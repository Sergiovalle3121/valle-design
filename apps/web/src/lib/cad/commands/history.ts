import type {
  CadCommandHistoryItem,
  CadCommandInput,
  CadCommandPreview,
  CadCommandResult,
  CadCommandStatus,
} from "./types";

export interface CadCommandHistoryState {
  undo: CadCommandHistoryItem[];
  redo: CadCommandHistoryItem[];
}

const id = () =>
  `cadcmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createHistoryItem(
  input: CadCommandInput,
  status: CadCommandStatus,
  label: string,
  preview?: CadCommandPreview,
  result?: CadCommandResult,
): CadCommandHistoryItem {
  return {
    id: id(),
    commandId: input.id,
    input,
    label,
    status,
    createdAt: new Date().toISOString(),
    preview,
    result,
  };
}

export function pushHistory(
  state: CadCommandHistoryState,
  item: CadCommandHistoryItem,
): CadCommandHistoryState {
  return { undo: [...state.undo, item], redo: [] };
}

export function undoHistory(state: CadCommandHistoryState): {
  state: CadCommandHistoryState;
  item?: CadCommandHistoryItem;
} {
  const item = state.undo.at(-1);
  if (!item) return { state };
  return {
    item,
    state: {
      undo: state.undo.slice(0, -1),
      redo: [{ ...item, status: "undone" }, ...state.redo],
    },
  };
}

export function redoHistory(state: CadCommandHistoryState): {
  state: CadCommandHistoryState;
  item?: CadCommandHistoryItem;
} {
  const item = state.redo[0];
  if (!item) return { state };
  return {
    item,
    state: {
      undo: [...state.undo, { ...item, status: "applied" }],
      redo: state.redo.slice(1),
    },
  };
}
