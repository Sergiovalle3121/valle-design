import type {
  CadBox,
  CadCommandDefinition,
  CadCommandInput,
  CadCommandPreview,
  CadCommandResult,
  CadConnectorInput,
  CadOperation,
} from "./types";
import {
  error,
  findObjectByLabel,
  outOfBounds,
  overlaps,
  selectedObjects,
  validateDistance,
  warning,
} from "./validators";

const ok = (issues: ReturnType<CadCommandDefinition["validate"]>) =>
  !issues.some((i) => i.level === "error");
const result = (
  preview: CadCommandPreview,
  applied: boolean,
  historyLabel: string,
): CadCommandResult => ({ ...preview, applied, historyLabel });
const center = (b: CadBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const bySequence = (xs: CadBox[]) =>
  [...xs].sort(
    (a, b) =>
      (a.sequence ?? 0) - (b.sequence ?? 0) || a.label.localeCompare(b.label),
  );

function clearancePreview(
  input: Extract<CadCommandInput, { id: "create_clearance_aisle" }>,
  context: Parameters<CadCommandDefinition["preview"]>[1],
): CadCommandPreview {
  const issues = validateDistance(input.distance);
  const a = findObjectByLabel(context, input.targetA);
  const b = findObjectByLabel(context, input.targetB);
  if (!a || !b)
    issues.push(
      error(
        "target_not_found",
        !a
          ? `No encontré un objeto llamado ${input.targetA ?? "origen"}.`
          : `No encontré un objeto llamado ${input.targetB ?? "destino"}.`,
      ),
    );
  if (!a || !b)
    return {
      summary: "Crear pasillo",
      affectedObjectIds: [],
      operations: [],
      issues,
    };
  const axis = input.axis ?? "x";
  const after = { ...b };
  if (axis === "x")
    after.x =
      a.x <= b.x ? a.x + a.w + input.distance : a.x - b.w - input.distance;
  else
    after.y =
      a.y <= b.y ? a.y + a.h + input.distance : a.y - b.h - input.distance;
  if (outOfBounds(after, context))
    issues.push(
      warning(
        "out_of_bounds",
        "La operación deja el objeto fuera del plano; la UI deberá limitar el movimiento.",
        [b.id],
      ),
    );
  return {
    summary: `Crear pasillo de ${input.distance}${input.unit ?? context.unit} entre ${a.label} y ${b.label}.`,
    affectedObjectIds: [a.id, b.id],
    operations: [{ type: "move", objectId: b.id, before: b, after }],
    issues,
  };
}

function alignPreview(
  input: Extract<CadCommandInput, { id: "align_selection" }>,
  context: Parameters<CadCommandDefinition["preview"]>[1],
): CadCommandPreview {
  const { objects, issues } = selectedObjects(context, input.objectIds, 2);
  if (!objects.length)
    return {
      summary: "Alinear selección",
      affectedObjectIds: [],
      operations: [],
      issues,
    };
  const minX = Math.min(...objects.map((o) => o.x));
  const maxX = Math.max(...objects.map((o) => o.x + o.w));
  const minY = Math.min(...objects.map((o) => o.y));
  const maxY = Math.max(...objects.map((o) => o.y + o.h));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const operations: CadOperation[] = objects.map((o) => {
    const after = { ...o };
    if (input.mode === "left") after.x = minX;
    if (input.mode === "right") after.x = maxX - o.w;
    if (input.mode === "center") after.x = Math.round(cx - o.w / 2);
    if (input.mode === "top") after.y = minY;
    if (input.mode === "bottom") after.y = maxY - o.h;
    if (input.mode === "middle") after.y = Math.round(cy - o.h / 2);
    return { type: "move", objectId: o.id, before: o, after };
  });
  return {
    summary: `Alinear ${objects.length} objetos (${input.mode}).`,
    affectedObjectIds: objects.map((o) => o.id),
    operations,
    issues,
  };
}

function distributePreview(
  input: Extract<CadCommandInput, { id: "distribute_selection" }>,
  context: Parameters<CadCommandDefinition["preview"]>[1],
): CadCommandPreview {
  const { objects, issues } = selectedObjects(context, input.objectIds, 3);
  const horizontal = input.axis === "horizontal";
  const sorted = [...objects].sort((a, b) =>
    horizontal ? a.x - b.x : a.y - b.y,
  );
  const start = horizontal ? sorted[0]?.x : sorted[0]?.y;
  if (sorted.length < 3 || start == null)
    return {
      summary: "Distribuir selección",
      affectedObjectIds: objects.map((o) => o.id),
      operations: [],
      issues,
    };
  const endEdge = horizontal
    ? sorted[sorted.length - 1].x + sorted[sorted.length - 1].w
    : sorted[sorted.length - 1].y + sorted[sorted.length - 1].h;
  const total = sorted.reduce((sum, o) => sum + (horizontal ? o.w : o.h), 0);
  const gap = (endEdge - start - total) / (sorted.length - 1);
  let cursor = start;
  const operations: CadOperation[] = sorted.map((o) => {
    const after = { ...o };
    if (horizontal) after.x = Math.round(cursor);
    else after.y = Math.round(cursor);
    cursor += (horizontal ? o.w : o.h) + gap;
    return { type: "move", objectId: o.id, before: o, after };
  });
  return {
    summary: `Distribuir ${objects.length} objetos en ${input.axis}.`,
    affectedObjectIds: objects.map((o) => o.id),
    operations,
    issues,
  };
}

function flowObjects(
  input: Extract<CadCommandInput, { id: "connect_flow" | "arrange_line" }>,
  context: Parameters<CadCommandDefinition["preview"]>[1],
) {
  const explicit = input.objectIds?.length
    ? input.objectIds
    : context.selectedIds;
  const objects = explicit.length
    ? explicit
        .map((id) => context.objects.find((o) => o.id === id))
        .filter((o): o is CadBox => !!o)
    : context.objects.filter((o) => o.type === "station");
  return bySequence(objects);
}

export const CAD_COMMAND_REGISTRY: CadCommandDefinition[] = [
  {
    id: "create_clearance_aisle",
    label: "Crear pasillo",
    category: "layout",
    description: "Separa dos objetos para crear una holgura/pasillo medible.",
    inputSchema: {
      targetA: { type: "string", required: true, description: "Objeto fijo." },
      targetB: {
        type: "string",
        required: true,
        description: "Objeto a mover.",
      },
      distance: {
        type: "number",
        required: true,
        description: "Distancia de holgura.",
      },
      unit: { type: "string", description: "Unidad interpretada." },
      axis: {
        type: "enum",
        enum: ["x", "y"],
        description: "Eje de separación.",
      },
    },
    examples: ["haz un pasillo de 1.2m entre SMT e inspección"],
    validate: (i, c) =>
      clearancePreview(
        i as Extract<CadCommandInput, { id: "create_clearance_aisle" }>,
        c,
      ).issues,
    preview: (i, c) =>
      clearancePreview(
        i as Extract<CadCommandInput, { id: "create_clearance_aisle" }>,
        c,
      ),
    execute: (i, c) => {
      const p = clearancePreview(
        i as Extract<CadCommandInput, { id: "create_clearance_aisle" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "align_selection",
    label: "Alinear selección",
    category: "layout",
    description: "Alinea objetos seleccionados a un borde o centro común.",
    inputSchema: {
      mode: {
        type: "enum",
        required: true,
        enum: ["left", "center", "right", "top", "middle", "bottom"],
        description: "Modo de alineación.",
      },
      objectIds: { type: "string[]", description: "Objetos afectados." },
    },
    examples: ["alinea las estaciones seleccionadas al centro"],
    validate: (i, c) =>
      alignPreview(i as Extract<CadCommandInput, { id: "align_selection" }>, c)
        .issues,
    preview: (i, c) =>
      alignPreview(i as Extract<CadCommandInput, { id: "align_selection" }>, c),
    execute: (i, c) => {
      const p = alignPreview(
        i as Extract<CadCommandInput, { id: "align_selection" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "distribute_selection",
    label: "Distribuir selección",
    category: "layout",
    description: "Distribuye objetos con espacios iguales.",
    inputSchema: {
      axis: {
        type: "enum",
        required: true,
        enum: ["horizontal", "vertical"],
        description: "Eje de distribución.",
      },
      objectIds: { type: "string[]", description: "Objetos afectados." },
    },
    examples: ["distribuye horizontalmente"],
    validate: (i, c) =>
      distributePreview(
        i as Extract<CadCommandInput, { id: "distribute_selection" }>,
        c,
      ).issues,
    preview: (i, c) =>
      distributePreview(
        i as Extract<CadCommandInput, { id: "distribute_selection" }>,
        c,
      ),
    execute: (i, c) => {
      const p = distributePreview(
        i as Extract<CadCommandInput, { id: "distribute_selection" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "connect_flow",
    label: "Conectar flujo",
    category: "flow",
    description: "Crea conectores secuenciales entre estaciones.",
    inputSchema: {
      objectIds: {
        type: "string[]",
        description: "Estaciones a conectar en secuencia.",
      },
      from: { type: "string", description: "Origen opcional." },
      to: { type: "string", description: "Destino opcional." },
    },
    examples: ["conecta flujo de SMT a inspección"],
    validate: (i, c) =>
      flowObjects(i as Extract<CadCommandInput, { id: "connect_flow" }>, c)
        .length >= 2
        ? []
        : [
            error(
              "selection_too_small",
              "Selecciona al menos 2 estaciones para conectar flujo.",
            ),
          ],
    preview: (i, c) => {
      const xs = flowObjects(
        i as Extract<CadCommandInput, { id: "connect_flow" }>,
        c,
      );
      const ops: CadOperation[] = xs.slice(0, -1).map((o, idx) => ({
        type: "connect",
        from: o.id,
        to: xs[idx + 1].id,
        kind: "flow",
      }));
      return {
        summary: `Conectar ${ops.length} tramos de flujo.`,
        affectedObjectIds: xs.map((o) => o.id),
        operations: ops,
        issues:
          xs.length >= 2
            ? []
            : [
                error(
                  "selection_too_small",
                  "Selecciona al menos 2 estaciones para conectar flujo.",
                ),
              ],
      };
    },
    execute: (i, c) => {
      const p = CAD_COMMAND_REGISTRY.find(
        (d) => d.id === "connect_flow",
      )!.preview(i, c);
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "arrange_line",
    label: "Acomodar línea",
    category: "layout",
    description: "Propone acomodo secuencial simple para estaciones.",
    inputSchema: {
      direction: {
        type: "enum",
        enum: ["left_to_right", "top_to_bottom"],
        description: "Dirección del acomodo.",
      },
      objectIds: { type: "string[]", description: "Estaciones a acomodar." },
    },
    examples: ["acomoda la línea de izquierda a derecha"],
    validate: (i, c) =>
      flowObjects(i as Extract<CadCommandInput, { id: "arrange_line" }>, c)
        .length >= 1
        ? []
        : [error("selection_empty", "No hay estaciones para acomodar.")],
    preview: (i, c) => {
      const input = i as Extract<CadCommandInput, { id: "arrange_line" }>;
      const xs = flowObjects(input, c);
      const gap = 500;
      const cursor = { x: gap, y: gap };
      const ops: CadOperation[] = xs.map((o) => {
        const after = { ...o, x: cursor.x, y: cursor.y };
        if (input.direction === "top_to_bottom") cursor.y += o.h + gap;
        else cursor.x += o.w + gap;
        return { type: "move", objectId: o.id, before: o, after };
      });
      return {
        summary: `Acomodar ${xs.length} estaciones por secuencia.`,
        affectedObjectIds: xs.map((o) => o.id),
        operations: ops,
        issues: xs.length
          ? []
          : [error("selection_empty", "No hay estaciones para acomodar.")],
      };
    },
    execute: (i, c) => {
      const p = CAD_COMMAND_REGISTRY.find(
        (d) => d.id === "arrange_line",
      )!.preview(i, c);
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "measure_distance",
    label: "Medir distancia",
    category: "analysis",
    description: "Mide la distancia centro a centro entre dos objetos.",
    inputSchema: {
      targetA: {
        type: "string",
        required: true,
        description: "Primer objeto.",
      },
      targetB: {
        type: "string",
        required: true,
        description: "Segundo objeto.",
      },
    },
    examples: ["mide distancia entre AOI y empaque"],
    validate: (i, c) => {
      const input = i as Extract<CadCommandInput, { id: "measure_distance" }>;
      return findObjectByLabel(c, input.targetA) &&
        findObjectByLabel(c, input.targetB)
        ? []
        : [error("target_not_found", "No encontré ambos objetos para medir.")];
    },
    preview: (i, c) => {
      const input = i as Extract<CadCommandInput, { id: "measure_distance" }>;
      const a = findObjectByLabel(c, input.targetA);
      const b = findObjectByLabel(c, input.targetB);
      const issues =
        a && b
          ? []
          : [
              error(
                "target_not_found",
                "No encontré ambos objetos para medir.",
              ),
            ];
      const distance =
        a && b
          ? Math.hypot(center(a).x - center(b).x, center(a).y - center(b).y)
          : 0;
      return {
        summary:
          a && b
            ? `Distancia ${a.label} ↔ ${b.label}: ${Math.round(distance)}${c.unit}.`
            : "Medir distancia",
        affectedObjectIds: [a?.id, b?.id].filter(Boolean) as string[],
        operations:
          a && b
            ? [
                {
                  type: "measure",
                  from: a.id,
                  to: b.id,
                  distance,
                  unit: c.unit,
                },
              ]
            : [],
        issues,
      };
    },
    execute: (i, c) => {
      const p = CAD_COMMAND_REGISTRY.find(
        (d) => d.id === "measure_distance",
      )!.preview(i, c);
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "find_collisions",
    label: "Encontrar colisiones",
    category: "analysis",
    description: "Detecta traslapes básicos entre objetos.",
    inputSchema: {
      objectIds: { type: "string[]", description: "Subconjunto opcional." },
    },
    examples: ["encuentra colisiones"],
    validate: () => [],
    preview: (i, c) => {
      const ids = (i as Extract<CadCommandInput, { id: "find_collisions" }>)
        .objectIds;
      const xs = ids?.length
        ? c.objects.filter((o) => ids.includes(o.id))
        : c.objects;
      const rows: { label: string; value: string }[] = [];
      for (let a = 0; a < xs.length; a++)
        for (let b = a + 1; b < xs.length; b++)
          if (overlaps(xs[a], xs[b]))
            rows.push({ label: xs[a].label, value: xs[b].label });
      return {
        summary: rows.length
          ? `${rows.length} colisiones detectadas.`
          : "Sin colisiones detectadas.",
        affectedObjectIds: uniq(rows.flatMap((r) => [r.label, r.value])),
        operations: [{ type: "report", title: "Colisiones", rows }],
        issues: rows.length
          ? [
              warning(
                "collisions_found",
                `${rows.length} traslapes básicos detectados.`,
              ),
            ]
          : [],
      };
    },
    execute: (i, c) => {
      const p = CAD_COMMAND_REGISTRY.find(
        (d) => d.id === "find_collisions",
      )!.preview(i, c);
      return result(p, true, p.summary);
    },
  },
  {
    id: "fit_to_view",
    label: "Enfocar vista",
    category: "viewport",
    description: "Solicita a la UI enfocar selección o layout.",
    inputSchema: {
      objectIds: { type: "string[]", description: "Objetos a enfocar." },
    },
    examples: ["enfoca la selección"],
    validate: () => [],
    preview: (i, c) => {
      const ids =
        (i as Extract<CadCommandInput, { id: "fit_to_view" }>).objectIds ??
        c.selectedIds;
      return {
        summary: ids.length
          ? `Enfocar ${ids.length} objetos.`
          : "Enfocar layout completo.",
        affectedObjectIds: ids,
        operations: [{ type: "focus", objectIds: ids }],
        issues: [],
      };
    },
    execute: (i, c) => {
      const p = CAD_COMMAND_REGISTRY.find(
        (d) => d.id === "fit_to_view",
      )!.preview(i, c);
      return result(p, true, p.summary);
    },
  },
];

export const CAD_COMMAND_IDS = CAD_COMMAND_REGISTRY.map((c) => c.id);
export function getCadCommand(id: CadCommandInput["id"]) {
  return CAD_COMMAND_REGISTRY.find((c) => c.id === id);
}
export function openAiCompatibleToolSchemas() {
  return CAD_COMMAND_REGISTRY.map(
    ({ id, label, description, inputSchema }) => ({
      type: "function" as const,
      function: {
        name: id,
        description: `${label}: ${description}`,
        parameters: inputSchema,
      },
    }),
  );
}
export type { CadConnectorInput };
