#!/usr/bin/env node
// ============================================================
// auto-git.mjs - Automated Git Workflow Script (Modern)
// ============================================================
// Implements robust automated Git workflow:
// 1. Status check (git status --porcelain)
// 2. Artifact cleanup & .gitignore staging validation
// 3. Secret scanning on staged diff (git diff --cached)
// 4. Conventional commit message generation based on staged files
// 5. Commit execution with dry-run support
// 6. Push to remote with conflict handling (git pull --rebase)
// 7. Comprehensive feedback report & diagnostics
// ============================================================

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CONFIG = {
  cleanupPatterns: [
    /^test_.*\.txt$/,
    /^test-.*\.txt$/,
    /^test_.*\.sh$/,
    /^test_.*\.py$/,
    /^test_.*\.js$/,
    /^test-.*\.sh$/,
    /^debug_.*\.sh$/,
    /^debug_.*\.txt$/,
    /^fix_.*\.py$/,
    /^fix_.*\.sh$/,
    /^cleanup\.bat$/,
    /^find_.*\.py$/,
    /\.log$/,
    /^cmd-.*\.txt$/,
    /\.DS_Store$/,
    /^core(\.\d+)?$/,
    /\.core$/,
    /^temp_.*$/,
    /^output_.*$/,
    /\.tmp$/,
    /^plans\/temp_.*\.md$/,
    /^plans\/scratch_.*\.md$/,
    /^plans\/.*\.tmp$/
  ],
  ignoredPatterns: [/.env$/, /node_modules\//, /\.db$/, /\.sqlite$/, /\.log$/],
  secretPatterns: [
    { name: "OmniRoute API Key", regex: /omniroute_[a-zA-Z0-9]{16,}/i },
    { name: "Generic API Token / Sk-key", regex: /sk-[a-zA-Z0-9]{20,}/ },
    { name: "Bearer Token", regex: /bearer\s+[a-zA-Z0-9_\-\.]{20,}/i },
    { name: "Private Key Block", regex: /-----BEGIN (RSA|DSA|EC|OPENSSH|PRIVATE) KEY-----/ },
    { name: "Secret / Password Assignment", regex: /(api_key|password|secret|auth_token)\s*[:=]\s*['"][a-zA-Z0-9_\-\.]{10,}['"]/ }
  ]
};

function log(msg, level = "info") {
  const t = new Date().toLocaleTimeString();
  const prefix = level === "error" ? "[ERROR]" : level === "warn" ? "[WARN]" : "[auto-git]";
  console.log(`[${prefix} ${t}] ${msg}`);
}

function run(cmd, options = {}) {
  try {
    const res = execSync(cmd, {
      encoding: "utf8",
      stdio: options.stdio || "pipe",
      cwd: process.cwd(),
      ...options
    });
    return res ? res.trim() : "";
  } catch (err) {
    if (options.ignoreError) return null;
    throw err;
  }
}

function cleanupArtifacts() {
  log("Cleaning temporary untracked artifacts...");
  const untrackedFiles = run("git ls-files --others --exclude-standard")
    .split("\n")
    .filter(Boolean);
  
  let removed = 0;
  for (const file of untrackedFiles) {
    if (CONFIG.cleanupPatterns.some(pat => pat.test(file))) {
      try {
        fs.unlinkSync(file);
        log(`  Removed: ${file}`, "info");
        removed++;
      } catch (e) {
        // Ignore errors
      }
    }
  }
  return removed;
}

function validateStagedFiles() {
  log("Validating staged files against .gitignore...");
  let stagedFiles = run("git diff --cached --name-only")
    .split("\n")
    .filter(Boolean);
  
  let unstaged = [];
  for (const file of stagedFiles) {
    const isIgnoredByPattern = CONFIG.ignoredPatterns.some(pat => pat.test(file));
    if (isIgnoredByPattern) {
      log(`  Unstaging ignored file: ${file}`, "warn");
      run(`git rm --cached "${file}"`, { ignoreError: true });
      unstaged.push(file);
      continue;
    }
    
    try {
      const isIgnored = run(`git check-ignore "${file}"`, { ignoreError: true });
      if (isIgnored) {
        log(`  Unstaging git-ignored file: ${file}`, "warn");
        run(`git rm --cached "${file}"`, { ignoreError: true });
        unstaged.push(file);
      }
    } catch (e) {
      // Ignore check-ignore errors
    }
  }
  return unstaged;
}

function scanSecrets(stagedFiles) {
  log("Scanning staged files for secrets...");
  const codeFiles = stagedFiles.filter(f => 
    !f.endsWith(".md") && !f.startsWith("plans/") && !f.endsWith(".json")
  );
  
  for (const file of codeFiles) {
    try {
      const diff = run(`git diff --cached -- "${file}"`, { ignoreError: true }) || "";
      
      // Skip false positives in auto-git.mjs itself
      const filteredDiff = file === "scripts/auto-git.mjs"
        ? diff.split("\n")
            .filter(line => !line.toLowerCase().includes("secret") && 
                   !line.includes("Regex") && 
                   !line.includes("omniroute_") &&
                   !line.includes("private key"))
            .join("\n")
        : diff;
      
      for (const { name, regex } of CONFIG.secretPatterns) {
        if (regex.test(filteredDiff)) {
          log(`SECURITY ERROR: Potential secret detected in ${file}`, "error");
          log(`  Pattern: ${name}`, "error");
          log("  Aborting to prevent credential leak.", "error");
          return false;
        }
      }
    } catch (e) {
      // Skip files that can't be diffed
    }
  }
  log("Secret scan passed: No secrets detected.");
  return true;
}

function generateCommitMessage(stagedFiles) {
  log("Analyzing staged files for conventional commit...");
  
  const hasTests = stagedFiles.some(f => 
    f.startsWith("__tests__/") || f.startsWith("tests/"));
  const hasDocs = stagedFiles.some(f => 
    f.endsWith(".md") || f.startsWith("plans/"));
  const hasDeps = stagedFiles.some(f => 
    f === "package.json" || f === "package-lock.json");
  const hasBandit = stagedFiles.some(f => f.includes("bandit"));
  const hasIndex = stagedFiles.some(f => f.includes("index.mjs"));
  const hasScripts = stagedFiles.some(f => f.startsWith("scripts/"));
  const hasConfig = stagedFiles.some(f => f.startsWith("config/"));
  
  let type = "chore";
  let scope = "";
  let subject = "";
  
  if (hasTests && !hasBandit && !hasIndex) {
    type = "test";
    subject = "update test suite and verification scripts";
  } else if (hasDocs) {
    type = "docs";
    subject = "update project documentation and architectural plans";
  } else if (hasDeps) {
    type = "chore";
    scope = "deps";
    subject = "update project dependencies";
  } else if (hasBandit) {
    type = "refactor";
    scope = "bandit";
    subject = "update bandit routing and model selection logic";
  } else if (hasIndex) {
    type = "feat";
    scope = "proxy";
    subject = "update proxy routing and request handling";
  } else if (hasScripts) {
    type = "chore";
    scope = "scripts";
    subject = "update automation and utility scripts";
  } else if (hasConfig) {
    type = "chore";
    scope = "config";
    subject = "update configuration files";
  } else {
    type = "chore";
    subject = "update repository source files and configurations";
  }
  
  const scopeStr = scope ? `(${scope})` : "";
  const commitMsg = `${type}${scopeStr}: ${subject}\n\nStaged files:\n` +
    stagedFiles.map(f => `- ${f}`).join("\n");
  
  log(`Generated commit message:\n${commitMsg}`);
  return { type, scope: scopeStr, subject, commitMsg };
}

function pushWithRebase(branch) {
  log(`Pushing branch '${branch}' to origin...`);
  
  try {
    run(`git push origin ${branch}`, { stdio: "inherit" });
    return true;
  } catch (err) {
    log("Push failed, attempting rebase...", "warn");
    
    try {
      run(`git pull --rebase origin ${branch}`, { stdio: "inherit" });
      log("Rebase successful, retrying push...", "info");
      run(`git push origin ${branch}`, { stdio: "inherit" });
      return true;
    } catch (rebaseErr) {
      log("CONFLICT ERROR: Manual intervention required", "error");
      log("Run 'git status' to resolve conflicts.", "error");
      return false;
    }
  }
}

function generateReport({ commitHash, commitMsg, branch, stagedFiles, pushSuccess, type, scopeStr }) {
  const commitCount = run(`git rev-list --count origin/${branch}..HEAD`, { ignoreError: true }) || "1";
  const recentCommits = run("git log -n 5 --oneline", { ignoreError: true });
  const recentSubjects = run("git log -n 5 --pretty=%s", { ignoreError: true }).split("\n");
  const subject = commitMsg.split("\n")[0].split(": ")[1]?.split("\n")[0] || "";
  const similarCount = recentSubjects.filter(s => 
    s.toLowerCase().includes(subject.toLowerCase().slice(0, 15))
  ).length;
  const duplicateWarning = similarCount > 1 
    ? "⚠️  Multiple recent commits share similar keywords" 
    : "None detected";
  
  const unpushedCount = parseInt(commitCount, 10) || 1;
  const squashSuggestion = unpushedCount > 3
    ? `💡 You have ${unpushedCount} unpushed commits. Consider squashing minor fixups.`
    : "None (optimal commit count)";
  
  console.log("\n" + "=".repeat(70));
  console.log("           AUTO-GIT WORKFLOW SUMMARY REPORT");
  console.log("=".repeat(70));
  console.log(`Commit Hash     : ${commitHash}`);
  console.log(`Commit Message  : ${commitMsg.split("\n")[0]}`);
  console.log(`Branch          : ${branch}`);
  console.log(`Staged Files    : ${stagedFiles.length} file(s)`);
  console.log(`Secret Scan     : Passed`);
  console.log(`Compliance      : Valid conventional commit ${type}${scopeStr}`);
  console.log(`Commit Count    : ${unpushedCount} new commit(s)`);
  console.log(`Duplicate Check : ${duplicateWarning}`);
  console.log(`Squash Suggest  : ${squashSuggestion}`);
  console.log(`Push Status     : ${pushSuccess ? "✓ Success" : "✗ Failed / Manual intervention"}`);
  console.log(`Recent Log:\n${recentCommits}`);
  console.log("=".repeat(70) + "\n");
}

async function main() {
  log("Starting automated git workflow...");
  
  // 1. Check for changes
  const status = run("git status --porcelain");
  if (!status) {
    log("No changes detected. Exiting.");
    process.exit(0);
  }
  
  log(`Changes detected:\n${status}`);
  
  // 2. Cleanup artifacts
  const removed = cleanupArtifacts();
  if (removed > 0) {
    log(`Removed ${removed} temporary artifacts`);
  }
  
  // 3. Validate staged files
  validateStagedFiles();
  
  // 4. Stage all changes
  log("Staging all modifications...");
  run("git add -A");
  
  const finalStaged = run("git diff --cached --name-only")
    .split("\n")
    .filter(Boolean);
  
  if (finalStaged.length === 0) {
    log("No changes to commit after filtering. Exiting.");
    process.exit(0);
  }
  
  // 5. Double-check ignored files
  for (const file of finalStaged) {
    try {
      const isIgnored = run(`git check-ignore "${file}"`, { ignoreError: true });
      if (isIgnored) {
        log(`SECURITY ERROR: Attempted to stage git-ignored file: ${file}`, "error");
        process.exit(1);
      }
    } catch (e) {}
  }
  
  // 6. Secret scanning
  if (!scanSecrets(finalStaged)) {
    process.exit(1);
  }
  
  // 7. Generate commit message
  const { type, scope: scopeStr, subject, commitMsg } = generateCommitMessage(finalStaged);
  
  // 8. Dry run mode
  const isDryRun = process.argv.includes("--dry-run") || 
    process.env.DRY_RUN === "true" || 
    process.env.DRY_RUN === "1";
  
  if (isDryRun) {
    log("[DRY RUN] Skipping commit and push");
    const branch = run("git branch --show-current") || "main";
    console.log("\n" + "=".repeat(70));
    console.log("      AUTO-GIT WORKFLOW SUMMARY REPORT (DRY RUN)");
    console.log("=".repeat(70));
    console.log(`Commit Message: ${commitMsg}`);
    console.log(`Branch        : ${branch}`);
    console.log(`Staged Files  : ${finalStaged.length}`);
    console.log(`Secret Scan   : Passed`);
    console.log(`Compliance    : Valid (${type}${scopeStr})`);
    console.log("=".repeat(70) + "\n");
    process.exit(0);
  }
  
  // 9. Commit
  log("Executing git commit...");
  run(`git commit -m ${JSON.stringify(commitMsg)}`, { stdio: "inherit" });
  
  // 10. Push with conflict handling
  const branch = run("git branch --show-current") || "main";
  const pushSuccess = pushWithRebase(branch);
  
  // 11. Generate report
  const commitHash = run("git rev-parse --short HEAD");
  generateReport({
    commitHash,
    commitMsg,
    branch,
    stagedFiles: finalStaged,
    pushSuccess,
    type,
    scopeStr
  });
}

main().catch(err => {
  log(`Fatal error: ${err.message}`, "error");
  process.exit(1);
});
