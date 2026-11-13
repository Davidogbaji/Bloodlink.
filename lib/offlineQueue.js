// Network-resilient write queue.
// If a Supabase write fails (or navigator is offline), the operation is
// stashed in localStorage. A 'online' listener + periodic retry replays
// the queue in order once connectivity returns. No service-worker-level
// background sync is required (not all browsers support it), so this
// works as a reliable baseline everywhere, with the service worker as
// a bonus for asset caching.

import { supabase } from "./supabaseClient";

const QUEUE_KEY = "bloodlink_offline_queue_v1";

function readQueue() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// op: { table: 'blood_inventory', type: 'insert'|'update', payload, match? }
export function enqueueWrite(op) {
  const queue = readQueue();
  queue.push({ ...op, queuedAt: new Date().toISOString() });
  writeQueue(queue);
}

export function getQueueLength() {
  return readQueue().length;
}

export async function flushQueue(onProgress) {
  let queue = readQueue();
  if (queue.length === 0) return { synced: 0, failed: 0, sessionExpired: false };

  // Check current auth session
  const { data: authData } = await supabase.auth.getSession();
  const session = authData?.session;

  let synced = 0;
  let failed = 0;
  let sessionExpired = false;
  const remaining = [];

  for (const op of queue) {
    // If the operation requires authentication (staff actions on inventory or outages)
    // and there is no active session, do not fail and drop: keep in queue and flag sessionExpired.
    const isProtectedTable = op.table === "blood_inventory" || op.table === "outage_logs";
    if (isProtectedTable && !session) {
      sessionExpired = true;
      remaining.push(op);
      failed += 1;
      continue;
    }

    try {
      let error;
      if (op.type === "insert") {
        ({ error } = await supabase.from(op.table).insert(op.payload));
      } else if (op.type === "update") {
        ({ error } = await supabase.from(op.table).update(op.payload).match(op.match));
      }

      if (error) {
        // Detect auth / RLS / JWT expiration failures
        if (
          error.code === "42501" ||
          error.status === 401 ||
          error.status === 403 ||
          error.message?.toLowerCase().includes("jwt") ||
          error.message?.toLowerCase().includes("unauthorized")
        ) {
          sessionExpired = true;
        }
        throw error;
      }

      synced += 1;
    } catch (e) {
      remaining.push(op);
      failed += 1;
    }
    onProgress?.({ synced, failed, total: queue.length, sessionExpired });
  }

  writeQueue(remaining);
  return { synced, failed, sessionExpired };
}

// Attempts a live write; if it fails or the browser is offline, queues it
// instead so the UI never blocks on connectivity.
export async function writeOrQueue({ table, type, payload, match }) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueWrite({ table, type, payload, match });
    return { queued: true };
  }
  try {
    let error;
    if (type === "insert") {
      ({ error } = await supabase.from(table).insert(payload));
    } else {
      ({ error } = await supabase.from(table).update(payload).match(match));
    }
    if (error) throw error;
    return { queued: false };
  } catch (e) {
    enqueueWrite({ table, type, payload, match });
    return { queued: true, error: e };
  }
}

export function registerAutoSync(onProgress) {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => flushQueue(onProgress));
  // Also retry every 30s in case 'online' event doesn't fire reliably
  // (common on flaky mobile networks in low-connectivity areas).
  setInterval(() => {
    if (navigator.onLine && getQueueLength() > 0) flushQueue(onProgress);
  }, 30000);
}
