#!/usr/bin/env bash
# git-auto-commit.sh - Robust, idempotent git commit-and-push automation
# Part of the git-auto-commit skill

set -uo pipefail

# Source the shared library
# Use absolute path to ensure script works regardless of current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/git-utils.sh"

# Default values
DRY_RUN="${GIT_AUTO_COMMIT_DRY_RUN:-false}"
AUTO_MESSAGE="${GIT_AUTO_COMMIT_AUTO_MESSAGE:-true}"
HISTORY_DEPTH="${GIT_AUTO_COMMIT_HISTORY_DEPTH:-20}"
SQUASH_THRESHOLD="${GIT_AUTO_COMMIT_SQUASH_THRESHOLD:-3}"
LOG_LEVEL="${GIT_AUTO_COMMIT_LOG_LEVEL:-INFO}"
WSL_EXEC="${GIT_AUTO_COMMIT_WSL_EXEC:-true}"
JSON_OUTPUT=false

# Parse command line arguments
CUSTOM_MESSAGE=""
TARGET_BRANCH=""
SELF_TEST=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--message)
            CUSTOM_MESSAGE="$2"
            shift 2
            ;;
        -b|--branch)
            TARGET_BRANCH="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --self-test)
            SELF_TEST=true
            shift
            ;;
        -h|--help)
            cat <<EOF
Usage: git-auto-commit.sh [OPTIONS]

Automated git commit and push with idempotent behavior and history analysis.

Options:
  -m, --message <msg>   Custom commit message (disables auto-generation)
  -b, --branch <branch> Target branch to push to (default: current branch)
  --dry-run             Show what would happen without executing
  --json                Output results in JSON format
  --self-test           Run basic validation in a temporary git repository
  -h, --help            Show this help message

Environment Variables:
  GIT_AUTO_COMMIT_LOG_LEVEL     Log level (DEBUG, INFO, WARN, ERROR) [default: INFO]
  GIT_AUTO_COMMIT_DRY_RUN       Enable dry-run mode [default: false]
  GIT_AUTO_COMMIT_AUTO_MESSAGE  Auto-generate commit message [default: true]
  GIT_AUTO_COMMIT_HISTORY_DEPTH Number of commits to analyze [default: 20]
  GIT_AUTO_COMMIT_SQUASH_THRESHOLD Suggest squash if N+ related commits [default: 3]

Exit Codes:
  0  Success or no changes (idempotent)
  1  General error
  2  Git error
  3  Push error
  4  Validation error
  5  Conflict detected

Examples:
  git-auto-commit.sh                    # Auto-commit and push
  git-auto-commit.sh -m "fix: resolve issue"  # Use custom message
  git-auto-commit.sh --dry-run          # Preview actions
  git-auto-commit.sh --self-test        # Run validation tests
EOF
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# Initialize skill
init_skill
normalize_staged_files() {
    log_debug "Normalizing line endings and whitespace in staged files..."

    git diff --cached --name-only -z | while IFS= read -r -d '' file; do
        if [[ -f "$file" ]]; then
            # Remove carriage returns and trailing whitespace
            if [[ "$DRY_RUN" == "true" ]]; then
                log_debug "[DRY RUN] Would normalize: $file"
            else
                # Use tr for CRLF removal and sed for trailing whitespace
                tr -d '\r' < "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
                sed -i 's/[[:space:]]*$//' "$file"
                # Re-stage the normalized file
                git_cmd "git add \"$file\"" >/dev/null 2>&1 || true
            fi
        fi
    done
}

# Fix empty modifications (e.g., permission changes, line ending differences)
fix_empty_modifications() {
    log_info "Checking for empty modifications (permission/line-ending changes...)"

    local changed_files
    changed_files=$(git_cmd_capture "git diff --name-only" 2>/dev/null || true)

    if [[ -z "$changed_files" ]]; then
        log_debug "No files to check for empty modifications"
        return 0
    fi

    local fixed_count=0
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue

        # Check if the diff is empty (only whitespace/permission changes)
        local diff_size
        diff_size=$(git diff --ignore-all-space -- "$file" 2>/dev/null | wc -c || echo 0)

        if [[ $diff_size -le 5 ]]; then
            # Likely just line ending or permission changes
            log_debug "Normalizing: $file (empty diff detected)"

            if [[ "$DRY_RUN" != "true" ]]; then
                # Normalize line endings
                if [[ -f "$file" ]]; then
                    tr -d '\r' < "$file" > "${file}.tmp" 2>/dev/null && mv "${file}.tmp" "$file"
                    sed -i 's/[[:space:]]*$//' "$file" 2>/dev/null || true
                    git add "$file" 2>/dev/null || true
                    fixed_count=$((fixed_count + 1))
                fi
            else
                log_info "[DRY RUN] Would normalize: $file"
            fi
        fi
    done <<< "$changed_files"

    if [[ $fixed_count -gt 0 ]]; then
        log_info "Fixed $fixed_count file(s) with empty modifications"
    fi
}

