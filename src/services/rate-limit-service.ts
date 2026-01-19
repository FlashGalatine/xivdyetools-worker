/**
 * Rate Limit Service
 * Tracks submission limits per user per day
 * Limit: 10 submissions per user per day
 *
 * Also provides IP-based rate limiting for public endpoints
 * Limit: 100 requests per minute per IP (sliding window)
 */

import type { RateLimitResult } from '../types.js';

// ============================================
// IP-BASED RATE LIMITING (PUBLIC ENDPOINTS)
// ============================================

/**
 * Configuration for public endpoint rate limiting
 */
const PUBLIC_RATE_LIMIT = {
  maxRequests: 100, // Maximum requests per window
  windowMs: 60_000, // Window size: 1 minute
  maxTrackedIps: 10_000, // PRESETS-BUG-001 FIX: Maximum IPs to track (prevents memory leak)
};

/**
 * In-memory store for IP rate limiting
 * Maps IP -> array of request timestamps
 * Note: Resets on worker restart, which is acceptable for defense-in-depth
 *
 * PRESETS-BUG-001 FIX: Size is now limited to maxTrackedIps to prevent
 * unbounded memory growth under DDoS or high-traffic conditions.
 */
const ipRequestLog = new Map<string, number[]>();

/**
 * Clean up old entries periodically to prevent memory leaks
 * Called during rate limit checks
 */
function cleanupOldEntries(): void {
  const cutoff = Date.now() - PUBLIC_RATE_LIMIT.windowMs * 2;
  // Use forEach instead of for...of to avoid needing downlevelIteration
  ipRequestLog.forEach((timestamps, ip) => {
    const filtered = timestamps.filter((ts) => ts > cutoff);
    if (filtered.length === 0) {
      ipRequestLog.delete(ip);
    } else {
      ipRequestLog.set(ip, filtered);
    }
  });
}

/**
 * Enforce maximum tracked IPs limit using LRU-style eviction
 * Removes oldest entries when limit is exceeded
 *
 * PRESETS-BUG-001 FIX: Prevents unbounded memory growth
 */
function enforceMaxTrackedIps(): void {
  if (ipRequestLog.size <= PUBLIC_RATE_LIMIT.maxTrackedIps) {
    return;
  }

  // Find and remove entries with oldest last-access time
  // Map iteration order is insertion order, so oldest entries come first
  const entriesToRemove = ipRequestLog.size - PUBLIC_RATE_LIMIT.maxTrackedIps;
  let removed = 0;

  // Get iterator manually to avoid needing downlevelIteration
  const keys = Array.from(ipRequestLog.keys());
  for (const ip of keys) {
    if (removed >= entriesToRemove) break;
    ipRequestLog.delete(ip);
    removed++;
  }
}

/**
 * Check if an IP is within rate limits for public endpoints
 * Uses sliding window algorithm
 *
 * @param ip - Client IP address (from CF-Connecting-IP header)
 * @returns Rate limit result with allowed status and remaining requests
 */
export function checkPublicRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const windowStart = now - PUBLIC_RATE_LIMIT.windowMs;

  // Get existing timestamps for this IP
  const timestamps = ipRequestLog.get(ip) || [];

  // Filter to only include requests within the current window
  const recentTimestamps = timestamps.filter((ts) => ts > windowStart);

  // Check if within limit
  const allowed = recentTimestamps.length < PUBLIC_RATE_LIMIT.maxRequests;
  const remaining = Math.max(0, PUBLIC_RATE_LIMIT.maxRequests - recentTimestamps.length);

  // Calculate reset time (when the oldest request in window expires)
  const oldestInWindow = recentTimestamps[0];
  const resetAt = oldestInWindow
    ? new Date(oldestInWindow + PUBLIC_RATE_LIMIT.windowMs)
    : new Date(now + PUBLIC_RATE_LIMIT.windowMs);

  // Record this request if allowed
  if (allowed) {
    recentTimestamps.push(now);
    ipRequestLog.set(ip, recentTimestamps);
  }

  // Periodically clean up old entries (roughly every 100 requests)
  if (Math.random() < 0.01) {
    cleanupOldEntries();
    // PRESETS-BUG-001 FIX: Also enforce max tracked IPs during cleanup
    enforceMaxTrackedIps();
  }

  return { allowed, remaining, resetAt };
}

/**
 * Get client IP from request headers
 * Uses CF-Connecting-IP which Cloudflare sets to the real client IP
 *
 * @param request - The incoming request
 * @returns Client IP or 'unknown' if not found
 */
export function getClientIp(request: Request): string {
  // CF-Connecting-IP is set by Cloudflare to the real client IP
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
}

/**
 * Maximum submissions per user per day
 */
const DAILY_SUBMISSION_LIMIT = 10;

/**
 * Check if a user can submit a preset
 * Returns rate limit status and remaining submissions
 */
export async function checkSubmissionRateLimit(
  db: D1Database,
  userDiscordId: string
): Promise<RateLimitResult> {
  const today = getStartOfDayUTC();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  // Count submissions today for this user
  const query = `
    SELECT COUNT(*) as count
    FROM presets
    WHERE author_discord_id = ?
      AND created_at >= ?
      AND created_at < ?
  `;

  const result = await db
    .prepare(query)
    .bind(userDiscordId, today.toISOString(), tomorrow.toISOString())
    .first<{ count: number }>();

  const submissionsToday = result?.count || 0;
  const remaining = Math.max(0, DAILY_SUBMISSION_LIMIT - submissionsToday);

  return {
    allowed: submissionsToday < DAILY_SUBMISSION_LIMIT,
    remaining,
    resetAt: tomorrow,
  };
}

/**
 * Get remaining submissions for a user today
 * Useful for displaying in the UI
 */
export async function getRemainingSubmissions(
  db: D1Database,
  userDiscordId: string
): Promise<{ remaining: number; resetAt: Date }> {
  const result = await checkSubmissionRateLimit(db, userDiscordId);
  return {
    remaining: result.remaining,
    resetAt: result.resetAt,
  };
}

/**
 * Get the start of the current day in UTC
 */
function getStartOfDayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
