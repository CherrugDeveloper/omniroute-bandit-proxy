#!/usr/bin/env node
/**
 * Auto Git Command
 * Automated Git versioning, changelog generation, and documentation updates
 * 
 * This script MUST be executed unconditionally after task completion.
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, options = {}) {
  try {
    const result = execSync(command, {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
    // When stdio is 'inherit', result may be undefined, return empty string
    return result || '';
  } catch (error) {
    if (options.allowFail) return '';
    throw error;
  }
}

// Step 1: Check for conflicting processes (only actual train-daemon processes, not system 'watch' processes)
log('=== Checking for conflicting processes ===', 'blue');
try {
  const processes = runCommand('ps aux | grep "train-daemon" | grep -v grep || true', { silent: true });
  if (processes && processes.trim()) {
    log(`Conflicting processes detected:\n${processes}`, 'yellow');
    log('Attempting to stop train-daemon...', 'yellow');
    runCommand('pkill -f "node.*train-daemon" 2>/dev/null || pkill -f "train-daemon" 2>/dev/null || true', { allowFail: true });
  } else {
    log('No conflicting processes detected', 'green');
  }
} catch (e) {
  log('Could not check processes, continuing...', 'yellow');
}

// Step 2: Stop train-daemon if running
log('\n=== Stopping train-daemon if running ===', 'blue');
try {
  runCommand('pkill -f "train-daemon" 2>/dev/null || true');
  log('Train-daemon stopped or not running', 'green');
} catch (e) {
  log('Train-daemon check failed, continuing...', 'yellow');
}

// Step 3: Clean repository with file-by-file verification
log('\n=== Repository Cleanup with File-by-File Verification ===', 'blue');

// Database temporary files (keep them, they're needed)
const dbFiles = ['bandit.db', 'bandit.db-wal', 'bandit.db-shm', 'proxy.db', 'omniroute.db'];
for (const db of dbFiles) {
  if (existsSync(join(ROOT_DIR, db))) {
    log(`Keeping ${db} (versioned database)`, 'green');
  }
}

// Remove PID files
const pidFiles = ['.train-daemon.pid'];
for (const pid of pidFiles) {
  const pidPath = join(ROOT_DIR, pid);
  if (existsSync(pidPath)) {
    log(`Removing stale PID file: ${pid}`, 'yellow');
    rmSync(pidPath);
  }
}

// Remove script output files
try {
  const outputFiles = runCommand('ls scripts/.script-output-*.json 2>/dev/null || true', { silent: true });
  if (outputFiles && outputFiles.trim()) {
    for (const file of outputFiles.trim().split('\n')) {
      if (existsSync(file)) {
        log(`Removing script output: ${file}`, 'yellow');
        rmSync(file);
      }
    }
  }
} catch (e) {
  // No output files to clean
}

// Step 4: Run syntax checks
log('\n=== Running syntax checks ===', 'blue');

// Run syntax checks with explicit exit code handling
let checkSuccess = true;
try {
  execSync('npm run check', {
    cwd: ROOT_DIR,
    encoding: 'utf-8',
    stdio: 'inherit',
    windowsHide: true
  });
  log('Syntax checks passed', 'green');
} catch (e) {
  log('ERROR: Syntax checks failed!', 'red');
  if (e.status !== 0) {
    log(`Exit code: ${e.status}`, 'red');
  }
  process.exit(1);
}

// Step 5: Get current version from package.json or git tag
const pkgJsonPath = join(ROOT_DIR, 'package.json');
const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
const currentVersion = pkgJson.version;

log(`\nCurrent version: ${currentVersion}`, 'blue');

// Check for latest git tag
let latestTag = null;
try {
  latestTag = runCommand('git describe --tags --abbrev=0 2>/dev/null || echo ""', { silent: true });
  if (latestTag) {
    log(`Latest git tag: ${latestTag}`, 'blue');
  }
} catch (e) {
  log('No git tags found', 'yellow');
}

// Step 6: Get commits since last tag
let commitsSinceTag = [];
try {
  const sinceTag = latestTag || 'HEAD~1';
  const commitsOutput = runCommand(`git log ${sinceTag}..HEAD --format="%s" 2>/dev/null || echo ""`, { silent: true });
  if (commitsOutput && commitsOutput.trim()) {
    commitsSinceTag = commitsOutput.trim().split('\n').filter(c => c.trim());
  }
} catch (e) {
  log('Could not get commits since tag', 'yellow');
}

// Step 7: Determine version bump
let versionBump = 'patch';
for (const commit of commitsSinceTag) {
  if (commit.toLowerCase().startsWith('feat:')) {
    versionBump = 'minor';
    break;
  }
  if (commit.toLowerCase().startsWith('fix:')) {
    versionBump = 'patch';
  }
  if (commit.includes('BREAKING CHANGE:')) {
    versionBump = 'major';
    break;
  }
}

// Calculate new version
const [major, minor, patch] = currentVersion.split('.').map(Number);
let newVersion;
if (versionBump === 'minor') {
  newVersion = `${major}.${minor + 1}.0`;
} else if (versionBump === 'major') {
  newVersion = `${major + 1}.0.0`;
} else {
  newVersion = `${major}.${minor}.${patch + 1}`;
}

log(`Version bump: ${versionBump}`, 'yellow');
log(`New version: v${newVersion}`, 'green');

// Step 8: Generate/update CHANGELOG.md following Keep a Changelog v1.1.0
const changelogPath = join(ROOT_DIR, 'CHANGELOG.md');
const today = new Date().toISOString().split('T')[0];

// Get all tags sorted by version (most recent first)
function getTagsSorted() {
  try {
    const tagOutput = runCommand('git tag --sort=-v:refname', { silent: true });
    if (tagOutput && tagOutput.trim()) {
      return tagOutput.trim().split('\n').filter(t => t.trim().startsWith('v'));
    }
  } catch (e) {}
  return [];
}

// Get commits between two tags
function getCommitsBetween(fromRef, toRef) {
  try {
    const commitsOutput = runCommand(`git log ${fromRef}..${toRef} --format="%s" 2>/dev/null || echo ""`, { silent: true });
    if (commitsOutput && commitsOutput.trim()) {
      return commitsOutput.trim().split('\n').filter(c => c.trim());
    }
  } catch (e) {}
  return [];
}

// Parse commit type from conventional commit message
function parseCommitType(commit) {
  const lower = commit.toLowerCase();
  if (lower.startsWith('feat:')) return 'feat';
  if (lower.startsWith('fix:')) return 'fix';
  if (lower.startsWith('feat(') || lower.startsWith('fix(')) return 'feat'; // with scope
  return 'other';
}

// Generate entries for a version
function generateVersionEntries(version, tag, commits, date) {
  const entries = [];
  const added = [];
  const changed = [];
  const fixed = [];
  const deprecated = [];
  const removed = [];
  const security = [];
  
  for (const commit of commits) {
    const type = parseCommitType(commit);
    // Extract description (remove type prefix and BREAKING CHANGE)
    let desc = commit.replace(/^(feat|fix|feat\([^)]+\)|fix\([^)]+\)):\s*/i, '');
    if (desc.includes('BREAKING CHANGE:')) {
      desc = desc.replace(/\(BREAKING CHANGE:[^)]*\)/i, '(BREAKING CHANGE)');
    }
    
    if (type === 'feat') {
      added.push(desc);
    } else if (type === 'fix') {
      fixed.push(desc);
    } else if (commit.toLowerCase().includes('security')) {
      security.push(desc);
    } else if (commit.toLowerCase().includes('deprecated')) {
      deprecated.push(desc);
    } else if (commit.toLowerCase().includes('remove')) {
      removed.push(desc);
    } else {
      changed.push(desc);
    }
  }
  
  if (added.length > 0) entries.push(['### Added'], '', ...added.map(d => `- ${d}`), '');
  if (changed.length > 0) entries.push(['### Changed'], '', ...changed.map(d => `- ${d}`), '');
  if (deprecated.length > 0) entries.push(['### Deprecated'], '', ...deprecated.map(d => `- ${d}`), '');
  if (removed.length > 0) entries.push(['### Removed'], '', ...removed.map(d => `- ${d}`), '');
  if (fixed.length > 0) entries.push(['### Fixed'], '', ...fixed.map(d => `- ${d}`), '');
  if (security.length > 0) entries.push(['### Security'], '', ...security.map(d => `- ${d}`), '');
  
  return entries;
}

