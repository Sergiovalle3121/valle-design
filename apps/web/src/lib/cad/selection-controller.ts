export type CadSelectionOperation = "replace" | "add" | "remove" | "toggle";

export interface CadSelectableItem {
  key: string;
  type: string;
  layer?: string;
  label?: string;
  properties?: Readonly<Record<string, unknown>>;
}

export interface CadQuickSelectionFilter {
  types?: readonly string[];
  layers?: readonly string[];
  text?: string;
  property?: { name: string; value: string };
}

export interface CadSelectionCycle {
  signature: string;
  index: number;
}

export interface CadSelectionState {
  current: string[];
  previous: string[];
  last: string | null;
  cycle: CadSelectionCycle | null;
}

export type CadSelectionAction =
  | { type: "apply"; keys: readonly string[]; operation?: CadSelectionOperation }
  | { type: "clear" }
  | { type: "previous" }
  | { type: "last"; operation?: CadSelectionOperation }
  | { type: "all"; universe: readonly CadSelectableItem[] }
  | { type: "invert"; universe: readonly CadSelectableItem[] }
  | { type: "quick"; universe: readonly CadSelectableItem[]; filter: CadQuickSelectionFilter; operation?: CadSelectionOperation }
  | { type: "cycle"; candidates: readonly string[]; operation?: CadSelectionOperation };

export const EMPTY_CAD_SELECTION: CadSelectionState = {
  current: [],
  previous: [],
  last: null,
  cycle: null,
};

function unique(keys: readonly string[]): string[] {
  return [...new Set(keys.filter(Boolean))];
}

function applyOperation(
  current: readonly string[],
  keys: readonly string[],
  operation: CadSelectionOperation,
): string[] {
  const incoming = unique(keys);
  if (operation === "replace") return incoming;
  const incomingSet = new Set(incoming);
  if (operation === "remove") return current.filter((key) => !incomingSet.has(key));
  if (operation === "add") return unique([...current, ...incoming]);
  const next = current.filter((key) => !incomingSet.has(key));
  const currentSet = new Set(current);
  return [...next, ...incoming.filter((key) => !currentSet.has(key))];
}

function commit(
  state: CadSelectionState,
  current: readonly string[],
  last: string | null,
  cycle: CadSelectionCycle | null = null,
): CadSelectionState {
  const next = unique(current);
  if (
    next.length === state.current.length
    && next.every((key, index) => key === state.current[index])
    && last === state.last
    && cycle?.signature === state.cycle?.signature
    && cycle?.index === state.cycle?.index
  ) return state;
  return {
    current: next,
    previous: [...state.current],
    last,
    cycle,
  };
}

function valueText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function filterCadSelectableItems(
  universe: readonly CadSelectableItem[],
  filter: CadQuickSelectionFilter,
): CadSelectableItem[] {
  const types = new Set(filter.types?.map((value) => value.toLocaleLowerCase()));
  const layers = new Set(filter.layers?.map((value) => value.toLocaleLowerCase()));
  const text = filter.text?.trim().toLocaleLowerCase();
  const propertyName = filter.property?.name.trim().toLocaleLowerCase();
  const propertyValue = filter.property?.value.trim().toLocaleLowerCase();
  return universe.filter((item) => {
    if (types.size && !types.has(item.type.toLocaleLowerCase())) return false;
    if (layers.size && !layers.has((item.layer ?? "").toLocaleLowerCase())) return false;
    if (text) {
      const haystack = [
        item.key,
        item.type,
        item.layer,
        item.label,
        ...Object.entries(item.properties ?? {}).flatMap(([name, value]) => [name, valueText(value)]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      if (!haystack.includes(text)) return false;
    }
    if (propertyName) {
      const entry = Object.entries(item.properties ?? {}).find(
        ([name]) => name.toLocaleLowerCase() === propertyName,
      );
      if (!entry || (propertyValue && !valueText(entry[1]).toLocaleLowerCase().includes(propertyValue)))
        return false;
    }
    return true;
  });
}

export function reduceCadSelection(
  state: CadSelectionState,
  action: CadSelectionAction,
): CadSelectionState {
  if (action.type === "clear") return commit(state, [], state.last);
  if (action.type === "previous") return commit(state, state.previous, state.last);
  if (action.type === "last") {
    const keys = state.last ? [state.last] : [];
    return commit(
      state,
      applyOperation(state.current, keys, action.operation ?? "replace"),
      state.last,
    );
  }
  if (action.type === "all") {
    const keys = unique(action.universe.map((item) => item.key));
    return commit(state, keys, keys.at(-1) ?? state.last);
  }
  if (action.type === "invert") {
    const selected = new Set(state.current);
    const keys = unique(action.universe.map((item) => item.key)).filter((key) => !selected.has(key));
    return commit(state, keys, keys.at(-1) ?? state.last);
  }
  if (action.type === "quick") {
    const keys = filterCadSelectableItems(action.universe, action.filter).map((item) => item.key);
    return commit(
      state,
      applyOperation(state.current, keys, action.operation ?? "replace"),
      keys.at(-1) ?? state.last,
    );
  }
  if (action.type === "cycle") {
    const candidates = unique(action.candidates);
    if (!candidates.length) return state;
    const signature = candidates.join("\u001f");
    const index = state.cycle?.signature === signature
      ? (state.cycle.index + 1) % candidates.length
      : 0;
    const key = candidates[index];
    return commit(
      state,
      applyOperation(state.current, [key], action.operation ?? "replace"),
      key,
      { signature, index },
    );
  }
  const keys = unique(action.keys);
  return commit(
    state,
    applyOperation(state.current, keys, action.operation ?? "replace"),
    keys.at(-1) ?? state.last,
  );
}
