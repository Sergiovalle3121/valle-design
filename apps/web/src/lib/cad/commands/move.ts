/**
 * Mover selección (AXOS-CAD-MOVE-001): el MOVE de AutoCAD, conversacional.
 * 'mueve la puerta a 2000,650' lleva el conjunto (su esquina superior
 * izquierda, como place_symbol) al punto absoluto; 'mueve la selección
 * 500 a la derecha' desplaza en relativo. El grupo viaja rígido: un solo
 * delta para todos los objetos.
 */
import { matchObjectsByName, resolveCommandTargets } from "./targets";
import type {
  CadBox,
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadOperation,
  CadValidationIssue,
} from "./types";
import { error } from "./validators";

const ANCHOR_GAP = 100;

export function moveSelectionPreview(
  input: Extract<CadCommandInput, { id: "move_selection" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const issues: CadValidationIssue[] = [];
  const { objs, usedTarget } = resolveCommandTargets(
    context,
    input.objectIds,
    input.target,
  );
  if (!objs.length) {
    issues.push(
      usedTarget
        ? error(
            "move_target_not_found",
            `No encontré '${input.target?.trim()}' en el plano.`,
          )
        : error(
            "move_empty_selection",
            "Selecciona al menos un objeto para mover.",
          ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }

  // Repartir (AXOS-CAD-MOVE-005): 'reparte las sillas entre los cuartos'
  // — cada objeto viaja al centro de un cuarto hoja en round-robin (misma
  // regla de hojas que PLACE-009: solo un contenedor MÁS CHICO cuenta como
  // hijo); los que exceden el número de cuartos se escalonan 300 mm.
  if (input.perRoom) {
    const movedIds = new Set(objs.map((o) => o.id));
    const containers = context.objects.filter(
      (o) => ["room", "zone"].includes(o.kind ?? "") && !movedIds.has(o.id),
    );
    const leaves = containers.filter(
      (r) =>
        !containers.some((other) => {
          if (other.id === r.id) return false;
          if (other.w * other.h >= r.w * r.h) return false;
          const cx = other.x + other.w / 2;
          const cy = other.y + other.h / 2;
          return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
        }),
    );
    if (!leaves.length) {
      issues.push(
        error(
          "move_no_rooms",
          "No hay cuartos ni zonas en el plano para repartir.",
        ),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
    const STAGGER = 300;
    return {
      summary: `Repartir ${objs.length} objeto(s) entre ${leaves.length} espacio(s).`,
      affectedObjectIds: objs.map((o) => o.id),
      operations: objs.map((o, i) => {
        const room = leaves[i % leaves.length]!;
        const round = Math.floor(i / leaves.length);
        return {
          type: "move",
          objectId: o.id,
          before: o,
          after: {
            ...o,
            x: Math.round(room.x + (room.w - o.w) / 2 + round * STAGGER),
            y: Math.round(room.y + (room.h - o.h) / 2 + round * STAGGER),
          },
        };
      }),
      issues,
    };
  }

  // Acomodo en cuadrícula (AXOS-CAD-MOVE-008): 'acomoda las sillas en 2
  // filas' — matriz anclada en la esquina del conjunto (orden del plano:
  // arriba-abajo, izquierda-derecha), celdas del objeto más grande + 200.
  if (input.rows || input.cols) {
    const GRID_GAP = 200;
    const sorted = [...objs].sort((a, b) => a.y - b.y || a.x - b.x);
    const n = sorted.length;
    const cols = input.cols
      ? Math.max(1, Math.round(input.cols))
      : Math.max(1, Math.ceil(n / Math.max(1, Math.round(input.rows ?? 1))));
    const rows = Math.ceil(n / cols);
    const cellW = Math.max(...sorted.map((o) => o.w)) + GRID_GAP;
    const cellH = Math.max(...sorted.map((o) => o.h)) + GRID_GAP;
    const ox = Math.min(...sorted.map((o) => o.x));
    const oy = Math.min(...sorted.map((o) => o.y));
    return {
      summary: `Acomodar ${n} objeto(s) en ${rows} fila(s) × ${cols} columna(s).`,
      affectedObjectIds: sorted.map((o) => o.id),
      operations: sorted.map((o, i) => ({
        type: "move",
        objectId: o.id,
        before: o,
        after: {
          ...o,
          x: Math.round(ox + (i % cols) * cellW),
          y: Math.round(oy + Math.floor(i / cols) * cellH),
        },
      })),
      issues,
    };
  }

  // Pegar a la pared (AXOS-CAD-MOVE-006): 'pega la mesa a la pared' — el
  // conjunto se recarga contra el muro del contenedor más chico que lo
  // contiene (cuarto/zona) o, si no hay, contra la orilla del plano;
  // 'nearest' elige la pared más cercana.
  if (input.wall) {
    const movedIds = new Set(objs.map((o) => o.id));
    const bminX = Math.min(...objs.map((o) => o.x));
    const bminY = Math.min(...objs.map((o) => o.y));
    const bmaxX = Math.max(...objs.map((o) => o.x + o.w));
    const bmaxY = Math.max(...objs.map((o) => o.y + o.h));
    const cx = (bminX + bmaxX) / 2;
    const cy = (bminY + bmaxY) / 2;
    const room = context.objects
      .filter(
        (o) =>
          ["room", "zone"].includes(o.kind ?? "") &&
          !movedIds.has(o.id) &&
          cx >= o.x &&
          cx <= o.x + o.w &&
          cy >= o.y &&
          cy <= o.y + o.h,
      )
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    const bounds = room
      ? { x0: room.x, y0: room.y, x1: room.x + room.w, y1: room.y + room.h }
      : {
          x0: 0,
          y0: 0,
          x1: context.footprintW ?? 10000,
          y1: context.footprintH ?? 6000,
        };
    const deltas = {
      left: { dx: bounds.x0 - bminX, dy: 0 },
      right: { dx: bounds.x1 - bmaxX, dy: 0 },
      top: { dx: 0, dy: bounds.y0 - bminY },
      bottom: { dx: 0, dy: bounds.y1 - bmaxY },
    } as const;
    const side =
      input.wall === "nearest"
        ? (Object.entries(deltas).sort(
            (a, b) =>
              Math.abs(a[1].dx + a[1].dy) - Math.abs(b[1].dx + b[1].dy),
          )[0]![0] as keyof typeof deltas)
        : input.wall;
    const wallSides: Record<keyof typeof deltas, string> = {
      left: "izquierda",
      right: "derecha",
      top: "de arriba",
      bottom: "del fondo",
    };
    return {
      summary: `Pegar ${objs.length} objeto(s) a la pared ${wallSides[side]}${room ? ` de '${room.label}'` : ""}.`,
      affectedObjectIds: objs.map((o) => o.id),
      operations: objs.map((o) => ({
        type: "move",
        objectId: o.id,
        before: o,
        after: {
          ...o,
          x: Math.round(o.x + deltas[side].dx),
          y: Math.round(o.y + deltas[side].dy),
        },
      })),
      issues,
    };
  }

  // Destino relacional (AXOS-CAD-MOVE-003): 'mueve la silla junto a la
  // mesa' — el conjunto aterriza al lado del ancla (excluyendo del ancla a
  // los propios objetos movidos).
  const anchorQuery = input.anchor?.trim();
  let anchorBox: CadBox | undefined;
  if (anchorQuery) {
    const movedIds = new Set(objs.map((o) => o.id));
    const anchors = matchObjectsByName(context, anchorQuery).filter(
      (a) => !movedIds.has(a.id),
    );
    if (!anchors.length) {
      issues.push(
        error(
          "move_anchor_not_found",
          `No encontré '${anchorQuery}' para mover junto a él.`,
        ),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
    anchorBox = anchors[0];
  }

  // Destino de zona (AXOS-CAD-MOVE-004): 'mete la mesa en la cocina' — el
  // conjunto aterriza centrado dentro del contenedor nombrado.
  const intoQuery = input.into?.trim();
  let intoBox: CadBox | undefined;
  if (intoQuery && !anchorBox) {
    const movedIds = new Set(objs.map((o) => o.id));
    const containers = matchObjectsByName(context, intoQuery).filter(
      (c) => !movedIds.has(c.id),
    );
    if (!containers.length) {
      issues.push(
        error(
          "move_into_not_found",
          `No encontré '${intoQuery}' para meter ahí el conjunto.`,
        ),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
    intoBox = containers[0];
  }

  const hasAbs = Number.isFinite(input.x) && Number.isFinite(input.y);
  const hasRel =
    (Number.isFinite(input.dx) && (input.dx as number) !== 0) ||
    (Number.isFinite(input.dy) && (input.dy as number) !== 0);
  if (!hasAbs && !hasRel && !input.center && !anchorBox && !intoBox) {
    issues.push(
      error(
        "move_missing_destination",
        "Dime a dónde: 'a 2000,650', '500 a la derecha', 'junto a la mesa', 'a la cocina' o 'céntrala'.",
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }

  const minX = Math.min(...objs.map((o) => o.x));
  const minY = Math.min(...objs.map((o) => o.y));
  // 'centra la mesa' (AXOS-CAD-MOVE-002): el bounding box del conjunto al
  // centro del footprint — mismo delta rígido para todos.
  const maxX = Math.max(...objs.map((o) => o.x + o.w));
  const maxY = Math.max(...objs.map((o) => o.y + o.h));
  const side = input.anchorSide ?? "right";
  const anchorX = anchorBox
    ? side === "left"
      ? anchorBox.x - ANCHOR_GAP - (maxX - minX)
      : side === "right"
        ? anchorBox.x + anchorBox.w + ANCHOR_GAP
        : anchorBox.x
    : undefined;
  const anchorY = anchorBox
    ? side === "above"
      ? anchorBox.y - ANCHOR_GAP - (maxY - minY)
      : side === "below"
        ? anchorBox.y + anchorBox.h + ANCHOR_GAP
        : anchorBox.y
    : undefined;
  const dx = input.center
    ? Math.round(((context.footprintW ?? 10000) - (maxX - minX)) / 2 - minX)
    : hasAbs
      ? Math.round((input.x as number) - minX)
      : anchorX !== undefined
        ? Math.round(anchorX - minX)
        : intoBox
          ? Math.round(intoBox.x + (intoBox.w - (maxX - minX)) / 2 - minX)
          : Math.round(Number.isFinite(input.dx) ? (input.dx as number) : 0);
  const dy = input.center
    ? Math.round(((context.footprintH ?? 6000) - (maxY - minY)) / 2 - minY)
    : hasAbs
      ? Math.round((input.y as number) - minY)
      : anchorY !== undefined
        ? Math.round(anchorY - minY)
        : intoBox
          ? Math.round(intoBox.y + (intoBox.h - (maxY - minY)) / 2 - minY)
          : Math.round(Number.isFinite(input.dy) ? (input.dy as number) : 0);

  const operations: CadOperation[] = objs.map((o) => ({
    type: "move",
    objectId: o.id,
    before: o,
    after: { ...o, x: o.x + dx, y: o.y + dy },
  }));

  return {
    summary: input.center
      ? `Centrar ${objs.length} objeto(s) en el plano.`
      : hasAbs
        ? `Mover ${objs.length} objeto(s) a (${Math.round(input.x as number)}, ${Math.round(input.y as number)}).`
        : anchorBox
          ? `Mover ${objs.length} objeto(s) junto a '${anchorQuery}'.`
          : intoBox
            ? `Mover ${objs.length} objeto(s) dentro de '${intoQuery}'.`
            : `Mover ${objs.length} objeto(s) ${dx ? `${dx > 0 ? "+" : ""}${dx} en X` : ""}${dx && dy ? ", " : ""}${dy ? `${dy > 0 ? "+" : ""}${dy} en Y` : ""}.`,
    affectedObjectIds: objs.map((o) => o.id),
    operations,
    issues,
  };
}