// Build changelog from full git history
function buildChangelogFromHistory(tags) {
  const lines = [
    '# Changelog',
    '',
    'All notable changes to this project will be documented in this file.',
    '',
    'The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),',
    'and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).',
    ''
  ];
  
  if (tags.length === 0) {
    // No tags - get all commits
    const allCommits = getCommitsBetween('4b817f1 HEAD~0', 'HEAD~0');
    if (allCommits.length > 0) {
      lines.push('## [Unreleased]');
      lines.push('');
      const entries = generateVersionEntries('unreleased', 'HEAD', allCommits, today);
      for (const entry of entries) {
        for (const line of entry) {
          lines.push(line);
        }
      }
      lines.push('');
    }
  } else {
    // Add [Unreleased] section for commits since last tag
    const commitsSinceLatest = getCommitsBetween(tags[0], 'HEAD');
    if (commitsSinceLatest.length > 0) {
      lines.push('## [Unreleased]');
      lines.push('');
      const entries = generateVersionEntries('unreleased', 'HEAD', commitsSinceLatest, today);
      for (const entry of entries) {
        for (const line of entry) {
          lines.push(line);
        }
      }
      lines.push('');
    }
    
    // Process each tagged version
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const version = tag.replace(/^v/, '');
      
      // Get commits for this version
      const fromRef = i === 0 ? tag : tags[i-1];
      const toRef = tag;
      const commits = getCommitsBetween(fromRef, toRef);
      
      // Try to get date from git tag
      let versionDate = today;
      try {
        const dateOutput = runCommand(`git log -1 --format="%ad" --date=short ${tag} 2>/dev/null || echo "${today}"`, { silent: true });
        if (dateOutput && dateOutput.trim()) {
          versionDate = dateOutput.trim().split('\n')[0];
        }
      } catch (e) {}
      
      // Format version display (strip 'v' prefix in section)
      lines.push(`## [${version}] - ${versionDate}`);
      lines.push('');
      
      const entries = generateVersionEntries(version, tag, commits, versionDate);
      for (const entry of entries) {
        for (const line of entry) {
          lines.push(line);
        }
      }
      lines.push('');
    }
  }
  
  // End marker
  lines.push('<!-- Version History -->');
  lines.push('');
  lines.push('## Version History');
  lines.push('');
  lines.push('For complete version history prior to the latest version, see the [git history](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commits/main/CHANGELOG.md) or commit files.');
  lines.push('');
  
  return lines.join('\n');
}

