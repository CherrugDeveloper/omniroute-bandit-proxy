---
description: Automate git commit-and-push workflow with idempotent behavior, conventional commit generation, history feedback, and retry-on-conflict push
arguments: [-m "custom message"] [-b branch] [--dry-run] [--json] [--self-test]
---

# Git Auto Commit Command

This command runs the `git-auto-commit` skill to automate the complete git commit-and-push workflow with safety guarantees and comprehensive feedback.

## Usage

```
/git-auto-commit [options]
```

## Options

- `-m, --message <msg>` - Custom commit message (disables auto-generation)
- `-b, --branch <branch>` - Target branch to push to (default: current branch)
- `--dry-run` - Show what would happen without executing
- `--json` - Output results in JSON format
- `--self-test` - Run basic validation in a temporary git repository

## Examples

```
/git-auto-commit                    # Auto-commit and push
/git-auto-commit -m "fix: resolve issue"  # Use custom message
/git-auto-commit --dry-run          # Preview actions
/git-auto-commit --self-test        # Run validation tests
```

## Features

- **Idempotent behavior**: Running multiple times with no changes is a no-op (exit code 0)
- **Conventional commit generation**: Auto-generates commit messages following conventional commit format
- **History analysis**: Reports commit count, compliance, duplicates, and squash suggestions
- **Retry on conflict**: Automatically handles push conflicts with `git pull --rebase`
- **Safety checks**: Validates .gitignore, checks for secrets, cleans stale staged entries
- **Self-test**: Built-in validation with `--self-test` flag

## Environment Variables

- `GIT_AUTO_COMMIT_LOG_LEVEL` - Log level (DEBUG, INFO, WARN, ERROR) [default: INFO]
- `GIT_AUTO_COMMIT_DRY_RUN` - Enable dry-run mode [default: false]
- `GIT_AUTO_COMMIT_AUTO_MESSAGE` - Auto-generate commit message [default: true]
- `GIT_AUTO_COMMIT_HISTORY_DEPTH` - Number of commits to analyze [default: 20]
- `GIT_AUTO_COMMIT_SQUASH_THRESHOLD` - Suggest squash if N+ related commits [default: 3]

## Exit Codes

- `0` - Success or no changes (idempotent)
- `1` - General error
- `2` - Git error
- `3` - Push error
- `4` - Validation error
- `5` - Conflict detected