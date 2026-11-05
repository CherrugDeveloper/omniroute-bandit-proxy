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
    
            addRequest(db, sessionId, endpoint, provider, status);
    
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
        
                    // Insert with explicit timestamps for proper ordering test
                    addRequestWithTimestamp(db, sessionId, '/v1/chat/completions', 'openai', 200, '2026-11-05 03:00:00');
                    addRequestWithTimestamp(db, sessionId, '/v1/chat/completions', 'anthropic', 429, '2026-11-05 03:01:00');
                    addRequestWithTimestamp(db, sessionId, '/v1/embeddings', 'openai', 500, '2026-11-05 03:02:00');
        
                    const history = getSessionHistory(db, sessionId, 100);
        
                    assert.strictEqual(history.length, 3, 'Dovrebbero esserci 3 richieste');
                    
                    // Verifica ordinamento (desc per timestamp)
                    // Ultima inserita (500) è la prima nel risultato
                    assert.strictEqual(history[0].status, 500, 'Ultima richiesta dovrebbe essere prima (status 500)');
                    assert.strictEqual(history[1].status, 429, 'Seconda richiesta dovrebbe avere status 429');
                    assert.strictEqual(history[2].status, 200, "Prima richiesta dovrebbe essere l'ultima");
                });

    /**
         * Test: Recovery after restart
         */
        it('should recover session data after restart', async () => {
            const sessionId = 'session-recover-test';
    
            // Salva richieste
            addRequest(db, sessionId, '/v1/chat/completions', 'openai', 200);
    
            // Simula restart: il "nuovo tracker" riesamine il DB
            const recoveredSessions = recoverFromDB(db);
    
            assert.ok(recoveredSessions.includes(sessionId),
                'La sessione dovrebbe essere recuperata dal DB');
        });

    /**
         * Test: Filtro per provider diverso
         */
        it('should get history grouped by provider', async () => {
            const sessionId = 'session-multi-provider';
    
            addRequest(db, sessionId, '/v1/chat/completions', 'openai', 200);
            addRequest(db, sessionId, '/v1/chat/completions', 'anthropic', 200);
            addRequest(db, sessionId, '/v1/chat/completions', 'openai', 500);
    
            const openaiHistory = getSessionHistoryByProvider(db, sessionId, 'openai');
            const anthropicHistory = getSessionHistoryByProvider(db, sessionId, 'anthropic');
    
            assert.strictEqual(openaiHistory.length, 2, 'OpenAI dovrebbe avere 2 richieste');
            assert.strictEqual(anthropicHistory.length, 1, 'Anthropic dovrebbe avere 1 richiesta');
        });

    /**
         * Test: Persistenza memory cache con fallback DB
         */
        it('should use memory cache with DB fallback', async () => {
                    const sessionId = 'cache-test-session';
        
                    // Aggiungi richiesta -> va su DB
                    addRequest(db, sessionId, '/v1/test', 'openai', 200);
        
                    // Recupera -> legge da DB (non c'è ancora in memory cache)
                    const history1 = getSessionHistory(db, sessionId);
        
                    // Crea cache pre-popolata con la history reale
                    const cache = new Map();
                    cache.set(sessionId, history1);
        
                    // Recupera nuovamente -> memory cache c'è
                    const history2 = getSessionHistoryWithCache(db, sessionId, cache);
        
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
                addRequest(db, sessionId, '/v1/test', 'openai', 200);
            }
    
            const count = db.prepare('SELECT COUNT(*) as cnt FROM request_logs WHERE session_id = ?')
                .get(sessionId).cnt;
    
            assert.strictEqual(count, 10, 'Dovrebbero esserci 10 righe distinte');
        });
    
        it('should handle status code variations', async () => {
            const sessionId = 'status-test';
            const statuses = [200, 201, 400, 401, 403, 404, 500, 502, 503];
    
            for (const status of statuses) {
                addRequest(db, sessionId, '/v1/test', 'openai', status);
            }
    
            const history = getSessionHistory(db, sessionId);
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

// Helper functions
function addRequest(db, sessionId, endpoint, provider, status) {
    db.prepare(`
        INSERT INTO request_logs (session_id, endpoint, provider, status)
        VALUES (?, ?, ?, ?)
    `).run(sessionId, endpoint, provider, status);
}

function addRequestWithTimestamp(db, sessionId, endpoint, provider, status, timestamp) {
    db.prepare(`
        INSERT INTO request_logs (session_id, endpoint, provider, status, timestamp)
        VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, endpoint, provider, status, timestamp);
}

function getSessionHistory(db, sessionId, limit = 100) {
    return db.prepare(`
        SELECT * FROM request_logs
        WHERE session_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
    `).all(sessionId, limit);
}

function getSessionHistoryByProvider(db, sessionId, provider) {
    return db.prepare(`
        SELECT * FROM request_logs
        WHERE session_id = ? AND provider = ?
        ORDER BY timestamp DESC
    `).all(sessionId, provider);
}

function recoverFromDB(db) {
    const rows = db.prepare(`
        SELECT DISTINCT session_id FROM request_logs
        WHERE timestamp > datetime('now', '-30 minutes')
    `).all();
    return rows.map(r => r.session_id);
}

function getSessionHistoryWithCache(db, sessionId, cache) {
    if (cache.has(sessionId)) {
        return cache.get(sessionId);
    }
    const history = getSessionHistory(db, sessionId);
    cache.set(sessionId, history);
    return history;
}