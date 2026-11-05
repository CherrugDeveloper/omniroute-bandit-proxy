# Auto Git Command

Automated Git versioning, changelog generation, and documentation updates for OmniRoute Bandit Proxy.

## Overview

The `auto-git` command automatically:
- Creates semantic version bumps based on commit messages
- Generates CHANGELOG.md from the complete git history
- Updates README.md with the latest version and changelog summary
- Updates package.json version
- Commits and pushes all changes

## Workflow

### Pre-flight Checks

1. Run `npm run check` to validate workspace integrity
   ```bash
   npm run check
   ```
   - Validates all source files in the project
   - Ensures no syntax errors in JavaScript/ESM files

2. Verify no browser console errors in `public/dashboard.html` (if file exists)
   - Check for JavaScript errors, missing resources, or rendering issues

3. Verify git status is clean or stage changes
   ```bash
   git status
   ```

4. Handle unstaged changes (if any)
   ```bash
   git add -A
   ```
   - First verify `.gitignore` is properly configured for the project
   - Stage all remaining changes to prevent conflicts
   - **Verify no sensitive files are staged before committing**:
     ```bash
     git diff --cached --name-only | grep -E '^\.env$|^\.env\.' && echo "ERROR: Sensitive env files staged!" && exit 1 || echo "No sensitive files staged"
     ```
   - This ensures all modifications are included in the version bump
   - **Critical**: Never stage files containing secrets, API keys, or personal data

### Privacy & Security Exclusions

The following file types MUST NEVER be staged or committed:

- **Environment files**: `.env`, `.env.local`, `.env.production`, `.env.*`
- **Credential files**: `*.key`, `*.pem`, `*.cert`, `*.pub`
- **Secret files**: Files containing API keys, tokens, passwords, or secrets
- **Personal data**: Database dumps, user data exports, personal notes
- **IDE-specific settings**: `.vscode/settings.json` (may contain personal paths)
- **Dependency lock files for comparison**: `package-lock.json` changes only if intentional

Always verify `.gitignore` covers these patterns before staging:
```bash
grep -E '\.env|\.key|\.pem|\.cert|\.pub|\.db$' .gitignore
```

### Version Detection

The command uses git history sources in priority order:

1. **Git tags** (`vX.Y.Z` format) - Primary version source
2. **Current package.json version** - Fallback version source
3. **Conventional commits** - Analyzed to determine version bump level from last tag

### Semantic Versioning Rules

Version bumps are determined by commit message types in the current version's changes:

| Commit Type | Version Bump |
|-------------|--------------|
| `feat:` | Minor (X.Y+1.0) |
| `fix:` | Patch (X.Y.Z+1) |
| `BREAKING CHANGE:` | Major (X+1.0.0) |

### CHANGELOG.md Generation

- **Reference**: [Keep a Changelog v1.1.0](https://keepachangelog.com/en/1.1.0/)
- Analyzes all commits since the first release tag
- Groups changes by type (Feat, Fix, Chore, Docs, etc.)
- Includes source file references from commit diffs
- Maintains reverse chronological order
- Uses project-specific scopes: bandit, proxy, dashboard, config, scripts, docs

### README.md Update

- Updates version number in header (line 3)
- Adds current release date
- Summarizes key features from git history
- Pulls version from git tags or package.json

### Git Operations

Final steps:
1. Verify no sensitive files are staged:
   ```bash
   git diff --cached --name-only | grep -E '^\.env$|^\.env\.|(\.key|\.pem|\.cert)$' && echo "ERROR: Sensitive files in staging!" && exit 1 || echo "Staging area is clean"
   ```
2. Stage all changes: `git add -A`
3. Commit with conventional message: `chore: update CHANGELOG, README, and version`
4. Push to origin: `git push origin main`

## File Format Standards

### CHANGELOG.md Format

```markdown
## [vX.Y.Z] - YYYY-MM-DD

### Feat
- Description of feature with [file:line] reference

### Fix
- Description of fix with [file:line] reference

### Changed
- Description of change with [file:line] reference

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

- **Framework**: Node.js/Express proxy server with better-sqlite3 database
- **Module System**: ES Modules (ESM) - `.mjs` and `.mjs` files
- **Version**: Semantic versioning (1.16.0)
- **Bandit Algorithm**: Discounted UCB1 with 0.99 discount factor
- **Database**: SQLite via better-sqlite3 with additive-only migrations (ADD COLUMN)
- **Session Management**: SESSION_TTL_MS=30m, STREAM_IDLE_MS=60s
- **Error Handling**: 5 scopes (ban/cooldown/flag/provider/model); consecutive_5xx >= 3 triggers degraded mode
- **Quota System**: Provider-level (RPM/RPD); atomic check of minute+day window
- **Soft Bias**: profileMultiplier applies to UCB1 score; multipliers stack
- **Testing**: node:test + in-memory :memory: DB; helpers: makeBandit(), seedCatalog()
- **Gotcha**: Fallback chain in config/bandit.json bypasses UCB1
- **Key Features**: 
  - Multi-Armed Bandit reverse proxy router
  - Dynamic LLM traffic distribution
  - Enhanced cooldown management
  - Aggressive 3-strike punishment system for critical failures
  - Exponential backoff cooldowns (15s→5m→30m→2h→permanent)
  - Training model isolation with production mixing (models + 0.3*models_train)

### Bandit-Specific Scopes

When generating changelog entries for bandit-related changes, use these scopes:
- `bandit` - Core algorithm changes
- `proxy` - Request routing and session management
- `dashboard` - Web UI and metrics display
- `config` - Configuration file changes
- `scripts` - Utility scripts
- `db` - Database schema changes

## Usage

```bash
npm run auto-git
```

The script will:
1. Run syntax checks
2. Analyze git history for version-appropriate changes
3. Generate/update CHANGELOG.md
4. Update README.md version header
5. Update package.json version
6. Commit and push changes

## Safety Checks

Before any commit:
- All `.env` files remain unstaged
- No credential files are committed
- All changes are properly documented in CHANGELOG

## Error Pattern Documentation

Important patterns tracked in `config/bandit.json`:
- SafeWrite initialization errors
- Model error classifications
- Critical failure patterns (403, 429, timeout, safeWrite)