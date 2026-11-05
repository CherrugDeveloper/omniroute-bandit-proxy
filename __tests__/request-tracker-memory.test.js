import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  trackRequestStart,
  trackRequestUpdate,
  trackRequestEnd,
  getActiveRequestsCount,
  getActiveRequestsValues,
  getRequest
} from '../src/request-tracker.mjs';

// Import reset function if available - otherwise we need to clear the Map
// Since the module doesn't export a reset, we'll test the functions directly

describe('Request Tracker In-Memory', () => {
  afterEach(() => {
    // Clear all tracked requests after each test
    const values = getActiveRequestsValues();
    for (const req of values) {
      if (req.id) {
        trackRequestEnd(req.id);
      }
    }
  });

  describe('trackRequestStart', () => {
    it('should track request with attempt 0', () => {
      const id = 'test-request-001';
      trackRequestStart(id, { 
        attempt: 0, 
        model: 'gpt-4', 
        source: 'test',
        sessionKey: 'sess1'
      });
      
      const req = getRequest(id);
      assert.strictEqual(req.id, id);
      assert.strictEqual(req.attempt, 0, 'attempt should be 0, not converted to 1');
      assert.strictEqual(req.model, 'gpt-4');
      assert.strictEqual(req.source, 'test');
      assert.strictEqual(req.sessionKey, 'sess1');
      assert.strictEqual(req.status, 'starting');
    });

    it('should track request with default attempt when not provided', () => {
      const id = 'test-request-002';
      trackRequestStart(id, { 
        model: 'gpt-3.5',
        source: 'zoo'
      });
      
      const req = getRequest(id);
      assert.strictEqual(req.id, id);
      assert.strictEqual(req.attempt, 1, 'attempt should default to 1');
    });

    it('should track request with explicit attempt value', () => {
      const id = 'test-request-003';
      trackRequestStart(id, { 
        attempt: 5, 
        model: 'claude-3',
        source: 'training'
      });
      
      const req = getRequest(id);
      assert.strictEqual(req.attempt, 5);
    });
  });

  describe('trackRequestUpdate', () => {
    it('should update existing request tracked with attempt 0', () => {
      const id = 'test-request-004';
      
      // Start with attempt 0
      trackRequestStart(id, { 
        attempt: 0, 
        model: 'gpt-4',
        source: 'test'
      });
      
      // Update with attempt 0 and additional data
      trackRequestUpdate(id, { 
        attempt: 0, 
        status: 'fetching',
        provider: 'openai'
      });
      
      const req = getRequest(id);
      assert.strictEqual(req.attempt, 0, 'attempt should remain 0');
      assert.strictEqual(req.status, 'fetching');
      assert.strictEqual(req.provider, 'openai');
      assert.strictEqual(req.model, 'gpt-4', 'model should be preserved');
    });

    it('should create new entry when no matching key exists', () => {
      const id = 'test-request-005';
      
      // Update without prior start
      trackRequestUpdate(id, { 
        attempt: 1,
        status: 'fetching',
        model: 'gpt-3.5'
      });
      
      const req = getRequest(id);
      assert.strictEqual(req.attempt, 1);
      assert.strictEqual(req.status, 'fetching');
      assert.strictEqual(req.model, 'gpt-3.5');
    });

    it('should fallback to existing request when attempt mismatch occurs', () => {
      const id = 'test-request-006';
      
      // Start with attempt 0
      trackRequestStart(id, { 
        attempt: 0, 
        model: 'gpt-4',
        source: 'test'
      });
      
      // Update with attempt 1 (simulating retry scenario)
      trackRequestUpdate(id, { 
        attempt: 1, 
        status: 'fetching',
        provider: 'openai'
      });
      
      const req = getRequest(id);
      assert.strictEqual(req.attempt, 1, 'should have the new attempt 1');
      assert.strictEqual(req.status, 'fetching');
      assert.strictEqual(req.provider, 'openai');
    });
  });

  describe('trackRequestEnd', () => {
    it('should remove request by exact id', () => {
      const id = 'test-request-007';
      trackRequestStart(id, { attempt: 0, model: 'gpt-4' });
      
      assert.strictEqual(getActiveRequestsCount(), 1);
      
      trackRequestEnd(id);
      
      assert.strictEqual(getActiveRequestsCount(), 0);
      assert.strictEqual(getRequest(id), null);
    });

    it('should remove all attempts of a request id', () => {
      const id = 'test-request-008';
      
      trackRequestStart(id, { attempt: 0, model: 'gpt-4' });
      trackRequestUpdate(id, { attempt: 1, status: 'fetching' });
      trackRequestUpdate(id, { attempt: 2, status: 'error' });
      
      assert.strictEqual(getActiveRequestsCount(), 3);
      
      trackRequestEnd(id);
      
      assert.strictEqual(getActiveRequestsCount(), 0);
    });
  });

  describe('getRequest', () => {
    it('should return latest request by attempt number', () => {
      const id = 'test-request-009';
      
      trackRequestStart(id, { attempt: 0, model: 'gpt-4' });
      trackRequestUpdate(id, { attempt: 1, status: 'fetching' });
      trackRequestUpdate(id, { attempt: 2, status: 'error' });
      
      const req = getRequest(id);
      assert.strictEqual(req.attempt, 2, 'should return request with highest attempt');
      assert.strictEqual(req.status, 'error');
    });

    it('should return null for non-existent request', () => {
      const req = getRequest('non-existent-id');
      assert.strictEqual(req, null);
    });
  });

  describe('Key Matching Bug Fix', () => {
    it('should match ${id}-att0 key correctly when attempt is 0', () => {
      const id = 'key-mismatch-test';
      
      // This tests the bug fix: || vs ??
      // Before fix: attempt: 0 was converted to 1, creating key ${id}-att1
      // After fix: attempt: 0 is preserved, creating key ${id}-att0
      
      trackRequestStart(id, { attempt: 0, model: 'gpt-4' });
      
      // Verify the key is ${id}-att0, not ${id}-att1
      const req = getRequest(id);
      assert.strictEqual(req.attempt, 0, 'attempt should be 0 (not 1 due to || bug)');
      
      // Update should work with same key
      trackRequestUpdate(id, { status: 'updated', provider: 'openai' });
      
      const updatedReq = getRequest(id);
      assert.strictEqual(updatedReq.status, 'updated');
      assert.strictEqual(updatedReq.provider, 'openai');
    });

    it('should not match ${id}-attX when looking for ${id}-att0', () => {
      const id = 'precision-test';
      
      // Create request with attempt 0
      trackRequestStart(id, { attempt: 0, model: 'gpt-4' });
      
      // Create request with attempt 1
      trackRequestStart(id, { attempt: 1, model: 'gpt-3.5' });
      
      // Clear all attempts
      const values = getActiveRequestsValues();
      for (const req of values) {
        if (req.id === id) {
          trackRequestEnd(req.id);
        }
      }
      
      // Verify both are removed
      assert.strictEqual(getActiveRequestsCount(), 0, 'all attempts should be cleared');
    });
  });
});

