# Auto-Git Script Modifications Documentation

**File**: [`/home/marco/.roo/commands/auto-git.sh`](file:///home/marco/.roo/commands/auto-git.sh:1)

This document describes the modifications made to the auto-git slash command script to improve commit message quality and add git history audit capabilities.

## Overview of Changes

The auto-git script has been enhanced with two major improvements:

1. **Intelligent Commit Message Generation**: Commit messages are now generated based on actual file changes through diff analysis and pattern matching, replacing generic "automated commit" messages
2. **Git History Audit System**: Automatic detection and rewriting of generic/automated commit messages with safety checks and backup mechanisms

## New Features Added

### 1. Intelligent Commit Message Generation

**Location**: [`/home/marco/.roo/commands/auto-git.sh`](file:///home/marco/.roo/commands/auto-git.sh:317)

The `generate_commit_message()` function has been completely redesigned to analyze staged files and generate meaningful conventional commit messages.

#### Key Improvements:

- **Diff-based analysis**: Examines actual code changes using `git diff --cached` instead of just file names
- **Pattern matching**: Detects specific changes in code (bandit algorithms, quota tracking, error classification, session management, streaming, context compression, mode detection, health checking, notifiers, request tracking, log throttling)
- **Context-aware descriptions**: Extracts meaningful descriptions from changed functions/classes
- **Multi-file consolidation**: Combines changes from multiple files into coherent descriptions
- **Type determination**: Automatically determines commit type (feat, docs, chore, refactor) based on file changes

### 2. Git History Audit and Rewrite

**Location**: [`/home/marco/.roo/commands/auto-git.sh`](file:///home/marco/.roo/commands/auto-git.sh:117)

The `audit_and_fix_history()` function audits recent git history for generic messages and offers rewriting options.

#### Key Features:

- **Generic message detection**: Identifies commits with messages like "automated commit", "feat(...): automated commit", "chore: automated commit", or containing "automated commit"
- **Consecutive commit grouping**: Detects groups of consecutive generic commits by same author within 1 hour
- **Safety checks**: Verifies if commits are pushed to remote before suggesting rewrites
- **Backup branch creation**: Automatically creates backup branches before any history modifications
- **Dry-run analysis**: Analyzes proposed squashes without executing destructive operations
- **Environment-based configuration**: Can be skipped or auto-executed via environment variables

## Commit Message Generation

### How It Works Now

The commit message generation process follows these steps:

1. **Staged File Collection**: Gather all staged files using `git diff --cached --name-only`
2. **File Type Classification**: Categorize files into types (src, tests, docs, scripts, config, readme, changelog)
3. **Commit Type Determination**: Set type based on file types:
   - `feat` for source or test files
   - `docs` for documentation only
   - `chore` for config changes or changelog updates
4. **Scope Building**: Create scope from file categories (e.g., `(src,tests,docs)`)
5. **Diff Analysis**: For each staged file:
   - Extract diff content using `git diff --cached`
   - Apply pattern matching for specific technologies/features
   - Extract changed function/class names when possible
6. **Description Construction**: Build concise description with fallback logic
7. **Message Assembly**: Combine type, scope, and description into conventional format

### Pattern Matching Details

The script recognizes specific change patterns:

| Pattern | Detected In | Example Message |
|---------|-------------|-----------------|
| `bandit\|Bandit\|discountFactor\|ucb\|UCB` | src files | "update bandit algorithm" |
| `quota\|Quota\|provider.*limit\|rpm\|rpd` | src files | "update provider quota tracking" |
| `error\|Error\|classify\|Classify\|ban\|cooldown` | src files | "fix error classification" |
| `session\|Session\|SESSION_TTL\|affinity` | src files | "update session management" |
| `stream\|Stream\|STREAM_IDLE\|STREAM_MAX` | src files | "fix streaming timeouts" |
| `context\|Context\|compress\|truncate` | src files | "update context compression" |
| `mode\|Mode\|detectProfile\|profileMultiplier` | src files | "update mode detection" |
| `health\|Health\|health-check\|HealthChecker` | src files | "update health checking" |
| `notifier\|Notifier\|notify` | src files | "update notifier" |
| `request.*tracker\|RequestTracker` | src files | "update request tracking" |
| `log.*throttle\|LogThrottle` | src files | "update log throttling" |

### File Type Handling

| File Pattern | Handling |
|--------------|----------|
| `src/*.mjs\|src/*.js\|src/*.ts` | Deep diff analysis with pattern matching |
| `config/*.json` | Specific config names (bandit.json, provider-limits.json, modes.json) |
| `tests/*\|__tests__/*` | Marked as tests |
| `docs/*\|*.md` | Documentation updates, CHANGELOG/README special handling |
| `scripts/*` | Script updates |
| `*.json\|*.config.*\|*.rc` | Configuration updates |

## History Audit Functionality

### Detection of Generic Messages

**Location**: [`/home/marco/.roo/commands/auto-git.sh`](file:///home/marco/.roo/commands/auto-git.sh:28)

The `is_generic_commit_message()` function detects generic messages using:
- Exact pattern matches: `^automated commit$`, `^feat\(.*\): automated commit$`, `^chore: automated commit$`
- Contains check: any message containing "automated commit" (case-insensitive)

### Safety Checks

Before offering history rewrites, the script performs:

1. **Push Status Check**: Verifies if generic commits are pushed to remote
   - If unpushed: Safe to rewrite (local only)
   - If pushed: Requires force push warning

2. **Backup Branch Creation**: Creates timestamped backup branch
   - Format: `backup/pre-audit-YYYYMMDD-HHMMSS`
   - Ensures recovery option if rewrite goes wrong

3. **Consecutive Commit Analysis**: Groups commits by:
   - Same author
   - Within 1 hour time window
   - Consecutive in history

### Squash Logic

The `auto_squash_generic_commits()` function:

1. Identifies groups of consecutive generic commits (2+ commits)
2. Analyzes combined file changes across all commits
3. Proposes new consolidated commit message using `analyze_commit_for_message()`
4. Currently operates in **dry-run mode** for safety
5. Logs proposed changes without executing destructive rewrites

## Configuration Options

### Environment Variables

#### `SKIP_HISTORY_AUDIT`

**Default**: `false`
**Type**: boolean string

Skips the history audit phase entirely.

```bash
SKIP_HISTORY_AUDIT=true ./auto-git.sh
```

**Use cases**:
- Non-interactive CI/CD pipelines
- When history is already clean
- Faster execution without audit overhead

**Location**: [`/home/marco/.roo/commands/auto-git.sh`](file:///home/marco/.roo/commands/auto-git.sh:119)

#### `AUTO_SQUASH_GENERIC`

**Default**: `false`
**Type**: boolean string

Automatically proceeds with auto-squash of consecutive generic commits without interactive prompt.

```bash
AUTO_SQUASH_GENERIC=true ./auto-git.sh
```

**Behavior**:
- Skips interactive menu
- Runs squash analysis automatically
- Currently in dry-run mode (safe)
- Still requires manual review for actual rewrite

**Location**: [`/home/marco/.roo/commands/auto-git.sh`](file:///home/marco/.roo/commands/auto-git.sh:247)

### Interactive Options

When history audit detects generic commits, users can choose:

1. **Review and rewrite messages individually** (not implemented in current version)
2. **Auto-squash consecutive generic commits** (dry-run analysis only)
3. **Skip history fix this time** (default)

## Examples

### Before and After Commit Messages

#### Example 1: Bandit Algorithm Changes

**Before** (generic):
```
chore: automated commit
```

**After** (specific):
```
feat(src): update bandit algorithm
```

**Analysis**: Detected changes in `src/bandit.mjs` with patterns matching "bandit", "discountFactor", "ucb"

#### Example 2: Provider Quota Updates

**Before** (generic):
```
automated commit
```

**After** (specific):
```
chore(config): update provider limits
```

**Analysis**: Changes in `config/provider-limits.json` detected

#### Example 3: Multiple File Types

**Before** (generic):
```
feat(src): automated commit
```

**After** (specific):
```
feat(src,tests,docs): update session management, update tests
```

**Analysis**: 
- Source files changed with session-related patterns
- Test files updated
- Documentation updated

#### Example 4: Documentation Only

**Before** (generic):
```
chore: automated commit
```

**After** (specific):
```
docs(docs): update readme
```

**Analysis**: Only README.md changed, no source files

### History Audit Example

**Detected generic commits**:
```
Found 3 generic commit(s) in last 20 commits:
  1. abc1234 (by marco on 2024-01-15 10:30:00)
     Message: chore: automated commit
     Files: src/index.mjs public/dashboard.html
  2. def5678 (by marco on 2024-01-15 10:32:15)
     Message: automated commit
     Files: src/bandit.mjs config/bandit.json
  3. ghi9012 (by marco on 2024-01-15 10:45:00)
     Message: feat(src): automated commit
     Files: src/notifier.mjs

Safety check:
  WARNING: 2 generic commit(s) are NOT pushed to remote.
  Rewriting will be safe (local only).

Found 1 group(s) of consecutive generic commits that can be squashed.
  Group 1: abc1234,def5678
```

**Proposed squash**:
```
Proposed squash message: feat(src,config): update bandit algorithm
[DRY RUN] Would squash 2 commits into: feat(src,config): update bandit algorithm
Commit hashes: abc1234 def5678
```

## Usage Instructions

### Basic Usage

Run the auto-git script as normal:

```bash
/home/marco/.roo/commands/auto-git.sh
```

The script will:
1. Stage all changes
2. Scan for secrets
3. Generate intelligent commit message
4. Audit recent history for generic messages
5. Commit and push changes

### Skipping History Audit

For faster execution or when you know history is clean:

```bash
SKIP_HISTORY_AUDIT=true /home/marco/.roo/commands/auto-git.sh
```

### Auto-Squash Mode

For non-interactive operation with automatic squash analysis:

```bash
AUTO_SQUASH_GENERIC=true /home/marco/.roo/commands/auto-git.sh
```

### Manual History Audit

To manually trigger audit without committing:

The audit runs automatically after `git pull --rebase` and before commit. To skip commit:

1. Run script with no changes
2. Or modify script to exit after audit phase

### Best Practices

1. **Review proposed messages**: Always verify the generated commit message looks appropriate
2. **Backup before rewrite**: Script automatically creates backup branches
3. **Check remote status**: Be aware that pushed commits require force push to rewrite
4. **Use environment variables**: Set `SKIP_HISTORY_AUDIT=true` in CI/CD environments
5. **Dry-run first**: Squash operations are in dry-run mode - review proposals carefully

## Technical Details

### Commit Message Analysis Function

**Location**: [`/home/marco/.roo/commands/auto-git.sh`](file:///home/marco/.roo/commands/auto-git.sh:42)

The `analyze_commit_for_message()` function analyzes historical commits:

- Examines commit diff using `git diff-tree --no-commit-id --name-only -r`
- Detects file types and builds scope
- Analyzes diff content for patterns
- Proposes consistent message for historical commits

### Lock Mechanism

The script uses file locking to prevent concurrent runs:

```bash
LOCKFILE="/tmp/auto-git.lock"
exec 200>"$LOCKFILE"
flock -n 200
```

### Safety Features

1. **File lock**: Prevents concurrent executions
2. **Secret scanning**: Checks staged files for API keys, tokens, secrets
3. **Rebase handling**: Uses `--autostash` for conflict avoidance
4. **Push verification**: Confirms remote push succeeded
5. **Backup branches**: Creates restore points before history modifications
6. **Dry-run mode**: Squash operations don't execute destructively

## Migration Notes

### From Old Behavior

**Previous behavior**:
- All commits used generic "automated commit" message
- No history analysis
- Manual commit message creation required for meaningful messages

**New behavior**:
- Messages automatically generated from code analysis
- History audit identifies and can fix past generic commits
- Conventional commit format enforced

### Breaking Changes

None. All changes are backward compatible and additive.

## Troubleshooting

### Issue: Commit message still generic

**Solution**: Ensure changes are staged and contain analyzable content. Empty commits fall back to generic message.

### Issue: History audit skipped unexpectedly

**Solution**: Check if `SKIP_HISTORY_AUDIT=true` is set in environment.

### Issue: Backup branch creation fails

**Solution**: Script will warn but continue. Ensure you have branch creation permissions.

### Issue: Pattern matching not working

**Solution**: Verify file extensions are recognized. Add custom patterns to the case statements in `generate_commit_message()`.

## Future Enhancements

Potential improvements for the auto-git script:

1. Interactive message editing before commit
2. Custom pattern configuration files
3. Machine learning-based message generation
4. Integration with commit message linters
5. Full interactive rebase for actual history rewriting
6. Commit message templates per file type
7. Integration with AI for more sophisticated analysis

---

**Last updated**: 2026-10-31
**Script version**: Enhanced with intelligent messaging and history audit
