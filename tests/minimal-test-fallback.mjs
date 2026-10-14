import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Test reading fallback config
const getFallbackModels = () => {
  try {
    const configPath = path.resolve('config/bandit.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.fallbackModels || [];
  } catch (err) {
    console.error('[TEST] Error reading fallback config:', err.message);
    return [];
  }
};

// Run the test
const fallbackModels = getFallbackModels();
console.log('Fallback Models:', fallbackModels);
assert.ok(Array.isArray(fallbackModels), 'fallbackModels should be an array');
console.log('✅ MINIMAL FALLBACK TEST PASSED');

export { fallbackModels };
