export class CanonicalHistory<T> {
  private undoItems: T[] = [];
  private redoItems: T[] = [];
  constructor(
    private current: T,
    private readonly clone: (value: T) => T = structuredClone,
  ) {}
  checkpoint(next: T) {
    this.undoItems.push(this.clone(this.current));
    this.current = this.clone(next);
    this.redoItems = [];
  }
  undo() {
    const item = this.undoItems.pop();
    if (!item) return this.clone(this.current);
    this.redoItems.push(this.clone(this.current));
    return (this.current = this.clone(item));
  }
  redo() {
    const item = this.redoItems.pop();
    if (!item) return this.clone(this.current);
    this.undoItems.push(this.clone(this.current));
    return (this.current = this.clone(item));
  }
  value() {
    return this.clone(this.current);
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
