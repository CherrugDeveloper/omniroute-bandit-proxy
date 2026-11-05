const activeRequests = new Map(); // key: `${id}-att${attempt}`

export function trackRequestStart(id, meta) {
  // Use ?? to preserve attempt: 0 (only null/undefined become 1)
  const attempt = meta.attempt ?? 1;
  const key = `${id}-att${attempt}`;
  activeRequests.set(key, {
    source: meta.source || 'zoo',
    id,
    attempt,
    startTime: Date.now(),
    status: 'starting',
    sessionKey: meta.sessionKey || null,
    ...meta
  });
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
