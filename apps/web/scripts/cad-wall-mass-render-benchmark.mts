#!/usr/bin/env node
/**
 * Rendimiento y memoria del volumen 3D nativo de muros y masas
 * arquitectónicas (Corte E, campaña 3D-M1) — `CadWallSolidHost`/
 * `CadArchitecturalMassHost`.
 *
 * NINGÚN benchmark existente en el repo toca este camino. El generador de
 * corpus de `cad-render-benchmark.mts`/`cad-perf-scale.mts` excluye `wall`/
 * `opening` a propósito —`corpus-mixes.ts` fija `wall: 0` porque el corpus
 * determinista está versionado por hash, y emitir muros cambiaría esos
 * hashes— y `performance.architecture-100k` de la rúbrica mide OTRO camino
 * por completo: muros como polilínea 2D + puertas/ventanas como INSERT
 * repetido, la representación heredada, no la entidad `wall` nativa que
 * consumen estos dos anfitriones. Este script existe para tener AL MENOS
 * una medición honesta de lo que hoy no tiene ninguna.
 *
 * ## Por qué la escala es de decenas/centenas, no de 100k
 *
 * Un muro es un elemento ESTRUCTURAL, no una primitiva diminuta: un edificio
 * grande de verdad tiene del orden de cientos de muros, no cientos de miles.
 * Pedir 100k aquí mediría algo que ningún documento real va a tener nunca.
 * La huella se genera como una retícula de R×C locales que comparten pared
 * —igual que un edificio real, no muros sueltos sin relación—, con (R+1)·C
 * segmentos horizontales y (C+1)·R verticales.
 *
 * ## Qué mide cada número
 *
 *  - `coldSyncMs`: construir TODO desde un anfitrión vacío (abrir el plano
 *    por primera vez).
 *  - `materialEditSyncMs`: cambiar el MATERIAL de un solo muro (nueva
 *    referencia de entidad, geometría idéntica) — desde el commit que cierra
 *    esta pieza, `CadWallSolidHost` lo resuelve recoloreando el sólido ya
 *    construido, no retesellando el B-rep. Si este número se acercara a
 *    `coldSyncMs`, sería la señal de que ese camino rápido se rompió.
 *  - `geometryEditSyncMs`: cambiar el GROSOR de un solo muro — esto SÍ tiene
 *    que retesellar (una malla distinta), pero sólo la de ESE muro: el
 *    resto de la retícula no debería pagar nada.
 *  - `massRebuildMs`: `CadArchitecturalMassHost` tras la misma edición de
 *    grosor. Es TODO-o-NADA por diseño —las tres losas se reconstruyen
 *    juntas en cuanto cualquier muro cambia, nunca una a medias, fijado por
 *    su propio spec (`room-solid-host.spec.ts`)— así que este número mide el
 *    COSTO de esa decisión, no un defecto: cuantifica lo que costaría
 *    afinarla si algún día se decide hacerlo.
 *  - `disposeLeavesZero`: tras `dispose()`, ni el mapa interno de cada
 *    anfitrión ni el grupo de Three.js retienen nada — la comprobación de
 *    fuga que SÍ se puede hacer sin un contexto WebGL real (JS, no GPU).
 *  - `approximateHeapDeltaBytes`: `process.memoryUsage().heapUsed` antes y
 *    después del build en frío, mismo patrón que `cad-perf-scale.mts`. Es
 *    heap de JS (entidades, geometría empaquetada, atributos de Three.js
 *    ANTES de subir a GPU) — no VRAM, que Node no puede medir sin un
 *    contexto real.
 */
import { writeFileSync } from "node:fs";
import { CadWallSolidHost } from "../src/components/cad/viewport/wall-solid-host";
import { CadArchitecturalMassHost } from "../src/components/cad/viewport/room-solid-host";
import type { CadDocument } from "../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../src/lib/cad/cad-document-shared";
import type { CadWallEntity } from "../src/lib/cad/cad-entities-v6";

const CELL_SIZE_MM = 4_000;
const WALL_THICKNESS_MM = 150;
const WALL_HEIGHT_MM = 2_700;

function buildGridWalls(rows: number, cols: number): CadWallEntity[] {
  const walls: CadWallEntity[] = [];
  let n = 0;
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const y = r * CELL_SIZE_MM;
      walls.push({
        id: `wh-${n++}`,
        type: "wall",
        start: { x: c * CELL_SIZE_MM, y, z: 0 },
        end: { x: (c + 1) * CELL_SIZE_MM, y, z: 0 },
        thickness: WALL_THICKNESS_MM,
        height: WALL_HEIGHT_MM,
        layer: "0",
      });
    }
  }
  for (let c = 0; c <= cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const x = c * CELL_SIZE_MM;
      walls.push({
        id: `wv-${n++}`,
        type: "wall",
        start: { x, y: r * CELL_SIZE_MM, z: 0 },
        end: { x, y: (r + 1) * CELL_SIZE_MM, z: 0 },
        thickness: WALL_THICKNESS_MM,
        height: WALL_HEIGHT_MM,
        layer: "0",
      });
    }
  }
  return walls;
}

