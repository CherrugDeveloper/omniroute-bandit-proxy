/**
 * Model Prefetch System
 * 
 * Memorizza in cache le risposte dei top modelli per ridurre la latenza.
 * 
 * Configurazione:
 * - TTL: 5 minuti
 * - Max risposte per modello: 100
 * - Chiave: hash(prompt)+modello
 * - Warm-up: connections all'avvio
 */

import { createHash } from 'node:crypto';
import { info as slogInfo, warn as slogWarn, debug as slogDebug } from './structured-logger.mjs';

// Configurazione cache
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minuti
const MAX_CACHE_ENTRIES_PER_MODEL = 100;
const TOP_MODELS_COUNT = 10;
const MIN_OBSERVATIONS = 5; // N >= 5

// Struttura cache: Map<modelId, Map<hashKey, {response, timestamp, prompt}>
const responseCache = new Map();
const cacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0
};

/**
 * Genera la chiave di cache basata su hash(prompt)+modello
 */
function generateCacheKey(modelId, messages) {
  const content = JSON.stringify(messages || []);
  const hash = createHash('sha256').update(content).digest('hex').substring(0, 16);
  return `${hash}`;
}

/**
 * Pulisce le voci scadute dalla cache per un modello
 */
function cleanupExpiredEntries(modelId) {
  const now = Date.now();
  const modelCache = responseCache.get(modelId);
  
  if (!modelCache) return;
  
  for (const [key, entry] of modelCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      modelCache.delete(key);
      cacheStats.evictions++;
    }
  }
}

/**
 * Recupera una risposta dalla cache
 */
export function getCachedResponse(modelId, messages) {
  const key = generateCacheKey(modelId, messages);
  const modelCache = responseCache.get(modelId);
  
  if (!modelCache) {
    cacheStats.misses++;
    return null;
  }
  
  const entry = modelCache.get(key);
  if (!entry) {
    cacheStats.misses++;
    return null;
  }
  
  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL_MS) {
    modelCache.delete(key);
    cacheStats.evictions++;
    cacheStats.misses++;
    return null;
  }
  
  cacheStats.hits++;
  return entry.response;
}

/**
 * Salva una risposta nella cache
 */
export function setCachedResponse(modelId, messages, response) {
  // Pulisci le voci scadute prima di aggiungere nuove
  cleanupExpiredEntries(modelId);
  
  // Crea o recupera il cache del modello
  if (!responseCache.has(modelId)) {
    responseCache.set(modelId, new Map());
  }
  
  const modelCache = responseCache.get(modelId);
  
  // Eviction se necessario
  if (modelCache.size >= MAX_CACHE_ENTRIES_PER_MODEL) {
    // Rimuovi l'entry più vecchia (LRU semplice)
    const firstKey = modelCache.keys().next().value;
    if (firstKey) {
      modelCache.delete(firstKey);
      cacheStats.evictions++;
    }
  }
  
  const key = generateCacheKey(modelId, messages);
  modelCache.set(key, {
    response,
    timestamp: Date.now(),
    prompt: messages
  });
  
  if (slogDebug) {
    slogDebug(`[PREFETCH] Cache set per ${modelId} (key=${key.substring(0, 8)}...)`);
  }
}

/**
 * Recupera i modelli popolari (top 10 con N >= 5)
 */
export function getPopularModels(bandit) {
  if (!bandit || !bandit.db) return [];
  
  try {
    const rows = bandit.db.prepare(`
      SELECT id, provider, N, sum_reward, (sum_reward / NULLIF(N, 0)) as avg_score
      FROM models 
      WHERE N >= ? AND permanent = 0 AND degraded = 0
      ORDER BY N DESC, avg DESC
      LIMIT ?
    `).all(MIN_OBSERVATIONS, TOP_MODELS_COUNT);
    
    return rows.map(r => ({
      id: r.id,
      provider: r.provider,
      N: r.N,
      avgScore: r.avg_score
    }));
  } catch (e) {
    slogWarn(`[PREFETCH] Errore recupero modelli popolari: ${e.message}`);
    return [];
  }
}

/**
 * Warm-up delle connections per i top modelli
 * Questo è un placeholder che può essere integrato con la logica di connessione esistente
 */
export async function warmUpConnections(bandit, topModels) {
  if (!bandit) return;
  
  slogInfo(`[PREFETCH] Warm-up connections per ${topModels.length} modelli`);
  
  // Itera sui top modelli e registra le informazioni per warm-up
  for (const model of topModels) {
    try {
      // Verifica che il modello sia disponibile
      const isAvailable = bandit.isModelAvailable(model.id, 0, false, true);
      
      if (isAvailable) {
        // Pre-carica metadati dal catalog
        const modelInfo = bandit.getModelInfo(model.id);
        slogDebug(`[PREFETCH] Warm-up completato per ${model.id} (N=${model.N})`);
      } else {
        slogWarn(`[PREFETCH] Modello ${model.id} non disponibile per warm-up`);
      }
    } catch (e) {
      slogWarn(`[PREFETCH] Errore warm-up per ${model.id}: ${e.message}`);
    }
  }
}

/**
 * Inizializza il prefetch system all'avvio
 */
export async function initializePrefetch(bandit) {
  if (!bandit) {
    slogWarn(`[PREFETCH] Bandit non disponibile, skip prefetch`);
    return;
  }
  
  slogInfo(`[PREFETCH] Inizializzazione prefetch system`);
  
  // Recupera i modelli popolari
  const popularModels = getPopularModels(bandit);
  
  if (popularModels.length === 0) {
    slogInfo(`[PREFETCH] Nessun modello popolare trovato (N < ${MIN_OBSERVATIONS})`);
    return;
  }
  
  slogInfo(`[PREFETCH] Trovati ${popularModels.length} modelli popolari`);
  
  // Warm-up connections
  await warmUpConnections(bandit, popularModels);
  
  slogInfo(`[PREFETCH] Prefetch completato`);
}

/**
 * Recupera le statistiche della cache
 */
export function getCacheStats() {
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 ? (cacheStats.hits / total) : 0;
  
  return {
    ...cacheStats,
    hitRate: Math.round(hitRate * 100) / 100,
    currentSize: responseCache.size
  };
}

/**
 * Pulisce la cache (utile per reset)
 */
export function clearCache() {
  responseCache.clear();
  cacheStats.hits = 0;
  cacheStats.misses = 0;
  cacheStats.evictions = 0;
  slogInfo(`[PREFETCH] Cache pulita`);
}

/**
 * Recupera le dimensioni della cache per modello
 */
export function getCacheSizes() {
  const sizes = {};
  for (const [modelId, cache] of responseCache.entries()) {
    sizes[modelId] = cache.size;
  }
  return sizes;
}