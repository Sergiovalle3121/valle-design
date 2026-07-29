import type { CadCommandHistoryItem } from "./commands";

export const CAD_COMMAND_HISTORY_LIMIT = 50;

export interface CadCommandSessionScope {
  tenantId: string | null | undefined;
  userId: string | null | undefined;
  buildingId?: string | null;
  projectId?: string | null;
  model: string;
  revision: string;
}

const compact = (value: string | null | undefined) =>
  encodeURIComponent(value?.trim() || "none");

/**
 * A command audit is persisted only when both authenticated tenant and user
 * are known. This prevents a shared browser profile from replaying another
 * tenant's commands while still allowing workspace/model-specific history.
 */
export function cadCommandHistoryStorageKey(
  scope: CadCommandSessionScope,
): string | null {
  if (!scope.tenantId?.trim() || !scope.userId?.trim()) return null;
  return [
    "axos:cad:command-history:v1",
    compact(scope.tenantId),
    compact(scope.userId),
    compact(scope.buildingId),
    compact(scope.projectId),
    compact(scope.model),
    compact(scope.revision),
  ].join(":");
}

function isHistoryItem(value: unknown): value is CadCommandHistoryItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CadCommandHistoryItem>;
  return (
    typeof item.id === "string" &&
    typeof item.commandId === "string" &&
    !!item.input &&
    typeof item.input === "object" &&
    typeof item.label === "string" &&
    typeof item.status === "string" &&
    typeof item.createdAt === "string" &&
    (!item.rawInput || typeof item.rawInput === "string") &&
    (item.durationMs === undefined ||
      (Number.isFinite(item.durationMs) && item.durationMs >= 0)) &&
    (item.affectedObjectIds === undefined ||
      (Array.isArray(item.affectedObjectIds) &&
        item.affectedObjectIds.every((id) => typeof id === "string")))
  );
}

function compactAuditItem(item: CadCommandHistoryItem): CadCommandHistoryItem {
  const audit = { ...item };
  delete audit.preview;
  delete audit.result;
  return {
    ...audit,
    rawInput: audit.rawInput?.slice(0, 2_000),
    label: audit.label.slice(0, 500),
    affectedObjectIds: audit.affectedObjectIds?.slice(0, 1_000),
  };
}

export function serializeCadCommandHistory(
  items: CadCommandHistoryItem[],
): string {
  return JSON.stringify({
    version: 1,
    items: items.slice(0, CAD_COMMAND_HISTORY_LIMIT).map(compactAuditItem),
  });
}

export function parseCadCommandHistory(
  raw: string | null | undefined,
): CadCommandHistoryItem[] {
  if (!raw) return [];
  try {
    const envelope = JSON.parse(raw) as { version?: unknown; items?: unknown };
    if (envelope.version !== 1 || !Array.isArray(envelope.items)) return [];
    return envelope.items
      .filter(isHistoryItem)
      .slice(0, CAD_COMMAND_HISTORY_LIMIT)
      .map(compactAuditItem);
  } catch {
    return [];
  }
}

export function prependCadCommandHistory(
  items: CadCommandHistoryItem[],
  item: CadCommandHistoryItem,
): CadCommandHistoryItem[] {
  return [item, ...items].slice(0, CAD_COMMAND_HISTORY_LIMIT);
}

export function repeatableCadCommand(
  items: CadCommandHistoryItem[],
): string | null {
  return (
    items.find(
      (item) => item.status === "applied" && !!item.rawInput?.trim(),
    )?.rawInput?.trim() ?? null
  );
}

export function navigateCadCommandHistory(
  items: CadCommandHistoryItem[],
  cursor: number,
  direction: "older" | "newer",
): { cursor: number; value: string } {
  const commands = items
    .map((item) => item.rawInput?.trim())
    .filter((value): value is string => !!value)
    .filter((value, index, all) => all.indexOf(value) === index);
  if (!commands.length) return { cursor: -1, value: "" };
  if (direction === "older") {
    const next = Math.min(commands.length - 1, cursor < 0 ? 0 : cursor + 1);
    return { cursor: next, value: commands[next] };
  }
  if (cursor <= 0) return { cursor: -1, value: "" };
  const next = cursor - 1;
  return { cursor: next, value: commands[next] };
}
