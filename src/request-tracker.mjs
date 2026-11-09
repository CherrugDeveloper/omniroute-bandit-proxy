const activeRequests = new Map(); // key: `${id}-att${attempt}`

// Ring buffer for recent requests (last 100 for "recent requests" display)
const MAX_RECENT_REQUESTS = 100;
const recentRequestBuffer = [];

// Helper to push to ring buffer
function pushRecent(request) {
  recentRequestBuffer.push(request);
  if (recentRequestBuffer.length > MAX_RECENT_REQUESTS) {
    recentRequestBuffer.shift();
  }
}

export function trackRequestStart(id, meta) {
  // Use ?? to preserve attempt: 0 (only null/undefined become 1)
  const attempt = meta.attempt ?? 1;
  const key = `${id}-att${attempt}`;
  const request = {
    source: meta.source || 'zoo',
    id,
    attempt,
    startTime: Date.now(),
    status: 'starting',
    sessionKey: meta.sessionKey || null,
    ...meta
  };
  activeRequests.set(key, request);
  
  // Add to recent requests buffer
  pushRecent(request);
}

export function trackRequestUpdate(id, patch) {
  // Find the existing request for this id (latest attempt)
  let existingKey = null;
  let existingReq = null;
  for (const [k, val] of activeRequests.entries()) {
    if (k.startsWith(`${id}-att`)) {
      if (!existingReq || val.attempt > existingReq.attempt) {
        existingKey = k;
        existingReq = val;
      }
    }
  }
  
  // Determine the attempt to use
  let attempt;
  if (patch.attempt !== undefined && patch.attempt !== null) {
    // Explicit attempt provided - use it
    attempt = patch.attempt;
  } else if (existingReq) {
    // No attempt provided - use existing attempt
    attempt = existingReq.attempt;
  } else {
    // No existing request - default to 1
    attempt = 1;
  }
  
  const key = `${id}-att${attempt}`;
  let r = activeRequests.get(key);
  
  if (!r) {
    // Key doesn't exist - create new entry
    if (existingReq) {
      // Inherit from existing request
      r = {
        ...existingReq,
        id,
        attempt,
        status: 'fetching',
        ...patch
      };
    } else {
      // No existing request - create from scratch
      r = {
        source: 'zoo',
        id,
        attempt,
        startTime: Date.now(),
        status: 'fetching',
        sessionKey: patch.sessionKey || null,
        ...patch
      };
    }
    activeRequests.set(key, r);
  }
  
  // Update existing entry with patch data
  Object.assign(r, patch);
}

export function trackRequestEnd(id) {
  for (const k of activeRequests.keys()) {
    // Match exact id or keys with -att suffix for precision
    if (k === id || k.startsWith(`${id}-att`)) {
      activeRequests.delete(k);
    }
  }
}

export function getActiveRequestsCount() {
  return activeRequests.size;
}

export function getActiveRequestsValues() {
  return Array.from(activeRequests.values());
}

export function getRequest(id) {
  let latest = null;
  for (const [k, val] of activeRequests.entries()) {
    // Match exact id or keys with -att suffix for precision
    if (k === id || k.startsWith(`${id}-att`)) {
      if (!latest || val.attempt > latest.attempt) {
        latest = val;
      }
    }
  }
  return latest;
}

// Recent Requests API - returns the last N requests as an array
const recentRequests = {
  getAll() {
    // Return a copy to prevent external mutation
    return [...recentRequestBuffer];
  },
  // Keep for compatibility with tests
  get size() {
    return recentRequestBuffer.length;
  },
  clear() {
    recentRequestBuffer.length = 0;
  }
};

export { recentRequests };
