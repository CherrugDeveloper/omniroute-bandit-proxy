import { classifyError } from './src/bandit.mjs';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('./config/bandit.json', 'utf8'));

// Let's trace through the exact matching
console.log('=== Analyzing pattern matching order ===\n');

// The transient patterns are checked FIRST (lines 1522-1545)
const transientPatterns = config.errorConfig.classification.transientErrors;
console.log('Transient patterns count:', transientPatterns.length);

// Check if any transient pattern matches 'model_not_found: The model does not exist'
transientPatterns.forEach((p, i) => {
  const regex = new RegExp(p.pattern, 'i');
  const matches = regex.test('model_not_found: The model does not exist');
  if (matches) console.log(`Transient pattern ${i} MATCHES: "${p.pattern}"`);
});

console.log('\n--- Now checking permanent patterns ---');

// Permanent patterns are checked SECOND (lines 1547-1559)
const permanentPatterns = config.errorConfig.classification.permanentErrors;
console.log('Permanent patterns count:', permanentPatterns.length);

permanentPatterns.forEach((p, i) => {
  const regex = new RegExp(p.pattern, 'i');
  const matches = regex.test('model_not_found: The model does not exist');
  if (matches) console.log(`Permanent pattern ${i} MATCHES: "${p.pattern}"`);
  else {
    // Also check with status
    const matchesStatus = regex.test('model_not_found') && 3 === 404; // status would be 404
    console.log(`Permanent pattern ${i} with status=404: ${matchesStatus} pattern="${p.pattern}"`);
  }
});
