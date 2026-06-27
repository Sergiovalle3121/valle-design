import { CAD_COMMAND_REGISTRY } from "./commands";
import { CAD_SYMBOL_LIBRARY } from "./symbols";
import { CAD_TOOLBAR_ACTIONS } from "./toolbar";

export type CadPaletteEntryKind = "command" | "tool" | "symbol";
export interface CadPaletteEntry {
  id: string;
  kind: CadPaletteEntryKind;
  label: string;
  description: string;
  keywords: string[];
  shortcut?: string;
}

export function buildCadPaletteEntries(): CadPaletteEntry[] {
  return [
    ...CAD_COMMAND_REGISTRY.map((command) => ({
      id: command.id,
      kind: "command" as const,
      label: command.label,
      description: command.description,
      keywords: [command.category, ...command.examples],
    })),
    ...CAD_TOOLBAR_ACTIONS.map((tool) => ({
      id: tool.id,
      kind: "tool" as const,
      label: tool.label,
      description: tool.description,
      keywords: [tool.group, tool.shortcut ?? ""].filter(Boolean),
      shortcut: tool.shortcut,
    })),
    ...CAD_SYMBOL_LIBRARY.map((symbol) => ({
      id: symbol.id,
      kind: "symbol" as const,
      label: symbol.label,
      description: `Insert ${symbol.label}`,
      keywords: [symbol.category, symbol.layer, ...symbol.tags],
    })),
  ];
}
export function searchCadPalette(
  query: string,
  entries = buildCadPaletteEntries(),
): CadPaletteEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries
    .map((entry) => {
      const haystack = [
        entry.id,
        entry.label,
        entry.description,
        ...entry.keywords,
      ]
        .join(" ")
        .toLowerCase();
      const score = entry.label.toLowerCase().startsWith(q)
        ? 3
        : entry.id.includes(q)
          ? 2
          : haystack.includes(q)
            ? 1
            : 0;
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label),
    )
    .map((item) => item.entry);
}
