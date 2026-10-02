// ============================================================
// Notifier - invia webhook su eventi critici
// ============================================================
// Supporta:
//   - Slack (URL contiene "hooks.slack.com")
//   - Discord (URL contiene "discord.com/api/webhooks")
//   - Generico (qualsiasi altro URL: JSON strutturato)
//
// Throttling: stesso evento + stesso soggetto → max 1 per throttleMs.
// ============================================================

export class Notifier {
  constructor(options = {}) {
    const urls = Array.isArray(options.urls) ? options.urls : [];
    this.urls = urls.filter(u => typeof u === "string" && u.trim().length > 0);
    this.enabled = options.enabled !== false && this.urls.length > 0;
    this.throttleMs = Number(options.throttleMs) || 5 * 60 * 1000;

    this._lastSent = new Map();
    this.stats = { sent: 0, throttled: 0, errors: 0 };

    if (this.enabled) {
      console.log(`[NOTIFIER] Attivo su ${this.urls.length} webhook (throttle ${this.throttleMs / 1000}s)`);
    }
  }

  async notify(event, message, details = {}) {
    if (!this.enabled) return false;

    const key = `${event}:${details.provider || details.model || ""}`;
    const now = Date.now();
    const last = this._lastSent.get(key) || 0;
    if (now - last < this.throttleMs) {
      this.stats.throttled++;
      return false;
    }
    this._lastSent.set(key, now);

    const results = await Promise.allSettled(
      this.urls.map(url => this._sendToUrl(url, event, message, details))
    );

    const ok = results.filter(r => r.status === "fulfilled").length;
    if (ok > 0) this.stats.sent++;
    if (ok < this.urls.length) this.stats.errors++;

    return ok > 0;
  }

  async _sendToUrl(url, event, message, details) {
    let body;
    const emoji = this._emojiFor(event);

    if (url.includes("hooks.slack.com")) {
      body = {
        text: `${emoji} *${event}*\n${message}`,
        attachments: details.provider || details.model
          ? [{ text: `\`\`\`${JSON.stringify(details, null, 2)}\`\`\``, color: "#da3633" }]
          : undefined
      };
    } else if (url.includes("discord.com/api/webhooks")) {
      body = {
        content: `${emoji} **${event}**\n${message}`
      };
    } else {
      body = {
        event,
        message,
        details,
        timestamp: new Date().toISOString()
      };
    }

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`HTTP ${r.status} ${txt.slice(0, 120)}`);
    }
  }

  _emojiFor(event) {
    if (event.includes("banned")) return "🚫";
    if (event.includes("quota") || event.includes("credit")) return "💳";
    if (event.includes("needs_attention")) return "⚠️";
    if (event.includes("no_models")) return "🔥";
    if (event.includes("recovered")) return "✅";
    return "🔔";
  }
}
