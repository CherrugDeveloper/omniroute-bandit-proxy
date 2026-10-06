'use strict';

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

// Simulate the DiscountedUCB1Bandit class
class DiscountedUCB1Bandit {
  constructor() {
    this.fallbackModels = [];
  }

  getFallbackModels() {
    try {
      const config = require('../config/bandit.json');
      return config.fallbackModels || [];
    } catch (err) {
      console.error('[BANDIT] Error reading fallback config:', err.message);
      return [];
    }
  }
}

// Create a bandit instance
const bandit = new DiscountedUCB1Bandit();

// Simulate a scenario where a model hits a 429 error
function simulate429Error() {
  const fallbackModels = bandit.getFallbackModels();
  console.log('Fallback Models:', fallbackModels);
  console.log('Fallback mechanism would be triggered for model failures.');
}

// Run the simulation
simulate429Error();

// Restore the original require function
require = originalRequire;