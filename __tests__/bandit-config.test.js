import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { classifyError, getFallbackAction, getPatternAction } from '../src/bandit.mjs';

/**
 * Test suite for bandit.json configuration parsing and error pattern matching
 */
describe('Bandit Configuration', () => {
    let config;

    before(() => {
        // Carica configurazione reale
        config = {
            patterns: {
                "safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized": {
                    "action": "ban-model",
                    "reason": "database_sync_failure"
                },
                "connection refused|ECONNREFUSED": {
                    "action": "cooldown-provider",
                    "reason": "provider_unavailable",
                    "severity": "high"
                },
                "rate limit exceeded|429": {
                    "action": "flag-provider",
                    "reason": "rate_limit_violation"
                },
                "timeout|ETIMEDOUT": {
                    "action": "cooldown-model",
                    "reason": "timeout"
                }
            },
            fallback_action: "cooldown-provider"
        };
    });

    beforeEach(() => {
        // Reset mock provider history
    });

    /**
     * Test: Classificazione errori database sync
     */
    it('should classify database sync errors as ban-model', () => {
        const errors = [
            'safeWrite is not initialized',
            'cannot access safeWrite',
            'safeWrite before initialization'
        ];

        errors.forEach(error => {
            const result = classifyError(config, error);
            assert.strictEqual(result.action, 'ban-model', 
                `L'errore "${error}" dovrebbe essere ban-model`);
            assert.strictEqual(result.reason, 'database_sync_failure');
        });
    });

    /**
     * Test: Classificazione errori connessione
     */
    it('should classify connection errors as cooldown-provider', () => {
        const errors = [
            'Connection refused',
            'ECONNREFUSED: connection refused'
        ];

        errors.forEach(error => {
            const result = classifyError(config, error);
            assert.strictEqual(result.action, 'cooldown-provider',
                `L'errore "${error}" dovrebbe essere cooldown-provider`);
        });
    });

    /**
     * Test: Rate limit classification
     */
    it('should classify rate limit errors as flag-provider', () => {
        const errors = [
            'rate limit exceeded',
            '429 Too Many Requests'
        ];

        errors.forEach(error => {
            const result = classifyError(config, error);
            assert.strictEqual(result.action, 'flag-provider');
            assert.strictEqual(result.reason, 'rate_limit_violation');
        });
    });

    /**
     * Test: Fallback per errori non riconosciuti
     */
    it('should apply fallback action for unknown errors', () => {
        const unknownErrors = [
            'Random unknown error message',
            'Some random exception',
            'NullPointerException in module X'
        ];

        unknownErrors.forEach(error => {
            const result = classifyError(config, error);
            assert.strictEqual(result.action, 'cooldown-provider',
                `L'errore sconosciuto dovrebbe usare fallback`);
            assert.strictEqual(result.reason, undefined);
        });
    });

    /**
     * Test: Case insensitive matching
     */
    it('should match patterns case-insensitively', () => {
        const variations = [
            'SAFEWRITE is not initialized',
            'SafeWrite before initialization',
            'CONNECTION REFUSED'
        ];

        variations.forEach(error => {
            const result = classifyError(config, error);
            assert.ok(result.action, `Dovrebbe trovare corrispondenza per "${error}"`);
        });
    });

    /**
     * Test: Multi-pattern matching
     */
    it('should match any pattern in pipe-separated list', () => {
        const patterns = config.patterns;

        Object.keys(patterns).forEach(patternKey => {
            const patternAlternatives = patternKey.split('|');
            const expectedAction = getPatternAction(config, patternKey)?.action || getFallbackAction(config);
            patternAlternatives.forEach(pattern => {
                const result = classifyError(config, pattern);
                assert.strictEqual(result.action, expectedAction,
                    `Dovrebbe trovare corrispondenza per "${pattern}" con action ${expectedAction}`);
            });
        });
    });
});

describe('Bandit Error Pattern Edge Cases', () => {
    let config;

    before(() => {
        config = {
            patterns: {
                "timeout|ETIMEDOUT|ESOCKTIMEDOUT": {
                    "action": "cooldown-model",
                    "reason": "timeout",
                    "severity": "medium"
                }
            },
            fallback_action: "cooldown-provider"
        };
    });

    it('should handle timeout errors correctly', () => {
        const result = classifyError(config, 'ESOCKTIMEDOUT');
        assert.strictEqual(result.action, 'cooldown-model');
        assert.strictEqual(result.reason, 'timeout');
        assert.strictEqual(result.severity, 'medium');
    });

    it('should handle empty error messages', () => {
        const result = classifyError(config, '');
        assert.strictEqual(result.action, 'cooldown-provider', 
            'Errore vuoto dovrebbe usare fallback');
    });

    it('should handle null/undefined gracefully', () => {
        const result = classifyError(config, null);
        assert.strictEqual(result.action, 'cooldown-provider',
            'Null dovrebbe usare fallback');
    });
});

/**
 * Test: Configurazione provider limits
 */
describe('Provider Limits Configuration', () => {
    let providerLimits;

    before(() => {
        providerLimits = {
            openai: {
                rpm: 1000,
                tpm: 150000,
                group: 'paid'
            },
            anthropic: {
                rpm: 1000,
                tpm: 200000,
                group: 'paid'
            },
            google: {
                rpm: 60,
                tpm: 0,
                group: 'free'
            }
        };
    });

    it('should correctly identify provider limits', () => {
        const openai = providerLimits.openai;
        assert.strictEqual(openai.rpm, 1000);
        assert.strictEqual(openai.group, 'paid');
    });

    it('should handle free tier correctly', () => {
        const google = providerLimits.google;
        assert.strictEqual(google.tpm, 0, 'Free tier dovrebbe avere tpm=0');
    });
});

// Export helpers for use in other tests
export function createBanditConfig() {
    return {
        patterns: {
            "safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized": {
                "action": "ban-model",
                "reason": "database_sync_failure"
            }
        },
        fallback_action: "cooldown-provider"
    };
}