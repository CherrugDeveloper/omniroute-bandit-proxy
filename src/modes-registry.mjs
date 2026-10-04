// ─── Modes Registry ──────────────────────────────────────────────────────────
// Registry + auto-discovery delle modalità Zoo Code.
// - Fast path: signature (md5 dei primi 300 char) → mode già noto
// - Pattern match: regex dal registry
// - Auto-discovery: system prompt sconosciuti vengono salvati per labeling

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH     = path.join(ROOT, 'config', 'modes.json');
const SIGNATURES_PATH   = path.join(ROOT, 'config', 'modes.signatures.json');
const DISCOVERED_PATH   = path.join(ROOT, 'config', 'modes.discovered.json');

// ─── Profili (hardcoded: qui le soglie di tuning) ────────────────────────────
const PROFILE_MULTIPLIERS = {
  code:      { codeBoost: 1.35, thinkingPenalty: 0.65, smallPenalty: 0.75 },
  reasoning: { codeBoost: 1.10, thinkingBoost:   1.30, smallPenalty: 0.60 },
  general:   { codePenalty: 0.65, thinkingPenalty: 0.55, smallPenalty: 0.85 },
  summarizer:{ fastBoost: 2.5, notFastPenalty: 0.25, bigPenalty: 0.15, thinkingPenalty: 0.1, codePenalty: 0.5, smallPenalty: 0.9, tpmLowPenalty: 0.05 },
};

// ─── State ──────────────────────────────────────────────────────────────────
let registry = { modes: [], compiled: [] };
let signatures = {};       // sig → { mode, profile, source, ts }
let discovered = {};       // sig → { sig, firstSeen, count, sysPreview }
let saveSignaturesTimer = null;
let saveDiscoveredTimer = null;

// ─── Init ───────────────────────────────────────────────────────────────────
export function initRegistry() {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    registry.modes = parsed.modes || [];
    registry.compiled = registry.modes.map(m => ({
      ...m,
      re: new RegExp(m.match, 'i'),
    }));
    console.log(`[MODES] Registry caricato: ${registry.modes.length} modalità`);
  } catch (e) {
    console.error(`[MODES] Errore caricamento registry: ${e.message}`);
    registry = { modes: [], compiled: [] };
  }

  signatures = loadJson(SIGNATURES_PATH) || {};
  discovered = loadJson(DISCOVERED_PATH) || {};
  console.log(`[MODES] Signatures: ${Object.keys(signatures).length} | Discovered: ${Object.keys(discovered).length}`);
}
function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

// ─── Detect ─────────────────────────────────────────────────────────────────
export function detectProfile(systemPrompt) {
  if (!systemPrompt || String(systemPrompt).trim() === '') {
    return { mode: 'enhance-prompt', profile: 'general', source: 'empty' };
  }
  const sys = String(systemPrompt);
  const sig = createHash('md5').update(sys.slice(0, 300)).digest('hex').slice(0, 16);

  // 1. Fast path: signature già nota
  if (signatures[sig]) {
    return { mode: signatures[sig].mode, profile: signatures[sig].profile, source: 'signature', sig };
  }

  // 2. Pattern match
  const sample = sys.slice(0, 600);
  for (const m of registry.compiled) {
    if (m.re.test(sample)) {
      signatures[sig] = { mode: m.name, profile: m.profile, source: 'pattern', ts: Date.now() };
      scheduleSave('signatures');
      return { mode: m.name, profile: m.profile, source: 'pattern', sig };
    }
  }

  // 3. Unknown: registra per labeling
  const prev = discovered[sig];
  discovered[sig] = {
    sig,
    firstSeen: prev?.firstSeen || Date.now(),
    count: (prev?.count || 0) + 1,
    sysPreview: sys.slice(0, 200),
  };
  scheduleSave('discovered');
  return { mode: null, profile: 'generic', source: 'unknown', sig };
}

