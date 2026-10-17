# Architectural & Technical Specification: Model Selection Refinement, Untested Model Prioritization, Quality-to-Speed Metrics, and High-Frequency Dashboard UI

## Overview
This document provides the technical specification and architectural blueprint for improving model selection, eliminating unnecessary last-resort fallbacks, prioritizing untested models ($N = 0$), incorporating a precise quality-to-speed ratio into [`selectModel()`](src/bandit.mjs:1394), rendering a vertical consideration list with discard reasons in [`public/dashboard.html`](public/dashboard.html:1), and accelerating dashboard polling frequency to 0.1s.

---

## 1. Investigation of Last-Resort Triggers (`src/bandit.mjs`)
### Root Causes
- **Strict Constraint Enforcement**: [`selectModel()`](src/bandit.mjs:1394) applies strict filters across multiple dimensions:
  1. [`resolvedExcluded`](src/bandit.mjs:1401) (already tried models in current request attempt loop).
  2. [`model.permanent === 1`](src/bandit.mjs:1450) or [`model.degraded === 1`](src/bandit.mjs:1452).
  3. [`provider_history`](src/bandit.mjs:1456) bans, cooldowns, or [`needs_attention`](src/bandit.mjs:1474) flags.
  4. [`ProviderQuota`](src/provider-quota.mjs:1) rolling minute/day limit exhaustion (`canCall()`).
  5. Policy filters: [`excludeThinking`](src/bandit.mjs:30), [`excludePaid`](src/bandit.mjs:28), [`onlyFree`](src/bandit.mjs:31).
  6. Token limits: [`estimatedTokens > max_input_tokens`](src/bandit.mjs:1507) or [`dynamic_max_tokens`](src/bandit.mjs:1504) (413/TPM memory).
  7. Capability requirements: [`requireTools`](src/bandit.mjs:1513), [`requireImageGeneration`](src/bandit.mjs:1517).
- **Ranking Restriction**: [`getModelRank()`](src/bandit.mjs:645) queries `WHERE permanent = 0 AND degraded = 0 AND N >= 3 AND N > 0`, which completely discards any model with $N < 3$ (including untested models with $N = 0$).

---

## 2. Strategy for Prioritizing Untested Models ($N = 0$) and Removing $N$-Threshold Blocks
### Implementation Steps
1. **Remove $N \ge 3$ Restriction in [`getModelRank()`](src/bandit.mjs:645)**:
   - Update SQL query in [`getModelRank()`](src/bandit.mjs:648) to include all available models (`N >= 0`), sorting unobserved models ($N = 0$) with an optimistic bonus.
2. **UCB1 Optimistic Exploration Bonus**:
   - In [`selectModel()`](src/bandit.mjs:1615), ensure models with $N = 0$ receive an optimistic score boost:
     $$\text{ucbScore} = \text{optimisticPrior} + c \sqrt{\frac{\ln(N_{\text{total}} + 1)}{\max(N, 1)}}$$
     where $\text{optimisticPrior} = 1.0$ (or higher for new catalog models).

---

## 3. Quality-to-Speed Ratio Metrics in [`selectModel()`](src/bandit.mjs:1394)
### Metric Formula
Compute a composite performance metric combining success reward, latency efficiency, and throughput:
$$\text{QualitySpeedScore} = \left(\frac{\sum \text{reward}}{N}\right) \times \left(\frac{\text{BaselineLatency}}{\max(\text{Latency}_{\text{avg}}, 100\text{ms})}\right) \times \left(1 + \min\left(\frac{\text{TokensPerSec}}{\text{MaxTokensPerSec}}, 1\right)\right)$$
- Incorporate this ratio into the reward updating logic in [`recordFeedback()`](src/bandit.mjs:671) or directly weight the UCB1 average reward in [`selectModel()`](src/bandit.mjs:1624).

---

## 4. Vertical Consideration List in [`public/dashboard.html`](public/dashboard.html:1)
### UI Specifications
- **Data Source**: Expose [`getLastSelectionHistory()`](src/bandit.mjs:1650) via an API endpoint (e.g., `GET /v1/consideration`).
- **Layout**: Add a dedicated vertical panel / collapsible accordion in [`public/dashboard.html`](src/bandit.mjs:1) under the active request or model tab displaying:
  - Model ID & Provider
  - Status Badge (`selected` vs `rejected`)
  - Discard Reason (`already_tried`, `model_cooldown`, `max_input_tokens_exceeded`, `no_tools_support`, etc.)
  - Tier of filtering where rejection occurred (`strict`, `tier1`, `tier2`, `tier3`, `emergency`).

---

## 5. Dashboard Polling Frequency Update (0.1s)
### Implementation Steps
- Locate polling intervals in [`public/dashboard.html`](public/dashboard.html:2709+) (e.g., `setInterval(refreshDashboard, 500)`).
- Change interval from `500` ms to `100` ms (0.1s) to ensure ultra-responsive real-time updates.
