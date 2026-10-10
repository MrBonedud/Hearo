// Process-local abuse protection, not an allowance or a per-person entitlement.
// A service burst ceiling also covers callers that discard their signed cookie.
// Do not key by IP: behind the preview proxy many learners share a network hop.
export function createAllowanceReadThrottle(
  windowMs = 60_000,
  sessionLimit = 30,
  serviceLimit = 600,
  maxEntries = 4096,
) {
  const windows = new Map<string, { count: number; expires: number }>();
  return (session: string, now = Date.now()): number => {
    for (const [key, value] of windows) {
      if (value.expires <= now) windows.delete(key);
    }
    const keys = ["service", `session:${session}`];
    if (windows.size + keys.filter(key => !windows.has(key)).length > maxEntries) {
      return Math.max(1, Math.ceil(windowMs / 1000));
    }
    // Count rejected attempts too: rotating cookies must not bypass the cap.
    const buckets = keys.map(key => {
      const bucket = windows.get(key) ?? { count: 0, expires: now + windowMs };
      bucket.count = Math.min(bucket.count + 1, Math.max(sessionLimit, serviceLimit) + 1);
      windows.set(key, bucket);
      return bucket;
    });
    return Math.max(0, ...buckets.map((bucket, index) =>
      bucket.count > (index === 0 ? serviceLimit : sessionLimit)
        ? Math.max(1, Math.ceil((bucket.expires - now) / 1000)) : 0));
  };
}