function documentWith(walls: readonly CadWallEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#94a3b8", visible: true, locked: false }],
    entities: [...walls],
    history: [],
    modelSpace: { entityIds: walls.map((wall) => wall.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

function timeMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

const viewport = { scale: 0.001, width: 200_000, height: 200_000 };

function measure(rows: number, cols: number) {
  const walls = buildGridWalls(rows, cols);
  const doc = documentWith(walls);

  const wallHost = new CadWallSolidHost(() => viewport);
  const massHost = new CadArchitecturalMassHost(() => viewport);

  const heapBefore = process.memoryUsage().heapUsed;
  const coldWallSyncMs = timeMs(() => wallHost.sync(doc, new Set()));
  const coldMassSyncMs = timeMs(() => massHost.sync(doc));
  const heapAfter = process.memoryUsage().heapUsed;

  const wallCountAfterCold = wallHost.count;
  const massCountAfterCold = massHost.count;

  // Edición de un solo muro, sólo material: la geometría no debe retesellarse.
  const materialEdited = walls.map((wall, index) =>
    index === 0 ? { ...wall, material: "brick" as const } : wall,
  );
  const materialDoc = documentWith(materialEdited);
  const materialEditSyncMs = timeMs(() => wallHost.sync(materialDoc, new Set()));

  // Edición de un solo muro, GROSOR: sí retesella, pero sólo ese muro.
  const geometryEdited = materialEdited.map((wall, index) =>
    index === 0 ? { ...wall, thickness: wall.thickness + 50 } : wall,
  );
  const geometryDoc = documentWith(geometryEdited);
  const geometryEditSyncMs = timeMs(() => wallHost.sync(geometryDoc, new Set()));
  const massRebuildMs = timeMs(() => massHost.sync(geometryDoc));

  const wallCountAfterEdits = wallHost.count;
  const massCountAfterEdits = massHost.count;

  wallHost.dispose();
  massHost.dispose();
  const disposeLeavesZero =
    wallHost.count === 0 &&
    massHost.count === 0 &&
    wallHost.group.children.length === 0 &&
    massHost.group.children.length === 0;

  return {
    rows,
    cols,
    wallCount: walls.length,
    coldWallSyncMs: Number(coldWallSyncMs.toFixed(3)),
    coldMassSyncMs: Number(coldMassSyncMs.toFixed(3)),
    materialEditSyncMs: Number(materialEditSyncMs.toFixed(3)),
    geometryEditSyncMs: Number(geometryEditSyncMs.toFixed(3)),
    massRebuildMs: Number(massRebuildMs.toFixed(3)),
    materialEditSpeedupVsCold:
      materialEditSyncMs > 0
        ? Number((coldWallSyncMs / materialEditSyncMs).toFixed(1))
        : null,
    wallCountAfterCold,
    massCountAfterCold,
    wallCountAfterEdits,
    massCountAfterEdits,
    disposeLeavesZero,
    approximateHeapDeltaBytes: Math.max(0, heapAfter - heapBefore),
  };
}

const scales: Array<[number, number]> = [
  [3, 3],
  [10, 10],
  [20, 20],
];
const reports = scales.map(([rows, cols]) => measure(rows, cols));

const brokenFastPath = reports.find(
  (report) => report.materialEditSpeedupVsCold !== null && report.materialEditSpeedupVsCold < 3,
);
const disposeFailed = reports.find((report) => !report.disposeLeavesZero);

const conclusion = disposeFailed
  ? `ROTO: dispose() de la retícula ${disposeFailed.rows}×${disposeFailed.cols} (${disposeFailed.wallCount} muros) no deja ambos anfitriones en cero — hay una fuga de bookkeeping JS.`
  : brokenFastPath
    ? `DEGRADADO: en la retícula ${brokenFastPath.rows}×${brokenFastPath.cols} editar sólo el MATERIAL de un muro (${brokenFastPath.materialEditSyncMs} ms) no es notablemente más rápido que reconstruir todo en frío (${brokenFastPath.coldWallSyncMs} ms) — el camino de recoloreado sin retesellar puede haberse roto.`
    : `OK: el camino de recoloreado (selección/material) evita retesellar en las tres escalas medidas — ver \`materialEditSpeedupVsCold\` por reporte. \`massRebuildMs\` confirma el costo, ya conocido y fijado por su propio spec, del rediseño todo-o-nada de piso/cielorraso/cubierta ante CUALQUIER cambio de muro; no es un defecto de esta pieza, es lo que costaría afinarlo si se decide hacerlo. \`disposeLeavesZero\` es true en las tres escalas: sin fuga de bookkeeping JS detectable sin un contexto WebGL real.`;

const summary = {
  generatedBy: "apps/web/scripts/cad-wall-mass-render-benchmark.mts",
  node: process.version,
  conclusion,
  reports,
};

const target = process.argv[2];
const json = JSON.stringify(summary, null, 2);
if (target) writeFileSync(target, `${json}\n`);
else process.stdout.write(`${json}\n`);
