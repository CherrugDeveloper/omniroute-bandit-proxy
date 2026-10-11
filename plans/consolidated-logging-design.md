# Consolidated Logging Design — OmniRoute Bandit Proxy

## Summary of the problem

The proxy currently emits multiple log lines per request because request logging is split across two Express middleware handlers and response/feedback logging is duplicated in both code paths (stream vs. non-stream). With `console` fully intercepted (each `console.log/error/warn` also writes to the in-memory `logBuffer` via `pushLog`), redundant lines are stored and surfaced by `/v1/logs` and the dashboard, cluttering the debug view.

## Root causes (src/index.mjs)

1. **Two middleware log the same incoming request** (duplicate `PROXY` + `DEBUG` line per request):
   - Proxy log at [line 271](src/index.mjs:271): `console.log(`[PROXY] ${req.method} ${req.path}${suffix}`)` — logs all `/v1/*` API calls except polling routes.
   - Debug log at [line 285](src/index.mjs:285): `console.log(`[DEBUG] Incoming request: ${req.method} ${req.path}`)` — logs **every** incoming request, unconditionally.
2. **Loop-detection log fires twice** for the same detected loop (identical lines at [1130](src/index.mjs:1130) and [1135](src/index.mjs:1135)).
3. **Response logging is repeated** in the non-stream path for tool-capable requests (lines [1645](src/index.mjs:1645) and [1647](src/index.mjs:1647)): one line for tool call count/content and a second line listing tool names.
4. **Success lines are duplicated per code path** (stream at [1613](src/index.mjs:1613), non-stream at [1664](src/index.mjs:1664)) — near-identical `[SUCCESS]` lines emitted twice for the same request outcome.

## Consolidation strategy

**One source of truth: a single request entry log in the PROXY middleware.** The bare `[PROXY] GET /v1/chat/completions` / `[PROXY] POST /v1/chat/completions [TRAIN]` line becomes the canonical per-request identifier. Everything else is organized as:

- `INFO` / `WARN`: per-request outcome and high-level state (model selected, retries exhausted, context rejects, upstream failures).
- `DEBUG` (gateable behind `debugVerbose` and `/v1/debug/toggle`): request internals — headers, session key, tool details, per-attempt flow, raw errors.
- `ERROR`: genuine failures — upstream errors, aborts, stream errors, rejection responses.
- The existing `logBuffer` interception keeps all levels available to the `/v1/logs` API and dashboard.

### Before / after: per-request log volume

| Scenario | Before (lines) | After (lines) |
|---|---|---|
| Normal non-stream request | 2 (PROXY + DEBUG) + 1 SUCCESS + 2 RESPONSE (if tools) | 2 (PROXY + SUCCESS) |
| Request rejected for context (413) | 2 (PROXY + DEBUG) + 1 WARN | 2 (PROXY + WARN) |
| Request with loop / struggling | +2 redundant AFFINITY lines | +0 (single consolidated AFFINITY line) |
| Stream success with tools | 2 (PROXY + DEBUG) + 1 SUCCESS + 1 RESPONSE-STREAM + 2 RESPONSE | 2 (PROXY + SUCCESS) + 1 RESPONSE-STREAM (DEBUG) |

## Consolidated logging flow

```mermaid
flowchart TD
    A[Incoming request] --> B{Express middleware}
    B --> C[PROXY middleware: log one canonical line<br/>[PROXY] POST /v1/chat/completions suffix]
    C --> D[Validation body guard<br/>400 if invalid]
    D --> E[Token estimate + context cap check]
    E --> F{estimated > MAX_CONTEXT_TOKENS?}
    F -- yes / no auto-compress --> G{Re-check cap}
    F -- yes / compress failed --> H{Still over cap}
    H -- yes --> I[WARN [REJECT] 413]
    H -- no --> J{mode / profile}
    G -- no compress or compressed --> J
    I --> K[send 413 response]
    J --> L{requireTools?}
    L -- yes --> M[INFO [TOOLS] tool-capable filter]
    L -- no --> N[stream or non-stream path]
    M --> N
    N --> O{stream?}
    O -- no --> P[non-stream path<br/>INFO [BANDIT] selected model<br/>INFO [SUCCESS] outcome<br/>ERROR on validation failure]
    O -- yes --> Q[stream path<br/>INFO [BANDIT] selected model<br/>ERROR on stream abort<br/>INFO [SUCCESS] outcome]
    P --> R[response.finish / close<br/>track end]
    Q --> R
    I --> R
    K --> R
    R --> S[console intercepted by pushLog<br/>→ logBuffer for /v1/logs]
```

## Middleware consolidation

Replace the two separate middleware with a single, gateable handler (target ~lines 257–287 in `src/index.mjs`):

