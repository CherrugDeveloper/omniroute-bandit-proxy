#!/usr/bin/env node

// Test script to reproduce the Promise resolution issue
const { execSync } = require('child_process');

console.log('Checking current test output...');
const output = execSync('cd /home/marco/Workspace_vscode/omniroute-bandit-proxy && npm test 2>&1 | grep -E "(Promise resolution is still pending|pending)" | head -5').toString();
console.log(output);

console.log('Let me check if there are any syntax errors in the bandit.mjs file...');
try {
    execSync('cd /home/marco/Workspace_vscode/omniroute-bandit-proxy && node -c src/bandit.mjs', { stdio: 'inherit' });
    console.log('No syntax errors found');
} catch (e) {
    console.log('Syntax error detected:', e.message);
}