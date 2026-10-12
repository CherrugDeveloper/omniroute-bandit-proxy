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

git_cmd_capture() {
    local cmd="$*"
    local output

    log_debug "Running git command (capture): $cmd"

    if output=$(eval "$cmd" 2>&1); then
        echo "$output"
    else
        log_error "Git command failed: $cmd"
        echo ""
    fi
}

check_git_repo() {
    if ! git rev-parse --git-dir >/dev/null 2>&1; then
        log_error "Not in a git repository"
        return 1
    fi
    log_debug "Git repository verified"
    return 0
}

clean_stale_staged() {
    log_info "Checking for stale staged entries..."

    local stale_count=0
    local stale_files

    # Find files that are staged but no longer exist
    stale_files=$(git diff --cached --name-only | while IFS= read -r file; do
        if [[ ! -f "$file" ]]; then
            echo "$file"
        fi
    done)

    if [[ -n "$stale_files" ]]; then
        while IFS= read -r file; do
            log_info "Removing stale staged entry: $file"
            if [[ "$DRY_RUN" != "true" ]]; then
                git reset HEAD "$file" 2>/dev/null || true
                stale_count=$((stale_count + 1))
            fi
        done <<< "$stale_files"

        if [[ $stale_count -gt 0 ]]; then
            log_info "Cleaned $stale_count stale staged entries"
        fi
    else
        log_debug "No stale staged entries found"
    fi
}

