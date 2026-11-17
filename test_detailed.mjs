import { classifyError } from './src/bandit.mjs';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('./config/bandit.json', 'utf8'));

console.log('=== DETAILED CLASSIFICATION TEST ===\n');

// Test model_not_found
console.log('1. model_not_found: "model_not_found: The model does not exist"');
const r1 = classifyError(config.errorConfig, 'model_not_found: The model does not exist');
console   .log('   Result:', JSON.stringify(r1));

// Test with just "model_not_found" 
console.log('\n2. Just "model_not_found"');
const r2 = classifyError(config.errorConfig, 'model_not_found');
console.log('   Result:', JSON.stringify(r2));

// Test with "does not exist"
console.log('\n3. "does not exist"');
const r3 = classifyError(config.errorConfig, 'does not exist');
console.log('   Result:', JSON.stringify(r3));

// Test with "not found"
console.log('\n4. "not found"');
const r4 = classifyError(config.errorConfig, 'not found');
console.log('   Result:', JSON.stringify(r4));

// Test with "catalog mismatch"
console.log('\n5. "catalog mismatch: model not in active live catalog"');
const r5 = classifyError(config.errorConfig, 'catalog mismatch: model not in active live catalog');
console.log('   Result:', JSON.stringify(r5));

// Now let's manually check which patterns match
console.log('\n=== PATTERN MATCHING ANALYSIS ===\n');

const transientPatterns = config.errorConfig.classification.transientErrors;
console.log('Transient patterns:');
transientPatterns.forEach((p, i) => {
  const regex = new RegExp(p.pattern, 'i');
  const m = regex.test('model_not_found: The model does not exist');
  console.log(`  ${i}. "${p.pattern}" matches: ${m}`);
});

const permanentPatterns = config.errorConfig.classification.permanentErrors;
console.log('\nPermanent patterns:');
permanentPatterns.forEach((p, i) => {
  const regex = new RegExp(p.pattern, 'i');
  const m = regex.test('model_not_found: The model does not exist');
  console.log(`  ${i}. "${p.pattern}" matches: ${m}`);
});
