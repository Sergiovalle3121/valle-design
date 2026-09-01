/**
 * La exportación DWG de punta a punta, con el gate DELANTE del round-trip:
 *
 *   1. FALLO CERRADO: con los gates de producción (oráculo externo sin
 *      correr — §8.2), la exportación se RECHAZA aunque la bandera esté
 *      encendida, y los bloqueos nombran el oráculo y la OWNER ACTION.
 *   2. ROUND-TRIP (con gates inyectados como si el oráculo hubiera pasado):
 *      un documento del producto con el subconjunto §8.1 más un MURO (fuera
 *      del subconjunto) sale como «éxito con pérdidas», el muro está en el
 *      manifiesto POR SU NOMBRE de tipo, y `readDwg` relee el archivo con
 *      las entidades escribibles y sus coordenadas intactas.
 *   3. RECHAZO por vacío: un documento sin entidades escribibles no produce
 *      archivo — un DWG vacío que dice ser tu plano es peor que un error.
 */
import assert from "node:assert/strict";
import { readDwg } from "@valle-design/dwg-codec";
import type { CadDocument } from "./cad-document";
import {
  exportCadDocumentToDwg,
  preflightCadDwgExport,
} from "./dwg-native-writer";
import { DWG_EXPORT_FLAG, dwgBetaExportIsEnabled } from "./dwg-export-flag";

const ORACLE_PASSED = Object.freeze({
  publicWriterExists: true,
  externalOracleVerified: true,
});

function baseDocument(entities: CadDocument["entities"]): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MURO", name: "MURO", color: "#f87171", visible: true, locked: false },
    ],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as CadDocument;
}

const mixedDocument = baseDocument([
  { id: "l1", type: "line", start: { x: 100, y: 200, z: 0 }, end: { x: 900, y: 200, z: 0 }, layer: "0" },
  { id: "c1", type: "circle", center: { x: 500, y: 500, z: 0 }, radius: 150, layer: "0" },
  { id: "a1", type: "arc", center: { x: 800, y: 800, z: 0 }, radius: 90, startAngle: 0, endAngle: 180, layer: "0" },
  {
    id: "w1",
    type: "wall",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 3_000, y: 0, z: 0 },
    thickness: 250,
    height: 2_400,
    layer: "MURO",
    material: "brick",
  },
] as CadDocument["entities"]);

// 1 · FALLO CERRADO con los gates reales de producción.
{
  assert.equal(DWG_EXPORT_FLAG, false, "la bandera nace apagada");
  assert.equal(dwgBetaExportIsEnabled(true), false, "bandera sin oráculo = cerrado");
  const rejected = exportCadDocumentToDwg(mixedDocument, { betaFlagOn: true });
  assert.equal(rejected.estado, "rechazado");
  assert.equal(rejected.motivo, "gate_cerrado");
  assert.ok(
    rejected.bloqueos.some((blocker) => /ODA File Converter/.test(blocker) && /OWNER ACTION/.test(blocker)),
    "el bloqueo nombra el oráculo externo y la OWNER ACTION",
  );
  // El preflight informa aunque el gate esté cerrado: la interfaz puede
  // enseñar qué viajaría el día que el oráculo pase.
  assert.equal(rejected.preflight.writableCount, 3);
  assert.deepEqual(rejected.preflight.unwritableByType, { wall: 1 });
}

