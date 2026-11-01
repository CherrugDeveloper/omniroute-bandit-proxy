---
description: Automate git commit-and-push workflow with repository cleanup, workspace problem resolution, documentation updates, and history optimization.
---

# Auto-Git Workflow

Execute the complete git workflow following these steps:

1. **Repository Analysis & Cleanup**:
   - Check for useless files and temporary artifacts (`*.bak`, `*.old`, `*.log`, `tmp*`, `temp*`, `.script-output-*.json`) and untracked scripts (`*.sh`, `*.py`, `*.bat`, `*.mjs`) and remove them.

2. **Resolve Workspace Problems**:
   - If `package.json` has a `check` script, run it and ensure syntax checks and validations pass before proceeding.

3. **Documentation Updates**:
   - Read the current version from `package.json`.
   - Automatically update `CHANGELOG.md` adding a new version entry and commit description.
   - Update version strings in `README.md` if present.

4. **Staging & Commit Message**:
   - Stage all changes using `git add .`.
   - Analyze staged changes to determine the type (`feat`, `docs`, `chore`), affected scopes (`src`, `tests`, `docs`, `scripts`, `config`), and generate a conventional commit message.
   - Scan staged changes for potential secrets (API keys, tokens, passwords). If any are detected, abort immediately.
   - Commit changes with the generated message.

5. **History Optimization**:
   - Unless skipped, check for consecutive generic/automated commits in recent history and squash them if appropriate.

6. **Sync & Push**:
   - Pull latest changes with rebase and autostash (`git pull --rebase --autostash origin main`).
   - Push to remote (`git push origin main`) with retry attempts if necessary.
