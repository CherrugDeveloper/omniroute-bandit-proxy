# Plan: Fix Model Count Limit, Capability Detection, and Half-Screen Action Button Visibility

## Objectives
1. **Fix Model Count Limitation**: Increase default SQL query limit in `getModels` (`src/bandit.mjs`) from 500 to 5000 so all 1015 monitored models are fully displayed in the Models tab.
2. **Enhance Capability Detection**: Improve backend classification for `is_free`, `is_paid`, `supports_tools`, and `supports_vision` in `syncCatalog` and `getModels` (`src/bandit.mjs`).
3. **Fix Half-Screen "Blocca" Button Visibility**: Update responsive CSS rules (`max-width: 900px`, `max-width: 600px`) in `public/dashboard.html` for column widths and action button containers so action buttons (like "Blocca") remain fully visible and accessible when resized to half-screen.

## Steps
1. **Update `src/bandit.mjs`**:
   - Change default limit in `getModels` to `5000` (or honor `filters.limit` up to `10000`).
   - Refine capability pattern matching and free/paid determination in `syncCatalog`.
2. **Update `public/dashboard.html`**:
   - Adjust table column widths and responsive media queries for `#tab-models` action column (column 11) and action buttons (`.btn`, `.btn-block`, `.btn-reset`) to wrap or fit comfortably on half-screen viewports without clipping.
3. **Verification**:
   - Run `npm run check` to verify syntax.
   - Run `npm run test` to verify all test suites pass.
