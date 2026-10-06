'use strict';

const fs = require('fs');
const path = require('path');

// Mock the require function to simulate reading bandit.json
const mockConfig = {
  fallbackModels: ['felo/fallback1', 'felo/fallback2']
};

// Mock the require function
const originalRequire = require;
require = (modulePath) => {
  if (modulePath === '../config/bandit.json') {
    return mockConfig;
  }
  return originalRequire(modulePath);
};

// Test the getFallbackModels function
function getFallbackModels() {
  try {
    const config = require('../config/bandit.json');
    return config.fallbackModels || [];
  } catch (err) {
    console.error('[TEST] Error reading fallback config:', err.message);
    return [];
  }
}

// Run the test
const fallbackModels = getFallbackModels();
console.log('Fallback Models:', fallbackModels);

// Restore the original require function
require = originalRequire;