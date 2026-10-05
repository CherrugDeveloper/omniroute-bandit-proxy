# Changelog

Tutte le modifiche rilevanti a OmniRoute Bandit Proxy.

## v1.0.10 — 2026-10-05
- Dashboard "In corso": colonne a larghezza fissa (rank, N, avg, arrow)
- Sempre 4 valori per riga (anche per modelli nuovi/test)
- `try N` per attive, `Xs`/`Xm` per recenti, sempre presenti

## v1.0.9 — 2026-10-05
- Bandit: `dynamic_max_tokens` appreso dagli errori 413 (self-learning)
- Rimosso hardcode `LOW_TPM_MODELS` / `LOW_TPM_THRESHOLD`
- `selectModel` filtra con `effective_max_tokens = MIN(catalog, learned)`

## v1.0.8 — 2026-10-05
- Fix crash `provider is not defined` su STREAM INVALID

## v1.0.7 — 2026-10-05
- Fix ReferenceError `recentErrors` (variabile eliminata)

## v1.0.6 — 2026-10-05
- Affinity: struggling detection solo sull'ultimo tool_result

## v1.0.5 — 2026-10-05
- Affinity: penalizza + unpin su tool_call fallito

## v1.0.4 — 2026-10-05
- Training: accumulo fail-provider su 5xx E 429 rate-limit

## v1.0.3 — 2026-10-05
- Training: accumulo fail-provider su 5xx
- Bandit: classifica errori anche in training (ban/cooldown/flag provider)

## v1.0.2 — 2026-10-05
- Bandit: training non incrementa più Richieste/Osservazioni
- Session affinity: unpin automatico se la sessione è struggling

## v1.0.1 — 2026-10-05
- Dashboard: FAB con menu Developer/Changelog
- Badge rosso sul FAB quando c'è un changelog non letto
- Changelog formattato client-side
- Fix link dev-card (PayPal, Ko-fi, BMC)
- Fix scope `DEBUG_VERBOSE`, `forceProvider`, `excludedModels`

## v1.0.0 — 2026-10-04
- **Session Affinity**: pin modello per conversazione (TTL 30 min)
- **Mode/Profile system**: 14 modalità Zoo Code con soft bias
- **Training isolation**: tabella `models_train` separata
- **Priorità Zoo al training**: pausa se `/v1/inflight > 0`
- **Circuit breaker provider**: 3 fail in-request → cooldown 5 min
- **Hard cap contesto**: 150k token → 413
- **Timeout streaming**: idle content-based (60s) + hard cap (180s)
- **Health check**: include `degraded=1`
- **5xx transitori**: cooldown 1h invece di ban permanente
- **Dashboard**: tab Modalità, rank modelli, trend, debug toggle
- **Debug verbose**: attivabile senza restart
- **Classificatore errori**: 20+ pattern

## v0.9.0 — 2026-10-03
- Training daemon con priorità Zoo
- Esclusione FIM, audio, non-chat
- Notifier webhook (Slack/Discord/Telegram)

## v0.8.0 — 2026-10-02
- Discriminated UCB1 con reward basato su latenza
- Catalog sync automatico
- Provider history con `needs_attention`
- Badge stato (attivo, cooldown, degraded, bannato)