/**
 * Shared, pure aspect-search predicate used by both the aspect palette (left)
 * and the inventory panel (right).
 *
 * @param query the raw search box text
 * @param latin the aspect's latin (translated) display name
 * @param key   the aspect's english key (the aspect string itself)
 * @returns true if the (trimmed) query is empty/whitespace, otherwise true iff
 *          `latin` OR `key` contains the query as a case-insensitive substring.
 */
export function aspectMatchesQuery(query: string, latin: string, key: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return latin.toLowerCase().includes(q) || key.toLowerCase().includes(q);
}