# Override config from command line
if [[ "$SELF_TEST" == "true" ]]; then
    # Self-test mode will be handled separately
    :
fi

if [[ "$JSON_OUTPUT" == "true" ]]; then
    enable_json_output
fi

# Main execution
main() {
    log_info "Starting git-auto-commit skill"

    # Verify git repository
    if ! check_git_repo; then
        return 2
    fi

    # Check for stale staged entries
    clean_stale_staged

    # Validate .gitignore
    validate_gitignore

    # Sync repository state (stash, pull, pop)
    local current_branch
    current_branch=$(git_cmd_capture "git rev-parse --abbrev-ref HEAD")
    if [[ "$current_branch" != "HEAD" ]]; then
        sync_repository_state "$current_branch"
    fi

    # Fix Git extension interference (GitKraken, fsmonitor, fileMode issues)
    # This addresses false "modified" status in VSCode caused by GitKraken, fsmonitor, etc.
    fix_git_extension_interference

    # Fix empty modifications (permission/line-ending changes)
    fix_empty_modifications

    # Check if there are changes to commit
    # Batch: git add and status check
    git_cmd "git add -A" >/dev/null
    normalize_staged_files
    git_cmd "git add -A" >/dev/null

    # Check again after normalization
    local unstaged_check
    unstaged_check=$(git_cmd_capture "git diff --name-only" 2>/dev/null || true)
    if [[ -n "$unstaged_check" ]]; then
        log_info "Re-normalizing remaining unstaged changes..."
        fix_empty_modifications
        git_cmd "git add -A" >/dev/null
    fi

    local staged_info
    staged_info=$(git_cmd_capture "git diff --cached --stat --name-only" 2>/dev/null || echo "0 files changed|")

    # Check for files with only whitespace/permission changes
    if [[ "$staged_info" == "0 files changed|"* ]]; then
        # Verify there are truly no changes
        local raw_diff
        raw_diff=$(git_cmd_capture "git diff --cached" 2>/dev/null || true)
        if [[ -z "$raw_diff" ]]; then
            log_info "No changes to commit - idempotent exit"
            if [[ "$JSON_OUTPUT" == "true" ]]; then
                print_json_output
            fi
            return 0
        fi
    fi

    # Parse staged info for count and names
    local staged_count staged_names
    if [[ "$staged_info" == "0 files changed|"* ]]; then
        staged_count=0
        staged_names=""
    else
        # First line is the stat, remaining are names separated by newline
        staged_count=$(echo "$staged_info" | head -1)
        staged_names=$(echo "$staged_info" | tail -n +2 | tr '\n' ' ')
    fi

    if [[ "$staged_count" == "0" ]] || [[ -z "$staged_names" ]]; then
        log_info "No changes to commit - idempotent exit"
        if [[ "$JSON_OUTPUT" == "true" ]]; then
            print_json_output
        fi
        return 0
    fi

    # Check for secrets
    if ! check_secrets; then
        return 4
    fi

    # Get diff information for commit message generation (already have it from above)
    local diff_stat="${staged_info%%|*}"
    local diff_names="$staged_names"

    # Determine commit message
    local commit_msg
    if [[ -n "$CUSTOM_MESSAGE" ]]; then
        commit_msg="$CUSTOM_MESSAGE"
        log_info "Using custom commit message: $commit_msg"
    elif [[ "$AUTO_MESSAGE" == "true" ]]; then
        commit_msg=$(generate_conventional_commit "$diff_stat" "$diff_names")
        log_info "Generated conventional commit message"
        log_debug "Generated message:\n$commit_msg"
    else
        log_error "No commit message provided and auto-generation disabled"
        return 4
    fi

    # Commit changes
    log_info "Committing changes..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would commit with message:"
        echo "$commit_msg" | while IFS= read -r line; do log_info "[DRY RUN] $line"; done
    else
        if ! git_cmd "git commit -m \"$commit_msg\""; then
            log_error "Failed to commit changes"
            return 2
        fi
        log_info "Changes committed successfully"
    fi

    # Push to origin with safe retry logic
    local push_branch="${TARGET_BRANCH:-$(git_cmd "git rev-parse --abbrev-ref HEAD")}"
    log_info "Pushing to origin/$push_branch..."

    local push_command="git push --progress origin HEAD:${push_branch}"

    if ! safe_push "$push_command"; then
        log_error "Push failed - attempting conflict recovery..."

        # Try to recover from merge conflicts
        if recover_merge_conflicts; then
            log_info "Retrying push after conflict recovery..."
            if ! safe_push "$push_command"; then
                log_error "Push failed after recovery attempt"
                return 3
            fi
        else
            log_error "Unable to recover from conflicts - manual resolution required"
            return 5
        fi
    fi

    # Post-push history analysis (optional)
    if [[ "${GIT_AUTO_COMMIT_ANALYZE_HISTORY:-true}" == "true" ]]; then
        log_info "Analyzing commit history..."
        local history_analysis
        history_analysis=$(analyze_history)

        if [[ "$JSON_OUTPUT" == "true" ]]; then
            # Add history analysis to JSON output
            echo "$history_analysis" | jq -s '.[0]'
        else
            # Human-readable output
            echo "=== Commit History Analysis ==="
            # Write history analysis to temp file and use Python
            temp_file=$(mktemp)
            echo "$history_analysis" > "$temp_file"
            python3 -c "import json, sys; data = json.load(open(sys.argv[1])); print('Commit count: ' + str(data['commit_count'])); print('Conventional compliance: ' + str(data['conventional_compliance'] * 100) + '%'); [print(x + ': ' + ', '.join(data[x])) if data.get(x) else None for x in ['duplicates', 'suggestions', 'orphaned_branches']]" "$temp_file"
            rm -f "$temp_file"
        fi
    fi

    log_info "git-auto-commit completed successfully"

    if [[ "$JSON_OUTPUT" == "true" ]]; then
        print_json_output
    fi

    return 0
}

