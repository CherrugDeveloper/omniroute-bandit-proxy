import fs from "node:fs";
import path from "node:path";

const testsDir = path.join(process.cwd(), "tests");
const cjsFiles = ["bandit.test.cjs", "minimal-test-fallback.cjs", "test-429-fallback.cjs", "test-fallback-direct.cjs"];

for (const file of cjsFiles) {
  const filePath = path.join(testsDir, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`Removed: ${file}`);
  } else {
    console.log(`Not found: ${file}`);
  }
}

const remaining = fs.readdirSync(testsDir);
console.log("Remaining files:", remaining.join(", "));