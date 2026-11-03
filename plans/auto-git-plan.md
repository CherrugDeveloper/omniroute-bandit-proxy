# Auto-Git Workflow Plan - v1.13.14

This plan automates the git commit-and-push workflow for the OmniRoute Bandit Proxy project.

## 1. Repository Analysis & Cleanup
- [ ] Scan and remove temporary artifacts: `*.bak`, `*.old`, `*.log`, `tmp*`, `temp*`.
- [ ] Specifically check for `.train-daemon.pid`, `.script-output-*.json`, and `training.log`.
- [ ] Remove `plans/changelog-fix.md` if obsolete.

## 2. Resolve Workspace Problems
- [ ] Run `npm run check` to ensure syntax and validation pass.
- [ ] Abort if the check script fails.

## 3. Documentation Updates
- [ ] **Calculate next version**:
  - Current `package.json`: `1.13.12`
  - Latest `CHANGELOG.md`: `1.13.13` (2026-11-02)
  - Today: 2026-11-02
  - **New Version**: `1.13.14` (incrementing patch as today matches latest entry date).
- [ ] **Update CHANGELOG.md**:
  - Add new entry for `## [v1.13.14] - 2026-11-02`.
  - Document auto-git workflow execution and repository cleanup.
- [ ] **Update package.json**:
  - Set version to `1.13.14`.
- [ ] **Update README.md**:
  - Delegate to `documentation-writer` to update version and reflect current project state.

## 4. Staging & Commit
- [ ] **Stage critical project utilities explicitly** (ensures they are tracked):
  - `git add rebase-script.sh`
  - `git add .roo/commands/`
- [ ] Stage all remaining changes (`git add -A`).
- [ ] **Verify critical files are staged**: `git status --porcelain | grep -E '(rebase-script\.sh|\.roo/commands/)'`
- [ ] Generate conventional commit message:
  - `chore(repo): auto-git workflow execution v1.13.14`
  - Body: Repository cleanup, version bump, documentation updates, and project utilities tracking.
- [ ] Commit changes.

## 5. History Optimization
- [ ] Check for consecutive automated commits and squash if appropriate.

## 6. AGENTS.md Generation
- [ ] Run `init` slash command to update `AGENTS.md` and mode-specific rules.

## 7. Sync & Push
- [ ] `git pull --rebase --autostash origin main`.
- [ ] `git push origin main` (with retries if needed).
