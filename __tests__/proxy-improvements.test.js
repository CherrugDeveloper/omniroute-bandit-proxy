import test from 'node:test';
import assert from 'node:assert';
import { DiscountedUCB1Bandit } from '../src/bandit.mjs';
import fs from 'fs';
import path from 'path';

/**
 * @fileoverview Unit tests for proxy improvements and error classification of browser/runtime dependencies
 * [`__tests__/proxy-improvements.test.js`](__tests__/proxy-improvements.test.js:1).
 */
test('Proxy Improvements & Error Classification', async (t) => {
  const bandit = new DiscountedUCB1Bandit(":memory:");
  const configRaw = fs.readFileSync(path.join(process.cwd(), 'config/bandit.json'), 'utf8');
  const config = JSON.parse(configRaw);

  await t.test('should classify Playwright / Cloudflare Playground runtime errors correctly', () => {
    const errorMsg = 'Cloudflare Playground needs Playwright and its Chromium browser';
    const classification = bandit._classifyError({ status: 502, message: errorMsg }, 'cfp');
    assert.strictEqual(classification.action, 'cooldown-provider');
    assert.strictEqual(classification.reason, 'provider-misconfigured');
  });

  await t.test('should classify missing binary / ENOENT errors correctly', () => {
    const errorMsg = 'spawn chromium ENOENT';
    const classification = bandit._classifyError({ status: 500, message: errorMsg }, 'zc');
    assert.strictEqual(classification.action, 'cooldown-provider');
  });

  await t.test('fallback models configuration is accessible and non-empty', () => {
    assert.ok(Array.isArray(config.fallbackModels));
    assert.ok(config.fallbackModels.length > 0);
  });

  bandit.close();
});