describe('Request Tracker Integration', () => {
  afterEach(() => {
    const values = getActiveRequestsValues();
    for (const req of values) {
      if (req.id) {
        trackRequestEnd(req.id);
      }
    }
  });

  it('should handle full request lifecycle from start to end', () => {
    const id = 'lifecycle-test';
    
    // Start
    trackRequestStart(id, { 
      attempt: 0,
      model: 'gpt-4',
      source: 'zoo',
      sessionKey: 'session-abc',
      stream: true
    });
    
    let req = getRequest(id);
    assert.strictEqual(req.attempt, 0);
    assert.strictEqual(req.model, 'gpt-4');
    assert.strictEqual(req.status, 'starting');
    
    // Update with provider after selection
    trackRequestUpdate(id, {
      attempt: 0,
      status: 'fetching',
      provider: 'openai'
    });
    
    req = getRequest(id);
    assert.strictEqual(req.status, 'fetching');
    assert.strictEqual(req.provider, 'openai');
    
    // Update with response
    trackRequestUpdate(id, {
      attempt: 0,
      status: 'completed',
      totalTokens: 150,
      endTime: Date.now()
    });
    
    req = getRequest(id);
    assert.strictEqual(req.status, 'completed');
    assert.strictEqual(req.totalTokens, 150);
    
    // End
    trackRequestEnd(id);
    
    req = getRequest(id);
    assert.strictEqual(req, null, 'request should be null after end');
  });

  it('should track retry attempts correctly', () => {
    const id = 'retry-test';
    
    // First attempt
    trackRequestStart(id, { attempt: 0, model: 'gpt-4' });
    
    // Retry attempt 1
    trackRequestUpdate(id, { attempt: 1, status: 'retry', error: 'timeout' });
    
    // Retry attempt 2
    trackRequestUpdate(id, { attempt: 2, status: 'retry', error: 'timeout' });
    
    // Final success
    trackRequestUpdate(id, { attempt: 2, status: 'completed' });
    
    const req = getRequest(id);
    assert.strictEqual(req.attempt, 2);
    assert.strictEqual(req.status, 'completed');
    
    // Clean up
    trackRequestEnd(id);
    assert.strictEqual(getActiveRequestsCount(), 0);
  });
});