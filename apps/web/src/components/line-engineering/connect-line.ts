/**
 * Auto-connect the production line — pure, side-effect-free (Fase 62).
 *
 * After the stations are laid out, a line engineer wants to SEE the material
 * flow: a connector from each station to the next in sequence. This builds that
 * chain — consecutive `from → to` links in sequence order over the PLACED
 * stations — and merges it with whatever connectors already exist (deduped on
 * the unordered pair) so re-running never duplicates a link and never drops a
 * hand-authored one. Kept pure (no three/DOM) so the chaining can be unit-tested.
 */

export interface ConnStation {
  id: string;
  sequence: number;
}

export interface Connector {
  from: string;
  to: string;
  kind?: string;
}

/** Canonical key for an UNORDERED pair, so A→B and B→A are the same link. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Merge the sequential line chain into `existing`, returning the combined list.
 *
 * - Stations are ordered by `sequence` (stable tie-break on id); links join each
 *   consecutive pair.
 * - Self-links and duplicate (unordered) pairs are skipped.
 * - Existing connectors are preserved (kept first, deduped among themselves).
 * Degenerate input (no/one station) returns the de-duplicated existing list.
 */
export function connectLine(stations: ConnStation[], existing: Connector[] = [], kind = 'flow'): Connector[] {
  const out: Connector[] = [];
  const seen = new Set<string>();
  const add = (from: string, to: string, k?: string) => {
    if (!from || !to || from === to) return;
    const key = pairKey(from, to);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(k !== undefined ? { from, to, kind: k } : { from, to });
  };

  // Keep existing links first (dedup among themselves).
  for (const c of Array.isArray(existing) ? existing : []) {
    if (c && typeof c.from === 'string' && typeof c.to === 'string') add(c.from, c.to, c.kind);
  }

  // Append the sequential chain over the placed stations.
  const ordered = (Array.isArray(stations) ? stations : [])
    .filter((s) => s && typeof s.id === 'string')
    .map((s) => ({ id: s.id, sequence: Number.isFinite(s.sequence) ? s.sequence : 0 }))
    .sort((a, b) => (a.sequence - b.sequence) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = 0; i + 1 < ordered.length; i++) add(ordered[i].id, ordered[i + 1].id, kind);

  return out;
}
