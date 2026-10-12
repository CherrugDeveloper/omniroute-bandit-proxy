#!/usr/bin/env bash
# git-utils.sh - Shared library functions for git-auto-commit skill
# This file is part of the git-auto-commit skill and provides common utilities.

set -uo pipefail

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SKILL_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Global variables
LOG_ENTRIES=()
JSON_OUTPUT=false
LOG_LEVEL="${GIT_AUTO_COMMIT_LOG_LEVEL:-INFO}"
DRY_RUN="${GIT_AUTO_COMMIT_DRY_RUN:-false}"
AUTO_MESSAGE="${GIT_AUTO_COMMIT_AUTO_MESSAGE:-true}"
HISTORY_DEPTH="${GIT_AUTO_COMMIT_HISTORY_DEPTH:-20}"
SQUASH_THRESHOLD="${GIT_AUTO_COMMIT_SQUASH_THRESHOLD:-3}"
WSL_EXEC="${GIT_AUTO_COMMIT_WSL_EXEC:-true}"

# Logging functions
log_entry() {
    local level="$1"
    local message="$2"
    local timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

    if [[ "$JSON_OUTPUT" == "true" ]]; then
        local json_entry
        json_entry=$(cat <<EOF
{
  "timestamp": "$timestamp",
  "level": "$level",
  "message": $message
}
EOF
)
        LOG_ENTRIES+=("$json_entry")
    else
        local formatted_time="$(date '+%Y-%m-%d %H:%M:%S')"
        echo "[$formatted_time] $level: $message" >&2
    fi
}

log_info() {
    if [[ "$LOG_LEVEL" == "DEBUG" || "$LOG_LEVEL" == "INFO" || "$LOG_LEVEL" == "WARN" || "$LOG_LEVEL" == "ERROR" ]]; then
        log_entry "INFO" "$(printf '%s' "$1")"
    fi
}

log_warn() {
    if [[ "$LOG_LEVEL" == "DEBUG" || "$LOG_LEVEL" == "INFO" || "$LOG_LEVEL" == "WARN" || "$LOG_LEVEL" == "ERROR" ]]; then
        log_entry "WARN" "$(printf '%s' "$1")"
    fi
}

log_error() {
    if [[ "$LOG_LEVEL" == "DEBUG" || "$LOG_LEVEL" == "INFO" || "$LOG_LEVEL" == "WARN" || "$LOG_LEVEL" == "ERROR" ]]; then
        log_entry "ERROR" "$(printf '%s' "$1")"
    fi
}

log_debug() {
    if [[ "$LOG_LEVEL" == "DEBUG" ]]; then
        log_entry "DEBUG" "$(printf '%s' "$1")"
    fi
}

# JSON output setup
enable_json_output() {
    JSON_OUTPUT=true
}

# Git command wrapper with error handling
git_cmd() {
    local cmd="$*"
    local output
    local exit_code
    local max_retries=3
    local retry_count=0

    log_debug "Running git command: $cmd"

    while [[ $retry_count -lt $max_retries ]]; do
        # Handle commands with pipes by splitting into separate commands
        if [[ "$cmd" == *"|"* ]]; then
            # For piped commands, execute them directly
            if output=$(eval "$cmd" 2>&1); then
                exit_code=0
                break
            else
                exit_code=$?
            fi
        else
            # For simple commands, use the original approach
            if output=$(eval "$cmd" 2>&1); then
                exit_code=0
                break
            else
                exit_code=$?
            fi
        fi

        # Check if we should retry based on error type
        if classify_git_error "$output" == "network" || [[ $exit_code -eq 128 && "$output" =~ "Connection reset" ]]; then
            retry_count=$((retry_count + 1))
            if [[ $retry_count -lt $max_retries ]]; then
                log_warn "Git command failed (attempt $retry_count/$max_retries), retrying in 2 seconds..."
                sleep 2
                continue
            fi
        fi

        break
    done

    if [[ $exit_code -ne 0 ]]; then
        log_error "Git command failed: $cmd (exit code: $exit_code)"
        log_error "Output: $output"

        # Check for authentication failures
        if is_auth_failure "$output"; then
            log_error "AUTHENTICATION FAILURE: Git credentials are invalid or expired"
            log_error "Please check your git credentials and try again"
            log_error "For SSH: ensure your SSH key is added to ssh-agent"
            log_error "For HTTPS: check your username/password or token"
        fi
    fi

    echo "$output"
    return $exit_code
}

# Classify git errors for appropriate handling
# Returns: auth, network, conflict, permission, or unknown
classify_git_error() {
    local output="$1"

    if is_auth_failure "$output"; then
        echo "auth"
        return
    fi

    if is_network_error "$output"; then
        echo "network"
        return
    fi

    if is_merge_conflict "$output"; then
        echo "conflict"
        return
    fi

    if echo "$output" | grep -qE "(permission denied|fatal: .*: Permission denied)"; then
        echo "permission"
        return
    fi

    echo "unknown"
}

