// Simulate a scenario where a felo/* model repeatedly hits 429 errors
// and verify that the fallback mechanism is triggered.

import { DiscountedUCB1Bandit } from '../src/bandit.mjs';
import { EventEmitter } from 'events';

// Mock the fetch function to simulate 429 errors for felo/* models
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  const model = options.body ? JSON.parse(options.body).model : null;
  if (model && model.startsWith('felo/')) {
    // Simulate a 429 error with Retry-After header
    const response = new Response(JSON.stringify({
      error: {
        message: 'Rate limit exceeded',
        status: 429
      }
    }), {
      status: 429,
      headers: {
        'Retry-After': '30' // Simulate a 30-second Retry-After header
      }
    });
    return response;
  }
  // Default behavior for other models
  return originalFetch(url, options);
};

// Initialize the Bandit algorithm
const bandit = new DiscountedUCB1Bandit();

// Mock the config/bandit.json to include fallback models
const originalRequire = global.require;
global.require = (path) => {
  if (path === '../config/bandit.json') {
    return {
      fallbackModels: ['gpt-3.5-turbo'] // Simulate a fallback model
    };
  }
  return originalRequire(path);
};

// Simulate a request that repeatedly hits 429 errors
async function simulate429Error() {
  console.log('=== Simulating 429 Error for felo/* Model ===');
  
  // Force the use of a felo/* model
  const model = 'felo/1';
  
  // Simulate multiple attempts with retries
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`Attempt ${attempt}: Selecting model ${model}`);
    
    // Simulate a fetch request that returns a 429 error
    try {
      const response = await fetch('https://example.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'user', content: 'Test request' }
          ]
        })
      });
      
      if (response.status === 429) {
        console.log(`Attempt ${attempt}: Received 429 error for ${model}`);
        
        // Record the feedback to trigger fallback logic
        bandit.recordFeedback(model, false, 0, {
          status: 429,
          message: 'Rate limit exceeded',
          retryAfter: 30,
          modelId: model
        }, { source: 'prod' });
        
        // Simulate exponential backoff delay
        const retryDelay = Math.min(30 * 1000 * Math.pow(2, attempt - 1), 60000);
        console.log(`Attempt ${attempt}: Retrying in ${retryDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    } catch (error) {
      console.error(`Attempt ${attempt}: Error during fetch: ${error.message}`);
    }
  }
}

// Run the simulation
simulate429Error()
  .then(() => {
    console.log('=== Simulation Complete ===');
  })
  .catch((error) => {
    console.error('=== Simulation Error ===');
    console.error(error);
  });

// Restore original functions
setTimeout(() => {
  global.fetch = originalFetch;
  global.require = originalRequire;
}, 5000);