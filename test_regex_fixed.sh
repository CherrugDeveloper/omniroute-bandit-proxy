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
)

for subject in "${test_cases[@]}"; do
    if [[ "$subject" =~ ^(feat|fix|docs|style|refactor|test|chore)(\([^)]+\))?:\ .+ ]]; then
        echo "\"$subject\" -> MATCH"
    else
        echo "\"$subject\" -> NO MATCH"
    fi
done