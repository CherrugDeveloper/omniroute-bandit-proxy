import fs from "node:fs";
import path from "node:path";

const testsDir = path.join(process.cwd(), "tests");
const scriptsTestsDir = path.join(process.cwd(), "scripts", "tests");

let checkedCount = 0;
let cleanedCount = 0;

const cjsFiles = ["bandit.test.cjs", "minimal-test-fallback.cjs", "test-429-fallback.cjs", "test-fallback-direct.cjs"];

if (fs.existsSync(scriptsTestsDir)) {
  for (const file of cjsFiles) {
    const filePath = path.join(scriptsTestsDir, file);
    checkedCount++;
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        cleanedCount++;
        console.log(`[clean-cjs-tests] Cleaned: [scripts/tests/${file}](scripts/tests/${file}:1)`);
      } catch (err) {
        console.error(`[clean-cjs-tests] Failed to remove [scripts/tests/${file}](scripts/tests/${file}:1):`, err.message);
      }
    }
  }
}

for (const file of cjsFiles) {
  const filePath = path.join(testsDir, file);
  checkedCount++;
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      cleanedCount++;
      console.log(`[clean-cjs-tests] Cleaned: [tests/${file}](tests/${file}:1)`);
    } catch (err) {
      console.error(`[clean-cjs-tests] Failed to remove [tests/${file}](tests/${file}:1):`, err.message);
    }
  }
}

try {
  fs.readdirSync(testsDir);
} catch (err) {
  // Ignore error if tests directory does not exist or cannot be read
}

if (cleanedCount > 0) {
  console.log(`[clean-cjs-tests] Completed: Checked ${checkedCount} target paths, successfully cleaned ${cleanedCount} cjs file(s).`);
} else {
  console.log(`[clean-cjs-tests] Completed: Checked ${checkedCount} target paths. No .cjs files were found to clean.`);
}
