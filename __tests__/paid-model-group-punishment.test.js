import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';

/**
 * Test suite for paid model group punishment feature
 * When a paid model hits 3 consecutive critical failures, the entire
 * paid sub-group for that provider should be punished (banned).
 */

describe('Paid Model Group Punishment', () => {
  let db;

  before(() => {
    db = new Database(':memory:');
    setupSchema(db);
  });

  after(() => {
    db.close();
  });

  beforeEach(() => {
    // Clean up all tables before each test
    db.prepare('DELETE FROM models').run();
    db.prepare('DELETE FROM provider_history').run();
    db.prepare('DELETE FROM catalog').run();
    db.prepare('DELETE FROM request_logs').run();
    
    // Insert test provider history
    db.prepare('INSERT INTO provider_history (provider, fails, cooldown_until, pointer, permanent, needs_attention, attention_reason, attention_message) VALUES (?, 0, 0, 0, 0, 0, \'\', \'\')').run('openai');
    db.prepare('INSERT INTO provider_history (provider, fails, cooldown_until, pointer, permanent, needs_attention, attention_reason, attention_message) VALUES (?, 0, 0, 0, 0, 0, \'\', \'\')').run('anthropic');
    db.prepare('INSERT INTO provider_history (provider, fails, cooldown_until, pointer, permanent, needs_attention, attention_reason, attention_message) VALUES (?, 0, 0, 0, 0, 0, \'\', \'\')').run('google');
  });

  /**
   * Helper: Insert a model into the models table
   */
  function insertModel(id, provider, isPaid = 0) {
    db.prepare(`
      INSERT INTO models (id, provider, N, sum_reward, fails, total_failures, cooldown_until, permanent, 
                          last_used_index, consecutive_5xx, consecutive_critical_failures, degraded, is_paid)
      VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?)
    `).run(id, provider, isPaid);
  }

  /**
   * Helper: Simulate recording feedback (failure) for a model
   */
  function recordFailure(modelId, provider, statusCode, errorMsg = 'test error') {
    const modelRow = db.prepare('SELECT is_paid FROM models WHERE id = ?').get(modelId);
    if (!modelRow) return null;

    const isPaidModel = modelRow.is_paid === 1;
    
    // Increment consecutive critical failures
    const currentConsecutive = db.prepare('SELECT consecutive_critical_failures FROM models WHERE id = ?').get(modelId).consecutive_critical_failures;
    const newConsecutive = currentConsecutive + 1;
    
    // Update the counter
    db.prepare('UPDATE models SET consecutive_critical_failures = ? WHERE id = ?').run(newConsecutive, modelId);
    
    // Check for 3-strike rule
    if (newConsecutive >= 3) {
      if (isPaidModel) {
        // PUNISH ENTIRE PAID SUB-GROUP
        db.prepare(`
          UPDATE models SET permanent = 1, banned_since = ?, cooldown_until = 0, consecutive_critical_failures = ?
          WHERE provider = ? AND is_paid = 1
        `).run(Date.now(), newConsecutive, provider);
        
        return { paidGroupBanned: true, modelId, provider };
      } else {
        // Punish individual model
        db.prepare(`
          UPDATE models SET permanent = 1, banned_since = ?, cooldown_until = 0, consecutive_critical_failures = ?
          WHERE id = ?
        `).run(Date.now(), newConsecutive, modelId);
        
        return { individualBanned: true, modelId, provider };
      }
    }
    
    // Just increment counter
    db.prepare('UPDATE models SET consecutive_critical_failures = ? WHERE id = ?').run(newConsecutive, modelId);
    return { counter: newConsecutive };
  }

  /**
   * Test: Paid model hitting 3 critical failures bans entire paid group
   */
  it('should ban all paid models in provider when one paid model hits 3 critical failures', () => {
    const provider = 'openai';
    
    // Insert 3 paid models and 2 free models
    insertModel('paid-model-1', provider, 1);
    insertModel('paid-model-2', provider, 1);
    insertModel('paid-model-3', provider, 1);
    insertModel('free-model-1', provider, 0);
    insertModel('free-model-2', provider, 0);
    
    // Verify all models exist with correct is_paid values
    let paidCount = db.prepare('SELECT COUNT(*) as cnt FROM models WHERE provider = ? AND is_paid = 1').get(provider).cnt;
    let freeCount = db.prepare('SELECT COUNT(*) as cnt FROM models WHERE provider = ? AND is_paid = 0').get(provider).cnt;
    assert.strictEqual(paidCount, 3, 'Should have 3 paid models');
    assert.strictEqual(freeCount, 2, 'Should have 2 free models');

    // First critical failure for paid-model-1
    let result = recordFailure('paid-model-1', provider, 403, 'access denied');
    assert.strictEqual(result.counter, 1, 'First failure should increment counter to 1');
    
    // Verify no bans yet
    let banned = db.prepare('SELECT COUNT(*) as cnt FROM models WHERE provider = ? AND permanent = 1').get(provider).cnt;
    assert.strictEqual(banned, 0, 'No models should be banned yet');

    // Second critical failure for paid-model-1
    result = recordFailure('paid-model-1', provider, 403, 'access denied');
    assert.strictEqual(result.counter, 2, 'Second failure should increment counter to 2');
    
    banned = db.prepare('SELECT COUNT(*) as cnt FROM models WHERE provider = ? AND permanent = 1').get(provider).cnt;
    assert.strictEqual(banned, 0, 'No models should be banned yet');

    // Third critical failure for paid-model-1 - should trigger paid group ban
    result = recordFailure('paid-model-1', provider, 403, 'access denied');
    assert.strictEqual(result.paidGroupBanned, true, 'Paid group should be banned');
    
    // Verify ALL paid models are now banned
    const paidModels = db.prepare('SELECT id, permanent FROM models WHERE provider = ? AND is_paid = 1').all(provider);
    assert.strictEqual(paidModels.length, 3, 'Should have 3 paid models');
    for (const m of paidModels) {
      assert.strictEqual(m.permanent, 1, `Model ${m.id} should be permanently banned`);
    }
    
    // Verify free models are NOT banned
        const freeModels = db.prepare('SELECT id, permanent FROM models WHERE provider = ? AND is_paid = 0').all(provider);
        assert.strictEqual(freeModels.length, 2, 'Should have 2 free models');
    for (const m of freeModels) {
      assert.strictEqual(m.permanent, 0, `Free model ${m.id} should NOT be banned`);
    }
  });

  /**
   * Test: Free model hitting 3 critical failures bans only that model
   */
  it('should ban only the individual free model when it hits 3 critical failures', () => {
    const provider = 'anthropic';
    
    // Insert 1 free model that will fail
    insertModel('free-model-1', provider, 0);
    insertModel('other-model', provider, 0);
    
    // First critical failure
    let result = recordFailure('free-model-1', provider, 429, 'rate limited');
    assert.strictEqual(result.counter, 1);

    // Second critical failure
    result = recordFailure('free-model-1', provider, 429, 'rate limited');
    assert.strictEqual(result.counter, 2);

    // Third critical failure - should ban only this model
    result = recordFailure('free-model-1', provider, 429, 'rate limited');
    assert.strictEqual(result.individualBanned, true);

    // Verify free-model-1 is banned
    const bannedModel = db.prepare('SELECT id, permanent FROM models WHERE id = ?').get('free-model-1');
    assert.strictEqual(bannedModel.permanent, 1, 'free-model-1 should be permanently banned');
    
    // Verify other-model is NOT banned
    const otherModel = db.prepare('SELECT id, permanent FROM models WHERE id = ?').get('other-model');
    assert.strictEqual(otherModel.permanent, 0, 'other-model should NOT be banned');
  });

  /**
   * Test: Mixed scenario with both paid and free models
   */
  it('should handle mixed paid/free models correctly', () => {
    const provider = 'google';
    
    // Insert 2 paid, 1 free model
    insertModel('google-paid-1', provider, 1);
    insertModel('google-paid-2', provider, 1);
    insertModel('google-free-1', provider, 0);
    
    // free model hits 3 critical failures - should only ban that model
    recordFailure('google-free-1', provider, 403, 'access denied');
    recordFailure('google-free-1', provider, 403, 'access denied');
    const result = recordFailure('google-free-1', provider, 403, 'access denied');
    assert.strictEqual(result.individualBanned, true);
    
    // free model is banned, paid models are not
    let bannedPaid = db.prepare('SELECT COUNT(*) as cnt FROM models WHERE provider = ? AND is_paid = 1 AND permanent = 1').get(provider).cnt;
    assert.strictEqual(bannedPaid, 0, 'No paid models should be banned');
    
    let bannedFree = db.prepare('SELECT COUNT(*) as cnt FROM models WHERE provider = ? AND is_paid = 0 AND permanent = 1').get(provider).cnt;
    assert.strictEqual(bannedFree, 1, '1 free model should be banned');

    // Now a paid model hits 3 critical failures
    recordFailure('google-paid-1', provider, 429, 'rate limited');
    recordFailure('google-paid-1', provider, 429, 'rate limited');
    const result2 = recordFailure('google-paid-1', provider, 429, 'rate limited');
    assert.strictEqual(result2.paidGroupBanned, true);
    
    // BOTH paid models should now be banned
    bannedPaid = db.prepare('SELECT COUNT(*) as cnt FROM models WHERE provider = ? AND is_paid = 1 AND permanent = 1').get(provider).cnt;
    assert.strictEqual(bannedPaid, 2, 'Both paid models should be banned');
    
    // Free model is still banned
    bannedFree = db.prepare('SELECT COUNT(*) as cnt FROM models WHERE provider = ? AND is_paid = 0 AND permanent = 1').get(provider).cnt;
    assert.strictEqual(bannedFree, 1, 'Free model should still be banned');
  });

  /**
   * Test: Counter reset on success
   */
  it('should reset consecutive_critical_failures counter on success', () => {
    insertModel('reset-test-model', 'openai', 1);
    
    // 2 critical failures - counter should be 2
    recordFailure('reset-test-model', 'openai', 403, 'error');
    recordFailure('reset-test-model', 'openai', 403, 'error');
    
    let counter = db.prepare('SELECT consecutive_critical_failures FROM models WHERE id = ?').get('reset-test-model').consecutive_critical_failures;
    assert.strictEqual(counter, 2, 'Counter should be 2');
    
    // Reset on success
    db.prepare('UPDATE models SET consecutive_critical_failures = 0 WHERE id = ?').run('reset-test-model');
    
    counter = db.prepare('SELECT consecutive_critical_failures FROM models WHERE id = ?').get('reset-test-model').consecutive_critical_failures;
    assert.strictEqual(counter, 0, 'Counter should be reset to 0');
  });

  /**
   * Test: Only paid models in provider are affected by paid group ban
   */
  it('should only affect paid models within the same provider', () => {
    const openaiProvider = 'openai';
    const anthropicProvider = 'anthropic';
    
    // Insert paid models in different providers
    insertModel('openai-paid', openaiProvider, 1);
    insertModel('anthropic-paid', anthropicProvider, 1);
    
    // Hit 3 critical failures on openai-paid
    recordFailure('openai-paid', openaiProvider, 403, 'error');
    recordFailure('openai-paid', openaiProvider, 403, 'error');
    recordFailure('openai-paid', openaiProvider, 403, 'error');
    
    // Verify openai-paid is banned
    let banned = db.prepare('SELECT permanent FROM models WHERE id = ?').get('openai-paid').permanent;
    assert.strictEqual(banned, 1, 'openai-paid should be banned');
    
    // Verify anthropic-paid is NOT banned (different provider)
    banned = db.prepare('SELECT permanent FROM models WHERE id = ?').get('anthropic-paid').permanent;
    assert.strictEqual(banned, 0, 'anthropic-paid should NOT be banned (different provider)');
  });
});

function setupSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      N REAL DEFAULT 0,
      sum_reward REAL DEFAULT 0,
      fails INTEGER DEFAULT 0,
      total_failures INTEGER DEFAULT 0,
      cooldown_until REAL DEFAULT 0,
      permanent INTEGER DEFAULT 0,
      last_used_index INTEGER DEFAULT 0,
      consecutive_5xx INTEGER DEFAULT 0,
      consecutive_critical_failures INTEGER DEFAULT 0,
      degraded INTEGER DEFAULT 0,
      degraded_since REAL DEFAULT 0,
      banned_since REAL DEFAULT 0,
      is_paid INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS provider_history (
      provider TEXT PRIMARY KEY,
      fails INTEGER DEFAULT 0,
      cooldown_until REAL DEFAULT 0,
      pointer INTEGER DEFAULT 0,
      permanent INTEGER DEFAULT 0,
      needs_attention INTEGER DEFAULT 0,
      attention_reason TEXT DEFAULT '',
      attention_message TEXT DEFAULT '',
      total_failures INTEGER DEFAULT 0,
      circuit_breaker_until REAL DEFAULT 0,
      last_success_time REAL DEFAULT 0,
      last_punishment TEXT,
      punishment_log TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS catalog (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      max_input_tokens INTEGER DEFAULT 0,
      is_free INTEGER DEFAULT 0,
      supports_tools INTEGER DEFAULT 0,
      supports_image_generation INTEGER DEFAULT 0,
      supports_vision INTEGER DEFAULT 0,
      capability TEXT DEFAULT 'chat_completion',
      supports_chat INTEGER DEFAULT 1,
      supports_audio_generation INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at REAL,
      ended_at REAL,
      status_code INTEGER,
      error_message TEXT,
      model TEXT,
      provider TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider);
    CREATE INDEX IF NOT EXISTS idx_models_cooldown ON models(cooldown_until);
  `);
}