// ─── Multiplier ─────────────────────────────────────────────────────────────
export function profileMultiplier(profile, modelName) {
  if (!profile || profile === 'generic' || !modelName) return 1.0;
  const cfg = PROFILE_MULTIPLIERS[profile];
  if (!cfg) return 1.0;

  const n = String(modelName).toLowerCase();

  const isCode     = /coder|codestral|code[-_]|deepseek.*cod|qwen.*cod|starcoder|devstral/i.test(n);
  const isThinking = /thinking|reasoning|[-_]r1[-_]|[-_]r1$|^r1[-_]|o1[-_]|o3[-_]|o4[-_]|qwq/i.test(n);
  const isFast     = /flash|turbo|fast|instant|mini|small|nano|haiku|8b|7b|3b|gpt-oss-20b|gemini-3-flash/i.test(n);
  // isBig: modelli grandi/lenti che non vanno bene per summarization
  // Match: gpt-5.X, gpt-5.X-something, modelli con "luna/terra/sol/medium/large/max/pro"
  const isBig      = /(?:^|[-_/])(?:27b|30b|32b|34b|40b|70b|72b|120b|180b|200b|235b|405b|max|pro|large|xhigh|medium|luna|terra|sol|nemotron|lightning|opus|sonnet-5|gpt-5\.[\d]+)/i.test(n);
  const isFIM      = /fim|fill[-_]?in[-_]?middle/i.test(n);
  const smallMatch = n.match(/(?:^|[-_/])([0-9.]+)b(?:[-_/]|$)/);
  const isSmall    = (smallMatch && parseFloat(smallMatch[1]) <= 8) || /mini|small|nano|tiny/i.test(n);

  if (isFIM) return 0.3; // mai per chat

  let m = 1.0;
  if (cfg.codeBoost       && isCode)     m *= cfg.codeBoost;
  if (cfg.fastBoost       && isFast)     m *= cfg.fastBoost;
  if (cfg.bigPenalty      && isBig)      m *= cfg.bigPenalty;
  if (cfg.notFastPenalty  && !isFast)    m *= cfg.notFastPenalty;
  // gpt-oss-* su Groq free tier ha TPM 8k → inadatto per summarizer (contesti >50k)
  const isLowTPM = /groq\/(?:openai\/)?gpt-oss-(?:20b|120b)/i.test(n);
  if (cfg.tpmLowPenalty   && isLowTPM)   m *= cfg.tpmLowPenalty;
  if (cfg.codePenalty     && isCode)     m *= cfg.codePenalty;
  if (cfg.thinkingBoost   && isThinking) m *= cfg.thinkingBoost;
  if (cfg.thinkingPenalty && isThinking) m *= cfg.thinkingPenalty;
  if (cfg.smallPenalty    && isSmall)    m *= cfg.smallPenalty;

  return m;
}

// ─── Discovery API (per dashboard/endpoint) ─────────────────────────────────
export function listDiscovered() {
  return Object.values(discovered)
    .sort((a, b) => b.count - a.count)
    .map(d => ({ ...d, firstSeen: new Date(d.firstSeen).toISOString() }));
}

export function labelDiscovered(sig, modeName, profile) {
  if (!sig || !modeName || !profile) return { ok: false, error: 'sig, modeName, profile richiesti' };
  const entry = discovered[sig];
  if (!entry) return { ok: false, error: 'sig non trovata' };

  signatures[sig] = { mode: modeName, profile, source: 'manual', ts: Date.now() };
  delete discovered[sig];
  scheduleSave('signatures');
  scheduleSave('discovered');
  console.log(`[MODES] Labeled ${sig} → ${modeName} (${profile})`);
  return { ok: true };
}
export function registrySignatures() {
  return Object.entries(signatures).map(([sig, v]) => ({
    sig,
    mode: v.mode,
    profile: v.profile,
    source: v.source,
    ts: v.ts || 0,
  })).sort((a, b) => b.ts - a.ts);
}

export function dismissDiscovered(sig) {
  if (!discovered[sig]) return false;
  delete discovered[sig];
  scheduleSave('discovered');
  console.log(`[MODES] dismissed ${sig}`);
  return true;
}
export function registryStats() {
  return {
    modes: registry.modes.length,
    signatures: Object.keys(signatures).length,
    discovered: Object.keys(discovered).length,
  };
}

// ─── Persistence (debounced) ────────────────────────────────────────────────
function scheduleSave(which) {
  const t = which === 'signatures' ? saveSignaturesTimer : saveDiscoveredTimer;
  if (t) clearTimeout(t);
  const fn = () => {
    try {
      if (which === 'signatures') {
        fs.writeFileSync(SIGNATURES_PATH, JSON.stringify(signatures, null, 2));
        saveSignaturesTimer = null;
      } else {
        fs.writeFileSync(DISCOVERED_PATH, JSON.stringify(discovered, null, 2));
        saveDiscoveredTimer = null;
      }
    } catch (e) { console.error(`[MODES] save ${which} failed: ${e.message}`); }
  };
  const timer = setTimeout(fn, 3000);
  timer.unref();
  if (which === 'signatures') saveSignaturesTimer = timer; else saveDiscoveredTimer = timer;
}
