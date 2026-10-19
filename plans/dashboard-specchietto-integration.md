# Plan: Integration of Specchietto Cronologico into Dashboard Top Panel

## Objective
Integrate the chronological spec sheet ("specchietto") of latest model evaluations and considerations (`#chronological-spec-sheet`), currently located under the "🔍 Considerazioni" tab, directly into the top panel / header area of `public/dashboard.html` as a collapsible or persistent top widget. This allows users to view recent model evaluations, selections, and rejection reasons at a glance from any active tab.

---

## Proposed Layout & UI Design

1. **Placement in Top Header Area (`public/dashboard.html`)**:
   - Place right below the `<div class="stats-container">` inside the main header card (or as a dedicated collapsible card immediately following the stats container).
   - Add a header bar for the widget:
     - Title: `📋 Ultime Valutazioni & Considerazioni` with a toggle collapse/expand button (`▼` / `▲`) and a badge showing the last updated model/timestamp.
   - Content Area:
     - The `#chronological-spec-sheet` element (monospace, dark themed `#0d1117`, scrollable, max-height ~150px-180px).
     - A quick link/button `"🔍 Vedi Tabella Completa"` that switches active tab to `consideration`.

2. **CSS Styling**:
   - Seamlessly blend with GitHub dark theme (`#161b22`, border `#30363d`, font-family monospace for log/spec output).
   - Collapsible state managed via localStorage (`dashboard.specchietto.collapsed`) or simple interactive toggle.

3. **JavaScript Integration**:
   - Ensure `updateConsiderations(data)` (or equivalent function updating `#chronological-spec-sheet` and `#consideration-table-body`) correctly updates both the top panel spec sheet and the consideration tab table simultaneously.
   - Preserve real-time updates via SSE / periodic metrics poll.

---

## Actionable Steps for Implementation (Code Mode)

1. **Modify `public/dashboard.html` HTML Structure**:
   - Extract / duplicate / move the `#chronological-spec-sheet` card container from `#tab-consideration` into the top header container (below `.stats-container`, inside the main top card).
   - Give it a collapsible toggle (`<details>` or custom JS toggle) and a button to jump to the consideration tab.

2. **Update CSS in `public/dashboard.html` `<style>`**:
   - Add styling for `.top-spec-widget`, toggle buttons, and responsive height.

3. **Refine JS Event Handlers**:
   - Ensure the data update function updates `#chronological-spec-sheet` wherever it is rendered.
