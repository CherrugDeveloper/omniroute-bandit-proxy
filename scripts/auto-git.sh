#!/bin/bash
# Auto Git Script for OmniRoute Bandit Proxy
# Automated Git versioning, changelog generation, and documentation updates

set -e

echo "🚀 Starting auto-git process for OmniRoute Bandit Proxy..."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Step 1: Run syntax checks
echo ""
echo "📋 Step 1: Running syntax checks..."
if npm run check; then
    print_status "Syntax checks passed"
else
    print_error "Syntax checks failed"
    exit 1
fi

# Step 2: Check for .env files in staging area
echo ""
echo "🔒 Step 2: Checking for sensitive files..."
SENSITIVE_FILES=$(git diff --cached --name-only 2>/dev/null | grep -E '^\.env$|^\.env\.' || true)
if [ -n "$SENSITIVE_FILES" ]; then
    print_error "Sensitive env files are staged!"
    echo "Files to unstage:"
    echo "$SENSITIVE_FILES"
    git reset HEAD $SENSITIVE_FILES
    print_warning "Reset sensitive files from staging"
else
    print_status "No sensitive files staged"
fi

# Step 3: Check git status
echo ""
echo "📦 Step 3: Checking git status..."
if [[ -n $(git status --porcelain) ]]; then
    print_status "Unstaged changes detected, staging all files..."
    git add -A
else
    print_status "Working directory is clean"
fi

# Step 4: Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo ""
echo "🏷️  Current version: $CURRENT_VERSION"

# Step 5: Analyze commits since last tag for version bump
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

if [ -z "$LAST_TAG" ]; then
    # No tags exist - check if we have a version in package.json
    echo "🏷️  No git tags found. Using package.json version as baseline: $CURRENT_VERSION"
    
    # Parse current version
    IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
    
    # Check for feat commits in entire history (feat(scope): or feat:)
    HAS_BREAKING=$(git log --oneline -- "*.md" "*.mjs" "*.js" 2>/dev/null | grep "BREAKING CHANGE" || true)
    HAS_FEAT=$(git log --oneline -- "*.md" "*.mjs" "*.js" 2>/dev/null | grep -E "^[a-f0-9]+ feat" || true)
    HAS_FIX=$(git log --oneline -- "*.md" "*.mjs" "*.js" 2>/dev/null | grep -E "^[a-f0-9]+ fix" || true)
    
    if [ -n "$HAS_BREAKING" ]; then
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        echo "💥 Breaking change detected, bumping major version"
    elif [ -n "$HAS_FEAT" ]; then
        MINOR=$((MINOR + 1))
        PATCH=0
        echo "✨ New feature detected, bumping minor version"
    elif [ -n "$HAS_FIX" ]; then
        PATCH=$((PATCH + 1))
        echo "🔧 Bug fix detected, bumping patch version"
    else
        echo "📝 No significant code changes, version remains $CURRENT_VERSION"
    fi
    
    NEW_VERSION="$MAJOR.$MINOR.$PATCH"
