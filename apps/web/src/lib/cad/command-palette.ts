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
 * ## Por qué UNIÓN y no sustitución
 *
 * El registro heredado no es un residuo: alimenta la barra de frases
 * (`parseCadCommand`/`previewCadCommand`), los esquemas de tools de IA y la
 * asistencia de la línea. Se queda, etiquetado «Frase», y cuando un id
 * heredado coincidiera con un nombre del motor gana el motor — dos entradas
 * con el mismo nombre y efectos distintos es el tipo de ambigüedad que una
 * paleta no puede permitirse.
 *
 * Los resúmenes en español del motor viven en `engine/command-summaries.ts`
 * con contrato fail-closed: un comando sin resumen es un error de CI, no una
 * entrada muda.
 */
import { CAD_COMMAND_REGISTRY } from "./commands";
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
  const engineNames = new Set<string>();
  const engineEntries = CAD_COMMAND_REGISTRY_V2.all().map((command): CadPaletteEntry => {
    engineNames.add(command.name.toUpperCase());
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
    ...CAD_COMMAND_REGISTRY.filter(
      (command) => !engineNames.has(command.id.toUpperCase()),
    ).map((command) => ({
      id: command.id,
      kind: "command" as const,
      label: command.label,
      // La etiqueta «Frase» dice QUÉ ejecuta esta entrada: una previsualización
      // del registro de frases, no un comando del motor. Sin ella las dos familias se
      // verían iguales y harían cosas distintas.
      description: `Frase · ${command.description}`,
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
