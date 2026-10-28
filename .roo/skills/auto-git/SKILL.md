---
name: auto-git
description: Automate comprehensive git commit-and-push workflow including project cleanup, changelog updates, and verification
---

# Auto-Git

## When to use
Use this skill when you need to automate a full git maintenance and commit workflow for the project: cleanup, documentation updates, and safe commit/push with problem resolution.

## When NOT to use
Do not use for manual git operations that require human review of individual changes, or for branches where a specific custom commit message is mandated.

## Inputs required
No explicit inputs required; operates on the current workspace root.

## Workflow
1. **Resolve workspace problems**
   - Ensure all syntax errors, lint errors, and test failures are fixed.
   - Resolve all `@problems` before proceeding.

2. **Cleanup and Maintenance**
   - Remove superfluous files: `plans/` directory, `tests/*.bak` files, and temporary build artifacts (`dist/`, `build/`).
   - Clean unuseful scripts (`sh`, `py`, `bat`, `mjs`) **EXCLUDING production scripts in `scripts/` and `src/` directories**.
   - Clean unused test scripts, unused `.md` plans files, unused `.png`/`.jpg` images.
   - Perform artifact cleanup and validate `.gitignore` staging.

3. **Documentation**
   - Update `CHANGELOG.md` (integrated directly):
     1) Get recent git commits: `git log -n <limit> --pretty=format:%s (%h) %ad --date=short`
     2) Read existing `CHANGELOG.md`
     3) Append new entries under today’s date
     4) Write back `CHANGELOG.md`
   - Update `README.md` to ensure it is current.

4. **Git workflow**
   - Run `git status --porcelain`.
   - **CRITICAL:** Before committing, perform `git status` to detect existing staged files. If changes are staged, `git reset` the staging area, then `git add -A` to stage ALL changes (modifications, deletions, untracked files).
   - **CRITICAL:** Never skip production files during cleanup – always stage files from `src/`, `scripts/`, `config/`, and service configuration files before committing.
   - Secret scanning on staged diff (`git diff --cached`).
   - Generate conventional commit message based on staged files.
   - Inspect old commits and clean/merge as needed to maintain clear history.
   - Commit for every modified file, including hidden folders.
   - Perform compliance, commit count, duplicate analysis, and squash resolution as needed.
   - Push to remote with conflict handling (`git pull --rebase`).
   - Verify git push succeeded and resolve any fatal errors.
   - Finalize with verification and completion.

## Examples
- Running the skill automatically triggers the cleanup → changelog → git workflow sequence.
- After execution, the repository should be clean, documented, and pushed.

## Troubleshooting
- If git push fails due to conflicts, perform `git pull --rebase`, resolve conflicts, and retry.
- If staging area contains unexpected files, `git reset` and re-run `git add -A` before committing.
- Ensure production directories are never removed during cleanup.
