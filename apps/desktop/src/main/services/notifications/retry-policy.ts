export const MAX_RETRIES = 5;

/**
 * Returns the delay (ms) to wait before retry #retryNumber.
 * retryNumber is 1-indexed: 1 = first retry after the initial failure.
 * Returns null when retries are exhausted.
 *
 * Schedule: 1min, 5min, 30min, 2hr, 12hr (≈14.5hr total).
 */
export function nextDelayMs(retryNumber: number): number | null {
  const schedule = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];
  return retryNumber > MAX_RETRIES ? null : (schedule[retryNumber - 1] ?? null);
}
