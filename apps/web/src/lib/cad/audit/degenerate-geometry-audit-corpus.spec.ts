/**
 * AUDIT contra el corpus de geometría degenerada — sin engordar el corpus.
 *
 * `../degenerate-geometry-corpus.spec.ts` ya fija, caso por caso, cuáles
 * defectos el motor de dibujo CORRIGE, cuáles RECHAZA y cuáles DEGRADA
 * (los conserva, sin dibujar nada, con la pérdida declarada). Este archivo
 * vive aparte —y no como una familia más de aquel— porque el corpus está
 * bajo el techo de 800 líneas de `check-monolith-budget.mjs`: añadirle
 * casos lo pasaba de 763 a 832, y la disciplina del repositorio es dividir,
 * no ampliar el manifiesto de excepciones sin razón escrita.
 *
 * Lo que se prueba aquí toma como INSUMO exactamente las mismas entidades
 * que esos casos ya fijaron —mismos ids, mismas coordenadas, citados por el
 * id del caso original— y comprueba la mitad que el corpus no cubre: que
 * AUDIT los detecta con nombre y que su reparación los QUITA, dejando cero
 * defectos en una segunda pasada. Es la prueba de que AUDIT es la capa que
 * finalmente actúa sobre lo que el motor de dibujo, con razón, sólo degrada.
 */
import assert from "node:assert/strict";
import type { CadEntity } from "../cad-document";
import { cadAuditGeometryRepairCommands, detectCadAuditGeometryDefects } from "./geometry";
import { cadAuditReferenceRepairCommands, detectCadAuditReferenceDefects } from "./references";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/** Detecta, repara y comprueba que una segunda pasada no encuentra nada. */
function verifyGeometryFixIsClean(entity: CadEntity, expectedKind: string) {
  const before = detectCadAuditGeometryDefects([entity]);
  ok(before.length === 1 && before[0].kind === expectedKind, `${entity.id}: AUDIT lo detecta como ${expectedKind}`);
  const repair = cadAuditGeometryRepairCommands(before);
  assert.deepEqual(repair, [{ type: "delete", entityId: entity.id }]);
  checks += 1;
  const survivors = [entity].filter((candidate) => candidate.id !== entity.id);
  ok(detectCadAuditGeometryDefects(survivors).length === 0, `${entity.id}: repararlo deja el dibujo limpio`);
}

// Mismo tramo que "longitud-cero/tramo-en-el-cosido": OVERKILL no lo ve
// (no es un duplicado), y ni HATCH lo trata como contorno abierto — pero
// tampoco aporta nada al dibujo, y AUDIT es quien finalmente lo dice y lo quita.
verifyGeometryFixIsClean(
  { id: "z", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 0 }, layer: "0" },
  "zero-length-line",
);

// Mismo CIRCLE de "radio-cero/circulo": el motor lo conserva archivado en su
// centro sin dibujar nada (degrada, y con razón: sigue siendo su posición
// real). AUDIT es la capa que, cuando se pide, lo retira del documento.
verifyGeometryFixIsClean(
  { id: "c0", type: "circle", center: { x: 300, y: 300, z: 0 }, radius: 0, layer: "0" },
  "zero-radius-circle",
);

// Mismo ARC de "radio-cero/arco".
verifyGeometryFixIsClean(
  { id: "a0", type: "arc", center: { x: 1000, y: 1000, z: 0 }, radius: 0, startAngle: 0, endAngle: 90, layer: "0" },
  "zero-radius-arc",
);

// Mismo caso de "radio-cero/elipse-razon-nula": razón 0, eje mayor real.
verifyGeometryFixIsClean(
  {
    id: "e0", type: "ellipse", center: { x: 77, y: 33, z: 0 }, majorAxis: { x: 10, y: 0, z: 0 },
    ratio: 0, startParameter: 0, endParameter: 360, layer: "0",
  },
  "degenerate-ellipse",
);

// Mismo caso de "radio-cero/spline-sin-curva": un solo punto de control.
verifyGeometryFixIsClean(
  { id: "s1", type: "spline", degree: 3, controlPoints: [{ x: 500, y: 500, z: 0 }], knots: [], layer: "0" },
  "degenerate-spline",
);

// Mismo caso de "duplicados/todos-los-vertices-iguales": los cuatro vértices
// son el mismo punto. `stitchCadBoundaryPaths` no fabrica un polígono de área
// nula (cero anillos); AUDIT nombra la POLYLINE entera como degenerada.
verifyGeometryFixIsClean(
  {
    id: "p", type: "polyline", closed: true,
    vertices: [{ x: 5, y: 5, z: 0 }, { x: 5, y: 5, z: 0 }, { x: 5, y: 5, z: 0 }, { x: 5, y: 5, z: 0 }],
    layer: "0",
  },
  "degenerate-polyline",
);

// --- referencias colgantes: mismo criterio, entidades nuevas -----------------
// (el corpus de geometría degenerada no cubre referencias entre entidades;
// esto usa el mismo módulo audit/references.ts que la familia de specs propia).

{
  const opening = { id: "o1", type: "opening", hostId: "muro-inexistente", layer: "0" } as unknown as CadEntity;
  const before = detectCadAuditReferenceDefects({ entities: [opening], blocks: [] });
  ok(before.length === 1 && before[0].kind === "orphan-opening", "AUDIT detecta el OPENING sin muro anfitrión");
  const repair = cadAuditReferenceRepairCommands(before);
  assert.deepEqual(repair, [{ type: "delete", entityId: "o1" }]);
  checks += 1;
  const survivors = [opening].filter((entity) => entity.id !== "o1");
  ok(detectCadAuditReferenceDefects({ entities: survivors, blocks: [] }).length === 0, "repararlo deja el dibujo limpio");
}

console.log(`audit/degenerate-geometry-audit-corpus.spec: ${checks} comprobaciones OK`);
