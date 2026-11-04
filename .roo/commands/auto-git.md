# Auto Git Command

Automated Git versioning, changelog generation, and documentation updates for OmniRoute Bandit Proxy.

## Overview

The `auto-git` command automatically:
- Creates semantic version bumps based on commit messages
- Generates CHANGELOG.md from the complete git history
- Updates README.md with the latest version and changelog summary
- Updates package.json version
- Commits and pushes all changes

## Usage

```bash
npm run auto-git
```

Or use the slash command:
```
/auto-git
```

## Workflow

### Pre-flight Checks

1. Run `npm run check` to validate workspace integrity
   ```bash
   npm run check
   ```
   - Validates all source files (`src/index.mjs`, `src/bandit.mjs`)
   - Ensures no syntax errors

2. Verify git status is clean
   ```bash
   git status
   ```

### Version Detection

The command uses git history sources in priority order:

1. **Git tags** (`v*X.Y.Z` format) - Primary version source
2. **Conventional commits** - Analyzed to determine version bump level
3. **Commit history** - All commits since last tag are analyzed

### Semantic Versioning Rules

Version bumps are determined by commit message types:

| Commit Type | Version Bump |
|-------------|--------------|
| `feat:` | Minor (X.Y+1.0) |
| `fix:` | Patch (X.Y.Z+1) |
| `BREAKING CHANGE:` | Major (X+1.0.0) |

### CHANGELOG.md Generation

- **Reference**: [Keep a Changelog v1.1.0](https://keepachangelog.com/en/1.1.0/)
- Analyzes all commits since the last release tag
- Groups changes by type (Feat, Fix, Chore, etc.)
- Includes source file references from commit diffs
- Maintains reverse chronological order

### README.md Update

- Updates version number in header
- Adds current release date
- Summarizes key features from git history
- Pulls version from git tags or package.json

### Git Operations

Final steps:
1. Stage `CHANGELOG.md` and `README.md` and `package.json`
2. Commit with conventional message: `chore: update CHANGELOG, README, and version`
3. Push to origin: `git push origin main`

## File Format Standards

### CHANGELOG.md Format

```markdown
## [vX.Y.Z] - YYYY-MM-DD

### Feat
- Description of feature with [file:line] reference

### Fix
- Description of fix with [file:line] reference

### Chore
- Repository maintenance tasks
```

### Commit Message Format

Follow [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
type(scope): subject

body describing the change
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Project-Specific Conventions

- **Bandit**: `DiscountedUCB1Bandit` uses 0.99 discount/event; `_rankCache` 30s TTL
- **DB**: `better-sqlite3`; additive-only migrations (`ADD COLUMN` in `_migrateDB`)
- **Training**: Isolated `models_train` table; production reads `models` + `0.3*models_train` (if `N < 1`)
- **Error Handling**: 5 scopes (ban/cooldown/flag provider/model); `consecutive_5xx ≥ 3` → degraded
- **Quota**: Provider-level (RPM/RPD); atomic minute+day window check
- **Proxy/Sessions**: `SESSION_TTL_MS`=30m; `STREAM_IDLE_MS`=60s (resets on ANY chunk/heartbeat)
- **Soft Bias**: `profileMultiplier` applies to UCB1 score; multipliers stack

## Integration with npm Scripts

Defined in `package.json`:
```json
{
  "scripts": {
    "auto-git": "node scripts/auto-git.mjs",
    "check": "node --check src/index.mjs && node --check src/bandit.mjs"
  }
}