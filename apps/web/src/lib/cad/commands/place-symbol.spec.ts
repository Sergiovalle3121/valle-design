/**
 * Colocar símbolo (AXOS-CAD-PLACE-001): búsqueda en la biblioteca, medidas
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

// Fila al colocar (AXOS-CAD-PLACE-003): 'pon 3 sillas en fila cada 200'.
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

// Ancla relacional (AXOS-CAD-PLACE-004): 'pon una silla junto a la mesa'.
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

// Lados del ancla (AXOS-CAD-PLACE-005): izquierda/derecha/arriba/abajo.
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

console.log("cad place-symbol specs passed");
