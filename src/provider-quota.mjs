import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

class ProviderQuota {
    constructor(db) {
        this.db = db;
        this.providerLimits = this._loadProviderLimits();
        this._startBackgroundRoller();
    }

    _startBackgroundRoller() {
        // Periodically roll quota windows even without incoming requests,
        // so providers recover from rate-limit exhaustion without needing a request.
        this._bgTimer = setInterval(() => {
            try {
                const now = Date.now();
                const providers = this.db.prepare(
                    `SELECT provider FROM provider_history`
                ).all();
                for (const row of providers) {
                    this._rollWindows(row.provider, false);
                    this._rollWindows(row.provider, true);
                }
            } catch (err) {
                console.error("[PROVIDER_QUOTA] Background roll error:", err.message);
            }
        }, 60000); // every 60s
    }

    stopBackgroundRoller() {
        if (this._bgTimer) {
            clearInterval(this._bgTimer);
            this._bgTimer = null;
        }
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

    _getQuotaDay(nowMs) {
        const d = new Date(nowMs);
        // Reset at 2:00 AM daily
        if (d.getHours() < 2) {
            d.setDate(d.getDate() - 1);
        }
        return d.toISOString().split('T')[0];
    }

    _rollWindows(provider, isPaid) {
        const now = Date.now();
        const group = isPaid ? 'paid' : 'free';
        const minuteCol = `calls_last_minute_${group}`;
        const startedCol = `calls_minute_started_${group}`;
        const todayCol = `calls_today_${group}`;
        const dateCol = `calls_today_date_${group}`;

        const cols = this.db.pragma("table_info(provider_history)");
        const hasGroupCols = cols.some(c => c.name === minuteCol);

        if (!hasGroupCols) {
            const row = this.db.prepare(
                `SELECT calls_last_minute, calls_minute_started, calls_today, calls_today_date FROM provider_history WHERE provider = ?`
            ).get(provider);
            if (!row) return;
            if (row.calls_minute_started && now - row.calls_minute_started > 60000) {
                this.db.prepare(
                    `UPDATE provider_history SET calls_last_minute = 0, calls_minute_started = ? WHERE provider = ?`
                ).run(now, provider);
            }
            if (row.calls_today_date) {
                const today = this._getQuotaDay(now);
                if (today !== row.calls_today_date) {
                    this.db.prepare(
                        `UPDATE provider_history SET calls_today = 0, calls_today_date = ? WHERE provider = ?`
                    ).run(today, provider);
                }
            }
            return;
        }

        const providerRow = this.db.prepare(
            `SELECT ${minuteCol}, ${startedCol}, ${todayCol}, ${dateCol} FROM provider_history WHERE provider = ?`
        ).get(provider);

        if (!providerRow) return;

        if (providerRow[startedCol] && now - providerRow[startedCol] > 60000) {
            this.db.prepare(
                `UPDATE provider_history SET ${minuteCol} = 0, ${startedCol} = ? WHERE provider = ?`
            ).run(now, provider);
        }

        const quotaDay = this._getQuotaDay(now);
        if (providerRow[dateCol] && quotaDay !== providerRow[dateCol]) {
            this.db.prepare(
                `UPDATE provider_history SET ${todayCol} = 0, ${dateCol} = ? WHERE provider = ?`
            ).run(quotaDay, provider);
        }
    }

    canCall(provider, isPaid = false) {
        this._rollWindows(provider, isPaid);

        const now = Date.now();
        const group = isPaid ? 'paid' : 'free';
        const minuteCol = `calls_last_minute_${group}`;
        const todayCol = `calls_today_${group}`;
        const resetCol = `quota_resets_at_${group}`;

        const cols = this.db.pragma("table_info(provider_history)");
        const hasGroupCols = cols.some(c => c.name === minuteCol);

        if (!hasGroupCols) {
            const providerRow = this.db.prepare(
                `SELECT calls_last_minute, calls_today, quota_resets_at FROM provider_history WHERE provider = ?`
            ).get(provider);
            if (!providerRow) return true;
            if (providerRow.quota_resets_at && providerRow.quota_resets_at > now) return false;
            const limit = this.providerLimits[provider];
            if (!limit) return true;
            if (providerRow.calls_last_minute >= limit.rpm) return false;
            if (providerRow.calls_today >= limit.rpd) return false;
            return true;
        }

        const providerRow = this.db.prepare(
            `SELECT ${minuteCol}, ${todayCol}, ${resetCol}, quota_resets_at FROM provider_history WHERE provider = ?`
        ).get(provider);

        if (!providerRow) return true;

        if ((providerRow[resetCol] && providerRow[resetCol] > now) || (providerRow.quota_resets_at && providerRow.quota_resets_at > now)) {
            return false;
        }

        const providerLimit = this.providerLimits[provider];
        if (!providerLimit) return true;

        const groupLimits = providerLimit.groups && providerLimit.groups[group] ? providerLimit.groups[group] : providerLimit;
        const rpmLimit = groupLimits.rpm || providerLimit.rpm || 100;
        const rpdLimit = groupLimits.rpd || providerLimit.rpd || 1000;

        if (providerRow[minuteCol] >= rpmLimit) return false;
        if (providerRow[todayCol] >= rpdLimit) return false;

        return true;
    }

    recordCall(provider, isPaid = false) {
        this._rollWindows(provider, isPaid);

        const now = Date.now();
        const group = isPaid ? 'paid' : 'free';
        const minuteCol = `calls_last_minute_${group}`;
        const startedCol = `calls_minute_started_${group}`;
        const todayCol = `calls_today_${group}`;
        const dateCol = `calls_today_date_${group}`;

        this.db.prepare(
            `INSERT OR IGNORE INTO provider_history (provider, fails, cooldown_until, pointer, permanent) VALUES (?, 0, 0, 0, 0)`
        ).run(provider);

        const cols = this.db.pragma("table_info(provider_history)");
        const hasGroupCols = cols.some(c => c.name === minuteCol);
        const quotaDay = this._getQuotaDay(now);

        if (!hasGroupCols) {
            const providerRow = this.db.prepare(
                `SELECT calls_last_minute, calls_minute_started, calls_today, calls_today_date FROM provider_history WHERE provider = ?`
            ).get(provider);
            if (!providerRow || !providerRow.calls_minute_started) {
                this.db.prepare(
                    `UPDATE provider_history SET calls_last_minute = 1, calls_minute_started = ?, calls_today = calls_today + 1, calls_today_date = ? WHERE provider = ?`
                ).run(now, quotaDay, provider);
            } else {
                let updates = [];
                let params = [];
                if (now - providerRow.calls_minute_started > 60000) {
                    updates.push("calls_last_minute = 1, calls_minute_started = ?");
                    params.push(now);
                } else {
                    updates.push("calls_last_minute = calls_last_minute + 1");
                }
                if (quotaDay !== providerRow.calls_today_date) {
                    updates.push("calls_today = 1, calls_today_date = ?");
                    params.push(quotaDay);
                } else {
                    updates.push("calls_today = calls_today + 1");
                }
                params.push(provider);
                this.db.prepare(`UPDATE provider_history SET ${updates.join(", ")} WHERE provider = ?`).run(...params);
            }
            return;
        }

        const providerRow = this.db.prepare(
            `SELECT ${minuteCol}, ${startedCol}, ${todayCol}, ${dateCol} FROM provider_history WHERE provider = ?`
        ).get(provider);

        if (!providerRow || !providerRow[startedCol]) {
            this.db.prepare(
                `UPDATE provider_history SET ${minuteCol} = 1, ${startedCol} = ?, ${todayCol} = 1, ${dateCol} = ? WHERE provider = ?`
            ).run(now, quotaDay, provider);
        } else {
            let updates = [];
            let params = [];
            if (now - providerRow[startedCol] > 60000) {
                updates.push(`${minuteCol} = 1, ${startedCol} = ?`);
                params.push(now);
            } else {
                updates.push(`${minuteCol} = ${minuteCol} + 1`);
            }
            if (quotaDay !== providerRow[dateCol]) {
                updates.push(`${todayCol} = 1, ${dateCol} = ?`);
                params.push(quotaDay);
            } else {
                updates.push(`${todayCol} = ${todayCol} + 1`);
            }
            params.push(provider);
            this.db.prepare(`UPDATE provider_history SET ${updates.join(", ")} WHERE provider = ?`).run(...params);
        }
    }

    recordQuotaExhausted(provider, resetAtMs, reason, isPaid = null) {
        this.db.prepare(
            `INSERT OR IGNORE INTO provider_history (provider, fails, cooldown_until, pointer, permanent) VALUES (?, 0, 0, 0, 0)`
        ).run(provider);

        if (isPaid !== null) {
            const group = isPaid ? 'paid' : 'free';
            const resetCol = `quota_resets_at_${group}`;
            const reasonCol = `quota_reason_${group}`;
            const cols = this.db.pragma("table_info(provider_history)");
            if (cols.some(c => c.name === resetCol)) {
                this.db.prepare(
                    `UPDATE provider_history SET ${resetCol} = ?, ${reasonCol} = ? WHERE provider = ?`
                ).run(resetAtMs, reason, provider);
                return;
            }
        }

        this.db.prepare(
            `UPDATE provider_history SET quota_resets_at = ?, quota_reason = ? WHERE provider = ?`
        ).run(resetAtMs, reason, provider);
    }

    snapshot() {
        const now = Date.now();
        const providers = this.db.prepare(
            `SELECT * FROM provider_history`
        ).all();

        const result = [];
        for (const provider of providers) {
            const providerLimit = this.providerLimits[provider.provider] || {};
            const rpmLimit = providerLimit.rpm || 0;
            const rpdLimit = providerLimit.rpd || 0;

            const freeLimits = providerLimit.groups && providerLimit.groups.free ? providerLimit.groups.free : { rpm: rpmLimit, rpd: rpdLimit };
            const paidLimits = providerLimit.groups && providerLimit.groups.paid ? providerLimit.groups.paid : { rpm: rpmLimit, rpd: rpdLimit };

            const freeResets = provider.quota_resets_at_free || provider.quota_resets_at || 0;
            const paidResets = provider.quota_resets_at_paid || provider.quota_resets_at || 0;

            result.push({
                provider: provider.provider,
                rpmLimit,
                rpdLimit,
                callsLastMinute: provider.calls_last_minute || 0,
                callsToday: provider.calls_today || 0,
                quotaResetAt: provider.quota_resets_at || 0,
                quotaReason: provider.quota_reason || '',
                quotaExhausted: (provider.quota_resets_at && provider.quota_resets_at > now),
                free: {
                    rpmLimit: freeLimits.rpm,
                    rpdLimit: freeLimits.rpd,
                    callsLastMinute: provider.calls_last_minute_free || 0,
                    callsToday: provider.calls_today_free || 0,
                    quotaResetAt: freeResets,
                    quotaReason: provider.quota_reason_free || provider.quota_reason || '',
                    quotaExhausted: freeResets > now
                },
                paid: {
                    rpmLimit: paidLimits.rpm,
                    rpdLimit: paidLimits.rpd,
                    callsLastMinute: provider.calls_last_minute_paid || 0,
                    callsToday: provider.calls_today_paid || 0,
                    quotaResetAt: paidResets,
                    quotaReason: provider.quota_reason_paid || provider.quota_reason || '',
                    quotaExhausted: paidResets > now
                }
            });
        }
        return result;
    }
}

export default ProviderQuota;
