process.env.DEBUG_BANDIT = 'true';

import Database from 'better-sqlite3';
import { DiscountedUCB1Bandit } from '../src/bandit.mjs';

// Create in-memory database for testing
const dbPath = ':memory:';

// Create a bandit instance
const bandit = new DiscountedUCB1Bandit(dbPath);

// Ensure the catalog and models tables have test data
bandit.db.prepare('INSERT OR IGNORE INTO catalog (id, provider, max_input_tokens, is_free, is_paid) VALUES (?, ?, ?, ?, ?)').run('test-provider/model-a', 'test-provider', 4000, 0, 0);

// Test 1: key-limit-exceeded should NOT increment group counter
console.log('\n=== Test 1: key-limit-exceeded error ===');
const result1 = bandit.recordFeedback('test-provider/model-a', false, 0, {status: 403, message: 'Key limit exceeded (total limit)'});
console.log('Error details:', result1.errorDetails);

// Check group_free_failures counter
const groupFree1 = bandit.db.prepare('SELECT group_free_failures FROM provider_history WHERE provider = ?', []).get('test-provider');
console.log('Group free failures after key-limit-exceeded:', groupFree1?.group_free_failures || 0);
console.log('Provider row:', groupFree1);

// Test 2: rate-limit should NOT increment group counter
console.log('\n=== Test 2: rate-limit error ===');
const result2 = bandit.recordFeedback('test-provider/model-a', false, 0, {status: 429, message: 'Rate limit exceeded'});
console.log('Error details:', result2.errorDetails);

const groupFree2 = bandit.db.prepare('SELECT group_free_failures FROM provider_history WHERE provider = ?', []).get('test-provider');
console.log('Group free failures after rate-limit:', groupFree2?.group_free_failures || 0);

// Test 3: timeout should NOT increment group counter
console.log('\n=== Test 3: timeout error ===');
const result3 = bandit.recordFeedback('test-provider/model-a', false, 0, {status: 504, message: 'Gateway timeout'});
console.log('Error details:', result3.errorDetails);

const groupFree3 = bandit.db.prepare('SELECT group_free_failures FROM provider_history WHERE provider = ?', []).get('test-provider');
console.log('Group free failures after timeout:', groupFree3?.group_free_failures || 0);

// Test 4: auth-expired SHOULD increment group counter (critical failure)
console.log('\n=== Test 4: auth-expired error (critical) ===');
const result4 = bandit.recordFeedback('test-provider/model-a', false, 0, {status: 401, message: 'No active credentials'});
console.log('Error details:', result4.errorDetails);

const groupFree4 = bandit.db.prepare('SELECT group_free_failures FROM provider_history WHERE provider = ?', []).get('test-provider');
console.log('Group free failures after auth-expired:', groupFree4?.group_free_failures || 0);

console.log('\n=== All tests completed ===');
process.exit(0);