# Check if error is authentication related
is_auth_failure() {
    local output="$1"
    echo "$output" | grep -iE "(fatal: .*: Authentication failed|fatal: .*: Could not read Password|fatal: .*: unable to access|fatal: .*: Permission denied.*push|fatal: .*: Access denied|fatal: .*: Bad owner or permissions on .*\.ssh/config|fatal: .*: no such identity)" | grep -v "Permission denied to .*\.ssh/config" | head -1
}

# Check if error is network related
is_network_error() {
    local output="$1"
    echo "$output" | grep -iE "(Connection refused|Connection timed out|Connection reset|Connection aborted|Could not resolve host|Network is unreachable|SSL_ERROR|TLS handshake failed|fatal: .*: unable to access.*Connection)" | head -1
}

# Check if error is a merge conflict
is_merge_conflict() {
    local output="$1"
    echo "$output" | grep -iE "(CONFLICT|Automatic merge failed|merge conflict)" | head -1
}

# Git command wrapper for capturing output without stderr pollution
git_cmd_capture() {
    local cmd="$*"
    local output
    local exit_code
    local max_retries=2
    local retry_count=0

    log_debug "Running git command (capture): $cmd"

    while [[ $retry_count -lt $max_retries ]]; do
        # Execute command and capture only stdout, redirect stderr to /dev/null
        if output=$(eval "$cmd" 2>/dev/null); then
            exit_code=0
            break
        else
            exit_code=$?
        fi

        # Check if we should retry based on error type
        local stderr_output
        stderr_output=$(eval "$cmd" 2>&1 >/dev/null || true)
        if is_network_error "$stderr_output"; then
            retry_count=$((retry_count + 1))
            if [[ $retry_count -lt $max_retries ]]; then
                log_warn "Git command failed (attempt $retry_count/$max_retries), retrying..."
                sleep 1
                continue
            fi
        fi

        break
    done

    if [[ $exit_code -ne 0 ]]; then
        log_debug "Git command (capture) failed: $cmd (exit code: $exit_code)"

        # Check for authentication failures
        local stderr_output
        stderr_output=$(eval "$cmd" 2>&1 >/dev/null || true)
        if is_auth_failure "$stderr_output"; then
            log_error "AUTHENTICATION FAILURE detected"
        fi
    fi

    echo "$output"
    return $exit_code
}

# Check if we're in a git repository and get root
check_git_repo() {
    local root
    root=$(git_cmd_capture "git rev-parse --show-toplevel" 2>/dev/null)
    if [[ -z "$root" ]]; then
        log_error "Not in a git repository"
        return 2
    fi

    # Handle detached HEAD
    local branch
    branch=$(git_cmd_capture "git rev-parse --abbrev-ref HEAD" 2>/dev/null)
    if [[ "$branch" == "HEAD" ]]; then
        log_warn "Detached HEAD state detected. Commits may be lost if not on a branch."
    fi

    log_info "Git repository verified at $root"
    return 0
}

# Clean stale staged entries (deleted files still in index)
clean_stale_staged() {
    log_info "Checking for stale staged entries..."

    # Stale entries = staged deletions (files staged for removal that still exist
    # in the working tree, or files staged but now missing). Use --diff-filter=D
    # to capture only staged deletions, and capture stdout only (no stderr).
    local stale_files
    stale_files=$(git_cmd_capture "git diff --cached --name-only --diff-filter=D")

    if [[ -n "$stale_files" ]]; then
        log_warn "Found stale staged entries, cleaning..."
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would clean stale staged entries: $stale_files"
        else
            git_cmd "git reset HEAD -- $stale_files" >/dev/null
            log_info "Cleaned stale staged entries: $stale_files"
        fi
    else
        log_info "No stale staged entries found"
    fi
}

# Ensure all changes are staged
stage_all_changes() {
    log_info "Staging all changes..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would run: git add -A"
    else
        if ! git_cmd "git add -A"; then
            log_error "Failed to stage changes"
            return 2
        fi
    fi
}

