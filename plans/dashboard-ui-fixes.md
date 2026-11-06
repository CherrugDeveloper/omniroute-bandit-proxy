# Plan: UI Optimizations and Bug Fixes in Dashboard (`public/dashboard.html`)

## Overview
This plan addresses three key UI issues in `public/dashboard.html`:
1. **Changelog & Badge Optimization**: Ensure the Changelog modal renders properly, badge notification state (`changelogLastRead` vs latest version) correctly triggers the red badge (`.has-update`) on the developer FAB menu, and version header formatting is clean.
2. **Half-Screen Responsiveness for Model "Block" Button**: In [`public/dashboard.html`](public/dashboard.html), adjust column width allocation and ensure table actions column (`nth-child(11)`) and buttons (`.btn-block`, `.btn-copy`, `.btn-reset`) are fully visible and not clipped/overflowed when resized to half-screen.
3. **Provider/Model Count Discrepancy**: Align the displayed model and provider counts in the UI lists with the metric boxes at the top by ensuring active filters (such as reasoning filters, pricing filters, or unselected sources) correctly reflect total catalog vs active filtered counts.

---

## Actionable Steps

### Step 1: Fix Changelog Badge & Modal Rendering
- Verify that `extractFirstVersion` correctly parses version headings (e.g. `## [1.24.0] - 2026-11-06` or `## 1.24.0`).
- Ensure the badge check compares `localStorage.getItem('changelogLastRead') !== latest` and toggles `.has-update` on `#dev-fab`.

### Step 2: Fix Half-Screen Responsiveness for Model "Block" Button
- In [`public/dashboard.html`](public/dashboard.html) media queries (`@media (max-width: 900px)` and `@media (max-width: 600px)`), ensure `#tab-models .table-wrapper table` has `table-layout: auto` or sufficient width on column 11 (Azioni) so the "Blocca" button remains fully visible without being truncated or pushed off-screen.
- Add `white-space: nowrap` on action buttons container or stack them if space is restricted.

### Step 3: Resolve Provider / Model Count Discrepancy
- Inspect how providers and models are counted in `fetchDashboardStats()` vs `/v1/models` and `/v1/providers`.
- Ensure summary metrics boxes (`#total-models`, `#active-providers`, etc.) reflect backend aggregate statistics accurately without being distorted by active table filters.

### Step 4: Review and Switch Mode
- Create the final plan document in `plans/dashboard-ui-fixes.md`.
- Request switch to `Code` mode to implement the changes.
