#!/bin/bash
cd /home/marco/omniroute-bandit-proxy

# Test the fixed pattern
subject="fix(scope): test message"
echo "Testing: $subject"

# Using a variable for the pattern to avoid issues with quoting
pattern='^(feat|fix|docs|style|refactor|test|chore)(\([^)]+\))?:\ .+'
if [[ "$subject" =~ $pattern ]]; then
    echo "MATCH"
    echo "BASH_REMATCH: ${BASH_REMATCH[*]}"
else
    echo "NO MATCH"
fi