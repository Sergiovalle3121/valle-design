/**
 * Colocar símbolo (VD-CAD-PLACE-001): 'pon una puerta', 'coloca una cama
 * en 3000,2000' — el copiloto busca en la biblioteca (universal + EMS) y
 * emite el create con las medidas reales del símbolo. Sin coordenadas, lo
 * centra en el footprint para que el usuario lo arrastre a su sitio.
 */
import { normalizeDeg } from "../precision-input";
import { searchCadSymbols } from "../symbols";
import { matchObjectsByName } from "./targets";
import type {
  CadBox,
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadOperation,
  CadValidationIssue,
} from "./types";
import { error, warning } from "./validators";

const MAX_ROW = 30;

/** Busca tolerando plural español ('sillas' → 'silla', 'estantes' → 'estante'). */
function searchWithPlural(q: string) {
  const attempts = [q];
  if (q.length > 3 && /es$/i.test(q)) attempts.push(q.slice(0, -2));
  if (q.length > 2 && /s$/i.test(q)) attempts.push(q.slice(0, -1));
  for (const attempt of attempts) {
    const matches = searchCadSymbols(attempt);
    if (matches.length) return matches;
  }
  return [];
}

export function placeSymbolPreview(
  input: Extract<CadCommandInput, { id: "place_symbol" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const issues: CadValidationIssue[] = [];
  const q = input.query?.trim();
  if (!q) {
    issues.push(
      error(
        "place_symbol_query",
        "Dime qué símbolo colocar (p. ej. 'puerta', 'cama', 'mostrador').",
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  const matches = searchWithPlural(q);
  if (!matches.length) {
    issues.push(
      error(
        "place_symbol_not_found",
        `No encontré '${q}' en la biblioteca de símbolos.`,
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  const symbol = matches[0];
  let count = Math.max(1, Math.floor(input.count ?? 1));
  if (count > MAX_ROW) {
    issues.push(
      warning(
        "place_count_clamped",
        `Una fila lleva máximo ${MAX_ROW} piezas; coloco ${MAX_ROW}.`,
      ),
    );
    count = MAX_ROW;
  }
  const gap = Math.max(0, input.gap ?? 100);
  const step = symbol.defaultWidth + gap;
  const totalW = symbol.defaultWidth + (count - 1) * step;
  // En cada esquina (VD-CAD-PLACE-008): 4 piezas en las esquinas del
  // footprint con margen de 200 mm; ignora conteo, anclas y coordenadas.
  // En cada cuarto (VD-CAD-PLACE-009): una pieza centrada en cada
  // cuarto hoja — contenedores (room/zone) que no contienen el centro de
  // otro contenedor; el muro perimetral queda fuera solo.
  if (input.perRoom) {
    const containers = context.objects.filter((o) =>
      ["room", "zone"].includes(o.kind ?? ""),
    );
    const leaves = containers.filter(
      (r) =>
        !containers.some((other) => {
          if (other.id === r.id) return false;
          // Solo un contenedor MÁS CHICO cuenta como hijo — el centro del
          // muro perimetral puede caer en la frontera de un cuarto.
          if (other.w * other.h >= r.w * r.h) return false;
          const cx = other.x + other.w / 2;
          const cy = other.y + other.h / 2;
          return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
        }),
    );
    if (!leaves.length) {
      issues.push(
        error(
          "place_no_rooms",
          "No hay cuartos ni zonas en el plano para repartir.",
        ),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
    const roomRotation = Number.isFinite(input.rotation)
      ? normalizeDeg(input.rotation as number)
      : undefined;
    return {
      summary: `${leaves.length} × ${symbol.label} — uno en cada cuarto.`,
      affectedObjectIds: leaves.map((r) => r.id),
      operations: leaves.map((r, i) => ({
        type: "create",
        object: {
          kind: symbol.id,
          type: "asset",
          label: `${symbol.label} ${i + 1}`,
          x: Math.round(r.x + (r.w - symbol.defaultWidth) / 2),
          y: Math.round(r.y + (r.h - symbol.defaultHeight) / 2),
          w: symbol.defaultWidth,
          h: symbol.defaultHeight,
          rotation: roomRotation,
        },
      })),
      issues,
    };
  }
  if (input.corners) {
    const M = 200;
    const W = context.footprintW ?? 10000;
    const H = context.footprintH ?? 6000;
    const w = symbol.defaultWidth;
    const h = symbol.defaultHeight;
    const spots = [
      { x: M, y: M },
      { x: W - w - M, y: M },
      { x: M, y: H - h - M },
      { x: W - w - M, y: H - h - M },
    ];
    const cornerRotation = Number.isFinite(input.rotation)
      ? normalizeDeg(input.rotation as number)
      : undefined;
    return {
      summary: `4 × ${symbol.label} — uno en cada esquina.`,
      affectedObjectIds: [],
      operations: spots.map((s, i) => ({
        type: "create",
        object: {
          kind: symbol.id,
          type: "asset",
          label: `${symbol.label} ${i + 1}`,
          x: Math.round(s.x),
          y: Math.round(s.y),
          w,
          h,
          rotation: cornerRotation,
        },
      })),
      issues,
    };
  }
  // Ancla relacional (VD-CAD-PLACE-004/005): 'junto a la mesa' cae a la
  // derecha del ancla; 'a la izquierda de' termina la fila en el ancla;
  // 'arriba/debajo de' alinean x. Coordenadas explícitas ganan siempre.
  const anchorQuery = input.anchor?.trim();
  const anchors = anchorQuery ? matchObjectsByName(context, anchorQuery) : [];
  if (anchorQuery && !anchors.length) {
    issues.push(
      error(
        "place_anchor_not_found",
        `No encontré '${anchorQuery}' para colocar junto a él.`,
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  const side = input.anchorSide ?? "right";
  // 'junto a cada mesa' (VD-CAD-PLACE-006): una pieza por coincidencia,
  // respetando el lado; ignora count/coordenadas (no aplican al modo cada).
  if (input.anchorEach && anchors.length) {
    const eachRotation = Number.isFinite(input.rotation)
      ? normalizeDeg(input.rotation as number)
      : undefined;
    const eachOps: CadOperation[] = anchors.map((a, i) => ({
      type: "create",
      object: {
        kind: symbol.id,
        type: "asset",
        label: anchors.length > 1 ? `${symbol.label} ${i + 1}` : symbol.label,
        x: Math.round(
          side === "left"
            ? a.x - gap - symbol.defaultWidth
            : side === "right"
              ? a.x + a.w + gap
              : a.x,
        ),
        y: Math.round(
          side === "above"
            ? a.y - gap - symbol.defaultHeight
            : side === "below"
              ? a.y + a.h + gap
              : a.y,
        ),
        w: symbol.defaultWidth,
        h: symbol.defaultHeight,
        rotation: eachRotation,
      },
    }));
    return {
      summary: `${anchors.length} × ${symbol.label} — uno junto a cada '${anchorQuery}'.`,
      affectedObjectIds: anchors.map((a) => a.id),
      operations: eachOps,
      issues,
    };
  }
  const anchorBox = anchors[0];
  // Dentro de un cuarto (VD-CAD-PLACE-007): 'pon una silla en la
  // cocina' — la pieza (o la fila completa) aterriza centrada dentro del
  // contenedor nombrado. Coordenadas y ancla siguen ganando.
  const intoQuery = input.into?.trim();
  let intoBox: CadBox | undefined;
  if (intoQuery && !anchorBox && !Number.isFinite(input.x)) {
    const containers = matchObjectsByName(context, intoQuery);
    if (!containers.length) {
      issues.push(
        error(
          "place_into_not_found",
          `No encontré '${intoQuery}' para colocar ahí.`,
        ),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
    intoBox = containers[0];
  }
  const anchorX = anchorBox
    ? side === "left"
      ? anchorBox.x - gap - totalW
      : side === "right"
        ? anchorBox.x + anchorBox.w + gap
        : anchorBox.x
    : undefined;
  const anchorY = anchorBox
    ? side === "above"
      ? anchorBox.y - gap - symbol.defaultHeight
      : side === "below"
        ? anchorBox.y + anchorBox.h + gap
        : anchorBox.y
    : undefined;
  const x = Number.isFinite(input.x)
    ? Math.round(input.x as number)
    : anchorX !== undefined
      ? Math.round(anchorX)
      : intoBox
        ? Math.round(intoBox.x + (intoBox.w - totalW) / 2)
        : Math.round((context.footprintW ?? 10000) / 2 - totalW / 2);
  const y = Number.isFinite(input.y)
    ? Math.round(input.y as number)
    : anchorY !== undefined
      ? Math.round(anchorY)
      : intoBox
        ? Math.round(intoBox.y + (intoBox.h - symbol.defaultHeight) / 2)
        : Math.round((context.footprintH ?? 6000) / 2 - symbol.defaultHeight / 2);

  const rotation = Number.isFinite(input.rotation)
    ? normalizeDeg(input.rotation as number)
    : undefined;
  const operations: CadOperation[] = Array.from({ length: count }, (_, i) => ({
    type: "create",
    object: {
      kind: symbol.id,
      type: "asset",
      label: count > 1 ? `${symbol.label} ${i + 1}` : symbol.label,
      x: x + i * step,
      y,
      w: symbol.defaultWidth,
      h: symbol.defaultHeight,
      rotation,
    },
  }));

  return {
    summary:
      count > 1
        ? intoBox
          ? `${count} × ${symbol.label} en fila dentro de '${intoQuery}'.`
          : `${count} × ${symbol.label} en fila desde (${x}, ${y}).`
        : intoBox
          ? `${symbol.label} colocado dentro de '${intoQuery}'.`
          : `${symbol.label} colocado en (${x}, ${y}).`,
    affectedObjectIds: [],
    operations,
    issues,
  };
}
