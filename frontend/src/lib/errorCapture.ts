interface CapturedError {
  timestamp: string;
  type: string;
  message: string;
  stack?: string;
  url: string;
  page: string;
  severity: "low" | "medium" | "high";
}

const ERROR_BATCH: CapturedError[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_DELAY = 3000;
const OFFLINE_QUEUE_KEY = "soulmate_error_offline_queue";

const API_BASE = import.meta.env.VITE_API_URL || "https://191.44.121.29.sslip.io";

function getCurrentPage(): string {
  try {
    const store = (window as any).__store;
    if (store?.getState?.()?.activePage) return store.getState().activePage;
  } catch {}
  return window.location.pathname;
}

function sendBatch() {
  if (ERROR_BATCH.length === 0) return;
  const batch = [...ERROR_BATCH];
  ERROR_BATCH.length = 0;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  fetch(`${API_BASE}/v1/auto-heal/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ errors: batch }),
    signal: controller.signal,
  })
    .then(() => {
      clearTimeout(timeout);
    })
    .catch(() => {
      clearTimeout(timeout);
      // Queue offline for retry
      const queue = getOfflineQueue();
      queue.push(...batch);
      if (queue.length > 50) queue.splice(0, queue.length - 50);
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    });
}

function getOfflineQueue(): CapturedError[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function flushOfflineQueue() {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
  ERROR_BATCH.push(...queue);
  scheduleSend();
}

function scheduleSend() {
  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = setTimeout(sendBatch, BATCH_DELAY);
}

export function captureError(
  type: string,
  message: string,
  severity: "low" | "medium" | "high" = "medium",
  stack?: string
) {
  const err: CapturedError = {
    timestamp: new Date().toISOString(),
    type,
    message: message.slice(0, 500),
    stack: stack?.slice(0, 1000),
    url: window.location.href,
    page: getCurrentPage(),
    severity,
  };

  ERROR_BATCH.push(err);
  scheduleSend();
}

export function initErrorCapture() {
  // Capture uncaught JS errors
  window.addEventListener("error", (e) => {
    captureError(
      "JS_CRASH",
      e.message || "Unknown error",
      "high",
      e.error?.stack
    );
  });

  // Capture unhandled promise rejections
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    captureError(
      "PROMISE_REJECTION",
      typeof reason === "string" ? reason : reason?.message || "Unhandled rejection",
      "high",
      reason?.stack
    );
  });

  // Flush offline queue on load
  flushOfflineQueue();

  // Flush offline queue periodically
  setInterval(flushOfflineQueue, 30000);
}
