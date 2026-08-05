import assert from "node:assert/strict";
import { exportCadDxf } from "./dxf-export";
import { importDxfPrimitives } from "./dxf-import";
import {
  cadEntityToDxfPrimitive,
  cadDxfPrimitivesToCanonicalEntities,
} from "./dxf-cad-document";
import type { CadEntity } from "./cad-document";

/**
 * Regresión P0 — `closed` sobrevive el contrato DXF COMPLETO.
 *
 *   CadDocument → CadDxfPrimitive → DXF → parser → CadDxfPrimitive → CadDocument
 *
 * `CadDxfPrimitive` no tenía forma de representar el cierre, así que la
 * información viajaba por un canal lateral con pérdidas: se REPETÍA el primer
 * vértice al final. Consecuencias medibles:
 *
 *  · `writePrimitiveGeometry` llamaba `pushPolyline(..., false)` para toda
 *    polilínea, de modo que el código de grupo 70 salía SIEMPRE en 0: un
 *    contorno cerrado llegaba a AutoCAD como abierto con dos vértices
 *    coincidentes;
 *  · el vértice duplicado añadía un segmento nulo que ni existía en el
 *    documento canónico ni debería existir en el DXF;
 *  · `rect` era peor: emitía 70=1 Y el vértice duplicado, es decir un
 *    contorno cerrado con un último tramo de longitud cero;
 *  · al reimportar, el cierre se REINFERÍA comparando el primer y el último
 *    punto, así que una polilínea ABIERTA cuyos extremos coinciden por
 *    geometría se convertía en cerrada, y el bulge del tramo de cierre no
 *    tenía dónde vivir.
 *
 * Nada de esto lo veía la suite: todos los fixtures de round-trip usaban
 * polilíneas abiertas (`grep closed` sólo encontraba `closed: false`).
 */

type Polyline = Extract<CadEntity, { type: "polyline" }>;

function polyline(over: Partial<Polyline> = {}): Polyline {
  return {
    id: "pl",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 1_000, y: 0, z: 0 },
      { x: 1_000, y: 600, z: 0 },
      { x: 0, y: 600, z: 0 },
    ],
    closed: true,
    layer: "MUROS",
    ...over,
  } as Polyline;
}

/** Vuelve del texto DXF al documento canónico por el pipeline real. */
function roundTrip(entity: Polyline): CadEntity[] {
  const primitive = cadEntityToDxfPrimitive(entity);
  assert.ok(primitive, "la polilínea debe mapear a una primitiva DXF");
  const dxf = exportCadDxf({ primitives: [primitive!] }, { units: "mm" }).content;
  const reimported = importDxfPrimitives(dxf);
  return cadDxfPrimitivesToCanonicalEntities(reimported.primitives, {
    idPrefix: "rt",
  });
}

function onlyPolyline(entities: CadEntity[]): Polyline {
  const found = entities.filter(
    (entity): entity is Polyline => entity.type === "polyline",
  );
  assert.equal(found.length, 1, "se espera exactamente una polilínea");
  return found[0];
}

/* ── 1. La primitiva DECLARA el cierre y no lo simula con un vértice ────── */

{
  const primitive = cadEntityToDxfPrimitive(polyline());
  assert.ok(primitive);
  assert.equal(
    primitive!.closed,
    true,
    "`closed` es explícito en la primitiva, no un vértice repetido",
  );
  assert.equal(
    primitive!.points.length,
    4,
    "cuatro vértices ÚNICOS: duplicar el primero añade un segmento nulo",
  );

  const open = cadEntityToDxfPrimitive(polyline({ closed: false }));
  assert.equal(open!.closed, false);
  assert.equal(open!.points.length, 4);
}

/* ── 2. El DXF lleva el bit 1 del grupo 70 ──────────────────────────────── */

{
  const closedDxf = exportCadDxf(
    { primitives: [cadEntityToDxfPrimitive(polyline())!] },
    { units: "mm" },
  ).content;
  assert.match(
    closedDxf,
    /\n\s*70\n\s*1\s*\n/,
    "un contorno cerrado debe emitir 70=1; con 70=0 AutoCAD lo abre",
  );
  assert.equal(
    (closedDxf.match(/\bVERTEX\b/g) ?? []).length,
    4,
    "cuatro VERTEX, sin el quinto duplicado",
  );

  const openDxf = exportCadDxf(
    { primitives: [cadEntityToDxfPrimitive(polyline({ closed: false }))!] },
    { units: "mm" },
  ).content;
  assert.match(
    openDxf,
    /\n\s*70\n\s*0\s*\n/,
    "un recorrido abierto debe emitir 70=0",
  );
}

/* ── 3. Round-trip completo: cerrado sigue cerrado ──────────────────────── */

{
  const result = onlyPolyline(roundTrip(polyline()));
  assert.equal(result.closed, true, "el cierre sobrevive el viaje completo");
  assert.equal(
    result.vertices.length,
    4,
    "y no gana un vértice por el camino",
  );
  assert.deepEqual(
    result.vertices.map((vertex) => [vertex.x, vertex.y]),
    [
      [0, 0],
      [1_000, 0],
      [1_000, 600],
      [0, 600],
    ],
    "coordenadas exactas y en el mismo orden",
  );
  assert.equal(result.layer, "MUROS", "la capa viaja con la entidad");
}

