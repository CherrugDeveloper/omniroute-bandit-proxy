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
        echo "[$formatted_time] $level: $message"
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
    
    log_debug "Running git command: $cmd"
    
    # Handle commands with pipes by splitting into separate commands
    if [[ "$cmd" == *"|"* ]]; then
        # For piped commands, execute them directly
        if output=$(eval "$cmd" 2>&1); then
            exit_code=0
        else
            exit_code=$?
            log_error "Git command failed: $cmd (exit code: $exit_code)"
            log_error "Output: $output"
        fi
    else
        # For simple commands, use the original approach
        if output=$(eval "$cmd" 2>&1); then
            exit_code=0
        else
            exit_code=$?
            log_error "Git command failed: $cmd (exit code: $exit_code)"
            log_error "Output: $output"
        fi
    fi
    
    echo "$output"
    return $exit_code
}

# Git command wrapper for capturing output without stderr pollution
git_cmd_capture() {
    local cmd="$*"
    local output
    local exit_code
    
    log_debug "Running git command (capture): $cmd"
    
    # Execute command and capture only stdout, redirect stderr to /dev/null
    if output=$(eval "$cmd" 2>/dev/null); then
        exit_code=0
    else
        exit_code=$?
        log_error "Git command failed: $cmd (exit code: $exit_code)"
    fi
    
    echo "$output"
    return $exit_code
}