// 2 · ROUND-TRIP con el oráculo inyectado como pasado.
{
  const result = exportCadDocumentToDwg(mixedDocument, {
    betaFlagOn: true,
    gates: ORACLE_PASSED,
  });
  assert.equal(result.estado, "exito_con_perdidas", "el muro no viaja y se DICE");
  assert.ok(result.bytes.length > 500, "el archivo tiene contenido real");
  assert.ok(
    result.manifiestoDePerdidas.some(
      (entry) => /wall/i.test(`${entry.sourceType} ${entry.detail}`),
    ),
    `el manifiesto nombra al muro: ${JSON.stringify(result.manifiestoDePerdidas)}`,
  );

  const reread = readDwg(result.bytes);
  const kinds = reread.modelSpaceEntities.map((record) => record.entity.kind).sort();
  assert.deepEqual(kinds, ["arc", "circle", "line"], "releído: exactamente lo escribible");
  const line = reread.modelSpaceEntities.find(
    (record) => record.entity.kind === "line",
  )!.entity;
  assert.ok("start" in line && "end" in line, "la línea releída trae sus puntos");
  const start = (line as { start: { x: number; y: number } }).start;
  const end = (line as { end: { x: number; y: number } }).end;
  assert.ok(Math.abs(start.x - 100) < 1e-6 && Math.abs(start.y - 200) < 1e-6, "coordenadas de inicio intactas");
  assert.ok(Math.abs(end.x - 900) < 1e-6 && Math.abs(end.y - 200) < 1e-6, "coordenadas de fin intactas");

  // `readDwg` es el códec crudo: NO convierte grados↔radianes (ver el
  // comentario de `toCanonicalEntity` en dwg-native-writer.ts) — lee EXACTAMENTE
  // lo que el writer escribió en el campo de ángulo, en RADIANES. El
  // documento del producto guarda 180° (`mixedDocument` arriba); si el
  // writer los escribiera crudos como si ya fueran radianes (el bug que
  // esto cierra), este valor releído sería 180, no π. `check:dwg` prohíbe
  // que este archivo importe el adaptador de LECTURA (ADR-0009 §6/§8, ver
  // scripts/dwg/check-product-boundary.mjs), así que la prueba se queda del
  // lado del códec crudo en vez de cruzar esa frontera.
  const arcRecord = reread.modelSpaceEntities.find(
    (record) => record.entity.kind === "arc",
  )!.entity as { startAngle: number; endAngle: number };
  assert.ok(
    Math.abs(arcRecord.startAngle - 0) < 1e-9,
    `startAngle crudo: ${arcRecord.startAngle} rad (esperado 0)`,
  );
  assert.ok(
    Math.abs(arcRecord.endAngle - Math.PI) < 1e-9,
    `endAngle crudo: ${arcRecord.endAngle} rad (esperado π ≈ ${Math.PI}; ` +
      `180 crudo delataría el bug de grados-como-radianes)`,
  );
}

// 3 · RECHAZO por documento sin nada escribible.
{
  const onlyWalls = baseDocument([
    {
      id: "w2",
      type: "wall",
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1_000, y: 0, z: 0 },
      thickness: 200,
      height: 2_400,
      layer: "MURO",
      material: "brick",
    },
  ] as CadDocument["entities"]);
  const rejected = exportCadDocumentToDwg(onlyWalls, {
    betaFlagOn: true,
    gates: ORACLE_PASSED,
  });
  assert.equal(rejected.estado, "rechazado");
  assert.equal(rejected.motivo, "sin_entidades_escribibles");
}

