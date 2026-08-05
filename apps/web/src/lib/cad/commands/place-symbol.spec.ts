/**
 * Colocar símbolo (VD-CAD-PLACE-001): búsqueda en la biblioteca, medidas
 * reales del símbolo, centrado por default y errores accionables.
 */
import { strict as assert } from "node:assert";
import { placeSymbolPreview } from "./place-symbol";
import { parseCadCommand } from "./parser";
import type { CadCommandContext } from "./types";

const ctx = {
  unit: "mm",
  footprintW: 10000,
  footprintH: 6000,
  objects: [],
  selectedIds: [],
} as unknown as CadCommandContext;

// 'puerta' encuentra door-90 (900×150) y respeta coordenadas explícitas.
{
  const out = placeSymbolPreview(
    { id: "place_symbol", query: "puerta", x: 2000, y: 650 },
    ctx,
  );
  assert.equal(out.issues.length, 0, "sin issues");
  const create = out.operations[0] as {
    type: string;
    object: { kind: string; w: number; h: number; x: number; y: number };
  };
  assert.equal(create.type, "create", "emite create");
  assert.equal(create.object.kind, "door-90", "encuentra la puerta");
  assert.equal(create.object.w, 900, "medida real de la puerta");
  assert.equal(create.object.x, 2000, "respeta x explícita");
}

// Sin coordenadas: centra en el footprint (cama 1400×2000 → x=4300, y=2000).
{
  const out = placeSymbolPreview(
    { id: "place_symbol", query: "cama matrimonial" },
    ctx,
  );
  const create = out.operations[0] as { object: { x: number; y: number } };
  assert.equal(create.object.x, 4300, "centrada en x");
  assert.equal(create.object.y, 2000, "centrada en y");
}

// Errores accionables: sin query y símbolo inexistente.
{
  const empty = placeSymbolPreview(
    { id: "place_symbol", query: "  " },
    ctx,
  );
  assert.ok(empty.issues.length > 0, "sin query → error");
  const missing = placeSymbolPreview(
    { id: "place_symbol", query: "nave espacial" },
    ctx,
  );
  assert.ok(missing.issues.length > 0, "símbolo inexistente → error");
}

// Parser: 'pon una puerta en 2000,650' → place_symbol con coordenadas.
{
  const parsed = parseCadCommand("pon una puerta en 2000,650");
  assert.equal(parsed.ok, true, "parser acepta 'pon una puerta'");
  assert.equal(parsed.input?.id, "place_symbol", "id correcto");
  if (parsed.input?.id === "place_symbol") {
    assert.equal(parsed.input.query, "puerta", "query limpia");
    assert.equal(parsed.input.x, 2000, "x del parser");
    assert.equal(parsed.input.y, 650, "y del parser");
  }
  const noQuery = parseCadCommand("coloca una");
  assert.equal(noQuery.ok, false, "sin símbolo pide clarificación");
}

// Rotación al colocar: 'pon una puerta girada 90 en 2000,650'.
{
  const parsed = parseCadCommand("pon una puerta girada 90 en 2000,650");
  assert.equal(parsed.input?.id, "place_symbol", "sigue siendo place");
  if (parsed.input?.id === "place_symbol") {
    assert.equal(parsed.input.query, "puerta", "query sin 'girada 90'");
    assert.equal(parsed.input.rotation, 90, "rotación del parser");
  }
  const out = placeSymbolPreview(
    { id: "place_symbol", query: "puerta", x: 0, y: 0, rotation: -90 },
    ctx,
  );
  const create = out.operations[0] as { object: { rotation?: number } };
  assert.equal(create.object.rotation, 270, "rotación normalizada (−90→270)");
}

