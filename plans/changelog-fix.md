# Piano di Risoluzione: Formattazione di `CHANGELOG.md` e Robustezza Dashboard

## Contesto e Causa Radice
Nel file [`public/dashboard.html`](public/dashboard.html:2109), la funzione [`renderChangelog()`](public/dashboard.html:2091) elabora le righe del changelog cercando l'intestazione di versione con la seguente espressione regolare:
```javascript
const h2 = line.match(/^##\s+(v[\d.]+|Unreleased)\s*(.*)$/);
```
Tuttavia, in [`CHANGELOG.md`](CHANGELOG.md:1), le intestazioni sono attualmente scritte con parentesi quadre e trattino singolo:
```markdown
## [v1.13.6] - 2026-11-01
```
Poiché il pattern regex richiede `## v...` o `## Unreleased` senza parentesi quadre:
1. `releases.length` rimane a `0`.
2. Il parser entra nel ramo di fallback alla riga [`public/dashboard.html:2123`](public/dashboard.html:2123):
   ```javascript
   if (releases.length === 0) {
       return '<pre style="white-space:pre-wrap; font-size:13px; color:#c9d1d9;">' + escapeHtml(md) + '</pre>';
   }
   ```
3. Il modal mostra quindi il markdown grezzo non formattato in un blocco `<pre>`, come mostrato nello screenshot dell'utente.

Inoltre, lo standard del repository (definito in [`.roo/tools/update_changelog.ts`](.roo/tools/update_changelog.ts:62)) prevede il formato con em dash (`—`):
```markdown
## v1.13.6 — 2026-11-01
```

---

## Piano di Azione

### 1. Correzione di [`CHANGELOG.md`](CHANGELOG.md:1)
Sostituire tutte le intestazioni delle 39 versioni convertendole da:
`## [vX.Y.Z] - YYYY-MM-DD`  
a:  
`## vX.Y.Z — YYYY-MM-DD`

Eliminare le parentesi quadre attorno ai tag di versione e standardizzare il separatore con l'em dash `—` (o trattino con spazi) in conformità con [`.roo/tools/update_changelog.ts`](.roo/tools/update_changelog.ts:72).

### 2. Aggiornamento difensivo del parser in [`public/dashboard.html`](public/dashboard.html:2109)
Rendere il parser resistente sia a formati con parentesi quadre sia senza, modificando la regex in [`renderChangelog()`](public/dashboard.html:2109):
```javascript
// Prima:
const h2 = line.match(/^##\s+(v[\d.]+|Unreleased)\s*(.*)$/);

// Dopo:
const h2 = line.match(/^##\s+\[?(v[\d.]+|Unreleased)\]?\s*(.*)$/);
```
Questo garantisce che, anche qualora un commit futuro introduca intestazioni con o senza quadre, il dashboard esegua sempre correttamente il rendering HTML.

---

## Verifiche Post-Implementazione
1. Verificare che la regex in [`renderChangelog()`](public/dashboard.html:2109) faccia match sia con `## v1.13.6 — 2026-11-01` sia con `## [v1.13.6] - 2026-11-01`.
2. Verificare che [`CHANGELOG.md`](CHANGELOG.md:1) non contenga più `## [` e che tutte le date e release siano coerenti.
3. Testare la visualizzazione nel browser / dashboard.
