#!/bin/bash
cd /home/marco/omniroute-bandit-proxy

# Test basic pattern without scope
subject="fix: test message"
echo "Testing: $subject"
if [[ "$subject" =~ ^(feat|fix|docs|style|refactor|test|chore):\ .+ ]]; then
    echo "Basic pattern MATCH"
else
    echo "Basic pattern NO MATCH"
fi

# Test pattern with scope - simplified
subject="fix(scope): test message"
echo "Testing: $subject"
if [[ "$subject" =~ ^(feat|fix|docs|style|refactor|test|chore)\([^)]+\):\ .+ ]]; then
    echo "Scope pattern MATCH"
else
    echo "Scope pattern NO MATCH"
fi

# Test the full pattern with escaped parentheses
subject="fix(scope): test message"
echo "Testing: $subject"
pattern="^(feat|fix|docs|style|refactor|test|chore)(\\([^)]+\\))?:\ .+"
if [[ "$subject" =~ $pattern ]]; then
    echo "Full pattern MATCH"
else
    echo "Full pattern NO MATCH"
fi