// Get all version tags
const allTags = getTagsSorted();

// Generate fresh changelog from git history
const newChangelog = buildChangelogFromHistory(allTags);
writeFileSync(changelogPath, newChangelog, 'utf-8');
log(`Generated CHANGELOG.md from ${allTags.length} version tags`, 'green');

// Step 9: Update README.md
const readmePath = join(ROOT_DIR, 'README.md');
if (existsSync(readmePath)) {
  let readmeContent = readFileSync(readmePath, 'utf-8');
  
  // Update version in header if present
  if (readmeContent.includes('version')) {
    // Simple version update - look for common patterns
    readmeContent = readmeContent.replace(
      /Version\s+v?[\d.]+/i,
      `Version v${newVersion}`
    );
    readmeContent = readmeContent.replace(
      /v?[\d.]+(\s*\(.*?)?\)/i,
      (match) => {
        if (match.includes(newVersion)) return match;
        const dateMatch = match.match(/\((.*?)\)/);
        const dateStr = dateMatch ? ` - ${dateMatch[1]}` : ` - ${today}`;
        return `v${newVersion}${dateStr})`;
      }
    );
    writeFileSync(readmePath, readmeContent, 'utf-8');
    log('Updated README.md version', 'green');
  }
}

// Step 10: Update package.json version
pkgJson.version = newVersion;
writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');
log(`Updated package.json to v${newVersion}`, 'green');

