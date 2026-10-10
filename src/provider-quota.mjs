import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

class ProviderQuota {
    constructor(db) {
        this.db = db;
        this.providerLimits = this._loadProviderLimits();
    }

    _loadProviderLimits() {
        const modulePath = fileURLToPath(import.meta.url);
        const configPath = path.join(path.dirname(modulePath), "..", "config", "provider-limits.json");
        try {
            const content = fs.readFileSync(configPath, "utf8");
            return JSON.parse(content).providers;
        } catch (err) {
            console.error("[PROVIDER_QUOTA] Error loading provider limits:", err.message);
            return {};
        }
    }

    _rollWindows(provider) {
        const now = Date.now();
        const providerRow = this.db.prepare(
            `SELECT calls_last_minute, calls_minute_started, calls_today, calls_today_date FROM provider_history WHERE provider = ?`
        ).get(provider);
        
        if (!providerRow) return;
        
        // Reset calls for the last minute if it's a new minute
        if (providerRow.calls_minute_started && now - providerRow.calls_minute_started > 60000) {
            this.db.prepare(
                `UPDATE provider_history SET calls_last_minute = 0, calls_minute_started = ? WHERE provider = ?`
            ).run(now, provider);
        }
        
        // Reset calls for the day if it's a new day
        if (providerRow.calls_today_date) {
            const today = new Date(now).toISOString().split('T')[0];
            if (today !== providerRow.calls_today_date) {
                this.db.prepare(
                    `UPDATE provider_history SET calls_today = 0, calls_today_date = ? WHERE provider = ?`
                ).run(today, provider);
            }
        }
    }

    canCall(provider) {
        this._rollWindows(provider);
        
        const now = Date.now();
        const providerRow = this.db.prepare(
            `SELECT calls_last_minute, calls_today, quota_resets_at, quota_reason FROM provider_history WHERE provider = ?`
        ).get(provider);
        
        if (!providerRow) return true;
        
        const providerLimit = this.providerLimits[provider];
        if (!providerLimit) return true;
        
        // Check if provider is currently in a quota reset
        if (providerRow.quota_resets_at && providerRow.quota_resets_at > now) {
            return false;
        }
        
        // Check RPM limit
        if (providerRow.calls_last_minute >= providerLimit.rpm) {
            return false;
        }
        
        // Check RPD limit
        if (providerRow.calls_today >= providerLimit.rpd) {
            return false;
        }
        
        return true;
    }

    recordCall(provider) {
        this._rollWindows(provider);
        
        const now = Date.now();
        const providerRow = this.db.prepare(
            `SELECT calls_last_minute, calls_minute_started, calls_today, calls_today_date FROM provider_history WHERE provider = ?`
        ).get(provider);
        
        if (!providerRow) {
            this.db.prepare(
                `INSERT INTO provider_history (provider, calls_last_minute, calls_minute_started, calls_today, calls_today_date) VALUES (?, 1, ?, 1, ?)`
            ).run(provider, now, new Date(now).toISOString().split('T')[0]);
        } else {
            const updateStmt = this.db.prepare(
                `UPDATE provider_history SET`
            );
            
            let updates = [];
            let params = [];
            
            // Increment calls_last_minute and set calls_minute_started if not set
            if (providerRow.calls_minute_started && now - providerRow.calls_minute_started > 60000) {
                updates.push("calls_last_minute = 1, calls_minute_started = ?");
                params.push(now);
            } else {
                updates.push("calls_last_minute = calls_last_minute + 1");
            }
            
            // Increment calls_today and set calls_today_date if not set
            const today = new Date(now).toISOString().split('T')[0];
            if (today !== providerRow.calls_today_date) {
                updates.push("calls_today = 1, calls_today_date = ?");
                params.push(today);
            } else {
                updates.push("calls_today = calls_today + 1");
            }
            
            params.push(provider);
            updateStmt.run(updates.join(", "), ...params);
        }
    }

    recordQuotaExhausted(provider, resetAtMs, reason) {
        this.db.prepare(
            `UPDATE provider_history SET quota_resets_at = ?, quota_reason = ? WHERE provider = ?`
        ).run(resetAtMs, reason, provider);
    }

    snapshot() {
        const now = Date.now();
        const providers = this.db.prepare(
            `SELECT provider, rpm_limit, rpd_limit, calls_last_minute, calls_minute_started, calls_today, calls_today_date, quota_resets_at, quota_reason FROM provider_history`
        ).all();
        
        const result = [];
        for (const provider of providers) {
            const providerLimit = this.providerLimits[provider.provider];
            const quotaStatus = {
                provider: provider.provider,
                rpmLimit: providerLimit ? providerLimit.rpm : null,
                rpdLimit: providerLimit ? providerLimit.rpd : null,
                callsLastMinute: provider.calls_last_minute,
                callsToday: provider.calls_today,
                quotaResetAt: provider.quota_resets_at,
                quotaReason: provider.quota_reason,
                quotaExhausted: provider.quota_resets_at && provider.quota_resets_at > now,
            };
            result.push(quotaStatus);
        }
        return result;
    }
}

export default ProviderQuota;