validate_gitignore() {
    log_info "Validating .gitignore coverage..."

    if [[ ! -f ".gitignore" ]]; then
        log_warn ".gitignore file not found"
        return 0
    fi

    # Check for common patterns that should be ignored
    local patterns=(
        "*.env"
        "*.db"
        "*.pid"
        ".DS_Store"
        "Thumbs.db"
    )

    local missing_patterns=()
    for pattern in "${patterns[@]}"; do
        if ! grep -q "^$pattern" ".gitignore" 2>/dev/null; then
            missing_patterns+=("$pattern")
        fi
    done

    if [[ ${#missing_patterns[@]} -gt 0 ]]; then
        log_warn "Missing .gitignore patterns: ${missing_patterns[*]}"
    else
        log_info ".gitignore appears to cover common patterns"
    fi
}

check_secrets() {
    log_info "Checking for potential secrets in staged files..."

    local staged_files
    staged_files=$(git diff --cached --name-only 2>/dev/null || true)

    if [[ -z "$staged_files" ]]; then
        log_debug "No files to check for secrets"
        return 0
    fi

    local secret_patterns=(
        "password"
        "passwd"
        "secret"
        "token"
        "api_key"
        "api_secret"
        "aws_key"
        "aws_secret"
        "private_key"
        "ssh_key"
        "credential"
        "auth"
    )

    local found_secrets=0
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue

        for pattern in "${secret_patterns[@]}"; do
            if grep -qi "$pattern" "$file" 2>/dev/null; then
                log_error "Potential secret found in: $file (pattern: $pattern)"
                found_secrets=$((found_secrets + 1))
            fi
        done
    done <<< "$staged_files"

    if [[ $found_secrets -gt 0 ]]; then
        log_error "Found $found_secrets potential secrets in staged files"
        return 1
    else
        log_info "No obvious secrets detected in staged files"
        return 0
    fi
}

determine_commit_type() {
    local subject="$1"

    if [[ "$subject" =~ ^([a-z]+)(\([a-z0-9_]+\))?:\ .+ ]]; then
        echo "${BASH_REMATCH[1]}"
    else
        echo "other"
    fi
}

determine_scope() {
    local subject="$1"

    if [[ "$subject" =~ ^([a-z]+)(\([a-z0-9_]+\))?:\ .+ ]]; then
        echo "${BASH_REMATCH[2]}"
    else
        echo ""
    fi
}

generate_conventional_commit() {
    local diff_stat="$1"
    local diff_names="$2"

    local commit_type="other"
    local scope=""

<<<<<<< Updated upstream
    # Create imperative subject (single line only for git commit -m)
    subject="$commit_type"
    if [[ -n "$scope" ]]; then
        subject="$subject($scope)"
    fi
    subject="$subject: $(echo "$diff_names" | head -1 | sed -E 's/.*\///')"

    # Print only the subject line (single line for git commit -m compatibility)
    printf '%s' "$subject"
=======
    if [[ -n "$diff_names" ]]; then
        commit_type=$(determine_commit_type "$diff_names")
        scope=$(determine_scope "$diff_names")
    fi

    local conventional_msg="$commit_type"

    if [[ -n "$scope" ]]; then
        conventional_msg="$commit_type($scope)"
    fi

    conventional_msg="$conventional_msg: $diff_stat"

    echo "$conventional_msg"
>>>>>>> Stashed changes
}

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
        # Ensure leading zero for values < 1
        if [[ "$compliance_rate" == .* ]]; then
            compliance_rate="0$compliance_rate"
        fi
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

# Sync repository state (stash, pull, pop)
sync_repository_state() {
    local branch="$1"
    log_info "Syncing repository state for branch '$branch'..."

    # Check if there are uncommitted changes
    local uncommitted_changes
    uncommitted_changes=$(git diff --name-only 2>/dev/null || true)

    if [[ -n "$uncommitted_changes" ]]; then
        log_info "Uncommitted changes detected, stashing..."
        if ! git stash push -m "auto-commit stash before sync" 2>/dev/null; then
            log_error "Failed to stash changes"
            return 1
        fi
    fi

    # Pull from origin
    if ! git pull --rebase origin "$branch" 2>/dev/null; then
        log_error "Failed to pull --rebase from origin/$branch"
        # Try to restore stash
        if git stash list >/dev/null 2>&1; then
            log_info "Attempting to restore stashed changes after pull failure..."
            if ! git stash pop 2>/dev/null; then
                log_error "Failed to restore stashed changes"
            fi
        fi
        return 1
    fi

    # Restore stashed changes
    if git stash list >/dev/null 2>&1; then
        log_info "Restoring stashed changes..."
        if ! git stash pop 2>/dev/null; then
            log_error "Failed to restore stashed changes"
            return 1
        fi
        log_info "Stashed changes restored successfully"
    fi

    log_info "Repository state synchronized"
    return 0
}

# Fix Git extension interference (GitKraken, fsmonitor, fileMode issues)
# This addresses false "modified" status in VSCode caused by GitKraken, fsmonitor, etc.
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

    # 2. Check and disable core.fsmonitor if enabled
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

    # 3. Check and disable core.fileMode if causing false modifications
    local filemode_enabled
    filemode_enabled=$(git_cmd_capture "git config core.fileMode" 2>/dev/null || true)
    if [[ "$filemode_enabled" == "true" ]]; then
        # Check if there are files showing as modified but only permission changes
        local perm_changes
        perm_changes=$(git_cmd_capture "git diff --name-only" 2>/dev/null | while IFS= read -r file; do
            [[ -z "$file" ]] && continue
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

    # 4. If we made any fixes, rebuild the git index
    if [[ "$fixed_any" == "true" ]] && [[ "$DRY_RUN" != "true" ]]; then
        log_info "Rebuilding git index after configuration changes..."
        rm -f .git/index
        git_cmd "git reset --mixed HEAD" >/dev/null
        log_info "Git index rebuilt"
    fi
    return 0
}

# Auto-squash duplicate commits
auto_squash_duplicates() {
    local max_commits="${1:-$HISTORY_DEPTH}"
    log_info "Checking for duplicate commits to squash (last $max_commits)..."

    local commits
    commits=$(git log -n "$max_commits" --format='%H %s' 2>/dev/null)

    if [[ -z "$commits" ]]; then
        log_debug "No commits to analyze"
        return 0
    fi

    declare -A subject_hashes
    declare -A subject_count
    local duplicates_found=0

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        local hash="${line%% *}"
        local subject="${line#* }"
        subject_count["$subject"]=$((${subject_count["$subject"]:-0} + 1))
        # Always record the hash for this subject
        subject_hashes["$subject"]="${subject_hashes["$subject"]:-} $hash"
        if [[ ${subject_count["$subject"]} -eq 2 ]]; then
<<<<<<< Updated upstream
            # First time we see this subject as a duplicate
=======
            subject_hashes["$subject"]="${subject_hashes["$subject"]:-} $hash"
>>>>>>> Stashed changes
            duplicates_found=$((duplicates_found + 1))
        fi
    done <<< "$commits"

    if [[ $duplicates_found -eq 0 ]]; then
        log_info "No duplicate commits found"
        return 0
    fi

    log_warn "Found $duplicates_found duplicate commit subject(s)"

    if [[ "$DRY_RUN" == "true" ]]; then
        for subj in "${!subject_count[@]}"; do
            if [[ ${subject_count["$subj"]} -ge 2 ]]; then
                log_info "[DRY RUN] Would squash duplicates for: $subj"
            fi
        done
        return 0
    fi

    local current_branch
    current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")
    if [[ "$current_branch" == "HEAD" ]]; then
        log_warn "Detached HEAD - skipping auto-squash"
        return 0
    fi

    local backup_branch="backup/pre-squash-$(date +%Y%m%d-%H%M%S)"
    git_cmd "git branch \"$backup_branch\"" >/dev/null 2>&1
    log_info "Created backup branch: $backup_branch"

<<<<<<< Updated upstream
    # Build a todo list for interactive rebase
    # We'll use GIT_SEQUENCE_EDITOR to inject fixup commands
    local base_commit
    base_commit=$(git rev-parse "HEAD~$max_commits" 2>/dev/null || git rev-list --max-parents=0 HEAD 2>/dev/null || echo "")
=======
    # Collect all duplicate commit hashes (all but the first of each group)
    local squash_hashes=""
    for subj in "${!subject_hashes[@]}"; do
        local hashes="${subject_hashes[$subj]}"
        local rest
        rest=$(echo "$hashes" | cut -d' ' -f2-)
        squash_hashes="$squash_hashes $rest"
    done
>>>>>>> Stashed changes

    if [[ -z "$base_commit" ]]; then
        log_warn "Could not determine base commit for rebase - skipping auto-squash"
        return 0
    fi

    # Create a todo script that marks duplicate commits with 'fixup'
    local todo_script
    todo_script=$(mktemp)

    # Get all commits in order (oldest first) for the rebase range
    local commit_list
    commit_list=$(git rev-list --reverse "${base_commit}..HEAD" 2>/dev/null)

    # Build the todo list: for each commit, if it's a duplicate (not the first occurrence), mark as fixup
    declare -A seen_subjects
    while IFS= read -r hash; do
        [[ -z "$hash" ]] && continue
        local subj
        subj=$(git log -1 --format='%s' "$hash" 2>/dev/null)
        if [[ -n "${seen_subjects[$subj]:-}" ]]; then
            # This is a duplicate - mark as fixup
            echo "fixup $hash" >> "$todo_script"
        else
            # First occurrence - keep as pick
            echo "pick $hash" >> "$todo_script"
            seen_subjects["$subj"]=1
        fi
    done <<< "$commit_list"

<<<<<<< Updated upstream
    # Execute the rebase with our todo list
    if GIT_SEQUENCE_EDITOR="cat $todo_script >" git rebase -i "$base_commit" >/dev/null 2>&1; then
        log_info "Auto-squash completed successfully"
    else
        log_warn "Rebase had conflicts - aborting and restoring from backup"
        git rebase --abort >/dev/null 2>&1 || true
        log_info "Restored from backup branch: $backup_branch"
    fi
=======
        git_cmd "git reset --soft \"$parent\"" >/dev/null 2>&1
        local msg
        msg=$(git log -1 --format='%s' "$first_hash" 2>/dev/null || echo "chore: squashed")
        git_cmd "git commit -m \"$msg\"" >/dev/null 2>&1
        log_debug "Squashed group: $msg"
    done
>>>>>>> Stashed changes

    rm -f "$todo_script"
    return 0
}

# Auto-cleanup orphaned branches
auto_cleanup_orphaned_branches() {
    log_info "Checking for orphaned branches to cleanup..."
    local current_branch
    current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")

    if [[ "$current_branch" == "HEAD" ]]; then
        log_debug "Detached HEAD - skipping orphaned branch cleanup"
        return 0
    fi

    local orphaned
    orphaned=$(git branch --merged "$current_branch" 2>/dev/null | grep -vE '^[*]|^[\s]*(main|master|HEAD|remotes/.*)$' | sed 's/^[* ]*//' | tr -d ' ')

    # Also find backup branches (backup/pre-squash-*) that are old
    local backup_branches
    backup_branches=$(git branch --format='%(refname:short)' 2>/dev/null | grep '^backup/' | grep -vE "^backup/(pre-squash-$(date +%Y%m%d-%H%M%S))$" || true)

    # Combine lists
    local all_orphaned="$orphaned $backup_branches"
    all_orphaned=$(echo "$all_orphaned" | tr ' ' '\n' | sort -u | grep -v '^$' || true)

    if [[ -z "$all_orphaned" ]]; then
        log_info "No orphaned branches to cleanup"
        return 0
    fi

    log_warn "Found orphaned branches: $all_orphaned"

    if [[ "$DRY_RUN" == "true" ]]; then
        for b in $all_orphaned; do
            log_info "[DRY RUN] Would delete branch: $b"
        done
        return 0
    fi

    local cleaned=0
    for b in $all_orphaned; do
        # Try safe delete first (-d), then force delete (-D) for backup branches
        if git_cmd "git branch -d \"$b\"" >/dev/null 2>&1; then
            log_info "Deleted merged branch: $b"
            cleaned=$((cleaned + 1))
        elif git_cmd "git branch -D \"$b\"" >/dev/null 2>&1; then
            log_info "Force deleted backup branch: $b"
            cleaned=$((cleaned + 1))
        else
            log_warn "Could not delete branch: $b"
        fi
    done

    if [[ $cleaned -gt 0 ]]; then
        log_info "Cleaned up $cleaned orphaned branch(es)"
    fi
    return 0
}

# Safe push with retry logic
safe_push() {
    local push_command="$1"
    local push_attempts=0
    local max_attempts=2

    while [[ $push_attempts -lt $max_attempts ]]; do
        if git_cmd "$push_command"; then
            log_info "Push successful"
            return 0
        else
            local push_exit=$?
            push_attempts=$((push_attempts + 1))

            if [[ $push_attempts -lt $max_attempts ]]; then
                log_warn "Push failed (attempt $push_attempts/$max_attempts), attempting pull --rebase..."
                if git_cmd "git pull --rebase origin $(git rev-parse --abbrev-ref HEAD)"; then
                    log_info "Pull --rebase successful, retrying push..."
                else
                    log_error "Pull --rebase failed, aborting push"
                    return 3
                fi
            else
                log_error "Push failed after $max_attempts attempts"
                return 3
            fi
        fi
    done

    return 1
}

# Recover from merge conflicts
recover_merge_conflicts() {
    log_info "Attempting to recover from merge conflicts..."

    # Check if there are conflicts
    if ! git status --porcelain | grep -q "^[<>:]"; then
        log_info "No merge conflicts detected"
        return 0
    fi

    # Abort the current merge
    if git_cmd "git merge --abort"; then
        log_info "Merge aborted successfully"
        return 0
    else
        log_error "Failed to abort merge"
        return 1
    fi
}