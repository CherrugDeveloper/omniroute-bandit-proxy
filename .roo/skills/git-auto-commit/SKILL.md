---
name: git-auto-commit
description: Automate git commit-and-push workflow with idempotent behavior, conventional commit generation, history feedback, and retry-on-conflict push. When to use this skill: you need to automate git operations with safety checks, customizable commit messages, and post-push feedback. Include keywords: git, commit, push, automation, conventional commits, history analysis, CI/CD, idempotent, self-test.
---

# When to use

Use this skill when you need to automate the complete git commit-and-push workflow with safety guarantees and comprehensive feedback. Ideal for:

- CI/CD pipelines that need reliable git operations
- Development teams requiring consistent commit messages
- Projects needing automated history analysis and cleanup suggestions
- Situations where idempotent behavior is critical (running multiple times with no changes should be a no-op)

# When NOT to use

Do NOT use this skill when:

- You need to force-push or reset history (this skill never uses `git push --force`, `git reset --hard`, or `git clean -fd`)
- You need to bypass safety checks (this skill validates .gitignore, checks for secrets, and cleans stale staged entries)
- You need to work with repositories that have complex merge conflicts (this skill handles simple conflicts via `git pull --rebase`)
- You need to modify commit history after pushing (this skill only creates new commits)

# Inputs required

- Git repository with staged changes (or none for idempotent no-op)
- Access to remote origin (for push operations)
- Optional: Custom commit message via `--message` flag
- Optional: Target branch via `--branch` flag
- Optional: Environment variables for configuration

# Workflow

1) **Verify git repository** - Check if we're in a valid git repo
2) **Clean stale staged entries** - Remove deleted files still in index
3) **Validate .gitignore** - Warn if common ignore patterns are missing
4) **Stage all changes** - Run `git add -A` with secret detection
5) **Check for changes** - If nothing to commit, exit 0 (idempotent)
6) **Generate commit message** - Use custom message or auto-generate conventional commit
7) **Commit changes** - Create commit with full message (subject + body)
8) **Push with retry** - Push to origin with automatic `pull --rebase` on conflicts
9) **Analyze history** - Report commit count, compliance, duplicates, and suggestions

# Files

| File | Purpose |
|------|---------|
| [`scripts/git-auto-commit.sh`](scripts/git-auto-commit.sh) | Main executable script |
| [`scripts/lib/git-utils.sh`](scripts/lib/git-utils.sh) | Shared library (logging, git wrappers, history analysis) |

Execute the script directly; source `scripts/lib/git-utils.sh` only if you need to reuse its functions.

# Examples

## Basic usage

```bash
scripts/git-auto-commit.sh
```

## With custom commit message

```bash
scripts/git-auto-commit.sh -m "feat: add user authentication middleware"
```

## With target branch

```bash
scripts/git-auto-commit.sh -b main
```

## Dry run mode

```bash
scripts/git-auto-commit.sh --dry-run
```

## JSON output for machine processing

```bash
scripts/git-auto-commit.sh --json
```

## Self-test mode

```bash
scripts/git-auto-commit.sh --self-test
```

## Debug output

```bash
GIT_AUTO_COMMIT_LOG_LEVEL=DEBUG scripts/git-auto-commit.sh --dry-run
```

# Flags

| Flag | Description |
|------|-------------|
| `-m, --message <msg>` | Custom commit message (disables auto-generation) |
| `-b, --branch <branch>` | Target branch to push to (default: current branch) |
| `--dry-run` | Show what would happen without executing |
| `--json` | Output results in machine-readable JSON format |
| `--self-test` | Run validation tests in a temporary git repository |
| `-h, --help` | Show usage information |

# Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GIT_AUTO_COMMIT_LOG_LEVEL` | `INFO` | Log level (`DEBUG`, `INFO`, `WARN`, `ERROR`) |
| `GIT_AUTO_COMMIT_DRY_RUN` | `false` | Enable dry-run mode |
| `GIT_AUTO_COMMIT_AUTO_MESSAGE` | `true` | Auto-generate commit message from diff |
| `GIT_AUTO_COMMIT_HISTORY_DEPTH` | `20` | Number of commits to analyze |
| `GIT_AUTO_COMMIT_SQUASH_THRESHOLD` | `3` | Suggest squash if N+ related commits share type/scope |

# Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success or no changes (idempotent) |
| 1 | General error |
| 2 | Git error |
| 3 | Push error |
| 4 | Validation error |
| 5 | Conflict detected |

# Example outputs

## Human-readable output

```
[2026-10-09 02:15:00] INFO: Starting git-auto-commit skill
[2026-10-09 02:15:00] INFO: Git repository verified
[2026-10-09 02:15:00] INFO: Checking for stale staged entries...
[2026-10-09 02:15:00] INFO: No stale staged entries found
[2026-10-09 02:15:00] INFO: Validating .gitignore coverage...
[2026-10-09 02:15:00] INFO: .gitignore appears to cover common patterns
[2026-10-09 02:15:00] INFO: Staging all changes...
[2026-10-09 02:15:00] INFO: Changes committed successfully
[2026-10-09 02:15:00] INFO: Pushing to origin/main...
[2026-10-09 02:15:00] INFO: Push successful
[2026-10-09 02:15:00] INFO: Analyzing commit history...
=== Commit History Analysis ===
Commit count: 5
Conventional compliance: 80.0%
Duplicates found: "feat:core: add user authentication middleware"
Suggestions: Found 3 commits with type/scope feat:core - consider squashing
Orphaned branches: feature/login
[2026-10-09 02:15:00] INFO: git-auto-commit completed successfully
```

## JSON output

```json
{
  "timestamp": "2026-10-09T02:15:00Z",
  "level": "INFO",
  "message": "Starting git-auto-commit skill",
  "steps": [
    { "name": "verify_git_repo", "status": "ok", "detail": "Git repository verified" },
    { "name": "clean_stale_staged", "status": "ok", "detail": "No stale staged entries found" },
    { "name": "validate_gitignore", "status": "ok", "detail": ".gitignore appears to cover common patterns" },
    { "name": "stage_changes", "status": "ok", "detail": "Changes staged successfully" },
    { "name": "commit", "status": "ok", "detail": "Changes committed successfully" },
    { "name": "push", "status": "ok", "detail": "Push successful" }
  ],
  "result": {
    "committed": true,
    "commit_sha": "abc123def456",
    "pushed": true,
    "branch": "main",
    "message": "feat:core: add user authentication middleware\n\nChanges:\n  - src/auth/middleware.js\n  - src/auth/routes.js\n\nDiff statistics:\n 2 files changed, 45 insertions"
  },
  "history": {
    "commit_count": 5,
    "conventional_compliance": 0.8,
    "duplicates": ["feat:core: add user authentication middleware"],
    "suggestions": ["Found 3 commits with type/scope feat:core - consider squashing"],
    "orphaned_branches": ["feature/login"]
  },
  "errors": []
}
```

# Integration notes for CI/CD

## GitHub Actions

```yaml
- name: Auto-commit and push
  run: |
    scripts/git-auto-commit.sh
  env:
    GIT_AUTO_COMMIT_LOG_LEVEL: INFO
    GIT_AUTO_COMMIT_DRY_RUN: false
    GIT_AUTO_COMMIT_AUTO_MESSAGE: true
```

## GitLab CI

```yaml
auto_commit:
  script:
    - scripts/git-auto-commit.sh
  only:
    - merge_requests
    - main
```

## Local invocation from the workspace root

```bash
./scripts/git-auto-commit.sh --message "feat: auto-commit workflow change" --branch feature/x
```

## Best practices

1. **Pre-commit hooks**: Use this skill as a post-commit hook or in CI pipelines.
2. **Branch protection**: Ensure branch protection rules are in place before enabling auto-push.
3. **Review process**: Consider using this skill in feature branches with required code reviews.
4. **Monitoring**: Set up alerts for failed auto-commit attempts.
5. **Configuration**: Customize environment variables based on your team's needs.

## Limitations

- This skill does not handle complex merge conflicts automatically.
- It does not modify existing commit history.
- It requires network access for pushing to remote repositories.
- Some secret detection patterns may produce false positives.
- Self-test mode requires network isolation (it runs against a temporary local repository).
