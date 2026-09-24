/**
 * A CAD commit has two projections of the same selection: native entity IDs for
 * rendering and qualified keys for the professional selection/status model.
 * Updating only the first paints a highlight while the status and subsequent
 * selection actions still see zero selected objects.
 */
export function syncCommittedNativeSelection(
  ids: string[],
  ref: { current: string[] },
  setNativeIds: (ids: string[]) => void,
  recordSelection: (keys: readonly string[]) => void,
): void {
  ref.current = ids;
  setNativeIds(ids);
  recordSelection(ids.map((id) => `native:${id}`));
}
