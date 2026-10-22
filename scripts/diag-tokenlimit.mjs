// Temporary diagnostic: replicate bandit._parseTokenLimit() against real error messages
import Database from 'better-sqlite3';

const db = new Database('bandit.db', { readonly: true });

function parseTokenLimit(message) {
  if (!message || typeof message !== 'string') return null;
  const limitPatterns = [
    /(?:limit|maximum|max|capacity|tpm|token\s+limit|rate\s+limit)[^\d]*(\d+)/i,
    /(\d+)\s*(?:tokens\s+per\s+minute|tpm)/i
  ];
  for (const pat of limitPatterns) {
    const m = message.match(pat);
    if (m && m[1]) {
      const val = parseInt(m[1], 10);
      if (val > 0) return val;
    }
  }
  return null;
}

const rows = db.prepare(`
  SELECT r.model, r.status_code, r.error_message, m.dynamic_max_tokens, m.N, m.fails
  FROM request_logs r
  JOIN models m ON m.id = r.model
  WHERE r.error_message IS NOT NULL
  ORDER BY r.id DESC
  LIMIT 400
`).all();

const seen = new Map();
for (const r of rows) {
  const parsed = parseTokenLimit(r.error_message);
  const key = `${r.status_code}|${parsed}|${r.dynamic_max_tokens}`;
  if (!seen.has(key)) {
    seen.set(key, { ...r, parsed, sample: r.error_message.slice(0, 160) });
  }
}

console.log('=== status | parsedLimit | dynamic_max_tokens | count ===');
const agg = new Map();
for (const r of rows) {
  const parsed = parseTokenLimit(r.error_message);
  const k = `${r.status_code} | parsed=${parsed} | dyn=${r.dynamic_max_tokens}`;
  agg.set(k, (agg.get(k) || 0) + 1);
}
for (const [k, v] of [...agg.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(v).padStart(4)}x  ${k}`);
}

console.log('\n=== sample messages whose parsed limit is small (<100) ===');
for (const r of seen.values()) {
  if (r.parsed !== null && r.parsed < 100) {
    console.log(`model=${r.model}\n  status=${r.status_code} parsed=${r.parsed} dyn=${r.dynamic_max_tokens} N=${r.N}\n  msg=${r.sample}\n`);
  }
}

console.log('\n=== models with dynamic_max_tokens < 100 (count + N distribution) ===');
const small = db.prepare(
  `SELECT dynamic_max_tokens, COUNT(*) c, SUM(CASE WHEN N>0 THEN 1 ELSE 0 END) with_traffic, MAX(N) maxN
  FROM models WHERE dynamic_max_tokens > 0 AND dynamic_max_tokens < 100
  GROUP BY dynamic_max_tokens ORDER BY dynamic_max_tokens`
).all();
console.table(small);

db.close();
