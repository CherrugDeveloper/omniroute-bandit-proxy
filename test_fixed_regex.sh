#!/bin/bash
cd /home/marco/omniroute-bandit-proxy

# Test cases
test_cases=(
    "fix: test message"
    "feat(scope): add feature"
    "docs: update readme"
    "refactor(core): simplify logic"
    "test: add unit tests"
    "chore: update dependencies"
    "style: fix formatting"
    "invalid: message"
    "no-colon-message"
    "feat(scope):"
    "feat: "
)

for subject in "${test_cases[@]}"; do
    # Using a variable for the pattern to avoid issues with quoting
    pattern='^(feat|fix|docs|style|refactor|test|chore)(\([^)]+\))?:\ .+'
    if [[ "$subject" =~ $pattern ]]; then
        echo "\"$subject\" -> MATCH"
    else
        echo "\"$subject\" -> NO MATCH"
    fi
done