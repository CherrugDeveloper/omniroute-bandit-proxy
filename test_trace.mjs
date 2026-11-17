// Add some debugging to understand the flow
import { classifyError } from './src/bandit.mjs';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('./config/bandit.json', 'utf8'));

console.log('=== TRACING classifyError FLOW ===\n');

// Let's manually replicate what classifyError does
const message = 'model_not_found: The model does not exist';
const status = 0; // no status
const resolvedProvider = '';

// Transient patterns check
const transientPatterns = config.errorConfig.classification.transientErrors;
console.log('Step 1: Checking transient patterns...');
for (let i = 0; i < transientPatterns.length; i++) {
  const pattern = transientPatterns[i];
  const regex = new RegExp(pattern.pattern, 'i');
  const matches = regex.test(message) || (pattern.status && pattern.status === status);
  if (matches) {
    console.log(`  MATCHED transient pattern ${i}: "${pattern.pattern}" -> action: ${pattern.action}`);
    break;
  }
  if (i === transientPatterns.length - 1) console.log('  NO transient patterns matched');
}

// Permanent patterns check
console.log('\nStep 2: Checking permanent patterns...');
const permanentPatterns = config.errorConfig.classification.permanentErrors;
for (let i = 0; i < permanentPatterns.length; i++) {
  const pattern = permanentPatterns[i];
  const regex = new RegExp(pattern.pattern, 'i');
  const matches = regex.test(message) || (pattern.status && pattern.status === status);
  if (matches) {
    console.log(`  MATCHED permanent pattern ${i}: "${pattern.pattern}" -> action: ${pattern.action}`);
    console.log('  Would return: ban-model permanent');
    break;
  }
  if (i === permanentPatterns.length - 1) console.log('  NO permanent patterns matched');
}

// Now check the special handling in bandit.mjs lines 1611-1617
console.log('\nStep 3: Checking special model_not_found handling (lines 1611-1617)...');
const specialMatch = (/catalog mismatch|unknown model|model_not_found|does not exist|not found|no longer available|not available|invalid model|not available in active live catalog/i.test(message));
console.log(`  Special match regex: ${specialMatch}`);
if (specialMatch) {
  console.log('  Would return: cooldown-model transient');
}
