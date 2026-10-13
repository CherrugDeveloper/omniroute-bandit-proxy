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

# Git command wrapper with error handling
git_cmd() {
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "[DRY RUN] $*" >&2
        return 0
    fi
    eval "$@"
}

# Git command wrapper that captures output
git_cmd_capture() {
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "[DRY RUN] $*" >&2
        # For dry run, we still need to return something reasonable for capture
        # Return empty string for most commands, or simulate expected output
        case "$1" in
            "git diff --name-only")
                echo ""  # No changes in dry run
                ;;
            "git rev-parse --abbrev-ref HEAD")
                echo "HEAD"  # Simulate current branch
                ;;
            "git diff --cached --name-only")
                echo ""  # No staged changes in dry run
                ;;
            "git diff --cached --stat --name-only")
                echo ""  # No stats in dry run
                ;;
            *)
                echo ""  # Default empty response
                ;;
        esac
        return 0
    fi
    eval "$@"
}

# Determine commit type based on file changes
determine_commit_type() {
    local diff_names="$1"

    # Check for common patterns in file names
    if echo "$diff_names" | grep -iqE '\.(test|spec)\.(js|ts|py|java|go|rb|php)$'; then
        echo "test"
    elif echo "$diff_names" | grep -iqE '(readme|documentation|doc)\.(md|txt|rst)$'; then
        echo "docs"
    elif echo "$diff_names" | grep -iqE '\.(css|scss|sass|less)$'; then
        echo "style"
    elif echo "$diff_names" | grep -iqE '(package\.json|requirements\.txt|pom\.xml|build\.gradle|cargo\.toml)' ; then
        echo "deps"
    elif echo "$diff_names" | grep -iqE '\.(md|markdown|rst|txt)$' && ! echo "$diff_names" | grep -iqE 'readme'; then
        echo "docs"
    elif echo "$diff_names" | grep -iqE '(migration|schema)\.(sql|py)$'; then
        echo "refactor"
    elif echo "$diff_names" | grep -iqE '\.(json|yaml|yml|toml|xml|ini|cfg|conf)$'; then
        echo "chore"
    elif echo "$diff_names" | grep -iqE '\.(js|ts|jsx|tsx|py|java|go|rb|php|cs|cpp|c|h|hpp)$'; then
        # Check if it's a feature or fix based on keywords
        if echo "$diff_names" | grep -iqE '(fix|bug|patch|error|issue)' ; then
            echo "fix"
        elif echo "$diff_names" | grep -iqE '(feature|add|new|implement)' ; then
            echo "feat"
        else
            echo "feat"
        fi
    else
        echo "chore"
    fi
}

# Determine scope based on file paths
determine_scope() {
    local diff_names="$1"
    local scope=""

    # Extract directory names from file paths
    local dirs=$(echo "$diff_names" | xargs -n1 dirname | sort -u)

    # Get the most specific common directory
    if [[ -n "$dirs" ]]; then
        # Take the first directory that's not too generic
        while IFS= read -r dir; do
            # Skip root and very generic directories
            if [[ "$dir" != "." && "$dir" != ".." && "$dir" != "src" && "$dir" != "lib" && "$dir" != "app" && "$dir" != "components" ]]; then
                # Convert path to scope format (replace slashes with dashes, remove special chars)
                scope=$(echo "$dir" | tr '/' '-' | sed 's/[^a-zA-Z0-9\-]//g')
                if [[ -n "$scope" ]]; then
                    break
                fi
            fi
        done <<< "$dirs"
    fi

    echo "$scope"
}

# Generate conventional commit message
generate_conventional_commit() {
    local diff_stat="$1"
    local diff_names="$2"

    local commit_type="other"
    local scope=""

    if [[ -n "$diff_names" ]]; then
        commit_type=$(determine_commit_type "$diff_names")
        scope=$(determine_scope "$diff_names")
    fi

    local conventional_msg="$commit_type"

    if [[ -n "$scope" ]]; then
        conventional_msg="$conventional_msg($scope)"
    fi

    conventional_msg="$conventional_msg: $diff_stat"

    echo "$conventional_msg"
}