# Sync repository state: stash changes, pull with rebase, then pop stash
sync_repository_state() {
    local branch="$1"
    log_info "Syncing repository state for branch '$branch'..."

    # Check for uncommitted changes
    local has_changes
    if ! git_cmd_capture "git diff-index --quiet HEAD --"; then
        has_changes=true
        log_info "Uncommitted changes detected, stashing..."
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would run: git stash push -u -m \"auto-commit stash before sync\""
        else
            # Stash changes including untracked files
            if ! git_cmd "git stash push -u -m \"auto-commit stash before sync\""; then
                log_error "Failed to stash changes"
                return 2
            fi
        fi
    else
        has_changes=false
        log_info "No uncommitted changes found"
    fi

    # Fetch latest with retry
    local fetch_output
    fetch_output=$(git_cmd "git fetch origin" 2>&1)
    local fetch_code=$?

    if [[ $fetch_code -ne 0 ]]; then
        log_error "Failed to fetch from origin"
        if is_auth_failure "$fetch_output"; then
            log_error "AUTHENTICATION FAILURE: Cannot fetch - check credentials"
            return 2
        fi
        if is_network_error "$fetch_output"; then
            log_error "NETWORK ERROR: Cannot reach origin - check connection"
            return 2
        fi
        # If fetch fails but we have changes, still try to continue
        log_warn "Continuing despite fetch failure..."
    fi

    # Check if behind
    local local_hash
    local remote_hash
    local_hash=$(git_cmd "git rev-parse $branch" 2>/dev/null || echo "")
    remote_hash=$(git_cmd "git rev-parse origin/$branch" 2>/dev/null || echo "")

    if [[ -n "$local_hash" && -n "$remote_hash" && "$local_hash" != "$remote_hash" ]]; then
        log_info "Branch is behind origin, performing pull --rebase..."
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would run: git pull --rebase origin $branch"
        else
            local pull_output
            pull_output=$(git_cmd "git pull --rebase origin $branch" 2>&1)
            local pull_code=$?

            if [[ $pull_code -ne 0 ]]; then
                log_error "Failed to pull --rebase"

                # Check for conflicts
                if is_merge_conflict "$pull_output"; then
                    log_warn "Merge conflict detected during rebase"
                    log_warn "Attempting to abort and restore stash..."
                    git_cmd "git rebase --abort" >/dev/null 2>&1 || true
                fi

                # If we stashed changes, try to restore them before returning
                if [[ "$has_changes" == "true" && "$DRY_RUN" != "true" ]]; then
                    log_warn "Attempting to restore stashed changes after pull failure..."
                    git_cmd "git stash pop" >/dev/null 2>&1 || true
                fi
                return 5
            fi
        fi
    else
        log_info "Branch is up to date with origin"
    fi

    # Pop stash if we had changes
    if [[ "$has_changes" == "true" ]]; then
        log_info "Restoring stashed changes..."
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would run: git stash pop"
        else
            local pop_output
            pop_output=$(git_cmd "git stash pop" 2>&1)
            local pop_code=$?

            if [[ $pop_code -ne 0 ]]; then
                if is_merge_conflict "$pop_output"; then
                    log_warn "Conflicts occurred when popping stash - manual resolution may be needed"
                    log_warn "You may need to resolve conflicts and commit the changes"
                    # Don't return error here as the pull succeeded, just warn about conflicts
                else
                    log_error "Failed to restore stashed changes"
                    return 2
                fi
            else
                log_info "Stashed changes restored successfully"
            fi
        fi
    fi

    log_info "Repository state synchronized"
}

# Pull with rebase if behind (kept for backward compatibility)
pull_rebase_if_behind() {
    local branch="$1"
    log_info "Checking if branch '$branch' is behind origin..."

    # Fetch latest
    git_cmd "git fetch origin" >/dev/null

    # Check if behind
    local local_hash
    local remote_hash
    local_hash=$(git_cmd "git rev-parse $branch")
    remote_hash=$(git_cmd "git rev-parse origin/$branch")

    if [[ "$local_hash" != "$remote_hash" ]]; then
        log_info "Branch is behind origin, performing pull --rebase..."
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would run: git pull --rebase origin $branch"
        else
            if ! git_cmd "git pull --rebase origin $branch"; then
                log_error "Failed to pull --rebase"
                return 5
            fi
        fi
    else
        log_info "Branch is up to date with origin"
    fi
}

