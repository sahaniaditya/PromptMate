// Simple in-memory sliding-window rate limiter (resets on service worker restart).
// Limit: 10 requests per 60 seconds per extension instance.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

const timestamps: number[] = [];

export function checkRateLimit(): boolean {
  const now = Date.now();
  // Evict timestamps outside the window
  while (timestamps.length > 0 && now - timestamps[0] > WINDOW_MS) {
    timestamps.shift();
  }
  if (timestamps.length >= MAX_REQUESTS) return false;
  timestamps.push(now);
  return true;
}
