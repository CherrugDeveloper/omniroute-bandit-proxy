import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { applyPunishment, resetFailuresGradually } from '../src/bandit.mjs';

/**
 * Test suite for punishment system race conditions and integrity
 */
describe('Punishment System', () => {
    let db;

    before(() => {
        db = new Database(':memory:');
        setupSchema(db);
    });

    after(() => {
        db.close();
    });

    beforeEach(() => {
        // Reset provider_history before each test
        db.prepare('DELETE FROM provider_history').run();
        db.prepare('INSERT INTO provider_history (provider, total_failures, circuit_breaker_until) VALUES (?, 0, 0)').run('openai');
        db.prepare('INSERT INTO provider_history (provider, total_failures, circuit_breaker_until) VALUES (?, 0, 0)').run('anthropic');
        db.prepare('INSERT INTO provider_history (provider, total_failures, circuit_breaker_until) VALUES (?, 0, 0)').run('google');
    });

    /**
     * Test: Race condition su punishments concorrenti
     * Verifica che 10 richieste concorrenti non causino race conditions
     */
    it('should handle concurrent punishments without race conditions', async () => {
        const promises = [];
        for (let i = 0; i < 10; i++) {
            promises.push(applyPunishment(db, 'openai', 'cooldown-provider', 'test-error'));
        }

        await Promise.all(promises);

        const result = db.prepare('SELECT total_failures FROM provider_history WHERE provider = ?')
            .get('openai');

        assert.strictEqual(result.total_failures, 10,
            'total_failures dovrebbe essere 10 dopo 10 punishments');
    });

    /**
     * Test: Circuit breaker timeout corretto
     */
    it('should calculate exponential backoff correctly', async () => {
        // 1st failure: 15s
        await applyPunishment(db, 'anthropic', 'cooldown-provider', 'error-1');
        let breaker = db.prepare('SELECT circuit_breaker_until FROM provider_history WHERE provider = ?')
            .get('anthropic').circuit_breaker_until;
        assert.ok(breaker > Date.now() + 10000,
            'Primo breaker dovrebbe essere ~15s');

        // Reset per altri test
        db.prepare('DELETE FROM provider_history').run();
        db.prepare('INSERT INTO provider_history (provider, total_failures, circuit_breaker_until) VALUES (?, 0, 0)').run('anthropic');

        // 3rd failure: 300s (5 minuti)
        await Promise.all([
            applyPunishment(db, 'anthropic', 'cooldown-provider', 'e1'),
            applyPunishment(db, 'anthropic', 'cooldown-provider', 'e2'),
            applyPunishment(db, 'anthropic', 'cooldown-provider', 'e3')
        ]);

        let result = db.prepare('SELECT circuit_breaker_until, total_failures FROM provider_history WHERE provider = ?')
            .get('anthropic');
        
        assert.strictEqual(result.total_failures, 3, 'total_failures dovrebbe essere 3');
    });

    /**
     * Test: Reset failures graduale
     */
    it('should reset failures gradually after success', async () => {
        // Simula 5 failures
        for (let i = 0; i < 5; i++) {
            await applyPunishment(db, 'google', 'cooldown-provider', `error-${i}`);
        }

        let result = db.prepare('SELECT total_failures FROM provider_history WHERE provider = ?')
            .get('google');
        assert.strictEqual(result.total_failures, 5);

        // Reset graduale
        await resetFailuresGradually(db, 'google');

        result = db.prepare('SELECT total_failures FROM provider_history WHERE provider = ?')
            .get('google');
        assert.strictEqual(result.total_failures, 4, 
            'Dopo 1 reset, dovrebbe essere 4');
    });

    /**
     * Test: Provider ban permanente after 10 failures
     */
    it('should apply permanent ban after threshold exceeded', async () => {
        for (let i = 0; i < 10; i++) {
            await applyPunishment(db, 'openai', 'cooldown-provider', `error-${i}`);
        }

        const result = db.prepare(`
            SELECT circuit_breaker_until 
            FROM provider_history 
            WHERE provider = ?
        `).get('openai');

        // Dopo 10 failures, dovrebbe essere permanente (max safe integer timestamp)
        assert.ok(parseInt(result.circuit_breaker_until) > Date.now() + 1000000000,
            'Circuit breaker dovrebbe essere quasi permanente');
    });
});

function setupSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS provider_history (
            provider TEXT PRIMARY KEY,
            total_failures INTEGER DEFAULT 0,
            circuit_breaker_until REAL DEFAULT 0,
            last_punishment TEXT,
            punishment_log TEXT DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS request_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            provider TEXT NOT NULL,
            status INTEGER NOT NULL,
            timestamp TEXT DEFAULT (datetime('now'))
        );
    `);
}

/**
 * Helper function to simulate concurrent access
 */
async function runConcurrentOperations(db, operation, count, provider) {
    const promises = [];
    for (let i = 0; i < count; i++) {
        promises.push(operation(db, provider, `error-${i}`));
    }
    return Promise.all(promises);
}