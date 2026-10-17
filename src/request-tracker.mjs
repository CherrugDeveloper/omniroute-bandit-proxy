const activeRequests = new Map(); // key: `${id}-att${attempt}`

export function trackRequestStart(id, meta) {
  const attempt = meta.attempt || 1;
  const key = `${id}-att${attempt}`;
  activeRequests.set(key, {
    source: meta.source || 'zoo',
    id,
    attempt,
    startTime: Date.now(),
    status: 'starting',
    ...meta
  });
}

export function trackRequestUpdate(id, patch) {
  const attempt = patch.attempt || 1;
  const key = `${id}-att${attempt}`;
  let r = activeRequests.get(key);
  if (!r) {
    let baseMeta = {};
    for (const [k, val] of activeRequests.entries()) {
      if (k.startsWith(`${id}-att`)) {
        baseMeta = { ...val };
        break;
      }
    }
    r = {
      source: 'zoo',
      id,
      attempt,
      startTime: Date.now(),
      status: 'fetching',
      ...baseMeta
    };
    activeRequests.set(key, r);
  }
  Object.assign(r, patch);
}

export function trackRequestEnd(id) {
  for (const k of activeRequests.keys()) {
    if (k === id || k.startsWith(`${id}-`) || k.startsWith(`${id}-att`)) {
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
    if (k === id || k.startsWith(`${id}-`) || k.startsWith(`${id}-att`)) {
      if (!latest || val.attempt > latest.attempt) {
        latest = val;
      }
    }
  }
  return latest;
}
