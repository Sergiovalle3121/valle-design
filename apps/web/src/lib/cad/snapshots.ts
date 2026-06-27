export interface CadLayoutSnapshot<TLayout = unknown> {
  id: string;
  label: string;
  createdAt: string;
  reason: "manual" | "command" | "import" | "restore";
  layout: TLayout;
}
export interface CadSnapshotDiff {
  beforeId: string;
  afterId: string;
  changed: boolean;
  beforeHash: string;
  afterHash: string;
}
export interface CadSnapshotHistory<TLayout = unknown> {
  snapshots: CadLayoutSnapshot<TLayout>[];
  activeId?: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function hashSnapshotLayout(layout: unknown): string {
  let hash = 0;
  const text = stable(layout);
  for (let i = 0; i < text.length; i += 1)
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash.toString(16).padStart(8, "0");
}
export function createCadSnapshot<TLayout>(
  layout: TLayout,
  label: string,
  reason: CadLayoutSnapshot["reason"] = "manual",
  id = `snap-${Date.now()}`,
): CadLayoutSnapshot<TLayout> {
  return {
    id,
    label,
    reason,
    createdAt: new Date().toISOString(),
    layout: structuredClone(layout),
  };
}
export function diffCadSnapshots(
  a: CadLayoutSnapshot,
  b: CadLayoutSnapshot,
): CadSnapshotDiff {
  const beforeHash = hashSnapshotLayout(a.layout);
  const afterHash = hashSnapshotLayout(b.layout);
  return {
    beforeId: a.id,
    afterId: b.id,
    beforeHash,
    afterHash,
    changed: beforeHash !== afterHash,
  };
}
export function pushCadSnapshot<TLayout>(
  history: CadSnapshotHistory<TLayout>,
  snapshot: CadLayoutSnapshot<TLayout>,
  limit = 50,
): CadSnapshotHistory<TLayout> {
  const snapshots = [
    ...history.snapshots.filter((item) => item.id !== snapshot.id),
    snapshot,
  ].slice(-limit);
  return { snapshots, activeId: snapshot.id };
}
export function restoreCadSnapshot<TLayout>(
  history: CadSnapshotHistory<TLayout>,
  id: string,
): { history: CadSnapshotHistory<TLayout>; layout?: TLayout } {
  const snapshot = history.snapshots.find((item) => item.id === id);
  if (!snapshot) return { history };
  return {
    history: { ...history, activeId: id },
    layout: structuredClone(snapshot.layout),
  };
}