else
    # Remove 'v' prefix if present
    LAST_TAG_VERSION=${LAST_TAG#v}
    echo "🏷️  Last tag: $LAST_TAG"
    
    # Parse current version
    IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
    
    # Check for breaking changes in recent commits
    HAS_BREAKING=$(git log --oneline $LAST_TAG..HEAD -- "*.md" "*.mjs" "*.js" 2>/dev/null | grep "BREAKING CHANGE" || true)
    
    # Check for feat commits (feat(scope): or feat:)
    HAS_FEAT=$(git log --oneline $LAST_TAG..HEAD -- "*.md" "*.mjs" "*.js" 2>/dev/null | grep -E "^[a-f0-9]+ feat" || true)
    
    # Check for fix commits (fix(scope): or fix:)
    HAS_FIX=$(git log --oneline $LAST_TAG..HEAD -- "*.md" "*.mjs" "*.js" 2>/dev/null | grep -E "^[a-f0-9]+ fix" || true)
    
    if [ -n "$HAS_BREAKING" ]; then
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        echo "💥 Breaking change detected, bumping major version"
    elif [ -n "$HAS_FEAT" ]; then
        MINOR=$((MINOR + 1))
        PATCH=0
        echo "✨ New feature detected, bumping minor version"
    elif [ -n "$HAS_FIX" ]; then
        PATCH=$((PATCH + 1))
        echo "🔧 Bug fix detected, bumping patch version"
    else
        # No significant changes, just update documentation
        echo "📝 No significant code changes, version remains $CURRENT_VERSION"
    fi
    
    NEW_VERSION="$MAJOR.$MINOR.$PATCH"
fi

# Only update if version changed
if [ "$CURRENT_VERSION" != "$NEW_VERSION" ]; then
    # Step 5a: Update package.json version
    echo ""
    echo "📝 Step 5a: Updating package.json version..."
    node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '$NEW_VERSION';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
    print_status "Updated package.json to $NEW_VERSION"
fi

# Step 6: Generate CHANGELOG.md
echo ""
echo "📚 Step 6: Generating CHANGELOG.md..."

# Get current date
RELEASE_DATE=$(date +%Y-%m-%d)

# Check if current version is already in CHANGELOG
VERSION_IN_CHANGELOG=false
if [ -f "CHANGELOG.md" ]; then
    if grep -q "## \[$CURRENT_VERSION\]" CHANGELOG.md; then
        VERSION_IN_CHANGELOG=true
        echo "📝 Version $CURRENT_VERSION already exists in CHANGELOG.md"
    fi
fi

# Get commits since last tag (or full history if no tags)
if [ -z "$LAST_TAG" ]; then
    COMMITS_SINCE="--all"
else
    COMMITS_SINCE="$LAST_TAG..HEAD"
fi

# Parse commits and categorize them
feat_commits=$(git log --oneline $COMMITS_SINCE -- "*.mjs" "*.js" "*.md" "*.json" 2>/dev/null | grep -E " feat" | sed -E 's/^[^ ]+ feat[^:]*: /- /' || true)
fix_commits=$(git log --oneline $COMMITS_SINCE -- "*.mjs" "*.js" "*.md" "*.json" 2>/dev/null | grep -E " fix" | sed -E 's/^[^ ]+ fix[^:]*: /- /' || true)
chore_commits=$(git log --oneline $COMMITS_SINCE -- "*.md" "*.json" 2>/dev/null | grep -E " chore" | sed -E 's/^[^ ]+ chore[^:]*: /- /' || true)
# Changed commits: all other commits with colons that aren't feat/fix/docs/test/chore
changed_commits=$(git log --oneline $COMMITS_SINCE -- "*.mjs" "*.js" "*.md" "*.json" 2>/dev/null | grep -v -E "^[a-f0-9]+ (feat|fix|docs|test|chore)" | sed -E 's/^[^ ]+ [^:]+: /- /' || true)

# Get file references from commits
get_file_refs() {
    git log --oneline $COMMITS_SINCE --name-only 2>/dev/null | grep -E "\.(m?js|md|json)$" | sort -u | head -10 | while read file; do
        if [ -n "$file" ]; then
            lines=$(git log -n 1 --format="%H" --follow -- "$file" 2>/dev/null | head -1)
            if [ -n "$lines" ]; then
                line=$(git log -n 1 --format="%H" --follow -- "$file" 2>/dev/null | xargs -I{} git blame -L1,1 {} -- "$file" 2>/dev/null | head -1 | awk '{print $1}' || echo "")
                echo "    - [$file:$line]"
            fi
        fi
    done
}

# Create new changelog entry
new_changelog_entry="## [$NEW_VERSION] - $RELEASE_DATE\n"

if [ -n "$feat_commits" ]; then
    new_changelog_entry+="### Feat\n"
    new_changelog_entry+="$feat_commits\n"
fi

if [ -n "$fix_commits" ]; then
    new_changelog_entry+="### Fix\n"
    new_changelog_entry+="$fix_commits\n"
fi

if [ -n "$changed_commits" ]; then
    new_changelog_entry+="### Changed\n"
    new_changelog_entry+="$changed_commits\n"
fi

# Prepend to CHANGELOG.md (skip if version already documented)
if [ -f "CHANGELOG.md" ]; then
    if [ "$VERSION_IN_CHANGELOG" = true ] && [ "$CURRENT_VERSION" = "$NEW_VERSION" ]; then
        print_status "CHANGELOG.md already has version $NEW_VERSION, skipping update"
    else
        # Prepend new entry to CHANGELOG.md
        echo -e "$new_changelog_entry\n" | cat - CHANGELOG.md > CHANGELOG.tmp && mv CHANGELOG.tmp CHANGELOG.md
        
        # Ensure Version History section exists at the end
        if ! grep -q "Version History" CHANGELOG.md; then
            echo -e "\n## Version History\n\nFor complete version history prior to $NEW_VERSION, see the [git history](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commits/main/CHANGELOG.md) or commit files.\n" >> CHANGELOG.md
        fi
        
        print_status "Updated CHANGELOG.md with version $NEW_VERSION"
    fi
else
    print_warning "CHANGELOG.md not found, creating new one..."
    echo "# Changelog

All notable changes to OmniRoute Bandit Proxy will be documented in this file.

The format is based on [Keep a Changelog v1.1.0](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

" > CHANGELOG.md
    echo -e "$new_changelog_entry" >> CHANGELOG.md
fi

# Step 7: Update README.md version header
echo ""
echo "📖 Step 7: Updating README.md..."
if [ -f "README.md" ]; then
    # Update version in header (line with **vX.Y.Z (date)** pattern)
    if [ "$CURRENT_VERSION" != "$NEW_VERSION" ]; then
        # Update version and date in README header
        sed -i "s/\*\*v[0-9]*\.[0-9]*\.[0-9]* ([0-9-]*)\*\*/\*\*v$NEW_VERSION ($RELEASE_DATE)\*\*/" README.md
        print_status "Updated README.md version header to v$NEW_VERSION ($RELEASE_DATE)"
    else
        print_status "README.md version already correct"
    fi
else
    print_warning "README.md not found"
fi

# Step 8: Final security check
echo ""
echo "🛡️  Step 8: Final security check..."
FINAL_CHECK=$(git diff --cached --name-only 2>/dev/null | grep -E '^\.env$|^\.env\.' || true)
if [ -n "$FINAL_CHECK" ]; then
    print_error "ERROR: Sensitive files detected in staging!"
    print_error "Files: $FINAL_CHECK"
    git reset HEAD $FINAL_CHECK
    print_warning "Reset sensitive files from staging"
else
    print_status "Security check passed"
fi

# Step 9: Commit changes
echo ""
echo "📤 Step 9: Committing changes..."
COMMITTED=false
if [[ -n $(git status --porcelain) ]]; then
    git add -A
    git commit -m "chore: update CHANGELOG, README, and version to $NEW_VERSION"
    print_status "Created commit for version $NEW_VERSION"
    COMMITTED=true
else
    print_warning "No changes to commit"
fi

# Step 10: Push to origin
echo ""
echo "📤 Step 10: Pushing to origin..."
if [ "$COMMITTED" = true ]; then
    git push origin main
    print_status "Pushed changes to origin/main"
else
    print_warning "Nothing to push"
fi

# Step 11: Create git tag (only if version changed)
if [ "$CURRENT_VERSION" != "$NEW_VERSION" ]; then
    echo ""
    echo "🏷️  Step 11: Creating git tag..."
    git tag -a "v$NEW_VERSION" -m "Release version $NEW_VERSION"
    git push origin "v$NEW_VERSION"
    print_status "Created and pushed tag v$NEW_VERSION"
fi

echo ""
echo "✅ Auto-git completed successfully!"
echo "   Version: $CURRENT_VERSION → $NEW_VERSION"
echo "   Date: $RELEASE_DATE"

exit 0