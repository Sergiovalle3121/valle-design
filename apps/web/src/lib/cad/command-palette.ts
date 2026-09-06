/**
 * Las entradas de la paleta Ctrl+K — la UNIÓN de los registros, no uno solo.
 *
 * ## El agujero que esto tapa
 *
 * La paleta indexaba únicamente el registro heredado de frases en lenguaje
 * natural (47 comandos sobre cajas heredadas) más herramientas y símbolos. Los
 * 182 comandos del motor V2 —TRIM, FILLET, REVCLOUD, PAGESETUP…— eran
 * invisibles en el buscador aunque se pudieran teclear: existían para la línea
 * de comandos y no para Ctrl+K, que es donde los busca quien no se sabe el
 * nombre.
 *
 * ## Las entradas «Frase» se retiraron el 2026-09-06, y por qué
 *
 * La paleta ofrecía además el registro heredado de frases (`commands/registry.ts`,
 * un parser local y determinista) etiquetado «Frase». Cada entrada prometía
 * «Preview listo en el Copiloto CAD»: un panel que se retiró a propósito con
 * la IA (`no-ai-boundary.spec.ts` impide que `CadCommandDock` vuelva) y cuyo
 * «Aplicar» ya no existía en el editor. Cuarenta entradas visibles que
 * terminaban en un estado que nadie pintaba ni podía aplicar: el cuarto
 * estado que la casa prohíbe (visible y sin verificar). Se retiran de la
 * paleta —fix-or-hide: OCULTA— hasta que el circuito se cierre bajo un nombre
 * que no mienta; el parser sigue en `commands/registry.ts` para la línea de
 * comandos. `command-palette.spec.ts` defiende que no vuelvan por aquí.
 *
 * Los resúmenes en español del motor viven en `engine/command-summaries.ts`
 * con contrato fail-closed: un comando sin resumen es un error de CI, no una
 * entrada muda.
 */
import { CAD_COMMAND_REGISTRY_V2 } from "./engine";
import { cadCommandSummary } from "./engine/command-summaries";
import { CAD_SYMBOL_LIBRARY } from "./symbols";
import { CAD_TOOLBAR_ACTIONS } from "./toolbar";

export type CadPaletteEntryKind = "engine" | "command" | "tool" | "symbol";
export interface CadPaletteEntry {
  id: string;
  kind: CadPaletteEntryKind;
  label: string;
  description: string;
  keywords: string[];
  shortcut?: string;
}

export function buildCadPaletteEntries(): CadPaletteEntry[] {
  const engineEntries = CAD_COMMAND_REGISTRY_V2.all().map((command): CadPaletteEntry => {
    return {
      id: command.name,
      kind: "engine",
      label: command.name,
      description: cadCommandSummary(command.name),
      // Los alias entran como palabras clave: quien busca «TR» debe encontrar
      // TRIM, porque ésa es la memoria muscular que la tabla de alias promete.
      keywords: [...command.aliases, command.kind],
      ...(command.aliases.length > 0 ? { shortcut: command.aliases[0] } : {}),
    };
  });
  return [
    ...engineEntries,
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
        : entry.id.toLowerCase().includes(q)
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
