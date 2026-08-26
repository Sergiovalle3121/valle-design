export type CanonicalHistoryEvent =
  | "record"
  | "group"
  | "undo"
  | "redo"
  | "cancel"
  | "evict"
  | "reset"
  | "recover";

export interface CanonicalHistoryMetrics {
  event: CanonicalHistoryEvent;
  undoDepth: number;
  redoDepth: number;
  retainedBytes: number;
  sharedTopLevelReferences: number;
}

export interface CanonicalHistoryOptions<T> {
  maxEntries?: number;
  maxRetainedBytes?: number;
  groupWindowMs?: number;
  estimateBytes?: (value: T) => number;
  now?: () => number;
  onMetric?: (metric: CanonicalHistoryMetrics) => void;
}

export interface CanonicalHistoryRecordOptions {
  groupKey?: string;
}

export interface CanonicalHistoryEntry<T> {
  before: T;
  after?: T;
  groupKey?: string;
  recordedAt: number;
  retainedBytes: number;
}

export interface CanonicalHistoryRecoveryPoint<T> {
  readonly current: T;
  readonly undo: readonly CanonicalHistoryEntry<T>[];
  readonly redo: readonly CanonicalHistoryEntry<T>[];
  readonly retainedBytes: number;
}

/** Conservative retained-heap estimate without allocating a serialized clone. */
const defaultEstimateBytes = (value: unknown) => {
  const pending: unknown[] = [value];
  const visited = new WeakSet<object>();
  let bytes = 0;
  while (pending.length) {
    const current = pending.pop();
    if (current == null) {
      bytes += 4;
    } else if (typeof current === "string") {
      // JavaScript strings can occupy two bytes per code unit.
      bytes += 16 + current.length * 2;
    } else if (typeof current === "number") {
      bytes += 8;
    } else if (typeof current === "boolean") {
      bytes += 4;
    } else if (typeof current === "object") {
      if (visited.has(current)) continue;
      visited.add(current);
      if (Array.isArray(current)) {
        bytes += 24 + current.length * 8;
        for (const item of current) pending.push(item);
      } else {
        const entries = Object.entries(current);
        bytes += 32 + entries.length * 16;
        for (const [key, nested] of entries) {
          bytes += key.length * 2;
          pending.push(nested);
        }
      }
    }
  }
  return bytes;
};

const sharedTopLevelReferences = (left: unknown, right: unknown) => {
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return 0;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  return Object.keys(leftRecord).filter(
    (key) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      leftRecord[key] === rightRecord[key] &&
      typeof leftRecord[key] === "object",
  ).length;
};

/**
 * Bounded history of immutable canonical states. Entries retain references
 * (and therefore preserve structural sharing) instead of cloning the complete
 * document for every operation. A caller can group bursts such as keyboard
 * nudges and can roll back a transaction through a lightweight recovery point.
 */
export class CanonicalHistory<T> {
  private undoItems: CanonicalHistoryEntry<T>[] = [];
  private redoItems: CanonicalHistoryEntry<T>[] = [];
  private retainedBytes = 0;
  private readonly maxEntries: number;
  private readonly maxRetainedBytes: number;
  private readonly groupWindowMs: number;
  private readonly estimateBytes: (value: T) => number;
  private readonly now: () => number;
  private readonly onMetric?: (metric: CanonicalHistoryMetrics) => void;

  constructor(
    private current: T,
    options: CanonicalHistoryOptions<T> = {},
  ) {
    this.maxEntries = Math.max(0, options.maxEntries ?? 80);
    this.maxRetainedBytes = Math.max(
      0,
      options.maxRetainedBytes ?? 32 * 1024 * 1024,
    );
    this.groupWindowMs = Math.max(0, options.groupWindowMs ?? 400);
    this.estimateBytes = options.estimateBytes ?? defaultEstimateBytes;
    this.now = options.now ?? Date.now;
    this.onMetric = options.onMetric;
  }

  /** Records a transition when both immutable states are already available. */
  checkpoint(next: T, options: CanonicalHistoryRecordOptions = {}) {
    this.recordCurrent(this.current, options);
    this.current = next;
  }

