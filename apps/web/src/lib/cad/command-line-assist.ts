import { CAD_COMMAND_REGISTRY } from "./commands/registry";
import type { CadCommandCategory, CadCommandId } from "./commands/types";

export interface CadCommandAssistInput {
  query?: string;
  selectedCount?: number;
  selectedObjectLabels?: string[];
  maxItems?: number;
}

export interface CadCommandSuggestion {
  id: string;
  commandId: CadCommandId;
  label: string;
  category: CadCommandCategory;
  example: string;
  reason: string;
  ready: boolean;
  score: number;
}

const SELECTION_MINIMUMS: Partial<Record<CadCommandId, number>> = {
  create_clearance_aisle: 2,
  align_selection: 2,
  distribute_selection: 3,
  connect_flow: 2,
  arrange_flow_line: 2,
  arrange_rack_rows: 2,
  measure_distance: 2,
};

const EMPTY_QUERY_PRIORITY: Partial<Record<CadCommandId, number>> = {
  measure_distance: 10,
  create_clearance_aisle: 9,
  align_selection: 8,
  distribute_selection: 7,
  connect_flow: 6,
  arrange_flow_line: 5,
  validate_layout: 4,
  find_collisions: 3,
  fit_to_view: 2,
};

const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function selectedPair(labels: string[] | undefined): [string, string] {
  const clean = (labels ?? []).map((label) => label.trim()).filter(Boolean);
  return [clean[0] ?? "SMT", clean[1] ?? "Inspeccion"];
}

function exampleFor(commandId: CadCommandId, labels: string[] | undefined) {
  const [a, b] = selectedPair(labels);
  if (commandId === "create_clearance_aisle")
    return `haz un pasillo de 1.2m entre ${a} y ${b}`;
  if (commandId === "measure_distance")
    return `mide distancia entre ${a} y ${b}`;
  if (commandId === "align_selection")
    return "alinea las estaciones seleccionadas al centro";
  if (commandId === "distribute_selection")
    return "distribuye horizontalmente";
  if (commandId === "connect_flow") return "conecta flujo";
  if (commandId === "arrange_flow_line")
    return "acomoda y conecta la linea de flujo";
  if (commandId === "arrange_rack_rows")
    return "acomoda racks en 2 filas con pasillo 3m";
  if (commandId === "validate_layout") return "valida el layout";
  if (commandId === "find_collisions") return "encuentra colisiones";
  if (commandId === "fit_to_view") return "enfoca la seleccion";
  return CAD_COMMAND_REGISTRY.find((command) => command.id === commandId)
    ?.examples[0] ?? "";
}

function readinessReason(commandId: CadCommandId, selectedCount: number) {
  const minimum = SELECTION_MINIMUMS[commandId] ?? 0;
  if (selectedCount >= minimum) {
    if (minimum > 0) return `Usa ${selectedCount} objeto(s) seleccionados`;
    return "No requiere seleccion previa";
  }
  const missing = minimum - selectedCount;
  return `Selecciona ${missing} objeto(s) mas`;
}

function commandHaystack(command: (typeof CAD_COMMAND_REGISTRY)[number]) {
  return normalized(
    [
      command.id,
      command.label,
      command.category,
      command.description,
      ...command.examples,
    ].join(" "),
  );
}

export function suggestCadCommands(
  input: CadCommandAssistInput,
): CadCommandSuggestion[] {
  const query = normalized(input.query ?? "").trim();
  const selectedCount = Math.max(0, input.selectedCount ?? 0);
  const maxItems = Math.max(1, input.maxItems ?? 4);

  return CAD_COMMAND_REGISTRY.map((command) => {
    const minimum = SELECTION_MINIMUMS[command.id] ?? 0;
    const ready = selectedCount >= minimum;
    const haystack = commandHaystack(command);
    let score = 0;

    if (query) {
      if (normalized(command.label).startsWith(query)) score += 8;
      if (normalized(command.id).includes(query)) score += 6;
      if (haystack.includes(query)) score += 4;
      if (!haystack.includes(query)) score -= 6;
    } else {
      score += EMPTY_QUERY_PRIORITY[command.id] ?? 0;
      if (minimum > 0 && selectedCount >= minimum) score += 6;
      else if (minimum === 0) score += 2;
      else score -= 8;
    }

    if (ready) score += 2;
    else if (query) score -= 1;

    return {
      id: `${command.id}:${exampleFor(command.id, input.selectedObjectLabels)}`,
      commandId: command.id,
      label: command.label,
      category: command.category,
      example: exampleFor(command.id, input.selectedObjectLabels),
      reason: readinessReason(command.id, selectedCount),
      ready,
      score,
    };
  })
    .filter((suggestion) => suggestion.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.ready) - Number(a.ready) ||
        a.label.localeCompare(b.label),
    )
    .slice(0, maxItems);
}
