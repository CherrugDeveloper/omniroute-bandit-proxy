# Dashboard Modification Plan

## 1. Timestamp Correction
- **Task:** Standardize all timestamp displays to Local Time.
- **Location:** `public/dashboard.html` -> `fmtRow` function.
- **Change:** Replace `toISOString().replace('T', ' ').substring(11, 19)` with `toLocaleTimeString()`.

## 2. Reduce Futile Info & Data Consolidation
- **Task:** Streamline `statsParts` in `fmtRow`.
- **Change:** Combine `reason` and `error` fields to avoid redundant logs. Ensure provider/model are shown clearly only once.

## 3. Clarify Scarti
- **Task:** Make "scarti" count intuitive.
- **Change:** Add `title="Modelli scartati per questa richiesta"` to the displayed "scarti: N" string.

## 4. Layout Optimization
- **Task:** Remove boxed/bordered look, optimize scrollbar.
- **Change:**
    - `.table-wrapper`: Remove `border`, `max-height` (make it dynamic or adjusted), set `scrollbar-color` to `transparent transparent`.
    - Table: Remove `border-bottom` from rows if necessary for a cleaner aesthetic.
    - Row Alignment: Ensure `vertical-align: middle` for `td`.
