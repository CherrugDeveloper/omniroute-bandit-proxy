import { classifyError } from './src/bandit.mjs';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('./config/bandit.json', 'utf8'));

// Test with exact patterns from bandit.json permanent errors
// model_not_found pattern from line 44 of bandit.json
const pattern = "catalog mismatch|unknown model|model_not_found|does not exist|not found|no longer available|not available|invalid model|not available in active live catalog";

// Test 1: model_not_found message
console.log('=== Test 1: model_not_found message ===');
const result1 = classifyError(config.errorConfig, 'model_not_found: The model does not exist');
console.log('Result:', JSON.stringify(result1));

// Test 2: catalog mismatch 
console.log('\n=== Test 2: catalog mismatch ===');
const result2 = classifyError(config.errorConfig, 'catalog mismatch: model not in active live catalog');
console.log('Result:', JSON.stringify(result2));

// Test 3: does not exist
console.log('\n=== Test 3: does not exist ===');
const result3 = classifyError(config.errorConfig, 'model does not exist');
console.log('Result:', JSON.stringify(result3));

// Test 4: not found 
console.log('\n=== Test 4: not found ===');
const result4 = classifyError(config.errorConfig, '404 Not Found');
console.log('Result:', JSON.stringify(result4));

// Test 5: Check what transient patterns match
console.log('\n=== Test 5: Check transient patterns ===');
const transientPatterns = config.errorConfig.classification.transientErrors;
transientPatterns.forEach((p, i) => {
  const regex = new RegExp(p.pattern, 'i');
  const matches = regex.test('model_not_found: The model does not exist');
  console.log(`Pattern ${i}: ${p.pattern} -> matches: ${matches}`);
});
