# Modifiche al Classificazione Model-Not-Found e Cascade Guard

## 1. Riepilogo delle Modifiche

### File Modificati
- [`src/bandit.mjs`](src/bandit.mjs) - Rimozione pattern 400 hardcoded, miglioramento classificazione errori
- [`config/bandit.json`](config/bandit.json) - Pattern 400 transient esistenti
- [`__tests__/model-not-found-classification.test.js`](__tests__/model-not-found-classification.test.js) - Test validazione logica

### Modifiche Specifiche

#### src/bandit.mjs

**CRITICO - Rimozione Pattern 400 Hardcoded che causava falsi positivi**

Rimosso il pattern hardcoded per errori 400 che trattava ogni errore 400 come permanent ban se non conteneva parole escluse. Questo causava falsi positivi per errori di validazione come "invalid request", "parameter missing", ecc.

- **Prima**: Il codice hardcoded su `status === 400 && !/excluded_pattern/` bannava permanentemente ogni errore 400 non esplicitamente escluso
- **Dopo**: I pattern 400 sono gestiti esclusivamente dalla configurazione in `config/bandit.json`
- **Risultato**: Errori 400 di validazione (es. "400 validation error: invalid input") ora causano `cooldown-model` invece di `ban-model` permanente

1. **BANDIT-CASCADE-GUARD**: Cambiato `slogInfo()` a `slogDebug()` per ridurre log spam
   - La riga 3214: `slogInfo(\`[BANDIT-CASCADE-GUARD] Applying punishment...\`)` è stata cambiata in `slogDebug()`
   - La riga 3208: `slogDebug(\`[BANDIT-CASCADE-GUARD] Skipping ALL punishment...\`)` mantiene il livello DEBUG
   - Questo riduce significativamente il log spam quando il cascade guard è attivo

2. **Aggiunti contatori**: `cascadeGuardSkipCount` e `cascadeGuardApplyCount` per monitorare il comportamento
   - Le righe 70-72: I contatori sono inizializzati nel costruttore
   - Le righe 3209-3210: `cascadeGuardSkipCount` viene incrementato quando il cascade guard salta la punizione
   - Le righe 3215-3216: `cascadeGuardApplyCount` viene incrementato quando il cascade guard applica la punizione
   - Questi contatori sono accessibili tramite `bandit.cascadeGuardSkipCount` e `bandit.cascadeGuardApplyCount`

#### config/bandit.json

1. **Nuovo pattern transient**: Aggiunti errori 400 che non dovrebbero causare ban immediato
   - La riga 34: Nuovo pattern per errori 400 di validazione
   - Gli errori 400 con messaggi di validazione, bad request, o parametri invalidi ora vengono classificati come transient
   - Questi errori causano un cooldown-model di 30 secondi invece di una permanent ban

2. **Migliorata documentazione**: Commenti chiari sulle differenze tra model-not-found e cooldown-model
   - La riga 47: Pattern `model-not-found` con motivo specifico
   - Gli errori "model not found" sono ora chiaramente distinti dagli errori di validazione

#### __tests__/model-not-found-classification.test.js

1. **Corretto beforeEach**: Ora è async per supportare import dinamici
   - La riga 46: `beforeEach(async () => {...})`
   - La riga 59: Utilizza `await import("../src/bandit.mjs")` per l'importazione dinamica

2. **Aggiunti test per DEBUG level**: Verifica che i messaggi cascade-guard siano a livello DEBUG
   - Il test "cascade guard logs at DEBUG level when skipping punishment" verifica che i messaggi siano a livello DEBUG
   - Usa `process.env.STRUCTURED_LOG_LEVEL = "debug"` per abilitare i log DEBUG

3. **Aggiunti test per contatori**: Verifica che i contatori vengano incrementati correttamente
   - Test "cascade guard counters are incremented correctly when punishment is skipped"
   - Test "cascade guard apply counter is incremented when punishment is applied"
   - Test "cascade guard counters increment correctly across multiple operations"

#### Nuovo Script: scripts/monitor-punishment.mjs