```javascript
// Single entry point: canonical per-request log + optional verbose body inspection
app.use((req, res, next) => {
  const isApi = req.path.startsWith("/v1/");
  const isPolling = req.path.startsWith("/v1/metrics")
    || req.path.startsWith("/v1/logs")
    || req.path.startsWith("/v1/active")
    || req.path.startsWith("/v1/modes")
    || req.path.startsWith("/v1/models")
    || req.path.startsWith("/v1/debug/status")
    || req.path.startsWith("/v1/inflight");
  if (isApi && !isPolling) {
    let suffix = '';
    if (req.method === 'POST' && req.path === '/v1/chat/completions') {
      suffix = req.get('x-source') === 'training' ? ' [TRAIN]' : ' [ZOO]';
    }
    console.log(`[PROXY] ${req.method} ${req.path}${suffix}`);   // canonical, always on
  }
  if (isApi && !isPolling && debugVerbose) {
    // verbose, on-demand: method + path + source + client
    console.log(`[DEBUG] Incoming ${req.method} ${req.path} source=${req.get('x-source') || '-'}` +
                ` client=${req.ip || req.connection?.remoteAddress || '?'}`);
  }
  next();
});
```

This removes the unconditional `console.log(`[DEBUG] Incoming request…`)` (line 285) and keeps `[PROXY]` as the sole per-request log. Debug internals move behind `debugVerbose`.

## Response/feedback consolidation

- **Non-stream path** — remove lines 1645/1647 (duplicate `[RESPONSE]` lines). Tool-call details surface via the `[MSGS]`/`[MSGS-TOOL#]` logs (which are already `debugVerbose`-gated) and are optional to expose. If tool details must be visible at INFO level, emit a single consolidated line:
  ```javascript
  console.log(`[RESPONSE] ${model} tool_calls=${tc?.length || 0} names=${(tc || []).map(t => t.function?.name).join(", ")}`);
  ```
- **Success path** — keep exactly one `[SUCCESS]` line. The stream and non-stream variants differ only by `streamToolNames` vs `respToolNames`; consolidate to a helper (see below) called once per outcome.
- **Loop detection** — remove the duplicate at line 1135; keep the first occurrence at line 1130.

## Recommended log level mapping

| Current tag | Level (proposed) | Gate | Rationale |
|---|---|---|---|
| `[PROXY]` (method/path) | INFO | always | Canonical per-request entry |
| `[BANDIT] Selezionato` | INFO | always | Core routing outcome |
| `[SUCCESS]` | INFO | always | Core outcome (replaces duplicate) |
| `[AFFINITY] …` | INFO/WARN | always | Session management state |
| `[FAILURE]` / `[UPSTREAM 4xx]` | ERROR | always | Actual failures |
| `[REJECT]` / `[TIMEOUT]` | WARN | always | Recoverable but notable |
| `[CONTEXT]` | WARN | always | Actions taken on request body |
| `[RETRY]` | WARN | always | Retry/backoff events |
| `[DEBUG] Incoming request`, `[DEBUG] verbose`, `[MSGS]`, `[MSGS-TOOL#]`, `[RESPONSE]`, `[RESPONSE-STREAM] tool_calls`, `[SESSION-KEY]`, `[FORCE]`, `[TOOLS]`, `[MODE]`, auto-compress internals | DEBUG | `debugVerbose` | Request internals, per-attempt flow |
| `[AFFINITY] ⚠`, `[AFFINITY] 🚫`, `[AFFINITY] ⊕`, `[AFFINITY] ✗`, `[FALLBACK]` | INFO | always (or WARN for bans) | Important state changes |
| `[BANDIT-TRAIN] …` (in `bandit.mjs`) | DEBUG | optional `DEBUG` env | Per-error-classification detail |

All of these still pass through the `console.log/error/warn` overrides (lines 593–595) into `logBuffer`, so `/v1/logs` and the dashboard retain full visibility when polling is enabled.

## Proposed helper functions

Add near the logging overrides (after `pushLog`, before `startServer`) to centralize the repeated success message:

```javascript
// Consolidated request outcome log
function logSuccess(model, dur, opts = {}) {
  const { stream, toolNames, hasWritten, rewardScore, baseReward } = opts;
  const tag = stream ? "[SUCCESS-STREAM]" : "[SUCCESS]";
  console.log(`${tag} ${model} in ${dur.toFixed(2)}s ` +
              `(reward: ${(rewardScore || 0).toFixed(3)} = base ${(baseReward || 0).toFixed(3)} ` +
              `x ${(toolNames ? 0.6 : 1).toFixed(1)} tool=${toolNames?.[0] || 'none'} hasWritten=${hasWritten ?? '?'})`);
}
```

Call once per completed request, and remove the duplicated lines at [1613](src/index.mjs:1613) and [1664](src/index.mjs:1664).

## Implementation order

1. Merge the two request middleware into the single gateable handler above (removes the 2× per-request line).
2. Remove the duplicate loop-detection log (line 1135).
3. Remove or consolidate the duplicate `[RESPONSE]` lines in the non-stream path (1645/1647).
4. Introduce `logSuccess()` and consolidate stream/non-stream success logs (1613/1664).
5. Re-map tag levels per the table above, keeping existing `debugVerbose` gates where present and adding them where absent (`[MSGS]`, `[MSGS-TOOL#]`, `[RESPONSE]`, `[RESPONSE-STREAM]`, `[SESSION-KEY]`, `[FORCE]`, `[TOOLS]`, `[MODE]`).
6. Verify with `node --test` and a live proxy run: single `[PROXY]` line per request, `/v1/logs` clean, debug info toggleable via `/v1/debug/toggle?verbose=true`.