// 4 · El preflight solo no escribe nada (pura consulta).
{
  const preflight = preflightCadDwgExport(mixedDocument);
  assert.equal(preflight.writableCount, 3);
  assert.deepEqual(preflight.unwritableByType, { wall: 1 });
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · LA FRONTERA DE ÁNGULO documento ↔ DWG, a 37,5°
   ══════════════════════════════════════════════════════════════════════════

   Esta comprobación pertenece a la OLA 1.4 de la campaña de lanzamiento —una
   prueba de ida y vuelta por CADA frontera donde un ángulo cambia de
   subsistema— y vive AQUÍ, no en `verification/angle-frontiers.spec.ts`, por
   una razón que no es de comodidad: ADR-0009 autoriza a importar el códec y
   el punto de escritura sólo a estos dos módulos y a sus specs. El primer
   intento la escribió en la suite de verificación y `check:dwg` lo rechazó,
   con razón. La frontera clean-room no se ensancha para acomodar una prueba;
   la prueba se muda a donde la política ya la permite.

   Por qué 37,5°: es el ángulo que delata la confusión grados↔radianes sin
   ambigüedad. El documento del producto guarda GRADOS; el canónico del
   laboratorio espera RADIANES. Antes de la campaña de paridad el lado de
   ESCRITURA no convertía, y un arco de 180° salía escrito como «180» en un
   campo que el formato lee como radianes (≈10,31°, envuelto).                */

{
  const DEG = 37.5;
  const RAD = 0.6544984694978736;
  const arcDocument = baseDocument([
    {
      id: "arc-frontera",
      type: "arc",
      center: { x: 0, y: 0, z: 0 },
      radius: 50,
      startAngle: DEG,
      endAngle: DEG + 90,
      layer: "0",
    },
  ] as CadDocument["entities"]);

  // El candado primero: con los gates REALES esto no exporta, y así se queda
  // para el lanzamiento (OLA 3.4).
  const locked = exportCadDocumentToDwg(arcDocument, { betaFlagOn: true });
  assert.equal(locked.estado, "rechazado");
  assert.equal(locked.motivo, "gate_cerrado");

  const written = exportCadDocumentToDwg(arcDocument, {
    betaFlagOn: true,
    gates: ORACLE_PASSED,
  });
  assert.ok(
    written.estado === "exito" || written.estado === "exito_con_perdidas",
    `con el oráculo inyectado el arco se escribe (${written.estado})`,
  );
  assert.ok("bytes" in written, "la exportación con oráculo entrega bytes");

  // `readDwg` es el códec CRUDO: no convierte nada, así que el número que
  // salga es literalmente el que el writer puso en el archivo.
  const reread = readDwg((written as { bytes: Uint8Array }).bytes);
  const arc = reread.modelSpaceEntities.find(
    (record) => record.entity.kind === "arc",
  )!.entity as { startAngle: number; endAngle: number };

  assert.ok(
    Math.abs(arc.startAngle - RAD) < 1e-9,
    `el DWG guarda 37,5° como ${RAD} RADIANES (obtenido ${arc.startAngle}): un 37.5 crudo aquí sería el defecto de vuelta`,
  );
  assert.ok(
    Math.abs(arc.startAngle - DEG) > 30,
    "y el valor escrito no se parece en nada al grado, que es por lo que 37,5° delata la confusión",
  );
  assert.ok(
    Math.abs(arc.endAngle - ((DEG + 90) * Math.PI) / 180) < 1e-9,
    "y el ángulo final también viaja en radianes",
  );
}

// ─── 2.F: el estado y el tipo de línea de la capa LLEGAN al archivo ────────
// Antes de este corte el adaptador mapeaba las capas como {id, name, color,
// visible, locked} y dejaba `styles` vacío, así que una capa CONGELADA se
// exportaba descongelada y una de ejes con TRAZOS salía continua, las dos EN
// SILENCIO. No era una limitación del códec —que ya sabe escribir ambas— sino
// de este adaptador, que las tiraba antes de que el códec las viera.
{
  const conCapas: CadDocument = {
    ...baseDocument([
      {
        id: "l1",
        type: "line",
        layer: "EJES",
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      } as never,
    ]),
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "CONGELADA", name: "CONGELADA", color: "#00ffff", visible: true, locked: false, frozen: true },
      { id: "BLOQUEADA", name: "BLOQUEADA", color: "#0000ff", visible: true, locked: true },
      { id: "EJES", name: "EJES", color: "#ffff00", visible: true, locked: false, linetype: "TRAZOS" },
      { id: "FANTASMA", name: "FANTASMA", color: "#ff00ff", visible: true, locked: false, linetype: "NO_DEFINIDO" },
    ],
    // Los valores son los del corpus real (`04-capas`), no unos inventados.
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {}, linetype: { TRAZOS: { pattern: [0.75, -0.25] } } },
  };

  const exported = exportCadDocumentToDwg(conCapas, {
    betaFlagOn: true,
    gates: ORACLE_PASSED,
  });
  // `assert.equal` sobre `estado` estrecha la unión: la rama de rechazo no
  // lleva bytes, y es el mismo modismo que usa el bloque de arriba.
  assert.equal(exported.estado, "exito_con_perdidas", "FANTASMA no tiene patrón: se DICE");
  const written = readDwg(exported.bytes);
  const nombre = (bytes: readonly number[]): string => String.fromCharCode(...bytes);
  const capa = (id: string) => written.layers.find((l) => nombre(l.name) === id);

  assert.equal(capa("CONGELADA")?.frozen, true, "una capa congelada se exporta congelada");
  assert.equal(capa("BLOQUEADA")?.locked, true, "una capa bloqueada se exporta bloqueada");
  assert.equal(capa("EJES")?.linetypeName, "TRAZOS", "la capa de ejes conserva su tipo de línea");
  assert.ok(
    written.tables?.linetypes.some((e) => nombre(e.name) === "TRAZOS"),
    "y el archivo lleva la entrada LTYPE con su patrón, no sólo el nombre",
  );
  // Lo que el documento NOMBRA pero no DEFINE cae a Continuous y SE DICE: la
  // diferencia entre «no sé» y un dato falso.
  assert.equal(capa("FANTASMA")?.linetypeName, "Continuous");
  assert.ok(
    exported.manifiestoDePerdidas.some(
      (loss) => loss.code === "layer-linetype-not-writable" && loss.detail.includes("FANTASMA"),
    ),
    "la capa sin patrón definido se nombra en el manifiesto que ve el usuario",
  );
}

