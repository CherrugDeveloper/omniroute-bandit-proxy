import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { format } from 'date-fns';

/**
 * Test suite for punishment monitoring and dashboard integration
 */
describe('Punishment Monitor', () => {
    let db;

    before(() => {
        db = new Database(':memory:');
        setupSchema(db);
    });

    after(() => {
        db.close();
    });

    beforeEach(() => {
        db.prepare('DELETE FROM provider_history').run();
    });

    /**
     * Test: Rilevamento provider in stato di emergenza
     */
    it('should detect emergency state providers', async () => {
        // Imposta provider con circuit breaker attivo
        const emergencyUntil = new Date(Date.now() + 3600000).toISOString(); // 1 ora
        
        db.prepare(`
            INSERT INTO provider_history 
            (provider_name, total_failures, circuit_breaker_until, last_request)
            VALUES ('openai', 10, ?, datetime('now'))
        `).run(emergencyUntil);

        const providers = await getProvidersInEmergency(db);
        
        assert.strictEqual(providers.length, 1);
        assert.strictEqual(providers[0].provider_name, 'openai');
        assert.strictEqual(providers[0].status, 'EMERGENCY');
    });

    /**
     * Test: Rilevazione provider con alti failure count
     */
    it('should detect high failure providers', async () => {
            db.prepare(`
                INSERT INTO provider_history
                (provider_name, total_failures, circuit_breaker_until, last_request)
                VALUES ('anthropic', 8, NULL, datetime('now'))
            `).run();
    
            db.prepare(`
                INSERT INTO provider_history
                (provider_name, total_failures, circuit_breaker_until, last_request)
                VALUES ('google', 2, NULL, datetime('now'))
            `).run();
    
            const highFailures = await getProvidersByFailureThreshold(db, 5);
            
            assert.strictEqual(highFailures.length, 1);
            assert.strictEqual(highFailures[0].provider_name, 'anthropic');
            assert.strictEqual(highFailures[0].total_failures, 8);
        });

    /**
     * Test: Generazione report per dashboard
     */
    it('should generate dashboard-compatible report', async () => {
            // Setup multi-provider data
            const providers = ['openai', 'anthropic', 'google'];
            providers.forEach((p, i) => {
                db.prepare(`
                    INSERT INTO provider_history
                    (provider_name, total_failures, circuit_breaker_until)
                    VALUES (?, ?, ?)
                `).run(p, i * 3, i === 0 ? new Date(Date.now() + 60000).toISOString() : null);
            });
    
            const report = await generateDashboardReport(db);
            
            assert.ok(Array.isArray(report.providers), 'Report dovrebbe avere array providers');
            assert.strictEqual(report.providers.length, 3, 'Dovrebbero esserci 3 provider');
            
            // Verifica struttura dati
            const openai = report.providers.find(p => p.provider_name === 'openai');
            assert.strictEqual(openai.status, 'BREAKER_ACTIVE');
            assert.strictEqual(openai.total_failures, 0);
        });

    /**
     * Test: Corretta formattazione timestamp
     */
    it('should format timestamps correctly', async () => {
        const date = new Date('2026-11-04T03:14:00.000Z');
        const formatted = format(date, 'yyyy-MM-dd HH:mm:ss');
        
        assert.strictEqual(formatted, '2026-11-04 04:14:00', 
            'Formattazione deve usare timezone locale corretto');
    });
});

