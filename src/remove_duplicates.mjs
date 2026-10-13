// Script to remove duplicate methods from bandit.mjs
const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/bandit.mjs', 'utf8');
const lines = content.split('\n');

// Define duplicate method ranges to remove (line numbers are 1-based)
// Format: [startLine, endLine] where endLine is inclusive
const duplicates = [
  [802, 811],    // _getProviderCooldownMs duplicate
  [971, 1050],   // recordFeedback duplicate (from line 971 to just before _parseResetAfter)
  [1053, 1070],  // _parseResetAfter duplicate
  [1072, 1081],  // _unlockProvider duplicate
  [1083, 1091],  // _recordTrainingFeedback duplicate
  [1094, 1097],  // _recordProviderFailure duplicate
  [1100, 1105],  // _forceProviderCooldown duplicate
  [1107, 1114]   // _triggerFallback duplicate
];

// Sort by start line in descending order so we can remove from bottom to top
const sortedDuplicates = duplicates.sort((a, b) => b[0] - a[0]);

// Remove duplicates
let resultLines = lines;
for (const [start, end] of sortedDuplicates) {
  // Convert to 0-based indices
  const startIdx = start - 1;
  const endIdx = end; // end is inclusive, so we need to remove up to this line

  resultLines = resultLines.filter((_, i) => !(i >= startIdx && i < endIdx));
}

// Write back the file
fs.writeFileSync('src/bandit.mjs', resultLines.join('\n'));

console.log('Removed duplicate methods from bandit.mjs');

// Verify by checking for remaining duplicates
const verifyContent = fs.readFileSync('src/bandit.mjs', 'utf8');
const verifyLines = verifyContent.split('\n');

// Check for remaining duplicates
const remainingDuplicates = [];
for (const [start, end] of duplicates) {
  // Check if any of these lines still exist
  for (let i = start - 1; i < Math.min(end, verifyLines.length); i++) {
    if (verifyLines[i] && verifyLines[i].includes('_getProviderCooldownMs') ||
        verifyLines[i].includes('recordFeedback') ||
        verifyLines[i].includes('_parseResetAfter') ||
        verifyLines[i].includes('_unlockProvider') ||
        verifyLines[i].includes('_recordTrainingFeedback') ||
        verifyLines[i].includes('_recordProviderFailure') ||
        verifyLines[i].includes('_forceProviderCooldown') ||
        verifyLines[i].includes('_triggerFallback')) {
      remainingDuplicates.push(start);
      break;
    }
  }
}

if (remainingDuplicates.length > 0) {
  console.log('WARNING: Some duplicates may still exist at lines:', remainingDuplicates);
} else {
  console.log('All duplicates removed successfully!');
}