import { classifyError } from './src/bandit.mjs';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('./config/bandit.json', 'utf8'));

// Test: model_not_found error
const result1 = classifyError(config.errorConfig, 'model_not_found: The model does not exist');
console.log('model_not_found error:', JSON.stringify(result1));

// Test: 404 error
const result2 = classifyError(config.errorConfig, '404 Not Found: The resource was not found');
console.log('404 error:', JSON.stringify(result2));

// Test: catalog mismatch
const result3 = classifyError(config.errorConfig, 'catalog mismatch: model not in active live catalog');
console.log('catalog mismatch error:', JSON.stringify(result3));