# Check if we're in a git repository
check_git_repo() {
    if ! git_cmd "git rev-parse --git-dir" >/dev/null 2>&1; then
        log_error "Not in a git repository"
        return 2
    fi
    log_info "Git repository verified"
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
    local test_file
    
    # Create a temporary directory for our tests
    local temp_dir
    temp_dir=$(mktemp -d)
    local original_dir
    original_dir=$(pwd)
    
    cd "$temp_dir" || {
        log_error "Failed to create temporary directory for .gitignore validation"
        return 0  # Don't fail the whole skill for this
    }
    
    # Initialize a git repo in temp dir for testing
    if ! git init -q; then
        log_error "Failed to initialize git repo for .gitignore validation"
        cd "$original_dir"
        rm -rf "$temp_dir"
        return 0
    fi
    
    # Copy the .gitignore from the actual repo to temp dir for testing
    if [[ -f "$SKILL_ROOT/../.gitignore" ]]; then
        cp "$SKILL_ROOT/../.gitignore" .gitignore
    elif [[ -f "$SKILL_ROOT/../../.gitignore" ]]; then
        cp "$SKILL_ROOT/../../.gitignore" .gitignore
    elif [[ -f "$SKILL_ROOT/../../../.gitignore" ]]; then
        cp "$SKILL_ROOT/../../../.gitignore" .gitignore
    fi
    
    for pattern in "${common_patterns[@]}"; do
        # Create a test file matching the pattern
        case $pattern in
            */)  # Directory pattern
                test_file="${pattern}testfile"
                mkdir -p "$(dirname "$test_file")"
                touch "$test_file"
                ;;
            *)     # File pattern or exact match
                test_file="test.$pattern"
                touch "$test_file"
                ;;
        esac
        
        # Check if git would ignore this file
        # git check-ignore exits 0 if ignored, 1 if NOT ignored (both are valid)
        if git check-ignore --quiet "$test_file" 2>/dev/null; then
            : # pattern is covered
        else
            log_warn "Pattern '$pattern' may not be covered by .gitignore"
            missing_patterns+=("$pattern")
        fi
        
        # Clean up test file
        rm -rf "$test_file"
    done
    
    # Cleanup
    cd "$original_dir"
    rm -rf "$temp_dir"
    
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
    
    if [[ -n "$staged_files" ]]; then
        # Simple heuristic: check for common patterns
        local potential_secrets=()
        
        for file in $staged_files; do
            if [[ "$file" == *.env ]] || [[ "$file" == *.json ]] || [[ "$file" == *.js ]]; then
                # Check for common secret patterns
                if git diff --cached -- "$file" | grep -E "(password|secret|key|token|auth)" >/dev/null 2>&1; then
                    potential_secrets+=("$file")
                fi
            fi
        done
        
        if [[ ${#potential_secrets[@]} -gt 0 ]]; then
            log_warn "Potential secrets found in staged files: ${potential_secrets[*]}"
            return 4
        else
            log_info "No obvious secrets detected in staged files"
        fi
    fi
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
    
    # Generate subject from changed files
    local files_list
    files_list=$(echo "$diff_names" | sed 's/^/  - /')
    
    # Create imperative subject
    subject="$commit_type$( [[ "$scope" != "core" ]] && echo ":$scope" ): $(echo "$diff_names" | head -1 | sed -E 's/.*\///')"
    
    # Add body with file list
    local body
    body=$(cat <<EOF
Changes:
$files_list

Diff statistics:
$diff_stat
EOF
)
    
    # Print subject and body with real newlines (avoid polluting caller output with log messages)
    printf '%s\n\n%s' "$subject" "$body"
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
    
    # Get recent commits
    local recent_commits
    recent_commits=$(git_cmd "git log --oneline -${HISTORY_DEPTH} --pretty=format:'%H|%s|%an|%ad' --date=iso" 2>/dev/null || true)
    
    if [[ -z "$recent_commits" ]]; then
        log_warn "Could not retrieve recent commit history"
        echo "$analysis_json"
        return
    fi
    
    # Parse commits
    local commit_count=0
    local conventional_count=0
    local subjects=()
    local commit_hashes=()
    
    while IFS='|' read -r hash subject author date; do
        [[ -z "$hash" ]] && continue
        
        commit_count=$((commit_count + 1))
        commit_hashes+=("$hash")
        subjects+=("$subject")
        
        # Check conventional commit compliance
        if [[ "$subject" =~ ^([a-z]+)(\([a-z0-9_]+\))?:\ .+ ]]; then
            conventional_count=$((conventional_count + 1))
        fi
    done <<< "$recent_commits"
    
    # Calculate compliance rate
    local compliance_rate=0
    if [[ $commit_count -gt 0 ]]; then
        compliance_rate=$(echo "scale=2; $conventional_count / $commit_count" | bc 2>/dev/null || echo "0")
    fi
    
    # Find duplicates (same subject)
    local duplicates=()
    if [[ ${#subjects[@]} -gt 0 ]]; then
        declare -A subject_counts
        for subj in "${subjects[@]}"; do
            subject_counts["$subj"]=$(( ${subject_counts["$subj"]:-0} + 1 ))
        done
        
        for subj in "${!subject_counts[@]}"; do
            if [[ ${subject_counts["$subj"]} -gt 1 ]]; then
                duplicates+=("$subj")
            fi
        done
    fi
    
    # Find squash suggestions (same type/scope commits)
    local suggestions=()
    declare -A type_scope_counts
    for subj in "${subjects[@]}"; do
        if [[ "$subj" =~ ^([a-z]+)(\([a-z0-9_]+\))?:\ .+ ]]; then
            local type="${BASH_REMATCH[1]}"
            local scope="${BASH_REMATCH[2]}"
            local key="$type$scope"
            type_scope_counts["$key"]=$((${type_scope_counts["$key"]:-0} + 1))
        fi
    done
    
    for key in "${!type_scope_counts[@]}"; do
        if [[ ${type_scope_counts["$key"]} -ge $SQUASH_THRESHOLD ]]; then
            suggestions+=("Found ${type_scope_counts["$key"]} commits with type/scope $key - consider squashing")
        fi
    done
    
    # Find orphaned branches
    local orphaned_branches=()
    local current_branch
    current_branch=$(git_cmd "git rev-parse --abbrev-ref HEAD" 2>/dev/null || echo "HEAD")
    
    if [[ "$current_branch" != "HEAD" ]]; then
        local branches
        branches=$(git branch --all --no-color 2>/dev/null || true)
        
        while IFS= read -r branch; do
            branch=$(echo "$branch" | sed 's/^[ *]*//')
            [[ -z "$branch" ]] && continue
            
            # Skip remote-tracking branches and HEAD ref
            if [[ "$branch" == remotes/* ]] || [[ "$branch" == HEAD* ]]; then
                continue
            fi
            
            # Skip current branch
            if [[ "$branch" == "$current_branch" ]]; then
                continue
            fi
            
            # Check if branch is merged into current branch
            if ! git merge-base --is-ancestor "$branch" "$current_branch" 2>/dev/null; then
                # Check if branch has commits ahead of current (local branches only)
                if [[ "$branch" != remotes/* ]]; then
                    local ahead_count
                    ahead_count=$(git rev-list --count "$branch..$current_branch" 2>/dev/null || echo "0")
                    if [[ "$ahead_count" =~ ^[0-9]+$ ]] && [[ "$ahead_count" -eq 0 ]]; then
                        orphaned_branches+=("$branch")
                    fi
                fi
            fi
        done <<< "$branches"
    fi
    
    # Build analysis JSON - handle empty arrays properly
    local duplicates_json suggestions_json orphaned_branches_json
    
    if [[ ${#duplicates[@]} -gt 0 ]]; then
        duplicates_json=$(printf '%s\n' "${duplicates[@]}" | jq -R . | jq -s .)
    else
        duplicates_json='[]'
    fi
    
    if [[ ${#suggestions[@]} -gt 0 ]]; then
        suggestions_json=$(printf '%s\n' "${suggestions[@]}" | jq -R . | jq -s .)
    else
        suggestions_json='[]'
    fi
    
    if [[ ${#orphaned_branches[@]} -gt 0 ]]; then
        orphaned_branches_json=$(printf '%s\n' "${orphaned_branches[@]}" | jq -R . | jq -s .)
    else
        orphaned_branches_json='[]'
    fi
    
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
}