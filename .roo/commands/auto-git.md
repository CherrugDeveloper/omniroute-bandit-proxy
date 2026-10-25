---
name: auto-git
description: Automate comprehensive git commit-and-push workflow including project cleanup
trigger: /auto-git
mode: code
allow_multiple: true
---

Implements robust automated Git workflow:

### 1. Cleanup and Maintenance
- Identify and remove superfluous files: `plans/` directory, `tests/*.bak` files, and temporary build artifacts (e.g., `dist/`, `build/`).
- Unuseful script cleanup (`sh`, `py`, `bat`, `mjs`).
- Unused test scripts cleanup.
- Unused `.md` plans files cleanup.
- Unused `.png`, `.jpg` image cleanup.
- Artifact cleanup & .gitignore staging validation.

### 2. Documentation
- Execute `update_changelog` tool to update `CHANGELOG.md`.
- Update `README.md` to ensure it is current.

### 3. Git Workflow
- Resolve all @problems.
- Status check (`git status --porcelain`).
- **CRITICAL: If files are already staged, first run `git reset` to unstage, then run `git add -A` to ensure ALL changes—including modifications, deletions, and new/untracked files (like root scripts)—are correctly staged.**
- Secret scanning on staged diff (`git diff --cached`).
- Conventional commit message generation based on staged files (messages must be descriptive, related to changes, not generic).
- Look at old commit and clean if needed or merge; maintain clear and clean branch history.
- Commit execution for every file modified, including hidden folders.
- Comprehensive compliance, commit count, potential duplicate analysis, squash resolution.
- Push to remote with conflict handling (`git pull --rebase`).
- Verify git push has really occurred.
- Resolve fatal errors.
- Finalize with verification and `attempt_completion`.