# Analyze commit history
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
        echo "$analysis_json"
        return 0
    fi

    local commit_count=0
    local conventional_count=0
    declare -A subjects
    declare -A subject_count
    local duplicates=()

    while IFS='|' read -r hash subject author date; do
        [[ -z "$hash" ]] && continue
        commit_count=$((commit_count + 1))

        # Check if commit follows conventional format
        local pattern='^(feat|fix|docs|style|refactor|test|chore)(\([^)]+\))?:\ .+'
        if [[ "$subject" =~ $pattern ]]; then
            conventional_count=$((conventional_count + 1))
        fi

        # Track subjects for duplicate detection
        subject_count["$subject"]=$((${subject_count["$subject"]:-0} + 1))
        if [[ ${subject_count["$subject"]} -eq 2 ]]; then
            duplicates+=("$subject")
        fi
    done <<< "$recent_commits"

    # Calculate compliance percentage
    local compliance=0.0
    if [[ $commit_count -gt 0 ]]; then
        compliance=$(echo "scale=1; $conventional_count * 100 / $commit_count" | bc -l)
    fi

    # Get orphaned branches
    local orphaned_branches
    orphaned_branches=$(git branch --merged "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")" 2>/dev/null | grep -vE '^[*]|^[\s]*(main|master|HEAD|remotes/.*)$' | sed 's/^[* ]*//' || true)

    # Format output
    local duplicates_json=""
    if [[ ${#duplicates[@]} -gt 0 ]]; then
        duplicates_json="["
        for i in "${!duplicates[@]}"; do
            if [[ $i -gt 0 ]]; then
                duplicates_json+=","
            fi
            duplicates_json+="\"${duplicates[$i]}\""
        done
        duplicates_json+="]"
    else
        duplicates_json="[]"
    fi

    local suggestions_json="[]"
    local orphaned_json="[]"
    if [[ -n "$orphaned_branches" ]]; then
        orphaned_json="["
        local first=true
        while IFS= read -r branch; do
            [[ -z "$branch" ]] && continue
            if [[ "$first" == "true" ]]; then
                first=false
            else
                orphaned_json+=","
            fi
            orphaned_json+="\"$branch\""
        done <<< "$orphaned_branches"
        orphaned_json+="]"
    fi

    # Update JSON with actual values
    analysis_json=$(echo "$analysis_json" | \
        sed "s/\"commit_count\": 0/\"commit_count\": $commit_count/" | \
        sed "s/\"conventional_compliance\": 0.0/\"conventional_compliance\": $compliance/" | \
        sed "s/\"duplicates\": \[\]/\"duplicates\": $duplicates_json/" | \
        sed "s/\"suggestions\": \[\]/\"suggestions\": $suggestions_json/" | \
        sed "s/\"orphaned_branches\": \[\]/\"orphaned_branches\": $orphaned_json/")

    echo "$analysis_json"
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

    # Determine base commit for rebase
    local base_commit
    base_commit=$(git merge-base HEAD "$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "main")" 2>/dev/null)
    if [[ -z "$base_commit" ]]; then
        base_commit=$(git merge-base HEAD main 2>/dev/null)
    fi
    if [[ -z "$base_commit" ]]; then
        base_commit=$(git merge-base HEAD master 2>/dev/null)
    fi

    if [[ -z "$base_commit" ]]; then
        log_warn "Could not determine base commit for rebase - skipping auto-squash"
        return 0
    fi

    # Get all commits in order (oldest first) for the rebase range
    local commit_list
    commit_list=$(git rev-list --reverse "${base_commit}..HEAD" 2>/dev/null)

    # Build the todo list: for each commit, if it's a duplicate (not the first occurrence), mark as fixup
    declare -A seen_subjects
    local todo_script
    todo_script=$(mktemp)
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

    # Execute the rebase
    if git_cmd "git rebase --interactive --autosquash \"$base_commit\""; then
        log_info "Auto-squash completed successfully"
        rm -f "$todo_script"
        return 0
    else
        log_error "Auto-squash failed during rebase"
        rm -f "$todo_script"
        return 1
    fi
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

    # Check if we have merge conflicts
    if ! git_cmd "git diff --quiet --ignore-submodules HEAD"; then
        log_warn "Merge conflicts detected, attempting to resolve..."

        # Try to automatically resolve conflicts by taking our changes
        if git_cmd "git add -u"; then
            log_info "Added conflicted files to index"

            # Check if there are still conflicts
            if ! git_cmd "git diff --quiet --ignore-submodules HEAD"; then
                log_warn "Still have conflicts after adding, attempting to continue..."
                if git_cmd "git rebase --continue"; then
                    log_info "Successfully continued rebase after conflict resolution"
                    return 0
                else
                    log_error "Failed to continue rebase"
                    return 1
                fi
            else
                log_info "No more conflicts after adding files"
                return 0
            fi
        else
            log_error "Failed to add conflicted files"
            return 1
        fi
    else
        log_info "No merge conflicts detected"
        return 0
    fi
}

# Initialize skill - this function was missing
init_skill() {
    # Ensure we're in a git repository
    if ! git_cmd "git rev-parse --git-dir > /dev/null 2>&1"; then
        log_error "Not a git repository"
        return 1
    fi

    # Initialize any skill-specific variables or state here
    log_debug "Initialized git-auto-commit skill"

    return 0
}

# Check if we're in a valid git repository
check_git_repo() {
    if ! git_cmd "git rev-parse --git-dir > /dev/null 2>&1"; then
        log_error "Not a git repository"
        return 1
    fi
    return 0
}

# Clean stale staged entries
clean_stale_staged() {
    log_info "Checking for stale staged entries..."

    # Get list of staged files
    local staged_files
    staged_files=$(git_cmd_capture "git diff --cached --name-only" 2>/dev/null || true)

    if [[ -z "$staged_files" ]]; then
        log_debug "No staged files to check"
        return 0
    fi

    local cleaned=0
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue

        # Check if file is staged but no longer exists in working directory
        if [[ ! -e "$file" ]]; then
            log_warn "Removing stale staged entry for deleted file: $file"
            if [[ "$DRY_RUN" != "true" ]]; then
                git_cmd "git rm --cached \"$file\"" >/dev/null 2>&1
                cleaned=$((cleaned + 1))
            else
                log_info "[DRY RUN] Would remove stale staged entry for: $file"
                cleaned=$((cleaned + 1))
            fi
        fi
    done <<< "$staged_files"

    if [[ $cleaned -gt 0 ]]; then
        log_info "Cleaned $cleaned stale staged entry(ies)"
    fi

    return 0
}

# Validate .gitignore file
validate_gitignore() {
    log_info "Validating .gitignore file..."

    if [[ ! -f ".gitignore" ]]; then
        log_debug "No .gitignore file found"
        return 0
    fi

    # Check if .gitignore is readable
    if [[ ! -r ".gitignore" ]]; then
        log_warn ".gitignore file is not readable"
        return 1
    fi

    # Basic validation: check for common issues
    local issues=0

    # Check for Windows line endings in .gitignore
    if git_cmd_capture "git check-attr -a .gitignore | grep -i crlf" >/dev/null 2>&1; then
        log_warn ".gitignore may have Windows line endings (CRLF)"
        issues=$((issues + 1))
    fi

    # Check for trailing whitespace
    if git_cmd_capture "grep '[[:space:]]$' .gitignore" >/dev/null 2>&1; then
        log_warn ".gitignore contains trailing whitespace"
        issues=$((issues + 1))
    fi

    # Check for empty lines that might be problematic
    local empty_lines
    empty_lines=$(git_cmd_capture "grep -c '^$' .gitignore" 2>/dev/null || echo "0")
    if [[ $empty_lines -gt 10 ]]; then
        log_warn ".gitignore has many empty lines ($empty_lines), consider cleaning up"
        # Not returning error, just warning
    fi

    if [[ $issues -gt 0 ]]; then
        log_warn "Found $issues potential issue(s) in .gitignore"
        return 1
    else
        log_info ".gitignore validation passed"
        return 0
    fi
}

# Synchronize repository state
sync_repository_state() {
    local branch="$1"
    log_info "Synchronizing repository state for branch: $branch"

    # Stash any local changes
    local has_changes
    has_changes=$(git_cmd_capture "git diff --quiet --ignore-submodules HEAD || echo 'has_changes'")

    if [[ -n "$has_changes" ]]; then
        log_info "Stashing local changes"
        if [[ "$DRY_RUN" != "true" ]]; then
            git_cmd "git stash push -m \"auto-squash-stash-$(date +%Y%m%d-%H%M%S)\"" >/dev/null 2>&1
        else
            log_info "[DRY RUN] Would stash local changes"
        fi
    fi

    # Fetch latest changes
    log_info "Fetching latest changes from remote"
    if [[ "$DRY_RUN" != "true" ]]; then
        git_cmd "git fetch origin" >/dev/null 2>&1
    else
        log_info "[DRY RUN] Would fetch from origin"
    fi

    # If we had changes, restore them
    if [[ -n "$has_changes" ]]; then
        log_info "Restoring stashed changes"
        if [[ "$DRY_RUN" != "true" ]]; then
            git_cmd "git stash pop" >/dev/null 2>&1
        else
            log_info "[DRY RUN] Would pop stashed changes"
        fi
    fi

    return 0
}

# Fix Git extension interference
fix_git_extension_interference() {
    log_info "Checking for Git extension interference..."

    # Disable fsmonitor if it's causing issues
    if git_cmd_capture "git config --get core.fsmonitor" >/dev/null 2>&1; then
        log_warn "fsmonitor is enabled, which may cause interference"
        if [[ "$DRY_RUN" != "true" ]]; then
            git_cmd "git config --unset core.fsmonitor" >/dev/null 2>&1
            log_info "Disabled fsmonitor configuration"
        else
            log_info "[DRY RUN] Would disable fsmonitor configuration"
        fi
    fi

    # Ensure fileMode is properly set (especially important on WSL)
    local filemode
    filemode=$(git_cmd_capture "git config --get core.filemode" 2>/dev/null || echo "unset")
    if [[ "$filemode" != "false" ]]; then
        # On WSL, we often want to ignore file mode changes
        log_info "Setting core.filemode to false to ignore permission changes"
        if [[ "$DRY_RUN" != "true" ]]; then
            git_cmd "git config core.filemode false" >/dev/null 2>&1
        else
            log_info "[DRY RUN] Would set core.filemode to false"
        fi
    fi

    # Check for GitKraken or other GUI interference
    # This is more of a informational check
    if [[ -d ".git/gitkraken" ]] || [[ -f ".git/gitkraken.conf" ]]; then
        log_warn "GitKraken metadata detected in repository"
    fi

    return 0
}

# Check for secrets in staged changes
check_secrets() {
    log_info "Checking for secrets in staged changes..."

    # Get list of staged files
    local staged_files
    staged_files=$(git_cmd_capture "git diff --cached --name-only" 2>/dev/null || true)

    if [[ -z "$staged_files" ]]; then
        log_debug "No staged files to check for secrets"
        return 0
    fi

    # Patterns for common secrets
    local secret_patterns=(
        'password\s*=\s*[^[:space:]]+'
        'api_key\s*=\s*[^[:space:]]+'
        'secret\s*=\s*[^[:space:]]+'
        'key\s*=\s*[^[:space:]]+'
        'token\s*=\s*[^[:space:]]+'
        '-----BEGIN [A-Z]+ PRIVATE KEY-----'
        'ssh-rsa AAAAB3NzaC1yc2E'
        'ssh-dss AAAAB3NzaC1kc3'
        'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBB'
    )

    local found_secret=0
    local secret_file=""

    while IFS= read -r file; do
        [[ -z "$file" ]] && continue

        # Exclude git-utils.sh from secret checks to avoid false positives
        if [[ "$file" == *"git-utils.sh" ]]; then
            continue
        fi

        # Check if file exists
        if [[ ! -f "$file" ]]; then
            continue
        fi

        # Check for secret patterns in the staged version of the file
        local staged_content
        staged_content=$(git_cmd_capture "git show :$file" 2>/dev/null || true)

        if [[ -n "$staged_content" ]]; then
            for pattern in "${secret_patterns[@]}"; do
                if echo "$staged_content" | grep -iqE -e "$pattern" 2>/dev/null; then
                    log_warn "Potential secret found in file: $file"
                    found_secret=1
                    secret_file="$file"
                    break
                fi
            done
        fi

        if [[ $found_secret -eq 1 ]]; then
            break
        fi
    done <<< "$staged_files"

    if [[ $found_secret -eq 1 ]]; then
        log_error "Secret detected in $secret_file. Commit aborted to prevent leaking credentials."
        return 1
    else
        log_info "No secrets detected in staged changes"
        return 0
    fi
}