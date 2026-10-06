'use strict';

const { DiscountedUCB1Bandit } = require('../src/bandit');
const { fetch } = require('node-fetch');

// Mock the fetch function to simulate 429 errors
const mockFetch = async (url, options) => {
  if (url.includes('felo/model1')) {
    return {
      ok: false,
      status: 429,
      headers: {
        'Retry-After': '10',
      },
      json: () => Promise.resolve({
        error: 'Rate limit exceeded',
      }),
    };
  }
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      data: 'mock response',
    }),
  };
};

// Override the global fetch function
global.fetch = mockFetch;

// Create a bandit instance
const bandit = new DiscountedUCB1Bandit();

// Simulate a request that triggers a fallback
async function simulateRequest() {
  try {
    const modelId = 'felo/model1';
    const feedback = await bandit.recordFeedback(modelId, false, 0, {
      status: 429,
      retryAfter: 10,
      modelId: modelId,
    });
    console.log('Feedback recorded:', feedback);
  } catch (err) {
    console.error('Error:', err);
  }
}

// Run the simulation
simulateRequest();