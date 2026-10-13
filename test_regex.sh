#!/bin/bash
cd /home/marco/omniroute-bandit-proxy
subject="fix(scope): test message"
if [[ "$subject" =~ ^(feat|fix|docs|style|refactor|test|chore)(\([^)]+\))?:\ .+ ]]; then
    echo "MATCH"
else
    echo "NO MATCH"
fi