1. **Monitoraggio avanzato**: Fornisce report dettagliati su ban e cooldown
   - Statistiche sui modelli (totali, attivi, in cooldown, bannati)
   - Stato dei provider con motivi specifici
   - Statistiche del catalogo (vision, tools, vision+tools)
   - Supporto per modalità watch (aggiornamento ogni 30 secondi)
   - Output in formato JSON per integrazione con sistemi esterni

2. **Utilizzo**:
   ```bash
   # Report singolo
   node scripts/monitor-punishment.mjs
   
   # Modalità watch (aggiornamento ogni 30s)
   node scripts/monitor-punishment.mjs --watch
   
   # Output JSON
   node scripts/monitor-punishment.mjs --format json
   ```

## 2. Istruzioni per il Riavvio Sicuro del Servizio

### Prima del Riavvio

1. Verifica che i test passino:
   ```bash
   npm test
   ```

2. Controlla che il database sia in uno stato consistente:
   ```bash
   node scripts/check-db.mjs
   ```

3. Verifica lo stato attuale dei ban:
   ```bash
   node scripts/monitor-punishment.mjs
   ```

### Riavvio

Usa lo script di riavvio sicuro:
```bash
./scripts/restart-safe.sh -q
```

Per seguire i log dopo il riavvio:
```bash
./scripts/restart-safe.sh -f
```

### Verifica Post-Riavvio

1. Controlla che il servizio sia in ascolto sulla porta 8080:
   ```bash
   curl -s http://127.0.0.1:8080/health
   ```

2. Verifica che i log non contengano errori critici

3. Controlla che il cascade-guard ora logghi a livello DEBUG invece di INFO

4. Verifica lo stato dei ban con il nuovo script:
   ```bash
   node scripts/monitor-punishment.mjs
   ```

## 3. Monitoraggio Consigliato

Dopo il riavvio, monitora:

- **Log a livello DEBUG** per verificare che il cascade-guard non generi più spam
  - I messaggi `[BANDIT-CASCADE-GUARD]` ora appaiono a livello DEBUG
  - Questo riduce significativamente il volume di log in produzione

- **Contatori `cascadeGuardSkipCount` e `cascadeGuardApplyCount`** per capire la frequenza con cui il sistema salta le punizioni
  - Accessibili tramite API o inspect script
  - `cascadeGuardSkipCount`: quante volte il cascade guard ha saltato una punizione
  - `cascadeGuardApplyCount`: quante volte il cascade guard ha applicato una punizione

- **Errori 400** per verificare che i nuovi pattern transient funzionino correttamente
  - Errori di validazione ora causano cooldown-model invece di ban permanente
  - Verifica che i messaggi contengano "transient-400-error" come reason

## 4. Falsi Positivi Corretti

### Problema Identificato

Prima della modifica, il codice hardcoded in `src/bandit.mjs` (righe 1702-1721) trattava **ogni errore 400** come un possibile "model not found" se il messaggio non conteneva parole escluse specifiche. Questo causava falsi positivi per:

- Errori di validazione: `"400 validation error: invalid input"` → **ban-model permanente** ❌
- Errori di parametri mancanti: `"400 missing field 'model'"` → **ban-model permanente** ❌
- Errori di formato: `"400 invalid request format"` → **ban-model permanente** ❌

### Soluzione Implementata

**Rimosso il pattern 400 hardcoded**. Ora i pattern 400 vengono gestiti esclusivamente dalla configurazione in `config/bandit.json`:

- Pattern transient (riga 34): errori 400 con "validation", "bad request", "invalid request" → `cooldown-model` 30s
- Pattern permanent: solo messaggi specifici di "catalog mismatch" → `ban-model` permanente

### Verifica dei Falsi Positivi

Errori 400 che **prima** causavano ban permanente ora causano cooldown-model:

| Messaggio | Prima | Dopo |
|-----------|-------|------|
| `"400 validation error: invalid input"` | ban-model | cooldown-model (transient) ✅ |
| `"400 missing field 'model'"` | ban-model | cooldown-model (transient) ✅ |
| `"catalog mismatch"` | ban-model | ban-model (corretto) ✅ |
| `"Model not found in active live catalog"` | ban-model | ban-model (corretto) ✅ |

- **Nuovo script di monitoraggio** per un'analisi completa:
  ```bash
  node scripts/monitor-punishment.mjs
  ```

