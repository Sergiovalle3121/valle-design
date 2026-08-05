/**
 * NOMBRES DE APLICACIÓN XDATA — lectura bidireccional.
 *
 * El producto pasó a llamarse Valle Design y el exportador emite VALLE_DIM /
 * VALLE_MLEADER / VALLE_BLOCK. Los archivos DXF exportados antes del cambio
 * llevan los nombres anteriores DENTRO de los bytes y están en discos de
 * clientes: el importador tiene que seguir leyéndolos con la MISMA semántica.
 *
 * Este spec cubre las dos direcciones sobre el mismo dibujo:
 *   1. lo que se escribe hoy lleva sólo los nombres vigentes;
 *   2. el mismo archivo con los nombres anteriores importa idéntico.
 *
 * Complementa a `dxf-xdata-golden.spec.ts`, que congela bytes REALES ya
 * exportados: aquel prueba que se leen; éste prueba que la equivalencia es
 * exacta y que el exportador ya no reintroduce el nombre retirado.
 */
import { strict as assert } from "node:assert";
import {
  DXF_XDATA_APPS,
  LEGACY_DXF_XDATA_APPS,
  isDxfXdataApp,
} from "@valle-design/contracts";
import { exportCadDxf } from "./dxf-export";
import { importDxfPrimitives } from "./dxf-import";

/* ── El predicado acepta el nombre vigente y el histórico, y nada más ────── */
assert.ok(isDxfXdataApp("dimension", "VALLE_DIM"));
assert.ok(isDxfXdataApp("dimension", "AXOS_DIM"));
assert.equal(isDxfXdataApp("dimension", "VALLE_MLEADER"), false);
assert.ok(isDxfXdataApp("mleader", "VALLE_MLEADER"));
assert.ok(isDxfXdataApp("mleader", "AXOS_MLEADER"));
assert.ok(isDxfXdataApp("block", "VALLE_BLOCK"));
assert.ok(isDxfXdataApp("block", "AXOS_BLOCK"));
assert.equal(isDxfXdataApp("block", "ACAD"), false);

/* ── Un dibujo con las tres clases de metadato semántico ─────────────────── */
const drawing = exportCadDxf(
  {
    layers: [{ name: "MUROS" }, { name: "COTAS" }, { name: "NOTAS" }],
    semanticDimensions: [
      {
        layer: "COTAS",
        dimensionKind: "aligned",
        a: { x: 0, y: 0 },
        b: { x: 3200, y: 0 },
        offset: 250,
        style: "Architectural",
        units: "mm",
      },
    ],
    mleaders: [
      {
        layer: "NOTAS",
        text: "Muro de carga",
        textPosition: { x: 900, y: 700, z: 0 },
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 800, y: 600, z: 0 },
        ],
        leaderLines: [
          [
            { x: 0, y: 0, z: 0 },
            { x: 800, y: 600, z: 0 },
          ],
        ],
      },
    ],
    blocks: [
      {
        name: "PILAR",
        primitives: [
          {
            kind: "line",
            layer: "MUROS",
            points: [
              { x: 0, y: 0 },
              { x: 300, y: 0 },
            ],
          },
        ],
        attributes: { TAG: { defaultValue: "P-1", prompt: "Tag" } },
      },
    ],
    inserts: [
      { block: "PILAR", x: 1000, y: 0, layer: "MUROS", attributes: { TAG: "P-7" } },
    ],
  },
  { units: "mm" },
);

/* ── 1. Lo que se escribe hoy no reintroduce el nombre retirado ──────────── */
for (const application of DXF_XDATA_APPS) {
  assert.ok(
    drawing.content.includes(application),
    application + " debe registrarse y marcar la XDATA del archivo exportado",
  );
}
for (const legacy of LEGACY_DXF_XDATA_APPS) {
  assert.equal(
    drawing.content.includes(legacy),
    false,
    legacy + " no puede volver a escribirse en un archivo nuevo",
  );
}

/* ── 2. El mismo archivo con los nombres anteriores importa idéntico ─────── */
// Sustitución exacta nombre a nombre: el resto de los bytes no se toca, así
// que cualquier diferencia posterior sólo puede venir de la marca XDATA.
let historic = drawing.content;
for (let index = 0; index < DXF_XDATA_APPS.length; index += 1) {
  historic = historic.split(DXF_XDATA_APPS[index]).join(LEGACY_DXF_XDATA_APPS[index]);
}
assert.notEqual(historic, drawing.content, "la sustitución tiene que aplicarse");
for (const application of DXF_XDATA_APPS) {
  assert.equal(historic.includes(application), false);
}

const current = importDxfPrimitives(drawing.content);
const legacyRead = importDxfPrimitives(historic);

assert.deepEqual(current.warnings, [], "el archivo actual importa sin avisos");
assert.deepEqual(
  legacyRead.warnings,
  [],
  "el archivo histórico importa sin avisos",
);
// La comparación completa es lo que hace útil al spec: no basta con contar
// entidades, un nombre mal enrutado devolvería la cota vacía en vez de fallar.
assert.deepEqual(legacyRead.semanticDimensions, current.semanticDimensions);
assert.deepEqual(legacyRead.mleaders, current.mleaders);
assert.deepEqual(legacyRead.blocks, current.blocks);
assert.deepEqual(legacyRead.inserts, current.inserts);
assert.deepEqual(legacyRead.primitives, current.primitives);

// Y la semántica llegó de verdad, no es un "vacío == vacío".
assert.equal(current.semanticDimensions.length, 1);
assert.equal(current.semanticDimensions[0].dimensionKind, "aligned");
assert.equal(current.mleaders.length, 1);
assert.equal(current.mleaders[0].text, "Muro de carga");
assert.equal(current.blocks.length, 1);
assert.equal(current.blocks[0].attributes.TAG?.defaultValue, "P-1");
assert.equal(current.inserts.length, 1);
assert.deepEqual(current.inserts[0].attributes, { TAG: "P-7" });

console.log(
  "dxf-xdata-app-names: se escribe VALLE_*, se leen VALLE_* y los nombres históricos",
);
