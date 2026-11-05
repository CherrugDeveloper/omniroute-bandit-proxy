# Auto Git Command

Automated Git versioning, Keep a Changelog v1.1.0 compliant changelog generation covering the complete project history, and documentation updates.

## Overview

The `auto-git` command automatically:
- Creates semantic version bumps based on commit messages
- Generates `CHANGELOG.md` following [Keep a Changelog v1.1.0](https://keepachangelog.com/en/1.1.0/) covering all project history
- Updates `README.md` with the latest version and changelog summary
- Updates `package.json` version
- Cleans repository by removing temporary files
- Commits and pushes all changes

## Workflow

### Pre-flight Checks

1. **Conflict Detection and Process Management**
   - Check for conflicting processes (daemon, watch, auto-commit)
   - Stop any running daemons to prevent interference

2. **Repository Cleanup with File-by-File Verification**
   - Keep database files: `bandit.db`, `bandit.db-wal`, `bandit.db-shm`, `proxy.db`, `omniroute.db`
   - Remove stale PID files (e.g., `.train-daemon.pid`)
   - Remove script output JSON files (`.script-output-*.json`)

3. **Lint Check**
   - Run `npm run check` to verify syntax
   - Exit if lint errors are found

### Version Detection

1. Read current version from `package.json`
2. Check for the latest git tag
3. Analyze commits since last tag:
   - `feat:` → minor version bump
   - `fix:` → patch version bump
   - `BREAKING CHANGE:` → major version bump

### Changelog Generation

Generate `CHANGELOG.md` following Keep a Changelog v1.1.0 format with sections:
- `## [Unreleased]` for current changes
- Historical versions grouped by git tags
- Categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`

### File Updates

- Update `README.md` version references
- Update `package.json` version

### Safety Verification

Verify no sensitive files are staged (`.env`, `.env.*`, `*.key`, `*.pem`, `*.cert`)

### Git Operations

1. Stage all changes: `git add -A`
2. Commit: `chore: update CHANGELOG, README, and version to v{X.Y.Z}`
3. Push with retry logic (up to 3 attempts)

## Execution

```bash
# Pre-flight: Check for conflicts
ps aux | grep -E "(daemon|watch|auto-commit)" | grep -v grep || echo "No conflicts detected"

# Stop daemons
pkill -f "daemon" 2>/dev/null || true

# Remove PID files
rm -f .train-daemon.pid

# Remove script outputs
rm -f .script-output-*.json

# Run syntax checks
npm run check

# Get versions
CURRENT_VERSION=$(node -p "require('./package.json').version")
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
echo "Current: $CURRENT_VERSION, Latest tag: $LATEST_TAG"

# Stage changes
git add -A

# Verify no sensitive files
if git diff --cached --name-only | grep -E '^\.env$|^\.env\.|(\.key|\.pem|\.cert)$'; then
  echo "ERROR: Sensitive files in staging!"
  exit 1
fi

# Commit and push
git commit -m "chore: update CHANGELOG, README, and version"
git push -u origin $(git rev-parse --abbrev-ref HEAD)
```

## Notes

- Execute from the project root
- Requires Node.js with ES modules support
- Git must be configured with proper auth for push operations
