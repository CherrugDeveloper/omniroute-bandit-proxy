# Auto Git Command

Automated Git versioning, changelog generation, and documentation updates.

## Overview

`npm run auto-git` executes `scripts/auto-git.mjs` to:
- Stop conflicting processes (train-daemon)
- Clean repository artifacts
- Run syntax checks
- Determine version bump based on conventional commits
- Generate CHANGELOG.md following [Keep a Changelog v1.1.0](https://keepachangelog.com/en/1.1.0/)
- Update README.md with new version
- Update package.json version
- Stage and commit changes
- Push to origin with retry logic

## Usage

```bash
npm run auto-git
```

Or directly:

```bash
node scripts/auto-git.mjs
```

## Workflow Steps

1. **Process Check**: Identifies and stops any running train-daemon processes
2. **Cleanup**: Removes PID files and script output artifacts (preserves databases)
3. **Syntax Validation**: Runs `npm run check` to verify ES module syntax
4. **Version Detection**: Reads from package.json and git tags
5. **Commit Analysis**: Examines commits since last tag
6. **Version Bump**: Determines bump type:
   - `feat:` → minor bump
   - `BREAKING CHANGE:` → major bump
   - `fix:` → patch bump
   - default → patch
7. **Changelog Generation**: Builds from full git history with proper versioning
8. **Documentation Update**: Updates README.md version references
9. **Package Update**: Updates package.json version
10. **Staged Verification**: Ensures no sensitive files (.env, .key, .pem, .cert)
11. **Commit**: Creates commit with conventional message
12. **Push**: Pushes to origin with up to 3 retries and rebase

## Changelog Format

Follows [Keep a Changelog v1.1.0](https://keepachangelog.com/en/1.1.0/) format:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2024-01-15

### Added
- New feature description

### Changed
- Updated existing behavior

### Fixed
- Bug fix description

### Deprecated
- Soon-to-be removed feature

### Removed
- Removed feature

### Security
- Security fix

## Version History

For complete version history prior to the latest version, see the [git history](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commits/main/CHANGELOG.md) or commit files.
```

## Categories

- **Added**: New features (`feat:`)
- **Changed**: General changes, improvements
- **Deprecated**: Features to be removed
- **Removed**: Features removed
- **Fixed**: Bug fixes (`fix:`)
- **Security**: Security-related fixes

## Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `SESSION_TTL_MS` | 30m | Session timeout |
| `STREAM_IDLE_MS` | 60s | Stream idle timeout |
| `_rankCache` TTL | 30s | Bandit ranking cache |

## Bandit Algorithm Notes

Uses `DiscountedUCB1Bandit` with:
- Discount factor: 0.99 per event
- Profile multipliers applied to UCB1 score
- Exponential backoff cooldowns: 15s → 5m → 30m → 2h → permanent
- 3-strike aggressive punishment for critical failures (403, 429, timeout, safeWrite errors)

## Database Notes

- Uses `better-sqlite3`
- Schema migrations are additive only (`ADD COLUMN`)
- Isolated `models_train` table for training data
- Production reads `models` + `0.3*models_train` (if N < 1)

## Error Handling Scopes

5 classification scopes:
- ban/cooldown/flag provider
- ban/cooldown/flag model

Critical failure detection:
- `consecutive_5xx ≥ 3` → degraded mode
- 3 consecutive critical failures → permanent ban

## Quota System

Provider-level quotas:
- Atomic minute and day window checks
- RPM (requests per minute) and RPD (requests per day) limits

## Testing

Uses `node:test` with in-memory `:memory:` database:
- `makeBandit()` helper for bandit instantiation
- `seedCatalog()` helper for catalog setup

## Gotchas

- Backup chain in `config/bandit.json` bypasses UCB1
- Token estimation = 4 chars/token

## Recent Changes (v1.20.0+)

- Exponential backoff cooldowns (15s → 5m → 30m → 2h → permanent)
- `total_failures` tracking per model
- Emergency relaxation respects cooldowns
- Consecutive failures reset on success
- 3-strike aggressive punishment for critical failures
- Error pattern mapping for safeWrite errors to ban-model

## Error Patterns for Critical Failures

`config/bandit.json` maps these patterns to ban-model:
- `safeWrite`
- `cannot access safeWrite`
- `safeWrite before initialization`
- `safeWrite is not initialized`

## Common Issues

### Merge Conflicts During Push

The script will rebase and retry. If conflicts persist, resolve manually:
```bash
git pull --rebase origin main
# resolve conflicts
git push origin main
```

### No Git Tags

On initial run, generates changelog from all commits with current date.

### Version Already Exists

If the new version is already in CHANGELOG.md, the script skips changelog update.

## See Also

- [AGENTS.md](/.roo/rules-code/AGENTS.md) - Project conventions and guidelines
- [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
- [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)