
const activeRequests = new Map();

export function trackRequestStart(id, meta) {
  activeRequests.set(id, {
    source: meta.source || 'zoo',
    id,
    startTime: Date.now(),
    ...meta
  });
}

export function trackRequestUpdate(id, patch) {
  const r = activeRequests.get(id);
  if (r) Object.assign(r, patch);
}

export function trackRequestEnd(id) {
  activeRequests.delete(id);
}

export function getActiveRequestsCount() {
  return activeRequests.size;
}

export function getActiveRequestsValues() {
    return Array.from(activeRequests.values());
}

export function getRequest(id) {
  return activeRequests.get(id);
}