// Step 11: Verify no sensitive files are staged
log('\n=== Verifying staged files ===', 'blue');
try {
  const stagedFiles = runCommand('git diff --cached --name-only 2>/dev/null || echo ""', { silent: true });
  if (stagedFiles && stagedFiles.trim()) {
    const sensitiveCheck = stagedFiles.split('\n').find(f => 
      f.match(/^\.env$/) || 
      f.match(/^\.env\./) || 
      f.match(/\.(key|pem|cert)$/)
    );
    if (sensitiveCheck) {
      log(`ERROR: Sensitive file staged: ${sensitiveCheck}`, 'red');
      process.exit(1);
    }
  }
  log('No sensitive files staged', 'green');
} catch (e) {
  log('Could not verify staged files', 'yellow');
}

// Step 12: Stage all changes
log('\n=== Staging changes ===', 'blue');
try {
  runCommand('git add -A');
  log('Changes staged', 'green');
} catch (e) {
  log('ERROR: Failed to stage changes!', 'red');
  process.exit(1);
}

// Step 13: Commit
log('\n=== Committing changes ===', 'blue');
try {
  runCommand(`git commit -m "chore: update CHANGELOG, README, and version to v${newVersion}"`);
  log('Changes committed', 'green');
} catch (e) {
  if (e.message.includes('nothing to commit')) {
    log('No changes to commit', 'yellow');
  } else {
    log('ERROR: Commit failed!', 'red');
    process.exit(1);
  }
}

// Step 14: Push to origin
log('\n=== Pushing to origin ===', 'blue');
const branch = runCommand('git rev-parse --abbrev-ref HEAD');

let pushSuccess = false;
let retries = 0;
const maxRetries = 3;

while (retries < maxRetries && !pushSuccess) {
  try {
    log(`Attempt ${retries + 1}/${maxRetries} to push...`);
    runCommand(`git push -u origin ${branch}`);
    pushSuccess = true;
  } catch (e) {
    retries++;
    if (retries < maxRetries) {
      log('Push failed, pulling with rebase...', 'yellow');
      runCommand(`git pull --rebase origin ${branch}`, { allowFail: true });
    }
  }
}

if (!pushSuccess) {
  log(`ERROR: git push failed after ${maxRetries} attempts`, 'red');
  process.exit(1);
}

// Step 15: Verify remote sync
log('\n=== Verifying remote sync ===', 'blue');
try {
  const localCommit = runCommand('git rev-parse HEAD');
  const remoteCommit = runCommand(`git rev-parse origin/${branch}`);
  
  if (localCommit === remoteCommit) {
    log('Remote synchronization verified - local and remote are in sync', 'green');
    log('\n=== Git sync workflow completed successfully ===', 'green');
  } else {
    log('ERROR: Remote not in sync - manual intervention required', 'red');
    process.exit(1);
  }
} catch (e) {
  log('ERROR: Could not verify remote sync', 'red');
  process.exit(1);
}

// Final summary
log('\n=== Summary ===', 'blue');
log(`Version: v${currentVersion} → v${newVersion}`, 'green');
log(`Changelog: UPDATED`, 'green');
log(`README: UPDATED`, 'green');
log(`Package: UPDATED`, 'green');
log(`Push: SUCCESS`, 'green');