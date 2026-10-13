#!/usr/bin/env python3
import os

# Get absolute path to the script directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GIT_UTILS_PATH = os.path.join(SCRIPT_DIR, 'lib/git-utils.sh')

print(f"Reading from: {GIT_UTILS_PATH}")

with open(GIT_UTILS_PATH, 'r') as f:
    content = f.read()

# Fix 1: Replace the generate_conventional_commit function conflict
old1 = '''    <<<<<<< Updated upstream
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
        conventional_msg="$conventional_msg($scope)"
    fi

    conventional_msg="$conventional_msg: $diff_stat"

    echo "$conventional_msg"
>>>>>>> Stashed changes'''

new1 = '''    if [[ -n "$diff_names" ]]; then
        commit_type=$(determine_commit_type "$diff_names")
        scope=$(determine_scope "$diff_names")
    fi

    local conventional_msg="$commit_type"

    if [[ -n "$scope" ]]; then
        conventional_msg="$conventional_msg($scope)"
    fi

    conventional_msg="$conventional_msg: $diff_stat"

    echo "$conventional_msg"'''

if old1 in content:
    content = content.replace(old1, new1)
    print("Fix 1: replaced generate_conventional_commit conflict")
else:
    print("Fix 1: pattern NOT found")

# Fix 2: auto_squash_duplicates() - first conflict (duplicate detection)
old2 = '''            <<<<<<< Updated upstream
            # First time we see this subject as a duplicate
            =======
            subject_hashes["$subject"]="${subject_hashes["$subject"]:-} $hash"
            >>>>>>> Stashed changes
            duplicates_found=$((duplicates_found + 1))'''

new2 = '''            # First time we see this subject as a duplicate
            duplicates_found=$((duplicates_found + 1))'''

if old2 in content:
    content = content.replace(old2, new2)
    print("Fix 2: replaced duplicate detection conflict")
else:
    print("Fix 2: pattern NOT found")

# Fix 3: auto_squash_duplicates() - second conflict (base commit determination)
old3 = '''    <<<<<<< Updated upstream
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

    if [[ -z "$base_commit" ]]; then'''

new3 = '''    # Build a todo list for interactive rebase
    # We'll use GIT_SEQUENCE_EDITOR to inject fixup commands
    local base_commit
    base_commit=$(git rev-parse "HEAD~$max_commits" 2>/dev/null || git rev-list --max-parents=0 HEAD 2>/dev/null || echo "")

    if [[ -z "$base_commit" ]]; then'''

if old3 in content:
    content = content.replace(old3, new3)
    print("Fix 3: replaced base commit determination conflict")
else:
    print("Fix 3: pattern NOT found")

# Fix 4: auto_squash_duplicates() - third conflict (rebase execution)
old4 = '''    <<<<<<< Updated upstream
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

    rm -f "$todo_script"'''

new4 = '''    # Execute the rebase with our todo list
    if GIT_SEQUENCE_EDITOR="cat $todo_script >" git rebase -i "$base_commit" >/dev/null 2>&1; then
        log_info "Auto-squash completed successfully"
    else
        log_warn "Rebase had conflicts - aborting and restoring from backup"
        git rebase --abort >/dev/null 2>&1 || true
        log_info "Restored from backup branch: $backup_branch"
    fi

    rm -f "$todo_script"'''

if old4 in content:
    content = content.replace(old4, new4)
    print("Fix 4: replaced rebase execution conflict")
else:
    print("Fix 4: pattern NOT found")

# Write the fixed content back
with open(GIT_UTILS_PATH, 'w') as f:
    f.write(content)

print(f"Fixed git-utils.sh conflicts at {GIT_UTILS_PATH}")