// Fila al colocar (VD-CAD-PLACE-003): 'pon 3 sillas en fila cada 200'.
{
  const parsed = parseCadCommand("pon 3 sillas en fila cada 200");
  assert.equal(parsed.input?.id, "place_symbol", "pon N sillas es place");
  if (parsed.input?.id === "place_symbol") {
    assert.equal(parsed.input.query, "sillas", "query sin conteo ni fila");
    assert.equal(parsed.input.count, 3, "conteo del parser");
    assert.equal(parsed.input.gap, 200, "separación del parser");
  }
  const out = placeSymbolPreview(
    { id: "place_symbol", query: "sillas", x: 1000, y: 1000, count: 3, gap: 200 },
    ctx,
  );
  assert.equal(out.issues.length, 0, "plural 'sillas' encuentra la silla");
  assert.equal(out.operations.length, 3, "tres creates en fila");
  const first = out.operations[0] as { object: { x: number; w: number } };
  const second = out.operations[1] as { object: { x: number } };
  assert.equal(
    second.object.x - first.object.x,
    first.object.w + 200,
    "paso = ancho + separación",
  );
  const single = parseCadCommand("pon una puerta en 2000,650");
  if (single.input?.id === "place_symbol")
    assert.equal(single.input.count, undefined, "sin conteo sigue igual");
  const clamped = placeSymbolPreview(
    { id: "place_symbol", query: "silla", count: 99 },
    ctx,
  );
  assert.equal(clamped.operations.length, 30, "fila con tope de 30");
  assert.ok(
    clamped.issues.some((i) => i.code === "place_count_clamped"),
    "el tope avisa con warning",
  );
}

// Ancla relacional (VD-CAD-PLACE-004): 'pon una silla junto a la mesa'.
{
  const parsed = parseCadCommand("pon una silla junto a la mesa");
  assert.equal(parsed.input?.id, "place_symbol", "junto a sigue siendo place");
  if (parsed.input?.id === "place_symbol") {
    assert.equal(parsed.input.query, "silla", "query sin el ancla");
    assert.equal(parsed.input.anchor, "mesa", "ancla del parser");
  }
  const mesaCtx = {
    unit: "mm",
    footprintW: 10000,
    footprintH: 6000,
    objects: [
      {
        id: "m1",
        type: "asset",
        kind: "dining-table-4",
        label: "Mesa comedor",
        x: 3000,
        y: 2000,
        w: 1200,
        h: 1200,
      },
    ],
    selectedIds: [],
  } as unknown as CadCommandContext;
  const out = placeSymbolPreview(
    { id: "place_symbol", query: "silla", anchor: "mesa" },
    mesaCtx,
  );
  assert.equal(out.issues.length, 0, "ancla encontrada sin issues");
  const create = out.operations[0] as { object: { x: number; y: number } };
  assert.equal(create.object.x, 3000 + 1200 + 100, "cae a la derecha del ancla");
  assert.equal(create.object.y, 2000, "misma altura que el ancla");
  const missing = placeSymbolPreview(
    { id: "place_symbol", query: "silla", anchor: "piano" },
    mesaCtx,
  );
  assert.ok(
    missing.issues.some((i) => i.code === "place_anchor_not_found"),
    "ancla inexistente reporta error claro",
  );
}

// Lados del ancla (VD-CAD-PLACE-005): izquierda/derecha/arriba/abajo.
{
  const izq = parseCadCommand("pon una silla a la izquierda de la mesa");
  assert.equal(izq.input?.id, "place_symbol", "lado izquierdo es place");
  if (izq.input?.id === "place_symbol") {
    assert.equal(izq.input.query, "silla", "query sin el lado");
    assert.equal(izq.input.anchor, "mesa", "ancla con lado");
    assert.equal(izq.input.anchorSide, "left", "lado izquierdo del parser");
  }
  const alDel = parseCadCommand("pon un lavacabezas a la izquierda del tocador");
  if (alDel.input?.id === "place_symbol")
    assert.equal(alDel.input.anchor, "tocador", "ancla tras 'del'");
  const abajo = parseCadCommand("pon una silla debajo de la mesa");
  if (abajo.input?.id === "place_symbol")
    assert.equal(abajo.input.anchorSide, "below", "lado abajo del parser");

  const mesaCtx = {
    unit: "mm",
    footprintW: 10000,
    footprintH: 6000,
    objects: [
      {
        id: "m1",
        type: "asset",
        kind: "dining-table-4",
        label: "Mesa comedor",
        x: 3000,
        y: 2000,
        w: 1200,
        h: 1200,
      },
    ],
    selectedIds: [],
  } as unknown as CadCommandContext;
  const left = placeSymbolPreview(
    { id: "place_symbol", query: "silla", anchor: "mesa", anchorSide: "left" },
    mesaCtx,
  );
  const leftOp = left.operations[0] as {
    object: { x: number; y: number; w: number };
  };
  assert.equal(
    leftOp.object.x + leftOp.object.w + 100,
    3000,
    "izquierda termina justo antes del ancla",
  );
  assert.equal(leftOp.object.y, 2000, "izquierda conserva la altura");
  const below = placeSymbolPreview(
    { id: "place_symbol", query: "silla", anchor: "mesa", anchorSide: "below" },
    mesaCtx,
  );
  const belowOp = below.operations[0] as { object: { x: number; y: number } };
  assert.equal(belowOp.object.y, 2000 + 1200 + 100, "debajo cae tras el ancla");
  assert.equal(belowOp.object.x, 3000, "debajo alinea la x");
}

