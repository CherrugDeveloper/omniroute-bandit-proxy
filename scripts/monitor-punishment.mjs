#!/usr/bin/env node
/**
 * Monitor Punishment System - Real-time monitoring of bans and cooldowns
 * 
 * This script provides detailed monitoring of the Bandit punishment system,
 * showing active bans, cooldowns, and provider status with reasons.
 * 
 * Usage:
 *   node scripts/monitor-punishment.mjs [--watch] [--format json]
 * 
 * Options:
 *   --watch         Continuously monitor every 30 seconds
 *   --format json   Output in JSON format for programmatic use
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, "../bandit.db");

const args = process.argv.slice(2);
const watchMode = args.includes('--watch');
const jsonFormat = args.includes('--format') && args[args.indexOf('--format') + 1] === 'json';

function formatDuration(ms) {
  if (ms === null || ms === undefined) return 'permanent';
  if (ms <= 0) return 'active';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatTimestamp(ts) {
  if (!ts) return 'N/A';
  return new Date(ts).toISOString();
}

function getCooldownRemaining(cooldownUntil) {
  if (!cooldownUntil || cooldownUntil <= Date.now()) return 0;
  return cooldownUntil - Date.now();
}

function getReasonCategory(reason) {
  const categories = {
    'stream-error': 'Stream/SSE Errors',
    'model-not-found': 'Model Not Found',
    'provider-misconfigured': 'Provider Misconfiguration',
    'auth-expired': 'Authentication Expired',
    'quota-exhausted': 'Quota Exhausted',
    'rate-limit': 'Rate Limit',
    'server-error': 'Server Error',
    'timeout': 'Timeout',
    '5-strike-rule': '5-Strike Rule',
    'escalation': 'Escalation',
    'key-limit-exceeded': 'Key Limit Exceeded'
  };
  return categories[reason] || 'Other';
}

function getReasonEmoji(reason) {
  const emojis = {
    'stream-error': '🔴',
    'model-not-found': '🔴',
    'provider-misconfigured': '🟡',
    'auth-expired': '🔵',
    'quota-exhausted': '🟡',
    'rate-limit': '🟡',
    'server-error': '🟡',
    'timeout': '🟢',
    '5-strike-rule': '🔴',
    'escalation': '🔴',
    'key-limit-exceeded': '🔴'
  };
  return emojis[reason] || '⚪';
}

function analyzeDatabase(db) {
  const now = Date.now();
  
  // Models analysis
  const models = db.prepare("SELECT * FROM models").all();
  const permanentModels = models.filter(m => m.permanent === 1);
  const cooldownModels = models.filter(m => m.cooldown_until > now);
  const degradedModels = models.filter(m => m.degraded === 1);
  
  // Provider history analysis
  const providers = db.prepare("SELECT * FROM provider_history").all();
  const permanentProviders = providers.filter(p => p.permanent === 1);
  const cooldownProviders = providers.filter(p => p.cooldown_until > now);
  const attentionProviders = providers.filter(p => p.needs_attention === 1);
  
  // Catalog analysis
  const catalog = db.prepare("SELECT * FROM catalog").all();
  const visionModels = catalog.filter(c => c.supports_vision === 1);
  const toolModels = catalog.filter(c => c.supports_tools === 1);
  const visionToolModels = catalog.filter(c => c.supports_vision === 1 && c.supports_tools === 1);
  
  // Meta analysis
  const meta = db.prepare("SELECT * FROM meta").all();
  const totalRequests = meta.find(m => m.key === 'totalRequests')?.value || 0;
  const catalogRawCount = meta.find(m => m.key === 'catalogRawCount')?.value || 0;
  
  return {
    timestamp: now,
    models: {
      total: models.length,
      active: models.length - permanentModels.length - cooldownModels.length,
      permanent: permanentModels.length,
      cooldown: cooldownModels.length,
      degraded: degradedModels.length,
      permanentList: permanentModels.map(m => ({
        id: m.id,
        provider: m.provider,
        bannedSince: formatTimestamp(m.banned_since),
        consecutiveCriticalFailures: m.consecutive_critical_failures,
        totalFailures: m.total_failures
      })),
      cooldownList: cooldownModels.map(m => ({
        id: m.id,
        provider: m.provider,
        cooldownRemaining: formatDuration(getCooldownRemaining(m.cooldown_until)),
        cooldownUntil: formatTimestamp(m.cooldown_until),
        consecutive5xx: m.consecutive_5xx,
        degraded: m.degraded === 1
      }))
    },
    providers: {
      total: providers.length,
      active: providers.length - permanentProviders.length - cooldownProviders.length,
      permanent: permanentProviders.length,
      cooldown: cooldownProviders.length,
      attention: attentionProviders.length,
      attentionList: attentionProviders.map(p => ({
        provider: p.provider,
        reason: p.attention_reason,
        message: p.attention_message,
        cooldownRemaining: formatDuration(getCooldownRemaining(p.cooldown_until)),
        bannedSince: formatTimestamp(p.banned_since)
      }))
    },
    catalog: {
      total: catalog.length,
      vision: visionModels.length,
      tools: toolModels.length,
      visionAndTools: visionToolModels.length
    },
    stats: {
      totalRequests,
      catalogRawCount,
      filteredPercentage: ((permanentModels.length + cooldownModels.length + degradedModels.length) / models.length * 100).toFixed(2)
    }
  };
}

function printTextReport(data) {
  console.log("\n" + "=".repeat(80));
  console.log("BANDIT PUNISHMENT SYSTEM MONITOR - " + new Date(data.timestamp).toISOString());
  console.log("=".repeat(80));
  
  // Models summary
  console.log("\n📊 MODELS STATUS");
  console.log("-".repeat(40));
  console.log(`Total:     ${data.models.total}`);
  console.log(`Active:    ${data.models.active}`);
  console.log(`Cooldown:  ${data.models.cooldown}`);
  console.log(`Degraded:  ${data.models.degraded}`);
  console.log(`Banned:    ${data.models.permanent}`);
  console.log(`Filtered:  ${data.stats.filteredPercentage}%`);
  
  if (data.models.permanentList.length > 0) {
    console.log("\n🔴 PERMANENTLY BANNED MODELS:");
    data.models.permanentList.forEach(m => {
      console.log(`  ${getReasonEmoji('5-strike-rule')} ${m.id} (${m.provider})`);
      console.log(`      Banned since: ${m.bannedSince}`);
      console.log(`      Critical failures: ${m.consecutiveCriticalFailures}, Total failures: ${m.totalFailures}`);
    });
  }
  
  if (data.models.cooldownList.length > 0) {
    console.log("\n🟡 MODELS IN COOLDOWN:");
    data.models.cooldownList.forEach(m => {
      console.log(`  ${getReasonEmoji('timeout')} ${m.id} (${m.provider})`);
      console.log(`      Remaining: ${m.cooldownRemaining}`);
      console.log(`      5xx count: ${m.consecutive5xx}, Degraded: ${m.degraded ? 'Yes' : 'No'}`);
    });
  }
  
  // Providers summary
  console.log("\n📡 PROVIDER STATUS");
  console.log("-".repeat(40));
  console.log(`Total:     ${data.providers.total}`);
  console.log(`Active:    ${data.providers.active}`);
  console.log(`Cooldown:  ${data.providers.cooldown}`);
  console.log(`Attention: ${data.providers.attention}`);
  console.log(`Banned:    ${data.providers.permanent}`);
  
  if (data.providers.attentionList.length > 0) {
    console.log("\n⚠️  PROVIDERS NEEDING ATTENTION:");
    data.providers.attentionList.forEach(p => {
      const category = getReasonCategory(p.reason);
      console.log(`  ${getReasonEmoji(p.reason)} ${p.provider}`);
      console.log(`      Reason: ${p.reason} (${category})`);
      console.log(`      Message: ${p.message}`);
      if (p.cooldownRemaining !== 'permanent') {
        console.log(`      Cooldown remaining: ${p.cooldownRemaining}`);
      }
    });
  }
  
  // Catalog summary
  console.log("\n📚 CATALOG STATUS");
  console.log("-".repeat(40));
  console.log(`Total models: ${data.catalog.total}`);
  console.log(`Vision:       ${data.catalog.vision}`);
  console.log(`Tools:        ${data.catalog.tools}`);
  console.log(`Vision+Tools: ${data.catalog.visionAndTools}`);
  
  // Stats
  console.log("\n📈 STATISTICS");
  console.log("-".repeat(40));
  console.log(`Total requests: ${data.stats.totalRequests}`);
  console.log(`Catalog raw:    ${data.stats.catalogRawCount}`);
  
  console.log("\n" + "=".repeat(80));
}

function printJsonReport(data) {
  console.log(JSON.stringify(data, null, 2));
}

// Main execution
function runMonitor() {
  if (!fs.existsSync(dbPath)) {
    console.error("Database not found at " + dbPath);
    process.exit(1);
  }
  
  const db = new Database(dbPath, { readonly: true });
  const data = analyzeDatabase(db);
  db.close();
  
  if (jsonFormat) {
    printJsonReport(data);
  } else {
    printTextReport(data);
  }
}

// Run once or in watch mode
if (watchMode) {
  console.log("Starting watch mode (updating every 30 seconds)...");
  console.log("Press Ctrl+C to stop.\n");
  
  runMonitor();
  
  setInterval(() => {
    // Clear screen for better visualization
    if (process.stdout.isTTY) {
      console.log('\x1Bc');
    }
    runMonitor();
  }, 30000);
} else {
  runMonitor();
}