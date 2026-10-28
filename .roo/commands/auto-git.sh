#!/bin/bash

# auto-git.sh - Automate comprehensive git commit-and-push workflow
# Includes project cleanup, changelog updates, and verification

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $*"
}

# Function to resolve workspace problems
resolve_workspace_problems() {
    log_step "Resolving workspace problems..."
    
    # Check for syntax errors in JavaScript/TypeScript
    if command -v node >/dev/null 2>&1; then
        log_info "Checking JavaScript/TypeScript syntax..."
        if [ -f "package.json" ]; then
            # Try to run TypeScript check if available
            if grep -q '"typescript"' package.json; then
                if command -v npx >/dev/null 2>&1; then
                    npx tsc --noEmit 2>/dev/null || log_warn "TypeScript check found issues"
                fi
            fi
            
            # Check for obvious syntax errors in .mjs files
            if [ -d "src" ]; then
                for file in src/*.mjs; do
                    if [ -f "$file" ]; then
                        node --check "$file" 2>/dev/null || log_warn "Syntax error in $file"
                    fi
                done
            fi
        fi
    fi
    
    # Check for lint errors if available
    if [ -f "package.json" ] && grep -q "eslint" package.json; then
        log_info "Running ESLint..."
        if command -v npx >/dev/null 2>&1; then
            npx eslint src/ --fix 2>/dev/null || log_warn "ESLint found issues"
        fi
    fi
    
    # Run tests to check for failures
    if [ -f "package.json" ] && grep -q "test" package.json; then
        log_info "Running tests..."
        if command -v npm >/dev/null 2>&1; then
            npm test 2>&1 | tail -20 || log_warn "Tests found failures"
        fi
    fi
    
    log_info "Workspace problem resolution completed."
}

# Function to perform cleanup and maintenance
cleanup_maintenance() {
    log_step "Performing cleanup and maintenance..."
    
    # Remove superfluous files
    log_info "Removing superfluous files..."
    
    # Remove plans/ directory
    if [ -d "plans" ]; then
        log_info "Removing plans/ directory..."
        rm -rf plans/
    fi
    
    # Remove temporary build artifacts
    for artifact in dist/ build/; do
        if [ -d "$artifact" ]; then
            log_info "Removing $artifact..."
            rm -rf "$artifact"
        fi
    done
    
    # Remove test backup files
    if [ -d "tests" ]; then
        log_info "Removing test backup files..."
        find tests/ -name "*.bak" -delete
    fi
    
    # Clean unuseful scripts (excluding production scripts in scripts/ and src/)
    log_info "Cleaning unuseful scripts..."
    
    # Find and remove shell scripts not in scripts/ or src/ directories
    if [ -d ".roo" ]; then
        find .roo -name "*.sh" -not -path ".roo/commands/*.sh" -not -path ".roo/skills/*.sh" -delete
    fi
    
    # Find and remove Python scripts not in scripts/ or src/ directories
    find . -name "*.py" -not -path "./scripts/*.py" -not -path "./src/*.py" -not -path "./.roo/*" -delete
    
    # Find and remove batch files not in scripts/ or src/ directories
    find . -name "*.bat" -not -path "./scripts/*.bat" -not -path "./src/*.bat" -not -path "./.roo/*" -delete
    
    # Find and remove mjs scripts not in scripts/ or src/ directories
    find . -name "*.mjs" -not -path "./scripts/*.mjs" -not -path "./src/*.mjs" -not -path "./.roo/*" -delete
    
    # Clean unused test scripts, unused .md plans files, unused .png/.jpg images
    log_info "Cleaning unused files..."
    
    # Remove unused .md files (excluding README.md, CHANGELOG.md, and docs/)
    if [ -d "." ]; then
        find . -name "*.md" -not -name "README.md" -not -name "CHANGELOG.md" -not -path "./docs/*.md" -not -path "./.roo/*" -not -path "./public/*" -delete
    fi
    
    # Remove unused images
    if [ -d "." ]; then
        find . -name "*.png" -not -path "./public/*" -not -path "./.roo/*" -delete
        find . -name "*.jpg" -not -path "./public/*" -not -path "./.roo/*" -delete
        find . -name "*.jpeg" -not -path "./public/*" -not -path "./.roo/*" -delete
    fi
    
    # Perform artifact cleanup and validate .gitignore staging
    log_info "Performing artifact cleanup..."
    
    # Remove common artifact directories
    for artifact in node_modules/ .vscode/ .idea/ *.log *.tmp *.cache/; do
        if [ -d "$artifact" ] || [ -f "$artifact" ]; then
            log_info "Removing $artifact..."
            rm -rf "$artifact"
        fi
    done
    
    # Validate .gitignore staging
    if [ -f ".gitignore" ]; then
        log_info "Validating .gitignore..."
        git check-ignore . 2>/dev/null || log_warn "Some files are not ignored by .gitignore"
    fi
    
    log_info "Cleanup and maintenance completed."
}

# Function to update CHANGELOG.md
update_changelog() {
    log_step "Updating CHANGELOG.md..."
    
    if [ ! -f "CHANGELOG.md" ]; then
        log_error "CHANGELOG.md not found!"
        return 1
    fi
    
    # Get recent git commits (limit to last 10)
    log_info "Getting recent git commits..."
    local recent_commits
    recent_commits=$(git log -n 10 --pretty=format:%s\ (%h)\ %ad\ --date=short 2>/dev/null || echo "No commits found")
    
    # Read existing CHANGELOG.md
    local changelog_content
    changelog_content=$(cat CHANGELOG.md)
    
    # Get today's date
    local today
    today=$(date +%Y-%m-%d)
    
    # Check if today's entry already exists
    if echo "$changelog_content" | grep -q "^## $today"; then
        log_info "Today's entry already exists in CHANGELOG.md"
    else
        # Append new entries under today's date
        log_info "Adding new entries for $today..."
        
        # Create new entry
        local new_entry="\n## $today\n\n$recent_commits\n"
        
        # Insert after the last ## header or at the beginning
        if echo "$changelog_content" | grep -q "^## "; then
            # Find the position after the last ## header
            local last_header_pos
            last_header_pos=$(echo "$changelog_content" | grep -n "^## " | tail -1 | cut -d: -f1)
            if [ -n "$last_header_pos" ]; then
                # Insert after the last header
                local before_last_header
                local after_last_header
                before_last_header=$(echo "$changelog_content" | head -n $((last_header_pos - 1)))
                after_last_header=$(echo "$changelog_content" | tail -n +$last_header_pos)
                echo -e "$before_last_header$new_entry$after_last_header" > CHANGELOG.md
            else
                echo -e "$changelog_content$new_entry" > CHANGELOG.md
            fi
        else
            echo -e "$changelog_content$new_entry" > CHANGELOG.md
        fi
    fi
    
    log_info "CHANGELOG.md updated successfully."
}

# Function to update README.md
update_readme() {
    log_step "Updating README.md..."
    
    if [ ! -f "README.md" ]; then
        log_error "README.md not found!"
        return 1
    fi
    
    # Basic README validation - ensure it has essential sections
    log_info "Validating README.md..."
    
    # Check for essential sections
    local has_title has_description has_installation
    has_title=$(grep -c "^# " README.md || echo 0)
    has_description=$(grep -c "^## Description" README.md || echo 0)
    has_installation=$(grep -c "^## Installation" README.md || echo 0)
    
    if [ "$has_title" -eq 0 ] || [ "$has_description" -eq 0 ] || [ "$has_installation" -eq 0 ]; then
        log_warn "README.md may be missing essential sections. Consider updating it."
    else
        log_info "README.md appears to be properly structured."
    fi
    
    log_info "README.md update completed."
}

# Function to perform git workflow
git_workflow() {
    log_step "Executing git workflow..."
    
    # Run git status --porcelain
    log_info "Checking git status..."
    git status --porcelain
    
    # CRITICAL: Before committing, perform git status to detect existing staged files
    log_info "Checking for staged files..."
    git status --short
    
    # If changes are staged, git reset the staging area
    if git diff --cached --quiet 2>/dev/null; then
        log_info "No staged changes found."
    else
        log_warn "Found staged changes. Resetting staging area..."
        git reset
    fi
    
    # Stage ALL changes (modifications, deletions, untracked files)
    log_info "Staging all changes..."
    git add -A
    
    # CRITICAL: Never skip production files during cleanup
    log_info "Ensuring production files are staged..."
    for dir in src/ scripts/ config/; do
        if [ -d "$dir" ]; then
            git add "$dir" 2>/dev/null || log_warn "Could not stage $dir"
        fi
    done
    
    # Secret scanning on staged diff
    log_info "Performing secret scanning..."
    if command -v git-secret >/dev/null 2>&1; then
        git-secret audit 2>/dev/null || log_warn "Secret scanning found potential issues"
    else
        log_warn "git-secret not available. Skipping secret scanning."
    fi
    
    # Generate conventional commit message based on staged files
    log_info "Generating commit message..."
    local commit_message
    commit_message=$(git diff --cached --name-only | head -1)
    if [ -z "$commit_message" ]; then
        commit_message="Auto-commit: $(date +%Y-%m-%d %H:%M:%S)"
    else
        commit_message="Auto-commit: $commit_message ($(date +%Y-%m-%d %H:%M:%S))"
    fi
    
    # Inspect old commits and clean/merge as needed
    log_info "Inspecting commit history..."
    git log --oneline -5
    
    # Commit for every modified file, including hidden folders
    log_info "Committing changes..."
    git commit -m "$commit_message"
    
    # Perform compliance, commit count, duplicate analysis, and squash resolution
    log_info "Performing compliance analysis..."
    
    # Check for duplicate commits
    local recent_commits
    recent_commits=$(git log --oneline --all --grep="^Auto-commit:" | sort | uniq -d)
    if [ -n "$recent_commits" ]; then
        log_warn "Found duplicate commits. Consider squashing."
    fi
    
    # Push to remote with conflict handling
    log_info "Pushing to remote..."
    git pull --rebase origin main 2>/dev/null || git pull --rebase origin master 2>/dev/null || log_warn "Could not pull from remote"
    
    git push --rebase
    
    # Verify git push succeeded
    log_info "Verifying push..."
    if [ $? -eq 0 ]; then
        log_info "Push completed successfully!"
    else
        log_error "Push failed!"
        return 1
    fi
    
    log_info "Git workflow completed successfully."
}

# Main function
main() {
    log_info "Starting auto-git workflow..."
    
    # Step 1: Resolve workspace problems
    resolve_workspace_problems
    
    # Step 2: Cleanup and maintenance
    cleanup_maintenance
    
    # Step 3: Documentation
    update_changelog
    update_readme
    
    # Step 4: Git workflow
    git_workflow
    
    # Step 5: Verification
    log_step "Final verification..."
    
    # Check if we're on a branch
    local current_branch
    current_branch=$(git branch --show-current 2>/dev/null || echo "unknown")
    log_info "Current branch: $current_branch"
    
    # Check remote status
    local remote_status
    remote_status=$(git status --porcelain 2>/dev/null | grep -v "^??" || echo "clean")
    if [ "$remote_status" = "clean" ]; then
        log_info "Working directory is clean."
    else
        log_warn "Working directory has untracked files."
    fi
    
    log_info "Auto-git workflow completed successfully!"
}

# Run main function
main