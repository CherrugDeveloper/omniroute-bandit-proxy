# Automated Git Workflow Script Technical Design (`auto-git`)

## Overview & Recommendation

This document outlines the technical design for a robust, automated Git workflow script for the [`omniroute-bandit-proxy`](package.json) project.

### Language Recommendation: **Node.js (`.mjs`) Utility Script**
While the project contains both Bash scripts (e.g., [`scripts/switch-mode.sh`](scripts/switch-mode.sh)) and Node.js ES module scripts (e.g., [`scripts/train-daemon.mjs`](scripts/train-daemon.mjs)), we strongly recommend implementing [`scripts/auto-git.mjs`](scripts/auto-git.mjs) as a **Node.js ES module (`.mjs`) script** running with Node >= 22.0.0.

**Rationale:**
1. **Advanced Text Processing & Regex**: Generating conventional commit messages (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`) based on diff parsing and file path analysis is significantly cleaner, safer, and more maintainable in JavaScript using regex and built-in string methods than fragile `sed`/`awk`/`grep` pipelines in Bash.
2. **Secret Scanning**: Robust regex pattern matching against staged diffs to prevent leaking API keys (`OMNIROUTE_API_KEY`, JWT secrets, private keys, AWS keys, etc.) is cleaner and less error-prone in Node.js.
3. **Structured Reporting**: Formatting comprehensive compliance reports, commit counts, potential duplicate analysis, and squash suggestions is straightforward with JavaScript object structures and JSON/console reporting.
4. **Cross-Platform Compatibility**: Ensures consistent behavior across Linux, macOS, and Windows environments without relying on GNU vs BSD utility flags.

---

## Architecture & Logic Steps

The script [`scripts/auto-git.mjs`](scripts/auto-git.mjs) will follow these sequential phases:

```mermaid
graph TD
    A[Start auto-git workflow] --> B[1. Repository Clean & Validation]
    B --> C{Changes detected?}
    C -- No --> D[No-op: Exit gracefully]
    C -- Yes --> E[2. Cleanup Untracked Artifacts & Stale Staged Entries]
    E --> F[3. Stage Changes & Validate against .gitignore]
    F --> G[4. Secret Scanning on Staged Diff]
    G -- Secrets Found --> H[Abort: Print security warning]
    G -- Clean --> I[5. Auto-Generate Conventional Commit Message]
    I --> J[6. Commit Changes]
    J --> K[7. Push to Remote & Handle Conflicts]
    K -- Conflict --> L[Attempt fetch/rebase or prompt]
    K -- Success --> M[8. Generate Comprehensive Feedback Report]
    M --> N[Complete]
```

### Detailed Logic Steps

#### 1. Repository Clean & No-Op Check
- Check git status (`git status --porcelain`).
- If no changes (staged, unstaged, or untracked), exit immediately with a clean no-op message.

#### 2. Clean Untracked Artifacts & Stale Staged Entries
- Remove unnecessary temporary files and untracked build artifacts (e.g., `test_*.txt`, debug logs, dangling core dumps, temporary test outputs) using safe filters.
- Run `git rm --cached` on any stale staged entries that match [` .gitignore`](.gitignore).

#### 3. Stage Changes & `.gitignore` Validation
- Automatically stage relevant modifications (`git add -A`).
- Verify that no files violating [` .gitignore`](.gitignore) (e.g., `.env`, `node_modules/`, log files) were accidentally staged.

#### 4. Secret Scanning (Safety Guarantee)
- Inspect the staged diff (`git diff --cached`) using regex patterns for common secrets:
  - API keys (`omniroute_`, `sk-[a-zA-Z0-9]{20,}`, `bearer `, `token=`)
  - Private keys (`-----BEGIN PRIVATE KEY-----`)
  - Connection strings with credentials.
- Abort execution immediately if any potential secret is detected, detailing the offending file and pattern match.

#### 5. Conventional Commit Message Generation
- Analyze staged files and diff summaries:
  - If `__tests__/` or `tests/` modified: `test: ...`
  - If `README.md` or `*.md` or [`plans/`](plans/) modified: `docs: ...`
  - If `package.json` or `package-lock.json` modified: `chore(deps): ...`
  - If `src/bandit.mjs` or core routing modified: `feat(bandit): ...` or `refactor(bandit): ...`
  - Default fallback: `chore: update repository files`
- Summarize changes into a clean conventional commit message title and body.

#### 6. Commit Execution
- Execute `git commit -m "..."`.

#### 7. Push to Remote & Conflict Handling
- Run `git push origin <current-branch>`.
- If push fails due to remote divergence (conflict), attempt `git pull --rebase` or gracefully handle/report the conflict state to prevent data loss.

#### 8. Comprehensive Feedback Report
- Output a detailed summary report including:
  - **Commit Count**: Number of commits made or pushed.
  - **Compliance Report**: Conventional commit adherence check.
  - **Potential Duplicates**: Detection of similar recent commits.
  - **Squash Suggestions**: Recommendations if multiple minor fixups can be squashed.
  - **Remote Status**: Push confirmation.
