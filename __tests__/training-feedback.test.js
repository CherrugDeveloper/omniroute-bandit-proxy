import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DiscountedUCB1Bandit } from '../src/bandit.mjs';

describe('Training Feedback and Metrics Suite', () => {
  let bandit;
  let dbPath = ':memory:';

  before(() => {
    bandit = new DiscountedUCB1Bandit(dbPath);
    // Seed catalog and model
    bandit.db.prepare(`
      INSERT OR REPLACE INTO catalog (id, provider, is_free, supports_chat)
      VALUES ('test-provider/model-a', 'test-provider', 1, 1)
    `).run();
    bandit.db.prepare(`
      INSERT OR REPLACE INTO models (id, provider, N, sum_reward, fails, cooldown_until, permanent)
      VALUES ('test-provider/model-a', 'test-provider', 0, 0, 0, 0, 0)
    `).run();
    bandit.db.prepare(`
      INSERT OR REPLACE INTO provider_history (provider, fails, cooldown_until, consecutive_failures)
      VALUES ('test-provider', 0, 0, 0)
    `).run();
  });

  after(() => {
    if (bandit && typeof bandit.close === "function") {
      bandit.close();
    }
  });

  beforeEach(() => {
    bandit.db.prepare(`UPDATE models SET N = 5, sum_reward = 4.5, fails = 2, consecutive_critical_failures = 0, cooldown_until = 0 WHERE id = 'test-provider/model-a'`).run();
    bandit.db.prepare(`UPDATE provider_history SET fails = 1, consecutive_failures = 1 WHERE provider = 'test-provider'`).run();
  });

  it('should update operational metrics and provider health on training success without polluting UCB1 scores', () => {
    const modelBefore = bandit.db.prepare('SELECT N, sum_reward, fails FROM models WHERE id = ?').get('test-provider/model-a');
    assert.strictEqual(modelBefore.N, 5);
    assert.strictEqual(modelBefore.sum_reward, 4.5);
    assert.strictEqual(modelBefore.fails, 2);

    // Record training success
    bandit.recordFeedback('test-provider/model-a', true, 1.0, null, { source: 'training' });

    const modelAfter = bandit.db.prepare('SELECT N, sum_reward, fails FROM models WHERE id = ?').get('test-provider/model-a');
    // UCB1 N and sum_reward must remain unchanged (no pollution)
    assert.strictEqual(modelAfter.N, 5, 'UCB1 N should not increase during training');
    assert.strictEqual(modelAfter.sum_reward, 4.5, 'UCB1 sum_reward should not increase during training');
    // Operational fails should be reset to 0
    assert.strictEqual(modelAfter.fails, 0, 'Operational fails should be reset on training success');

    const providerAfter = bandit.db.prepare('SELECT consecutive_failures FROM provider_history WHERE provider = ?').get('test-provider');
    assert.strictEqual(providerAfter.consecutive_failures, 0, 'Provider consecutive failures should be reset on training success');
  });

  it('should trigger model and provider punishment on training failure', () => {
    // Record training failure with critical error (e.g. 403 Account disabled)
    bandit.recordFeedback('test-provider/model-a', false, 0, { status: 403, message: 'Account disabled' }, { source: 'training' });

    const modelAfter = bandit.db.prepare('SELECT fails, total_failures, consecutive_critical_failures FROM models WHERE id = ?').get('test-provider/model-a');
    assert.strictEqual(modelAfter.fails, 3, 'Fails should increment');
    assert.strictEqual(modelAfter.total_failures, 1, 'Total failures should increment');
    assert.strictEqual(modelAfter.consecutive_critical_failures, 1, 'Consecutive critical failures should track critical error');
  });
});