// Uno por coincidencia (VD-CAD-PLACE-006): 'pon una silla junto a cada mesa'.
{
  const parsed = parseCadCommand("pon una silla junto a cada mesa");
  assert.equal(parsed.input?.id, "place_symbol", "junto a cada es place");
  if (parsed.input?.id === "place_symbol") {
    assert.equal(parsed.input.anchor, "mesa", "ancla sin 'cada'");
    assert.equal(parsed.input.anchorEach, true, "modo cada del parser");
  }
  const mesasCtx = {
    unit: "mm",
    footprintW: 20000,
    footprintH: 10000,
    objects: [
      {
        id: "m1",
        type: "asset",
        kind: "dining-table-4",
        label: "Mesa 1",
        x: 2000,
        y: 2000,
        w: 1200,
        h: 1200,
      },
      {
        id: "m2",
        type: "asset",
        kind: "dining-table-4",
        label: "Mesa 2",
        x: 6000,
        y: 2000,
        w: 1200,
        h: 1200,
      },
    ],
    selectedIds: [],
  } as unknown as CadCommandContext;
  const out = placeSymbolPreview(
    { id: "place_symbol", query: "silla", anchor: "mesa", anchorEach: true },
    mesasCtx,
  );
  assert.equal(out.issues.length, 0, "cada mesa sin issues");
  assert.equal(out.operations.length, 2, "una silla por cada mesa");
  const first = out.operations[0] as { object: { x: number; y: number } };
  const second = out.operations[1] as { object: { x: number; y: number } };
  assert.equal(first.object.x, 2000 + 1200 + 100, "primera junto a Mesa 1");
  assert.equal(second.object.x, 6000 + 1200 + 100, "segunda junto a Mesa 2");
  assert.equal(first.object.y, 2000, "misma altura que su mesa");
}

// Dentro de un cuarto (VD-CAD-PLACE-007): 'pon una silla en la cocina'
// aterriza centrada en el contenedor; coordenadas siguen ganando.
{
  const casaCtx = {
    unit: "mm",
    footprintW: 12000,
    footprintH: 8000,
    objects: [
      { id: "coc", type: "asset", kind: "room", label: "Cocina", x: 6000, y: 4000, w: 3000, h: 3000 },
    ],
    selectedIds: [],
  } as unknown as CadCommandContext;
  const parsed = parseCadCommand("pon una silla en la cocina");
  assert.equal(parsed.input?.id, "place_symbol", "pon en zona parsea");
  if (parsed.input?.id === "place_symbol") {
    assert.equal(parsed.input.query, "silla", "query del parser");
    assert.equal(parsed.input.into, "cocina", "into del parser");
  }
  const out = placeSymbolPreview(
    { id: "place_symbol", query: "silla", into: "cocina" },
    casaCtx,
  );
  assert.equal(out.issues.length, 0, "colocar en zona sin issues");
  const op = out.operations[0] as {
    object: { x: number; y: number; w: number; h: number };
  };
  assert.equal(
    op.object.x,
    Math.round(6000 + (3000 - op.object.w) / 2),
    "centrada en x del cuarto",
  );
  assert.equal(
    op.object.y,
    Math.round(4000 + (3000 - op.object.h) / 2),
    "centrada en y del cuarto",
  );
  assert.ok(out.summary.includes("dentro de"), "resumen de zona");
  const fila = parseCadCommand("pon 2 sillas en la cocina");
  if (fila.input?.id === "place_symbol") {
    assert.equal(fila.input.count, 2, "conteo con zona");
    assert.equal(fila.input.into, "cocina", "into con conteo");
  }
  const coords = parseCadCommand("pon una silla en 2000,1000");
  if (coords.input?.id === "place_symbol") {
    assert.equal(coords.input.into, undefined, "coordenadas no son zona");
    assert.equal(coords.input.x, 2000, "x explícita intacta");
  }
  const missing = placeSymbolPreview(
    { id: "place_symbol", query: "silla", into: "terraza" },
    casaCtx,
  );
  assert.ok(
    missing.issues.some((i) => i.code === "place_into_not_found"),
    "zona inexistente → error específico",
  );
}

