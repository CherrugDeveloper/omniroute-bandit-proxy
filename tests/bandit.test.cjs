import { jest } from '@jest/globals';
import { Bandit } from '../src/bandit.mjs';
import { HealthChecker } from '../src/health-check.mjs';
import { Notifier } from '../src/notifier.mjs';

// Mock the fetch API
jest.mock('node-fetch');

// Mock the console to avoid polluting test output
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

describe('Bandit Algorithm Tests', () => {
  let bandit;
  let healthChecker;
  let notifier;

  beforeEach(() => {
    bandit = new Bandit();
    healthChecker = new HealthChecker(bandit);
    notifier = new Notifier();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Retry Logic', () => {
    it('should retry with exponential backoff for 429 errors on felo/* models', async () => {
      // Mock the fetch API to return a 429 error
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Map([['Retry-After', '5']]),
          text: jest.fn().mockResolvedValue('Rate limit exceeded')
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'Success' } }] })
        });

      global.fetch = mockFetch;

      // Simulate a request to a felo/* model
      const response = await bandit.request('felo/test-model', { messages: [{ role: 'user', content: 'Test' }] });

      // Verify the retry logic was applied
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(response.choices[0].message.content).toBe('Success');
    });
  });

  describe('Fallback Mechanism', () => {
    it('should switch to fallback models when felo/* models fail due to 429 errors', async () => {
      // Mock the fetch API to return a 429 error for felo/* models
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Map([['Retry-After', '5']]),
          text: jest.fn().mockResolvedValue('Rate limit exceeded')
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'Fallback Success' } }] })
        });

      global.fetch = mockFetch;

      // Mock the getFallbackModels method to return a fallback model
      jest.spyOn(bandit, 'getFallbackModels').mockReturnValue(['mistral/ministral-8b-latest']);

      // Simulate a request to a felo/* model
      const response = await bandit.request('felo/test-model', { messages: [{ role: 'user', content: 'Test' }] });

      // Verify the fallback mechanism was applied
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(response.choices[0].message.content).toBe('Fallback Success');
    });
  });

  describe('Bandit Algorithm', () => {
    it('should penalize models that repeatedly hit rate limits', async () => {
      // Mock the fetch API to return a 429 error
      const mockFetch = jest.fn()
        .mockResolvedValue({
          ok: false,
          status: 429,
          headers: new Map([['Retry-After', '5']]),
          text: jest.fn().mockResolvedValue('Rate limit exceeded')
        });

      global.fetch = mockFetch;

      // Simulate multiple requests to the same model
      for (let i = 0; i < 5; i++) {
        await bandit.request('felo/test-model', { messages: [{ role: 'user', content: 'Test' }] }).catch(() => {});
      }

      // Verify the model was penalized
      const modelStats = bandit.getModelStats('felo/test-model');
      expect(modelStats.fails).toBeGreaterThan(0);
      expect(modelStats.cooldown).toBeGreaterThan(0);
    });
  });

  describe('Logging', () => {
    it('should generate detailed logs for retries, failures, and fallback selections', async () => {
      // Mock the fetch API to return a 429 error
      const mockFetch = jest.fn()
        .mockResolvedValue({
          ok: false,
          status: 429,
          headers: new Map([['Retry-After', '5']]),
          text: jest.fn().mockResolvedValue('Rate limit exceeded')
        });

      global.fetch = mockFetch;

      // Simulate a request to a felo/* model
      await bandit.request('felo/test-model', { messages: [{ role: 'user', content: 'Test' }] }).catch(() => {});

      // Verify detailed logs were generated
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[RETRY]'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[FAILURE]'));
    });
  });
});