/* ── 4. Una polilínea ABIERTA cuyos extremos coinciden NO se cierra sola ── */

{
  // Éste es el caso que el canal lateral no podía distinguir: el cierre se
  // reinfería comparando primer y último punto, así que esta figura —abierta
  // por contrato, coincidente por geometría— volvía como cerrada y perdía su
  // último tramo.
  const touching = polyline({
    closed: false,
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 1_000, y: 0, z: 0 },
      { x: 1_000, y: 600, z: 0 },
      { x: 0, y: 0, z: 0 },
    ],
  });
  const result = onlyPolyline(roundTrip(touching));
  assert.equal(
    result.closed,
    false,
    "abierta por contrato sigue abierta aunque sus extremos coincidan",
  );
  assert.equal(
    result.vertices.length,
    4,
    "y conserva sus cuatro vértices, incluido el que repite el origen",
  );
}

/* ── 5. El bulge del tramo de CIERRE sobrevive ──────────────────────────── */

{
  // El último vértice de un contorno cerrado describe el tramo que vuelve al
  // primero. Al duplicar el primer vértice, ese arco quedaba descrito por una
  // copia del bulge inicial y el de cierre se perdía.
  const withClosingArc = polyline({
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 1_000, y: 0, z: 0 },
      { x: 1_000, y: 600, z: 0, bulge: 0.5 },
    ],
  });
  const primitive = cadEntityToDxfPrimitive(withClosingArc);
  assert.equal(
    primitive!.points.at(-1)?.bulge,
    0.5,
    "el bulge de cierre viaja en el ÚLTIMO vértice",
  );

  const dxf = exportCadDxf({ primitives: [primitive!] }, { units: "mm" }).content;
  assert.match(dxf, /\n\s*42\n\s*0?\.5\s*\n/, "el grupo 42 de cierre se emite");

  const result = onlyPolyline(roundTrip(withClosingArc));
  assert.equal(result.closed, true);
  assert.equal(result.vertices.length, 3);
  assert.equal(
    result.vertices[2].bulge,
    0.5,
    "y vuelve en el mismo vértice tras el round-trip",
  );
  assert.equal(
    result.vertices[0].bulge,
    undefined,
    "sin contaminar el primer vértice",
  );
}

/* ── 6. Un rectángulo no lleva un tramo final de longitud cero ──────────── */

{
  // `rect` es la degradación que el importador aplica a un contorno cerrado
  // rectangular sin arcos. Emitía 70=1 Y cinco vértices.
  const dxf = exportCadDxf(
    {
      primitives: [
        {
          kind: "rect",
          layer: "ZONAS",
          points: [
            { x: 0, y: 0 },
            { x: 400, y: 0 },
            { x: 400, y: 300 },
            { x: 0, y: 300 },
          ],
        },
      ],
    },
    { units: "mm" },
  ).content;
  assert.match(dxf, /\n\s*70\n\s*1\s*\n/, "el rectángulo es un contorno cerrado");
  assert.equal(
    (dxf.match(/\bVERTEX\b/g) ?? []).length,
    4,
    "cuatro vértices: el cierre lo declara el grupo 70, no un punto repetido",
  );
}

/* ── 7. Dentro de un BLOQUE rige la misma semántica ─────────────────────── */

{
  const dxf = exportCadDxf(
    {
      primitives: [],
      blocks: [
        {
          name: "MARCO",
          primitives: [cadEntityToDxfPrimitive(polyline())!],
        },
      ],
      inserts: [{ block: "MARCO", layer: "MUROS", x: 0, y: 0 }],
    },
    { units: "mm" },
  ).content;
  const blockSection = dxf.slice(
    dxf.indexOf("BLOCKS"),
    dxf.indexOf("ENTITIES"),
  );
  assert.match(
    blockSection,
    /\n\s*70\n\s*1\s*\n/,
    "la polilínea del bloque también se cierra con el grupo 70",
  );
  assert.equal(
    (blockSection.match(/\bVERTEX\b/g) ?? []).length,
    4,
    "y tampoco duplica su primer vértice",
  );
}

/* ── 8. El parser lee el bit 70 y NO lo reconvierte en vértice ──────────── */

{
  const dxf = exportCadDxf(
    { primitives: [cadEntityToDxfPrimitive(polyline())!] },
    { units: "mm" },
  ).content;
  const reimported = importDxfPrimitives(dxf);
  const primitive = reimported.primitives.find(
    (item) => item.kind === "polyline" || item.kind === "rect",
  );
  assert.ok(primitive, "el parser devuelve la polilínea");
  assert.equal(primitive!.closed, true, "con `closed` explícito");
  assert.equal(
    primitive!.points.length,
    4,
    "y sin volver a duplicar el primer vértice",
  );
}

console.log("dxf-closed-polyline.spec.ts OK");