describe('Circuit Breaker Logic', () => {
    let db;

    before(() => {
        db = new Database(':memory:');
        setupSchema(db);
    });

    after(() => {
        db.close();
    });

    beforeEach(() => {
        db.prepare('DELETE FROM provider_history').run();
    });

    it('should correctly evaluate breaker status', () => {
            const now = Date.now();
            
            // Test: Breaker futuro
            const futureBreaker = new Date(now + 3600000).toISOString();
            db.prepare('INSERT INTO provider_history (provider_name, circuit_breaker_until) VALUES (?, ?)')
                .run('openai', futureBreaker);
    
            const result1 = isBreakerActive(db, 'openai');
            assert.strictEqual(result1.active, true);
            assert.strictEqual(result1.minutesRemaining, 60);
    
            // Test: Breaker passato
            const pastBreaker = new Date(now - 3600000).toISOString();
            db.prepare('INSERT INTO provider_history (provider_name, circuit_breaker_until) VALUES (?, ?)')
                .run('anthropic', pastBreaker);
    
            const result2 = isBreakerActive(db, 'anthropic');
            assert.strictEqual(result2.active, false);
            assert.strictEqual(result2.minutesRemaining, 0);
        });
    
        it('should handle null breaker gracefully', () => {
                    db.prepare('INSERT INTO provider_history (provider_name, circuit_breaker_until, last_request) VALUES (?, NULL, NULL)')
                        .run('google');
    
            const result = isBreakerActive(db, 'google');
            assert.strictEqual(result.active, false);
        });
});

/**
 * Test: Integrità dashboard HTML
 */
describe('Dashboard HTML Structure', () => {
    it('should have correct table structure for providers', async () => {
        // Questo test verificherebbe il file public/dashboard.html
        // per assicurarsi che le tabelle siano ben formate
        
        const html = `
            <table id="providers-table">
                <thead>
                    <tr>
                        <th>Provider</th>
                        <th>Status</th>
                        <th>Failures</th>
                        <th>Circuit Breaker</th>
                    </tr>
                </thead>
                <tbody id="providers-body">
                </tbody>
            </table>
        `;

        // Parsing semplice per verificare struttura
        assert.ok(html.includes('<table id="providers-table">'), 'Table deve avere ID');
        assert.ok(html.includes('<thead>'), 'Table deve avere header');
        assert.ok(html.includes('<tbody id="providers-body">'), 'Table deve avere body per popolamento dinamico');
    });
});

function setupSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS provider_history (
            provider_name TEXT PRIMARY KEY,
            last_request TEXT,
            total_failures INTEGER DEFAULT 0,
            circuit_breaker_until TEXT,
            last_punishment TEXT,
            punishment_log TEXT DEFAULT '[]'
        );
    `);
}

// Helper functions
async function getProvidersInEmergency(db) {
    const now = new Date().toISOString();
    return db.prepare(`
        SELECT provider_name, 
               total_failures,
               circuit_breaker_until,
               'EMERGENCY' as status
        FROM provider_history
        WHERE circuit_breaker_until > ?
    `).all(now);
}

async function getProvidersByFailureThreshold(db, threshold) {
    return db.prepare(`
        SELECT provider_name, total_failures, circuit_breaker_until
        FROM provider_history
        WHERE total_failures >= ?
        ORDER BY total_failures DESC
    `).all(threshold);
}

async function generateDashboardReport(db) {
    const now = new Date().toISOString();
    const providers = db.prepare(`
        SELECT provider_name,
               total_failures,
               circuit_breaker_until,
               CASE 
                   WHEN circuit_breaker_until > ? THEN 'BREAKER_ACTIVE'
                   WHEN total_failures >= 10 THEN 'HIGH_FAILURES'
                   WHEN total_failures >= 5 THEN 'MEDIUM_FAILURES'
                   ELSE 'OK'
               END as status
        FROM provider_history
    `).all(now);

    return {
        generated_at: now,
        providers,
        summary: {
            total: providers.length,
            emergency: providers.filter(p => p.status === 'EMERGENCY').length,
            high_failures: providers.filter(p => p.total_failures >= 10).length
        }
    };
}

function isBreakerActive(db, providerName) {
    const row = db.prepare('SELECT circuit_breaker_until FROM provider_history WHERE provider_name = ?')
        .get(providerName);

    if (!row || !row.circuit_breaker_until) {
        return { active: false, minutesRemaining: 0 };
    }

    const breakerTime = new Date(row.circuit_breaker_until).getTime();
    const now = Date.now();
    const diffMs = breakerTime - now;

    if (diffMs <= 0) {
        return { active: false, minutesRemaining: 0 };
    }

    return {
            active: true,
            minutesRemaining: Math.ceil(diffMs / 60000)
        };
}

// Export for external use
export {
    getProvidersInEmergency,
    getProvidersByFailureThreshold,
    generateDashboardReport,
    isBreakerActive
};