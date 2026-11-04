import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';

/**
 * Test suite for Request Tracker persistence and session recovery
 */
describe('Request Tracker Persistence', () => {
    let db;

    before(() => {
        db = new Database(':memory:');
        setupSchema(db);
    });

    after(() => {
        db.close();
    });

    beforeEach(() => {
        db.prepare('DELETE FROM request_logs').run();
    });

    /**
     * Test: Scrittura richiesta su DB
     */
    it('should persist request to database', async () => {
        const sessionId = 'session-test-001';
        const endpoint = '/v1/chat/completions';
        const provider = 'openai';
        const status = 200;

        await addRequest(db, sessionId, endpoint, provider, status);

        const result = db.prepare(`
            SELECT * FROM request_logs 
            WHERE session_id = ? AND provider = ?
        `).get(sessionId, provider);

        assert.ok(result, 'La richiesta dovrebbe essere salvata');
        assert.strictEqual(result.endpoint, endpoint);
        assert.strictEqual(result.provider, provider);
        assert.strictEqual(result.status, status);
    });

    /**
     * Test: Recupero session history
     */
    it('should retrieve session history', async () => {
        const sessionId = 'session-user-123';

        // Aggiungi richieste multiple
        await Promise.all([
            addRequest(db, sessionId, '/v1/chat/completions', 'openai', 200),
            addRequest(db, sessionId, '/v1/chat/completions', 'anthropic', 429),
            addRequest(db, sessionId, '/v1/embeddings', 'openai', 500)
        ]);

        const history = await getSessionHistory(db, sessionId, 100);

        assert.strictEqual(history.length, 3, 'Dovrebbero esserci 3 richieste');
        
        // Verifica ordinamento (desc per timestamp)
        assert.ok(history[0].status === 429, 'Ultime richieste prima di tutte');
        assert.strictEqual(history[2].status, 200, 'Prima richiesta dovrebbe essere l'ultima');
    });

    /**
     * Test: Recovery after restart
     */
    it('should recover session data after restart', async () => {
        const sessionId = 'session-recover-test';

        // Salva richieste
        await addRequest(db, sessionId, '/v1/chat/completions', 'openai', 200);

        // Simula restart: il "nuovo tracker" riesamina il DB
        const recoveredSessions = await recoverFromDB(db);

        assert.ok(recoveredSessions.includes(sessionId), 
            'La sessione dovrebbe essere recuperata dal DB');
    });

    /**
     * Test: Filtro per provider diverso
     */
    it('should get history grouped by provider', async () => {
        const sessionId = 'session-multi-provider';

        await Promise.all([
            addRequest(db, sessionId, '/v1/chat/completions', 'openai', 200),
            addRequest(db, sessionId, '/v1/chat/completions', 'anthropic', 200),
            addRequest(db, sessionId, '/v1/chat/completions', 'openai', 500)
        ]);

        const openaiHistory = await getSessionHistoryByProvider(db, sessionId, 'openai');
        const anthropicHistory = await getSessionHistoryByProvider(db, sessionId, 'anthropic');

        assert.strictEqual(openaiHistory.length, 2, 'OpenAI dovrebbe avere 2 richieste');
        assert.strictEqual(anthropicHistory.length, 1, 'Anthropic dovrebbe avere 1 richiesta');
    });

    /**
     * Test: Persistenza memory cache con fallback DB
     */
    it('should use memory cache with DB fallback', async () => {
        const sessionId = 'cache-test-session';

        // Aggiungi richiesta -> va su DB
        await addRequest(db, sessionId, '/v1/test', 'openai', 200);

        // Recupera -> legge da DB (non c'è ancora in memory cache)
        const history1 = await getSessionHistory(db, sessionId);

        // Recupera nuovamente -> memory cache c'è
        const history2 = await getSessionHistoryWithCache(
            db, 
            sessionId, 
            new Map([[sessionId, { cached: true }]])
        );

        assert.deepStrictEqual(history1, history2, 'I risultati dovrebbero coincere');
    });
});

/**
 * Test: Verifica integrità dati
 */
describe('Request Tracker Data Integrity', () => {
    let db;

    before(() => {
        db = new Database(':memory:');
        setupSchema(db);
    });

    after(() => {
        db.close();
    });

    it('should handle duplicate session entries correctly', async () => {
        const sessionId = 'duplicate-session';

        // Aggiungi 10 richieste identiche
        for (let i = 0; i < 10; i++) {
            await addRequest(db, sessionId, '/v1/test', 'openai', 200);
        }

        const count = db.prepare('SELECT COUNT(*) as cnt FROM request_logs WHERE session_id = ?')
            .get(sessionId).cnt;

        assert.strictEqual(count, 10, 'Dovrebbero esserci 10 righe distinte');
    });

    it('should handle status code variations', async () => {
        const sessionId = 'status-test';
        const statuses = [200, 201, 400, 401, 403, 404, 500, 502, 503];

        for (const status of statuses) {
            await addRequest(db, sessionId, '/v1/test', 'openai', status);
        }

        const history = await getSessionHistory(db, sessionId);
        const statusCounts = {};

        for (const row of history) {
            statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
        }

        assert.strictEqual(history.length, 9);
        statuses.forEach(s => assert.strictEqual(statusCounts[s], 1));
    });
});

function setupSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS request_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            provider TEXT NOT NULL,
            status INTEGER NOT NULL,
            timestamp TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_request_logs_session ON request_logs(session_id);
        CREATE INDEX IF NOT EXISTS idx_request_logs_provider ON request_logs(provider);
    `);
}

// Helper functions da implementare in src/request-tracker.mjs
async function addRequest(db, sessionId, endpoint, provider, status) {
    await db.prepare(`
        INSERT INTO request_logs (session_id, endpoint, provider, status)
        VALUES (?, ?, ?, ?)
    `).runAsync(sessionId, endpoint, provider, status);
}

async function getSessionHistory(db, sessionId, limit = 100) {
    return db.prepare(`
        SELECT * FROM request_logs 
        WHERE session_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
    `).all(sessionId, limit);
}

async function getSessionHistoryByProvider(db, sessionId, provider) {
    return db.prepare(`
        SELECT * FROM request_logs 
        WHERE session_id = ? AND provider = ?
        ORDER BY timestamp DESC
    `).all(sessionId, provider);
}

async function recoverFromDB(db) {
    const rows = db.prepare(`
        SELECT DISTINCT session_id FROM request_logs 
        WHERE timestamp > datetime('now', '-30 minutes')
    `).all();
    return rows.map(r => r.session_id);
}

async function getSessionHistoryWithCache(db, sessionId, cache) {
    if (cache.has(sessionId)) {
        return cache.get(sessionId);
    }
    const history = await getSessionHistory(db, sessionId);
    cache.set(sessionId, history);
    return history;
}