  /** Records the state immediately before an editor mutation. */
  recordCurrent(before: T, options: CanonicalHistoryRecordOptions = {}) {
    const recordedAt = this.now();
    const previous = this.undoItems.at(-1);
    if (
      options.groupKey &&
      previous?.groupKey === options.groupKey &&
      recordedAt - previous.recordedAt <= this.groupWindowMs
    ) {
      previous.recordedAt = recordedAt;
      previous.after = undefined;
      this.current = before;
      this.clearRedo();
      this.emit("group", previous.before, before);
      return false;
    }

    const entry: CanonicalHistoryEntry<T> = {
      before,
      groupKey: options.groupKey,
      recordedAt,
      retainedBytes: Math.max(0, this.estimateBytes(before)),
    };
    this.undoItems.push(entry);
    this.retainedBytes += entry.retainedBytes;
    this.current = before;
    this.clearRedo();
    this.enforceBudget();
    this.emit("record", before, before);
    return this.undoItems.includes(entry);
  }

  undo(current: T = this.current) {
    const item = this.undoItems.pop();
    if (!item) return this.current;
    item.after = current;
    this.redoItems.push(item);
    this.current = item.before;
    this.emit("undo", item.before, current);
    return this.current;
  }

  redo(current: T = this.current) {
    const item = this.redoItems.pop();
    if (!item?.after) return this.current;
    this.undoItems.push(item);
    this.current = item.after;
    this.emit("redo", current, item.after);
    return this.current;
  }

  cancelLastCheckpoint() {
    const item = this.undoItems.pop();
    if (!item) return this.current;
    this.retainedBytes -= item.retainedBytes;
    this.current = item.before;
    this.emit("cancel", item.before, item.after ?? item.before);
    return this.current;
  }

  createRecoveryPoint(): CanonicalHistoryRecoveryPoint<T> {
    return {
      current: this.current,
      undo: this.undoItems.map((entry) => ({ ...entry })),
      redo: this.redoItems.map((entry) => ({ ...entry })),
      retainedBytes: this.retainedBytes,
    };
  }

  restoreRecoveryPoint(point: CanonicalHistoryRecoveryPoint<T>) {
    this.current = point.current;
    this.undoItems = point.undo.map((entry) => ({ ...entry }));
    this.redoItems = point.redo.map((entry) => ({ ...entry }));
    this.retainedBytes = point.retainedBytes;
    this.emit("recover", this.current, this.current);
    return this.current;
  }

  reset(current: T) {
    this.current = current;
    this.undoItems = [];
    this.redoItems = [];
    this.retainedBytes = 0;
    this.emit("reset", current, current);
  }

  depths() {
    return { undo: this.undoItems.length, redo: this.redoItems.length };
  }

  stats() {
    return { ...this.depths(), retainedBytes: this.retainedBytes };
  }

  value() {
    return this.current;
  }

  private clearRedo() {
    for (const item of this.redoItems) this.retainedBytes -= item.retainedBytes;
    this.redoItems = [];
  }

  private enforceBudget() {
    // El presupuesto de bytes acota la PROFUNDIDAD retenida, nunca el último
    // paso: expulsar la entrada recién grabada convertía «mover 100.000
    // entidades» en una edición SIN deshacer, en silencio — el documento
    // denso estima por encima de los 32 MB del presupuesto y `recordCurrent`
    // devolvía false que nadie miraba (medido en cad-dense-editing-100k,
    // fase moveMassive: el movimiento se aplicaba y Ctrl+Z no tenía nada que
    // deshacer). Un único checkpoint puede exceder el presupuesto; retenerlo
    // es el suelo de seguridad de datos y el techo sigue gobernando cuántos
    // pasos MÁS se conservan.
    while (
      this.undoItems.length > 1 &&
      (this.undoItems.length > this.maxEntries ||
        this.retainedBytes > this.maxRetainedBytes)
    ) {
      const removed = this.undoItems.shift();
      if (!removed) break;
      this.retainedBytes -= removed.retainedBytes;
      this.emit("evict", removed.before, this.current);
    }
  }

  private emit(event: CanonicalHistoryEvent, left: T, right: T) {
    this.onMetric?.({
      event,
      undoDepth: this.undoItems.length,
      redoDepth: this.redoItems.length,
      retainedBytes: Math.max(0, this.retainedBytes),
      sharedTopLevelReferences: sharedTopLevelReferences(left, right),
    });
  }
}

export interface CancelableCommand {
  cancel(): void;
}
export function cancelActiveCommand(
  command: CancelableCommand | null,
): boolean {
  if (!command) return false;
  command.cancel();
  return true;
}