# Validate .gitignore covers common patterns
validate_gitignore() {
    log_info "Validating .gitignore coverage..."

    local common_patterns=(
        "*.log"
        "*.tmp"
        "*.bak"
        "*.swp"
        "*~"
        "node_modules/"
        "*.env"
        "*.db"
        "*.pid"
        ".DS_Store"
        "Thumbs.db"
        ".idea/"
        ".vscode/"
    )

    local missing_patterns=()
    local gitignore_file=""

    # Find .gitignore in the actual repo (no temp directory needed)
    if [[ -f "$SKILL_ROOT/../.gitignore" ]]; then
        gitignore_file="$SKILL_ROOT/../.gitignore"
    elif [[ -f "$SKILL_ROOT/../../.gitignore" ]]; then
        gitignore_file="$SKILL_ROOT/../../.gitignore"
    elif [[ -f "$SKILL_ROOT/../../../.gitignore" ]]; then
        gitignore_file="$SKILL_ROOT/../../../.gitignore"
    fi

    if [[ -z "$gitignore_file" || ! -f "$gitignore_file" ]]; then
        log_warn "No .gitignore found in repository root"
        return 0
    fi

    # Read .gitignore content once
    local gitignore_content
    gitignore_content=$(cat "$gitignore_file")

    # Check each pattern against .gitignore content directly
    for pattern in "${common_patterns[@]}"; do
        if ! echo "$pattern" | grep -qFf <(echo "$gitignore_content") && ! grep -qF "$pattern" "$gitignore_file"; then
            log_warn "Pattern '$pattern' may not be covered by .gitignore"
            missing_patterns+=("$pattern")
        fi
    done

    if [[ ${#missing_patterns[@]} -gt 0 ]]; then
        log_warn "Missing .gitignore patterns: ${missing_patterns[*]}"
    else
        log_info ".gitignore appears to cover common patterns"
    fi
}

# Check for secrets in staged files
check_secrets() {
    log_info "Checking for potential secrets in staged files..."

    local staged_files
    staged_files=$(git_cmd "git diff --cached --name-only" 2>/dev/null || true)

    if [[ -z "$staged_files" ]]; then
        log_debug "No staged files to check for secrets"
        return 0
    fi

    # Exclude the secret detection script itself to avoid false positives
    # from regex pattern definitions in the code
    local filtered_files
    filtered_files=$(echo "$staged_files" | grep -v 'git-utils.sh' || true)

    if [[ -z "$filtered_files" ]]; then
        log_debug "Only git-utils.sh staged - skipping secret check"
        return 0
    fi

    # Get all staged file diffs at once, but only for non-excluded files
    local staged_diff
    staged_diff=$(git_cmd "git diff --cached -- $filtered_files" 2>/dev/null || true)

    if [[ -z "$staged_diff" ]]; then
        return 0
    fi

    # Extract only added lines (starting with +) and filter out diff headers
    # This reduces false positives from documentation and code comments
    local added_lines
    added_lines=$(echo "$staged_diff" | grep '^+' | grep -v '^+++' || true)

    if [[ -z "$added_lines" ]]; then
        log_info "No secrets detected in staged files"
        return 0
    fi

    # Single grep pass to find common secret patterns across all staged files
    # Patterns: API keys, tokens, passwords, private keys, connection strings
    # Focus on actual secret assignments (key=value format) rather than just words
    # Using a temp file to avoid self-matching issues
    local secrets_found
    local pattern_file
    pattern_file=$(mktemp)
    cat > "$pattern_file" <<'PATTERNS'
(api|secret|access|auth)[_-]?(key|token)[[:space:]]*[=:][[:space:]]*['\"]?[A-Za-z0-9_\-\.]{8,}
(password|passwd)[[:space:]]*[=:][[:space:]]*['\"]?[^\s'\"]{4,}
private[_-]?key[[:space:]]*[=:][[:space:]]*['\"]?[A-Za-z0-9_\-\.]{10,}
-----BEGIN (RSA|OPENSSH|DSA|EC|PGP)
mongodb://[^[:space:]]+:[^[:space:]]+@
mysql://[^[:space:]]+:[^[:space:]]+@
postgres://[^[:space:]]+:[^[:space:]]+@
redis://[^[:space:]]+:[^[:space:]]+@
amqp://[^[:space:]]+:[^[:space:]]+@
smtp://[^[:space:]]+:[^[:space:]]+@
PATTERNS
    secrets_found=$(echo "$added_lines" | grep -iEf "$pattern_file" | head -5 || true)
    rm -f "$pattern_file"

    if [[ -n "$secrets_found" ]]; then
        log_error "Potential secrets found in staged files:"
        echo "$secrets_found" | while IFS= read -r line; do
            log_error "  $line"
        done
        return 4
    fi

    log_info "No secrets detected in staged files"
    return 0
}

# Determine conventional commit type from changed paths
determine_commit_type() {
    local diff_stat="$1"
    local diff_names="$2"

    # Default type
    local commit_type="feat"

    # Check for docs
    if echo "$diff_names" | grep -E "(\.md|README|CHANGELOG)" >/dev/null; then
        commit_type="docs"
    # Check for tests
    elif echo "$diff_names" | grep -E "(test|spec)" >/dev/null; then
        commit_type="test"
    # Check for CI config
    elif echo "$diff_names" | grep -E "(\.|github|gitlab|travis|circleci)" >/dev/null; then
        commit_type="ci"
    # Check for build files
    elif echo "$diff_names" | grep -E "(Dockerfile|Makefile|package\.json|webpack|rollup|vite)" >/dev/null; then
        commit_type="build"
    # Check for config files
    elif echo "$diff_names" | grep -E "(\.json|\.yaml|\.yml|\.toml|\.ini|\.cfg)" >/dev/null; then
        commit_type="chore"
    # Check for style/formatting
    elif echo "$diff_names" | grep -E "(\.css|\.scss|\.less|\.html|\.svg|\.png|\.jpg)" >/dev/null; then
        commit_type="style"
    # Check for performance
    elif echo "$diff_names" | grep -E "(perf|performance)" >/dev/null; then
        commit_type="perf"
    # Check for refactor
    elif echo "$diff_names" | grep -E "(refactor|restructure)" >/dev/null; then
        commit_type="refactor"
    # Check for bug fixes (more deletions than additions)
    else
        local additions deletions
        additions=$(echo "$diff_stat" | awk '{sum += $1} END {print sum}')
        deletions=$(echo "$diff_stat" | awk '{sum += $2} END {print sum}')

        if [[ $deletions -gt $additions ]]; then
            commit_type="fix"
        fi
    fi

    echo "$commit_type"
}

# Determine scope from changed paths
determine_scope() {
    local diff_names="$1"

    # Extract top-level directories from changed files
    local dirs
    dirs=$(echo "$diff_names" | sed -E 's|/[^/]*/[^/]*$||' | sed -E 's|/[^/]*/$||' | sort -u)

    # Find the most common top-level directory
    local scope=""
    while IFS= read -r dir; do
        if [[ -n "$dir" && "$dir" != "." ]]; then
            local basename="$(basename "$dir")"
            if [[ "$scope" == "" ]]; then
                scope="$basename"
            else
                # Keep the shorter/more specific scope
                if [[ ${#basename} -lt ${#scope} ]]; then
                    scope="$basename"
                fi
            fi
        fi
    done <<< "$dirs"

    # If no clear scope, use "core"
    if [[ -z "$scope" ]]; then
        scope="core"
    fi

    echo "$scope"
}

# Generate conventional commit message
generate_conventional_commit() {
    local diff_stat="$1"
    local diff_names="$2"

    local commit_type scope subject
    commit_type=$(determine_commit_type "$diff_stat" "$diff_names")
    scope=$(determine_scope "$diff_names")

    # Create imperative subject (single line only for git commit -m)
    subject="$commit_type"
    if [[ -n "$scope" ]]; then
        subject="$subject($scope)"
    fi
    subject="$subject: $(echo "$diff_names" | head -1 | sed -E 's/.*\///')"

    # Print only the subject line (single line for git commit -m compatibility)
    printf '%s' "$subject"
}

# Analyze recent commit history
analyze_history() {
    # Log to stderr to avoid polluting JSON output
    log_info "Analyzing recent commit history..." >&2

    local analysis_json
    analysis_json=$(cat <<EOF
{
  "commit_count": 0,
  "conventional_compliance": 0.0,
  "duplicates": [],
  "suggestions": [],
  "orphaned_branches": []
}
EOF
)

    # Get recent commits - single efficient query (no hash needed for analysis)
    local log_data
    log_data=$(git log -n "${HISTORY_DEPTH}" --format='%s' 2>/dev/null)

    if [[ -z "$log_data" ]]; then
        log_warn "Could not retrieve recent commit history"
        echo "$analysis_json"
        return
    fi

    local commit_count=0
    local conventional_count=0
    declare -A subject_counts
    declare -A type_scope_counts

    while IFS= read -r subject; do
        [[ -z "$subject" ]] && continue
        commit_count=$((commit_count + 1))

        # Count subjects for duplicates
        subject_counts["$subject"]=$(( ${subject_counts["$subject"]:-0} + 1 ))

        # Check conventional compliance and type/scope
        if [[ "$subject" =~ ^([a-z]+)(\([a-z0-9_]+\))?:\ .+ ]]; then
            conventional_count=$((conventional_count + 1))
            local type="${BASH_REMATCH[1]}"
            local scope="${BASH_REMATCH[2]}"
            local key="$type$scope"
            type_scope_counts["$key"]=$((${type_scope_counts["$key"]:-0} + 1))
        fi
    done <<< "$log_data"

    # Calculate compliance rate
    local compliance_rate="0.00"
    if [[ $commit_count -gt 0 ]]; then
        compliance_rate=$(printf "%.2f" "$(echo "scale=4; $conventional_count / $commit_count" | bc 2>/dev/null || echo "0")")
    fi

    # Collect duplicates
    local duplicates=()
    for subj in "${!subject_counts[@]}"; do
        if [[ ${subject_counts["$subj"]} -gt 1 ]]; then
            duplicates+=("$subj")
        fi
    done

    # Collect suggestions
    local suggestions=()
    for key in "${!type_scope_counts[@]}"; do
        if [[ ${type_scope_counts["$key"]} -ge $SQUASH_THRESHOLD ]]; then
            suggestions+=("Found ${type_scope_counts["$key"]} commits with type/scope $key - consider squashing")
        fi
    done

    # Find orphaned branches (merged but not deleted)
    local orphaned_branches=()
    local current_branch
    current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")

    if [[ "$current_branch" != "HEAD" ]]; then
        while read -r branch; do
            [[ -z "$branch" ]] && continue
            # Clean branch name (remove * and whitespace)
            branch="${branch//[* ]/}"
            # Skip common branches and current
            [[ "$branch" =~ ^(master|main|HEAD|remotes/.*)$ ]] && continue
            [[ "$branch" == "$current_branch" ]] && continue
            orphaned_branches+=("$branch")
        done <<< "$(git branch --merged "$current_branch" 2>/dev/null)"
    fi

    # Build analysis JSON - handle empty arrays properly with jq fallback
    local duplicates_json suggestions_json orphaned_branches_json

    json_array() {
        if command -v jq >/dev/null 2>&1; then
            printf '%s\n' "$@" | jq -R . | jq -s .
        else
            # Fallback: manual JSON array construction
            local res="["
            local first=true
            for item in "$@"; do
                [[ "$first" == "false" ]] && res+=", "
                res+="\"$item\""
                first=false
            done
            res+="]"
            echo "$res"
        fi
    }

    duplicates_json=$(json_array "${duplicates[@]}")
    suggestions_json=$(json_array "${suggestions[@]}")
    orphaned_branches_json=$(json_array "${orphaned_branches[@]}")

    analysis_json=$(cat <<EOF
{
  "commit_count": $commit_count,
  "conventional_compliance": $compliance_rate,
  "duplicates": $duplicates_json,
  "suggestions": $suggestions_json,
  "orphaned_branches": $orphaned_branches_json
}
EOF
)

    echo "$analysis_json"
}

# Print JSON output
print_json_output() {
    if [[ "$JSON_OUTPUT" == "true" ]]; then
        echo "$(printf '%s\n' "${LOG_ENTRIES[@]}" | jq -s '.')"
    fi
}

# Safe push with retry and conflict recovery
safe_push() {
    local push_cmd="$1"
    local max_retries=3
    local retry_count=0
    local exit_code=0

    log_info "Pushing with retry logic (max $max_retries attempts)..."

    while [[ $retry_count -lt $max_retries ]]; do
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would run: $push_cmd"
            return 0
        fi

        local push_output
        push_output=$(eval "$push_cmd" 2>&1)
        exit_code=$?

        if [[ $exit_code -eq 0 ]]; then
            log_info "Push successful on attempt $((retry_count + 1))"
            return 0
        fi

        log_warn "Push attempt $((retry_count + 1)) failed (exit code: $exit_code)"

        # Check error type
        if is_auth_failure "$push_output"; then
            log_error "AUTHENTICATION FAILURE during push"
            log_error "Please check your git credentials"
            return 3
        fi

        if is_network_error "$push_output"; then
            retry_count=$((retry_count + 1))
            if [[ $retry_count -lt $max_retries ]]; then
                log_warn "Network error, retrying in 3 seconds..."
                sleep 3
                continue
            fi
        fi

        if echo "$push_output" | grep -qE "(non-fast-forward|rejected|fetch first)"; then
            log_warn "Push rejected - remote has changes, attempting to sync..."
            if git_cmd "git fetch origin" >/dev/null 2>&1; then
                if git_cmd "git rebase origin/HEAD" >/dev/null 2>&1; then
                    log_info "Repository synced, retrying push..."
                    retry_count=$((retry_count + 1))
                    sleep 1
                    continue
                fi
            fi
        fi

        # For other errors, don't retry
        break
    done

    log_error "Push failed after $max_retries attempts"
    log_error "Push output: $push_output"
    return 3
}

# Recover from merge conflicts
recover_merge_conflicts() {
    log_info "Attempting to recover from merge conflicts..."

    # Check if we're in a merge state
    if [[ -d .git/rebase-merge ]] || [[ -d .git/rebase-apply ]]; then
        log_warn "Active rebase/merge operation detected"
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would abort current merge/rebase"
            return 0
        fi
        # Abort the operation and try again
        git_cmd "git rebase --abort" >/dev/null 2>&1 || git_cmd "git merge --abort" >/dev/null 2>&1 || true
    fi

    # Check for conflict markers in files
    local conflict_files
    conflict_files=$(git_cmd_capture "git diff --name-only --diff-filter=U" 2>/dev/null || true)

    if [[ -n "$conflict_files" ]]; then
        log_warn "Conflicted files: $conflict_files"
        log_error "Automatic conflict resolution not possible - manual intervention required"
        return 5
    fi

    log_info "No merge conflicts detected"
    return 0
}

# Validate git configuration
validate_git_config() {
    log_info "Validating git configuration..."

    local user_name user_email
    user_name=$(git_cmd_capture "git config user.name" 2>/dev/null || true)
    user_email=$(git_cmd_capture "git config user.email" 2>/dev/null || true)

    if [[ -z "$user_name" ]]; then
        log_warn "Git user.name not set - commits may fail"
    fi

    if [[ -z "$user_email" ]]; then
        log_warn "Git user.email not set - commits may fail"
    fi

    # Check remote connectivity
    local remote_url
    remote_url=$(git_cmd_capture "git config --get remote.origin.url" 2>/dev/null || true)

    if [[ -n "$remote_url" ]]; then
        log_debug "Remote URL: $remote_url"
        # Test connectivity with a lightweight operation
        if ! git_cmd_capture "git ls-remote --heads origin HEAD" >/dev/null 2>&1; then
            log_warn "Cannot reach remote - check network and credentials"
            return 2
        fi
    fi

    log_info "Git configuration validated"
    return 0
}

# Fix Git extension interference (GitKraken, fsmonitor, fileMode issues)
# This addresses false "modified" status in VSCode caused by:
# - GitKraken's gk.exe extension cache (.git/gk/)
# - core.fsmonitor incompatibility with WSL
# - core.fileMode tracking permission changes
fix_git_extension_interference() {
    log_info "Checking for Git extension interference..."

    local fixed_any=false

    # 1. Remove GitKraken cache directory if present
    if [[ -d ".git/gk" ]]; then
        log_warn "Found GitKraken cache directory (.git/gk/), removing..."
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would remove .git/gk/"
        else
            rm -rf .git/gk
            log_info "Removed GitKraken cache directory"
            fixed_any=true
        fi
    fi

    # 2. Check and disable core.fsmonitor if enabled (incompatible with WSL)
    local fsmonitor_enabled
    fsmonitor_enabled=$(git_cmd_capture "git config core.fsmonitor" 2>/dev/null || true)
    if [[ "$fsmonitor_enabled" == "true" ]]; then
        log_warn "core.fsmonitor is enabled (incompatible with WSL), disabling..."
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would disable core.fsmonitor"
        else
            git_cmd "git config core.fsmonitor false"
            log_info "Disabled core.fsmonitor"
            fixed_any=true
        fi
    fi

    # 3. Check and disable core.fileMode if it's causing false modifications
    # This is common on Windows/WSL where file permissions don't map well
    local filemode_enabled
    filemode_enabled=$(git_cmd_capture "git config core.fileMode" 2>/dev/null || true)
    if [[ "$filemode_enabled" == "true" ]]; then
        # Check if there are files showing as modified but only permission changes
        local perm_changes
        perm_changes=$(git_cmd_capture "git diff --name-only" 2>/dev/null | while IFS= read -r file; do
            [[ -z "$file" ]] && continue
            # Check if diff is only mode changes
            local diff_output
            diff_output=$(git diff -- "$file" 2>/dev/null || true)
            if [[ -n "$diff_output" ]] && echo "$diff_output" | grep -q "^old mode\|^new mode" && ! echo "$diff_output" | grep -q "^@@"; then
                echo "$file"
            fi
        done)

        if [[ -n "$perm_changes" ]]; then
            log_warn "core.fileMode is causing false modifications, disabling..."
            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY RUN] Would disable core.fileMode"
            else
                git_cmd "git config core.fileMode false"
                log_info "Disabled core.fileMode"
                fixed_any=true
            fi
        fi
    fi

    # 4. If we made any fixes, rebuild the git index to clear stale state
    if [[ "$fixed_any" == "true" ]] && [[ "$DRY_RUN" != "true" ]]; then
        log_info "Rebuilding git index after configuration changes..."
        rm -f .git/index
        git_cmd "git reset --mixed HEAD" >/dev/null
        log_info "Git index rebuilt"
    fi

    return 0
}

# Initialize skill
init_skill() {
    log_debug "Initializing git-auto-commit skill"

    # Set up logging based on environment
    if [[ "$LOG_LEVEL" == "DEBUG" ]]; then
        log_debug "Debug logging enabled"
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "Dry run mode enabled"
    fi

    if [[ "$AUTO_MESSAGE" == "false" ]]; then
        log_info "Auto message generation disabled"
    fi

    # Validate git configuration
    validate_git_config
}

# Auto-squash duplicate commits with the same subject
# Uses git rebase --interactive with auto-squash to merge commits that have identical messages
auto_squash_duplicates() {
    local max_commits="${1:-$HISTORY_DEPTH}"
    log_info "Checking for duplicate commits to squash (last $max_commits)..."

    # Get commit subjects with their hashes
    local commits
    commits=$(git log -n "$max_commits" --format='%H %s' 2>/dev/null)

    if [[ -z "$commits" ]]; then
        log_debug "No commits to analyze"
        return 0
    fi

    # Find duplicates by subject
    declare -A subject_hashes
    declare -A subject_count
    local duplicates_found=0

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        local hash="${line%% *}"
        local subject="${line#* }"
        subject_count["$subject"]=$((${subject_count["$subject"]:-0} + 1))
        if [[ ${subject_count["$subject"]} -eq 2 ]]; then
            # First duplicate found - record both hashes
            subject_hashes["$subject"]="${subject_hashes["$subject"]:-} $hash"
            duplicates_found=$((duplicates_found + 1))
        elif [[ ${subject_count["$subject"]} -gt 2 ]]; then
            subject_hashes["$subject"]="${subject_hashes["$subject"]:-} $hash"
        fi
    done <<< "$commits"

    if [[ $duplicates_found -eq 0 ]]; then
        log_info "No duplicate commits found"
        return 0
    fi

    log_warn "Found $duplicates_found duplicate commit subject(s)"

    if [[ "$DRY_RUN" == "true" ]]; then
        for subj in "${!subject_hashes[@]}"; do
            log_info "[DRY RUN] Would squash duplicates for: $subj"
        done
        return 0
    fi

    # Perform the squash using git rebase --autosquash
    local current_branch
    current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")
    if [[ "$current_branch" == "HEAD" ]]; then
        log_warn "Detached HEAD - skipping auto-squash"
        return 0
    fi

    # Create a backup branch before rebase
    local backup_branch="backup/pre-squash-$(date +%Y%m%d-%H%M%S)"
    git_cmd "git branch \"$backup_branch\"" >/dev/null 2>&1
    log_info "Created backup branch: $backup_branch"

    # Collect all duplicate commit hashes (all but the first of each group)
    local squash_hashes=""
    for subj in "${!subject_hashes[@]}"; do
        local hashes="${subject_hashes[$subj]}"
        # Skip the first hash (to keep), collect the rest
        local rest
        rest=$(echo "$hashes" | cut -d' ' -f2-)
        squash_hashes="$squash_hashes $rest"
    done

    if [[ -z "$squash_hashes" ]]; then
        log_info "No commits to squash"
        return 0
    fi

    log_info "Squashing duplicate commits using git reset --soft + recommit..."

    # For each duplicate group, reset to before the first commit and recommit
    for subj in "${!subject_hashes[@]}"; do
        local hashes="${subject_hashes[$subj]}"
        local first_hash
        first_hash=$(echo "$hashes" | awk '{print $1}')
        local parent
        parent=$(git rev-parse "${first_hash}^" 2>/dev/null || echo "")

        if [[ -z "$parent" ]]; then
            continue
        fi

        # Reset to parent, keeping all changes from first commit
        git_cmd "git reset --soft \"$parent\"" >/dev/null 2>&1
        # Commit with the original message
        local msg
        msg=$(git log -1 --format='%s' "$first_hash" 2>/dev/null || echo "chore: squashed")
        git_cmd "git commit -m \"$msg\"" >/dev/null 2>&1
        log_debug "Squashed group: $msg"
    done

    log_info "Auto-squash completed"
    return 0
}

# Auto-cleanup orphaned branches (merged but not deleted)
auto_cleanup_orphaned_branches() {
    log_info "Checking for orphaned branches to cleanup..."

    local current_branch
    current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")

    if [[ "$current_branch" == "HEAD" ]]; then
        log_debug "Detached HEAD - skipping orphaned branch cleanup"
        return 0
    fi

    # Find merged branches (excluding current, main, master, and remotes)
    local orphaned
    orphaned=$(git branch --merged "$current_branch" 2>/dev/null | grep -vE '^\*|^\s*(main|master|HEAD|remotes/.*)$' | sed 's/^[* ]*//' | tr -d ' ')

    if [[ -z "$orphaned" ]]; then
        log_info "No orphaned branches to cleanup"
        return 0
    fi

    log_warn "Found orphaned branches: $orphaned"

    if [[ "$DRY_RUN" == "true" ]]; then
        for b in $orphaned; do
            log_info "[DRY RUN] Would delete branch: $b"
        done
        return 0
    fi

    local cleaned=0
    for b in $orphaned; do
        if git_cmd "git branch -d \"$b\"" >/dev/null 2>&1; then
            log_info "Deleted merged branch: $b"
            cleaned=$((cleaned + 1))
        else
            log_warn "Could not delete branch: $b (may have unmerged changes)"
        fi
    done

    if [[ $cleaned -gt 0 ]]; then
        log_info "Cleaned up $cleaned orphaned branch(es)"
    fi

    return 0
}

# Initialize skill
init_skill() {
    log_debug "Initializing git-auto-commit skill"

    # Set up logging based on environment
    if [[ "$LOG_LEVEL" == "DEBUG" ]]; then
        log_debug "Debug logging enabled"
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "Dry run mode enabled"
    fi

    if [[ "$AUTO_MESSAGE" == "false" ]]; then
        log_info "Auto message generation disabled"
    fi

    # Validate git configuration
    validate_git_config
}