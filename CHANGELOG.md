# Changelog

Tutte le modifiche rilevanti a OmniRoute Bandit Proxy.

Il formato segue lo standard [Keep a Changelog](https://keepachangelog.com/it/1.0.0/), con versioni in ordine cronologico decrescente (più recente prima).

## [v1.16.0] - 2026-11-04

### Feat

- **Bandit**: Implementato sistema di punizione aggressiva a 3-strike per failure critici [src/bandit.mjs:1199-1219]
  - Aggiunta colonna `consecutive_critical_failures` per il 3-strike rule
  - Nuovo metodo `_isCriticalFailure()` che classifica 403, 429, timeout e errori safeWrite come critici
  - Ban permanente dopo 3 consecutive critical failures (3-strike rule)
  - Il contatore si resetta a 0 alle richieste riuscite
  - Aggiunta migrazione database per schema esistente

- **Bandit**: Implementato exponential backoff per cooldown consecutivi
  - Progressione cooldown: 15s → 5m → 30m → 2h → ban permanente dopo 5+ failure
  - Aggiunto tracking `total_failures` per modello con limite a 50
  - Emergency relaxation rispetta ora i cooldown (bypass solo per last resort)
  - Contatore consecutive 5xx si resetta alla richiesta riuscita

- **Bandit**: Aggiunto pattern errori inizializzazione safeWrite a config/bandit.json
  - Match: "safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized" → ban-model scope [config/bandit.json:39]

### Fix

- **Proxy**: Aggiunte verifiche `supports_vision` nei percorsi di fallback model selection [src/index.mjs:2007-2040,2123-2133,2161-2170,2194-2204,2230-2240]
  - Session affinity pinning: controlla vision support prima di usare model pinnati
  - Fallback Pass 1: filtra modelli non-vision quando richiesto
  - Fallback Pass 2: mantiene check vision anche rilasciando i requisiti tool
  - Fallback Pass 3: check vision nell'emergency tier
  - Fallback Pass 4: check vision nell'absolute last resort
  - Aggiornato logging errori per includere flag `requireVision`

- **Dashboard**: Aggiustate dimensioni tabelle Unified Chronology e larghezze colonne
  - Altezza tabella: 110px → 114px con line-height: 1.2 per miglior leggibilità
  - Larghezze colonne: Error Type 8%→12%, Countermeasure 8%→14%, Reason 40%→30%
  - Prefisso provider rimosso dai nomi modello nella selection history per display più pulito

### Chore

- **Repository Maintenance**: Eseguito cleanup di artifact temporanei e file non tracciati
- **Workflow Automation**: Eseguito workflow `auto-git`, validando l'integrità del workspace tramite `npm run check`
- **Documentation & Versioning**: Aggiornata versione a `v1.16.0` tramite workflow auto-git

## [v1.14.10] - 2026-11-03

### Feat

- **Dashboard**: Enhanced Unified Chronology panel con per-model selection history
  - Ogni model considerato durante la selezione bandit ha la sua riga con timestamp, provider, model, status, error type, countermeasure, e reason
  - Altezza tabella aumentata da 84px a 280px con scrollbar per rimuovere spazio vuoto
  - Aggiunta checkbox "Mostra cronologia selezione" per toggle del display
  - Info modello attivo in tempo reale mostra durata (es. "🟢 ATTIVO 12.3s") con background verde
  - Righe storiche mostrano modelli scartati con motivi di rifiuto (tier_min_score, health, max_retries, ecc.) con background rosso

- **Bandit**: Aggiunto parametro `bypassCooldown` a `isModelAvailable()` per affidabilità fallback chain
  - Fallback chain bypassa ora controlli cooldown rispettando permanent bans e model degradati
  - Emergency relaxation preserva `ignorePermanent: false` e `ignoreDegraded: false` per evitare routing a modelli rotti
  - Ultimo resort non filtra più per cooldown poiché emergency mode ha già tentato

- **Bandit**: Implementato exponential backoff per 5xx/SSE errors
  - Formula cooldown: `min(15s * 2^fails, 5m)`

### Fix

- **Bandit**: Migliorata classificazione errori per stream/keepalive/connection in `_classifyError()`
  - Estesa gestione 5xx per includere errori stream/chunk/keepalive/connection related (via message matching)
  - Ridotto cooldown da 30s a 15s per errori stream/server transitori
  - Aggiunto null guard per classificazione errori per prevenire crash
  - Rilassato emergency mode per migliorare continuità servizio
  - Abilitato provider-level quota checking in emergency mode

- **Dashboard**: Aggiustate dimensioni tabelle Unified Chronology e larghezze colonne

### Chore

- **Repository Maintenance**: Eseguito cleanup di artifact temporanei e file non tracciati identificati nella root del repository
- **Workflow Automation**: Eseguito workflow `auto-git`, validando l'integrità del workspace tramite `npm run check`
- **Documentation & Versioning**: Consolidati ingressi versioni duplicate patch (v1.14.1 attraverso v1.14.10) in singola voce per 2026-11-03

## Versioni Precedenti

Per la cronologia completa delle versioni precedenti a v1.14.10, vedere la [git history](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commits/main/CHANGELOG.md) o i file di commit.

### Versioni Principali Documentate

- **v1.15.0** - 2026-11-04: Prima release con sistema 3-strike e exponential backoff
- **v1.14.10** - 2026-11-03: Integrazione per-model selection history nel dashboard
- **v1.14.0** - 2026-10-XX: Aggiornamento versione con workflow auto-git
- **v1.13.10** - 2026-10-XX: Aggiornamento versione
- **v1.13.9** - 2026-10-XX: Aggiornamento versione
- **v1.13.7** - 2026-10-XX: Pulizia, standardizzazione changelog, version bump
- **v1.13.6** - 2026-10-XX: Aggiornamento versione e docs
- **v1.13.5** - 2026-10-XX: Aggiornamento versione e documentazione
- **v1.1.94** - 2026-10-XX: Aggiornamento versione
- **v1.1.90** - 2026-10-30: Release principale
- **v1.1.58** - 2026-10-XX: Aggiornamento changelog
- **v1.1.8** - 2026-10-XX: Aggiornamento changelog
- **v1.1.1** - 2026-10-XX: Prima release con API modelli/provider
- **v1.1.0** - 2026-10-XX: Sistema quota provider

### Note Versionamento

Il progetto utilizza versioning semantico con date opzionali. Le versioni vengono generate automaticamente dal workflow `auto-git` basandosi su:
- Data corrente per determinare il numero di versione
- Formato: `vX.Y.Z` dove X=major, Y=minor, Z=patch

## Contribuire

Questo changelog viene generato automaticamente dal workflow `auto-git`. Per modifiche significative, consultare la [git history](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commits/main/CHANGELOG.md) o i file di commit.
