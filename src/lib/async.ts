/**
 * Runs `fn` over `items` with at most `limit` promises in flight at once,
 * returning results in input order. Used by the digest/weekly cron fan-out
 * so a growing user count doesn't open one Neon transaction per user all at
 * once (pool exhaustion, `maxWait` stalls).
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  };
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}
