# Plan: Optimize Models and Train Dashboard Layout & Model Name Sanitization

This plan addresses layout, sizing, responsiveness, and model name sanitization in the 'Modelli e Train' tabs (`#tab-models` and `#tab-train`) within [`public/dashboard.html`](public/dashboard.html).

## Objectives

1. **Layout & Resizing Optimization (`#tab-models` & `#tab-train`)**:
   - Ensure all 11 columns (Rank, Model Name, N, Avg, Fails, Score/Badge, Free, Paid, Tools, Vision, Actions) are properly proportioned, never clipped, and remain fully visible and readable across different window sizes (desktop, tablet, mobile).
   - Fix issues where cells like rank, free, paid, tools, and vision appear empty or cut off due to overly aggressive column width constraints or hiding (`display: none`) in media queries.
   - Improve CSS table layout (`table-layout: fixed`), padding, font sizing, and flex/overflow properties so each row fits entirely within the window/wrapper.

2. **Model Name Sanitization**:
   - Strip explicit provider prefixes from model IDs when rendering model rows (`renderModelRow` in [`public/dashboard.html`](public/dashboard.html)), since models are already grouped under provider headers (e.g. displaying `gpt-4o` instead of `openai/gpt-4o`).
   - Implement a robust sanitization helper `sanitizeModelName(modelId, provider)` that checks if `modelId` starts with `provider + '/'` or `provider + ':'` or contains duplicated provider prefixes and cleans it accordingly.

---

## Proposed Changes in [`public/dashboard.html`](public/dashboard.html)

### 1. Model Name Sanitization Function
Add or update a client-side sanitization helper:
```javascript
function sanitizeModelName(modelId, provider) {
    if (!modelId) return '';
    if (provider) {
        const prefix1 = provider.toLowerCase() + '/';
        const prefix2 = provider.toLowerCase() + ':';
        const idLower = modelId.toLowerCase();
        if (idLower.startsWith(prefix1)) {
            return modelId.substring(prefix1.length);
        }
        if (idLower.startsWith(prefix2)) {
            return modelId.substring(prefix2.length);
        }
    }
    return modelId;
}
```
Update `renderModelRow(m, isCollapsed)` to use `sanitizeModelName(m.id, m.provider)` for the displayed model name while keeping the full ID in `data-model` attributes.

### 2. Table Column Widths & CSS Responsiveness (`#tab-models` & `#tab-train`)
- Review `#tab-models` and `#tab-train` table selectors in the `<style>` block.
- Adjust `nth-child` column widths so badges (`Free`, `Paid`, `✓`, `—`) and ranks have guaranteed minimum widths and do not overflow or collapse into invisibility.
- Ensure smaller viewports (`@media (max-width: 900px)` and `@media (max-width: 600px)`) keep columns visible with balanced widths (`table-layout: fixed` with appropriate horizontal scrolling or compact badge rendering) rather than `display: none`.

---

## Verification Steps
1. Open [`public/dashboard.html`](public/dashboard.html) or run `npm start` to test the proxy and view the dashboard in browser / via Playwright or manual inspection.
2. Verify that Rank, Free, Paid, Tools, and Vision cells render correctly across `#tab-models` and `#tab-train`.
3. Verify that model names under each provider group are cleanly sanitized (no redundant provider prefix).
