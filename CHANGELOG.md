# Changelog

## v1.0.0 — 2026-10-04
- Session affinity (pin modello per conversazione)
- Mode/Profile system (14 modalità Zoo Code)
- Training isolation (models_train separata)
- Soft bias profilo-modello (code/reasoning/general/summarizer)
- Circuit breaker provider (3 fail = cooldown 5min)
- Hard cap contesto (150k token)
- Timeout streaming (idle content-based + hard cap)
- Dashboard: tab Modalità, rank modelli, trend, debug toggle
- Health check include modelli degraded
- 5xx transitori: cooldown 1h invece di ban permanente

## v0.9.0 — 2026-10-03
- Training daemon con priorità Zoo
- Esclusione FIM, audio, non-chat
- Classificatore errori esteso (20+ pattern)
- Notifier webhook
- Dashboard Live Logs

## v0.8.0 — 2026-10-02
- Discriminated UCB1 con reward basato su latenza
- Catalog sync automatico
- Provider history con needs_attention
- Badge stato (attivo, cooldown, degraded, bannato)