## 4. Rollback (se necessario)

Se incontri problemi, puoi tornare indietro con:

```bash
git checkout HEAD~1 -- src/bandit.mjs config/bandit.json __tests__/model-not-found-classification.test.js
```

Poi riavvia il servizio con lo script restart-safe.sh:

```bash
./scripts/restart-safe.sh -q
```

## 5. Dettagli Tecnici

### Differenza tra model-not-found e cooldown-model

| Aspetto | model-not-found | cooldown-model (transient 400) |
|---------|-----------------|-------------------------------|
| **Categoria** | PERMANENT | TRANSIENT |
| **Azione** | ban-model | cooldown-model |
| **Scope** | model | model |
| **Durata** | Permanente | 30 secondi (configurabile) |
| **Cause** | Model non esiste più nel catalogo provider | Errori di validazione, parametri invalidi |
| **Esempi** | "Model not found in active live catalog", "catalog mismatch" | "400 validation error", "400 bad request" |

### Quando il Cascade Guard Salta la Punizione

Il cascade guard salta la punizione quando il modello è già stato rifiutato per motivi di:

- `model_cooldown` - Modello già in cooldown
- `provider_cooled_down_this_request` - Provider appena messo in cooldown
- `provider_circuit_breaker` - Circuit breaker aperto
- `provider_cooldown` - Provider in cooldown
- `auth-expired` - Autenticazione scaduta
- `provider_quota_exhausted` - Quota provider esaurita
- `provider_needs_attention` - Provider con attenzione richiesta
- `non_chat_model_excluded` - Modello non chat escluso
- `no_tools_support` - Nessun supporto tools
- `max_input_tokens_exceeded` - Token massimi superati
- `exclude_thinking` - Pensiero escluso
- `dynamic_max_tokens_exceeded` - Token dinamici massimi superati

### Accesso ai Contatori

I contatori sono accessibili tramite l'istanza bandit:

```javascript
// Dopo aver creato l'istanza bandit
console.log('Skip count:', bandit.cascadeGuardSkipCount);
console.log('Apply count:', bandit.cascadeGuardApplyCount);
```

Oppure tramite lo script di ispezione:

```bash
node scripts/inspect-summary.mjs
```

### Nuovo Script di Monitoraggio

Per un monitoraggio avanzato dei ban e cooldown:

```bash
# Report dettagliato
node scripts/monitor-punishment.mjs

# Modalità watch (aggiornamento ogni 30 secondi)
node scripts/monitor-punishment.mjs --watch

# Output JSON per integrazione
node scripts/monitor-punishment.mjs --format json
```

## 7. Sistema 5-Strike e Exponential Backoff

### 5-Strike System

Il sistema utilizza 5 errori critici consecutivi per determinare il ban permanente:

**Errori Critici** (incrementano il contatore):
- 403 con "account disabled|banned|suspended"
- Model not found nel catalogo ("catalog mismatch|model_not_found|does not exist")
- SSE errors ("SSE contains error|stream error")
- 402 con "insufficient|funds|credit|payment"

**Errori NON Critici** (non incrementano il contatore):
- Timeout errors
- safeWrite errors
- Rate limit (429)

### Exponential Backoff

I cooldown vengono applicati in modo esponenziale:

| Fallimenti | Cooldown |
|------------|----------|
| 0 | nessuno |
| 1 | 30 secondi |
| 2 | 2 minuti |
| 3 | 5 minuti |
| 4 | 15 minuti |
| 5 | 30 minuti |
| 6 | 1 ora |
| 7 | 2 ore |
| 8 | 6 ore |
| 9 | 12 ore |
| 10+ | ban permanente |

### Cascade Ban Prevention (v0.53.10)

- 5-strike paid-group-ban: Imposta `needs_attention = 1` su `provider_history` (NON `permanent = 1`)
- Escalation permanent-ban: Imposta `needs_attention = 1` su `provider_history` (NON `permanent = 1`)
- Model-not-found: Il bare 404 status non triggera ban permanente
- 403 key-limit-exceeded: Richiede frasi specifiche (non bare "403|")
- Timeout aumentato: `UPSTREAM_TIMEOUT_MS` da 20000ms a 60000ms