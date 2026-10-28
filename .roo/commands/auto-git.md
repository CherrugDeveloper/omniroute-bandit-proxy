# auto-git

Automate comprehensive git commit-and-push workflow including project cleanup, changelog updates, and verification.

## Usage

Type `/auto-git` in the chat to execute this command.

## Workflow

This command invokes the `auto-git` skill, which performs the following steps:

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
     3) Append new entries under today's date
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

## When NOT to use
Do not use for manual git operations that require human review of individual changes, or for branches where a specific custom commit message is mandated.
