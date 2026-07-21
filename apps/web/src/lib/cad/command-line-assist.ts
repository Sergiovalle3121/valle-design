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
  array_rectangular: 1,
  array_polar: 1,
  array_along_flow: 1,
  offset_object: 1,
  // Kit diario (AXOS-CAD-MIRROR/XFORM-001): transformaciones sobre selección.
  mirror_selection: 1,
  delete_selection: 1,
  duplicate_selection: 1,
  move_selection: 1,
  rotate_selection: 1,
  scale_selection: 1,
  resize_object: 1,
  swap_objects: 2,
  extend_wall: 2,
  trim_wall: 2,
  chamfer_walls: 2,
  measure_area: 1,
  create_zone_around: 1,
  auto_dimension: 1,
};

const EMPTY_QUERY_PRIORITY: Partial<Record<CadCommandId, number>> = {
  measure_distance: 10,
  // Kit diario universal (AXOS-CAD-ASSIST-002): con el palette vacío y sin
  // selección, lo primero que ve cualquiera es colocar/seleccionar/contar —
  // no los comandos EMS de planta. Con selección, el bump de readiness (+6)
  // sube las transformaciones solo cuando ya aplican.
  place_symbol: 10,
  select_objects: 9,
  move_selection: 8,
  duplicate_selection: 7,
  add_label: 6,
  count_objects: 6,
  rotate_selection: 6,
  scale_selection: 5,
  mirror_selection: 5,
  object_info: 5,
  delete_selection: 4,
  resize_object: 4,
  create_clearance_aisle: 9,
  align_selection: 8,
  distribute_selection: 7,
  connect_flow: 6,
  arrange_flow_line: 5,
  trace_material_route: 5,
  validate_layout: 4,
  find_collisions: 3,
  fit_to_view: 2,
  draw_wall_segment: 1,
  draw_rect_zone: 1,
};

// Sinónimos espaciales (AXOS-CAD-ASSIST-005): palabras que la gente
// teclea y que no viven en ningún example del registry — sin esto, el
// palette las castigaba con la penalización de no-match. OJO: 'mide'
// pertenece a measure_distance (contrato del spec), no va aquí.
const QUERY_ALIASES: Partial<Record<CadCommandId, string[]>> = {
  delete_selection: ["vacia", "vaciar", "despejar", "quita"],
  move_selection: ["mete", "meter", "lleva", "centra"],
  select_objects: ["cerca", "junto", "menos", "excepto"],
  count_objects: ["cuantos", "cuantas", "inventario"],
  object_info: ["donde", "ubicacion"],
  place_symbol: ["esquina", "inserta"],
  duplicate_selection: ["clona", "copia"],
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
  if (commandId === "distribute_selection") return "distribuye horizontalmente";
  if (commandId === "connect_flow") return "conecta flujo";
  if (commandId === "arrange_flow_line")
    return "acomoda y conecta la linea de flujo";
  if (commandId === "arrange_rack_rows")
    return "acomoda racks en 2 filas con pasillo 3m";
  if (commandId === "trace_material_route") return "traza ruta material";
  if (commandId === "validate_layout") return "valida el layout";
  if (commandId === "find_collisions") return "encuentra colisiones";
  if (commandId === "fit_to_view") return "enfoca la seleccion";
  if (commandId === "draw_wall_segment") return "muro 0,0 @5000,0";
  if (commandId === "draw_rect_zone") return "rect 0,0 @4000,2500";
  return (
    CAD_COMMAND_REGISTRY.find((command) => command.id === commandId)
      ?.examples[0] ?? ""
  );
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
      const aliasHit = (QUERY_ALIASES[command.id] ?? []).some(
        (alias) => alias.startsWith(query) || query.includes(alias),
      );
      if (normalized(command.label).startsWith(query)) score += 8;
      if (normalized(command.id).includes(query)) score += 6;
      if (haystack.includes(query)) score += 4;
      if (aliasHit) score += 7;
      if (!haystack.includes(query) && !aliasHit) score -= 6;
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