# Self-test mode
self_test() {
    log_info "Running self-test in temporary git repository..."

    local test_dir
    test_dir=$(mktemp -d)
    local original_dir
    original_dir=$(pwd)

    cd "$test_dir" || {
        log_error "Failed to create test directory"
        return 1
    }

    # Initialize test repo
    if ! git init; then
        log_error "Failed to initialize test git repository"
        cd "$original_dir"
        rm -rf "$test_dir"
        return 2
    fi

    # Configure git for test
    git config user.name "Test User"
    git config user.email "test@example.com"

    # Create initial commit
    echo "Initial commit" > README.md
    git add README.md
    if ! git commit -m "Initial commit"; then
        log_error "Failed to create initial commit"
        cd "$original_dir"
        rm -rf "$test_dir"
        return 2
    fi

    # Test 1: No changes (should exit 0)
    log_info "Test 1: No changes scenario"
    if output=$(GIT_AUTO_COMMIT_LOG_LEVEL=ERROR "$SCRIPT_DIR/../git-auto-commit.sh" 2>&1); then
        if [[ $? -eq 0 ]]; then
            log_info "✓ No changes test passed"
        else
            log_error "✗ No changes test failed: $output"
            cd "$original_dir"
            rm -rf "$test_dir"
            return 1
        fi
    else
        log_error "✗ No changes test failed with error: $output"
        cd "$original_dir"
        rm -rf "$test_dir"
        return 1
    fi

    # Test 2: Simple changes (dry-run to avoid needing a remote)
    log_info "Test 2: Simple changes scenario"
    echo "Test content" > test.txt
    if output=$(GIT_AUTO_COMMIT_LOG_LEVEL=ERROR "$SCRIPT_DIR/../git-auto-commit.sh" -m "test: add test file" --dry-run 2>&1); then
        if [[ $? -eq 0 ]]; then
            log_info "✓ Simple changes test passed"
        else
            log_error "✗ Simple changes test failed: $output"
            cd "$original_dir"
            rm -rf "$test_dir"
            return 1
        fi
    else
        log_error "✗ Simple changes test failed with error: $output"
        cd "$original_dir"
        rm -rf "$test_dir"
        return 1
    fi

    # Test 3: Dry run
    log_info "Test 3: Dry run scenario"
    echo "More content" >> test.txt
    if output=$(GIT_AUTO_COMMIT_LOG_LEVEL=ERROR "$SCRIPT_DIR/../git-auto-commit.sh" --dry-run 2>&1); then
        if [[ $? -eq 0 ]]; then
            log_info "✓ Dry run test passed"
        else
            log_error "✗ Dry run test failed: $output"
            cd "$original_dir"
            rm -rf "$test_dir"
            return 1
        fi
    else
        log_error "✗ Dry run test failed with error: $output"
        cd "$original_dir"
        rm -rf "$test_dir"
        return 1
    fi

    # Cleanup
    cd "$original_dir"
    rm -rf "$test_dir"

    log_info "All self-tests passed"
    return 0
}

# Main execution flow
if [[ "$SELF_TEST" == "true" ]]; then
    self_test
    exit $?
else
    main
    exit $?
fi