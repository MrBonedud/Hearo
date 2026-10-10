/** Run one checker at a time; never return an unvalidated result. */
export async function checkWithFallback<P, R>(
  providers: readonly P[],
  check: (provider: P) => Promise<R>,
  onFailure?: (provider: P, error: unknown) => void,
): Promise<{ result: R; provider: P; fallbackUsed: boolean }> {
  let lastError: unknown = new Error("No AI checker is configured");
  for (const [index, provider] of providers.entries()) {
    try {
      return { result: await check(provider), provider, fallbackUsed: index > 0 };
    } catch (error) {
      lastError = error;
      onFailure?.(provider, error);
    }
  }
  throw lastError;
}