// En cada esquina (VD-CAD-PLACE-008): 4 piezas con margen de 200 mm.
{
  const esquinaCtx = {
    unit: "mm",
    footprintW: 10000,
    footprintH: 6000,
    objects: [],
    selectedIds: [],
  } as unknown as CadCommandContext;
  const parsed = parseCadCommand("pon una silla en cada esquina");
  assert.equal(parsed.input?.id, "place_symbol", "esquinas parsea");
  if (parsed.input?.id === "place_symbol") {
    assert.equal(parsed.input.query, "silla", "query limpia");
    assert.equal(parsed.input.corners, true, "corners del parser");
  }
  const out = placeSymbolPreview(
    { id: "place_symbol", query: "silla", corners: true },
    esquinaCtx,
  );
  assert.equal(out.issues.length, 0, "esquinas sin issues");
  assert.equal(out.operations.length, 4, "una pieza por esquina");
  const ops = out.operations as {
    object: { x: number; y: number; w: number; h: number };
  }[];
  assert.equal(ops[0].object.x, 200, "esquina sup-izq x");
  assert.equal(ops[0].object.y, 200, "esquina sup-izq y");
  assert.equal(
    ops[3].object.x,
    10000 - ops[3].object.w - 200,
    "esquina inf-der x",
  );
  assert.equal(
    ops[3].object.y,
    6000 - ops[3].object.h - 200,
    "esquina inf-der y",
  );
  assert.ok(out.summary.includes("cada esquina"), "resumen de esquinas");
}

console.log("cad place-symbol specs passed");

// En cada cuarto (VD-CAD-PLACE-009): una pieza centrada por cuarto
// hoja; el muro perimetral no duplica y sin cuartos hay error.
{
  const cuartosCtx = {
    unit: "mm",
    footprintW: 12000,
    footprintH: 8000,
    objects: [
      { id: "shell", type: "asset", kind: "room", label: "Muro perimetral", x: 0, y: 0, w: 12000, h: 8000 },
      { id: "coc", type: "asset", kind: "room", label: "Cocina", x: 0, y: 0, w: 4000, h: 4000 },
      { id: "com", type: "asset", kind: "room", label: "Comedor", x: 5000, y: 0, w: 4000, h: 4000 },
    ],
    selectedIds: [],
  } as unknown as CadCommandContext;
  const parsed = parseCadCommand("pon una silla en cada cuarto");
  assert.equal(parsed.input?.id, "place_symbol", "por cuarto parsea");
  if (parsed.input?.id === "place_symbol") {
    assert.equal(parsed.input.query, "silla", "query limpia");
    assert.equal(parsed.input.perRoom, true, "perRoom del parser");
  }
  const out = placeSymbolPreview(
    { id: "place_symbol", query: "silla", perRoom: true },
    cuartosCtx,
  );
  assert.equal(out.issues.length, 0, "por cuarto sin issues");
  assert.equal(out.operations.length, 2, "una silla por cuarto hoja");
  const first = out.operations[0] as {
    object: { x: number; y: number; w: number; h: number };
  };
  assert.equal(
    first.object.x,
    Math.round(0 + (4000 - first.object.w) / 2),
    "centrada en x de la cocina",
  );
  assert.ok(out.summary.includes("cada cuarto"), "resumen por cuarto");
  const vacio = placeSymbolPreview(
    { id: "place_symbol", query: "silla", perRoom: true },
    { unit: "mm", footprintW: 10000, footprintH: 6000, objects: [], selectedIds: [] } as unknown as CadCommandContext,
  );
  assert.ok(
    vacio.issues.some((i) => i.code === "place_no_rooms"),
    "sin cuartos → error específico",
  );
}