// ─── 5.A: la ELIPSE llega al archivo, y con su arco en RADIANES ───────────
// El writer del laboratorio la emitía desde hacía olas, pero el camino PÚBLICO
// (`canonical-to-dwg.ts`) la mandaba al `default` y la declaraba no escribible,
// así que `DWG_EXPORT_WRITABLE_TYPES` la excluía con razón. Al enrutarla hubo
// que resolver una trampa de unidades: `startParameter`/`endParameter` están en
// GRADOS en el documento del producto y en RADIANES en el canónico, así que
// pasarlos crudos habría exportado TODA elipse recortada con el arco
// equivocado, en silencio. Por eso la prueba usa un cuarto de elipse y no una
// entera: una vuelta completa disimularía justo ese fallo.
{
  const conElipse: CadDocument = {
    ...baseDocument([]),
    entities: [
      {
        id: "el1",
        type: "ellipse",
        center: { x: 100, y: 50, z: 0 },
        majorAxis: { x: 40, y: 0, z: 0 },
        ratio: 0.5,
        startParameter: 0,
        endParameter: 90,
        layer: "0",
      } as never,
    ],
    modelSpace: { entityIds: ["el1"] },
  };

  const exportada = exportCadDocumentToDwg(conElipse, {
    betaFlagOn: true,
    gates: ORACLE_PASSED,
  });
  assert.equal(exportada.estado, "exito_con_perdidas", "la extrusión que no viaja se declara");
  const leida = readDwg(exportada.bytes);
  const elipse = leida.modelSpaceEntities.find((r) => r.entity.kind === "ellipse");
  assert.ok(elipse, "la elipse llega al archivo, ya no se declara no escribible");
  if (elipse?.entity.kind !== "ellipse") throw new Error("inalcanzable");
  assert.ok(Math.abs(elipse.entity.center.x - 100) < 1e-9, "el centro viaja");
  assert.ok(Math.abs(elipse.entity.majorAxisEndpoint.x - 40) < 1e-9, "el eje mayor viaja");
  assert.ok(Math.abs(elipse.entity.axisRatio - 0.5) < 1e-9, "la razón de ejes viaja");
  assert.ok(
    Math.abs(elipse.entity.endAngle - Math.PI / 2) < 1e-9,
    "y 90 GRADOS del producto salen como π/2 RADIANES, no como 90 radianes",
  );
  assert.ok(
    exportada.manifiestoDePerdidas.some((p) => p.code === "ellipse-extrusion-not-carried"),
    "y lo único que se pierde —el plano de la elipse— se nombra en el manifiesto",
  );
  assert.ok(
    !exportada.manifiestoDePerdidas.some((p) => p.code === "canonical-type-not-writable"),
    "y ya NO se declara no escribible: eso sería el guardián de una carencia cerrada",
  );
}

console.log(
  "dwg-native-writer.spec: gate cerrado hasta el oráculo, round-trip íntegro, " +
    "pérdidas con nombre, la frontera de ángulo documento↔DWG a 37,5° y el estado " +
    "y el tipo de línea de cada capa llegando al archivo exportado, más la ELIPSE " +
    "escrita con su arco convertido a radianes y su extrusión declarada",
);
