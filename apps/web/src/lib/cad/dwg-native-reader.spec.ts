/**
 * `dwg-native-reader.ts`: el único punto del producto que toca el códec DWG
 * propio en runtime, probado de punta a punta con bytes DWG REALES.
 *
 * El harness escribe un AC1015 100% con el propio writer del laboratorio
 * (`writeDwg`, ya validado por oráculo externo dentro de `dwg-codec`), lo
 * pasa por `readDwgNeutralDatabase` —el adaptador— y verifica que el perfil
 * de beta `AC1015_MODELSPACE_2D_V3` llega completo, que lo que el
 * laboratorio SÍ decodifica pero el perfil no cubre se declara como
 * diagnóstico (nunca como pérdida silenciosa ni como "no decodificado", que
 * sería falso), que el puente ya probado lo proyecta al documento canónico,
 * y que otra versión reconocida se rechaza nombrando la versión detectada en
 * vez de decir "archivo corrupto".
 *
 * No usa ningún fixture del corpus privado: los bytes nacen y mueren en este
 * proceso, así que no hay derechos que pedir ni bytes que versionar.
 */
import { strict as assert } from "node:assert";
import { writeDwg, type DwgGeometryEntity } from "@valle-design/dwg-codec";
import { readDwgNeutralDatabase, toBetaProfileDatabase } from "./dwg-native-reader";
import { dwgNeutralDatabaseToCadDocument } from "./dwg-document-bridge";

/** Sólo `DwgGeometryEntity` (la unión) es pública; se extrae cada variante. */
type EntityOfKind<K extends DwgGeometryEntity["kind"]> = Extract<
  DwgGeometryEntity,
  { kind: K }
>;

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

const LINE: EntityOfKind<"line"> = {
  kind: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 100, y: 50, z: 0 },
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
};
const CIRCLE: EntityOfKind<"circle"> = {
  kind: "circle",
  center: { x: 10, y: 10, z: 0 },
  radius: 5,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
};
const ARC: EntityOfKind<"arc"> = {
  kind: "arc",
  center: { x: 20, y: 20, z: 0 },
  radius: 4,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  startAngle: 0,
  endAngle: Math.PI / 2,
};
const POINT: EntityOfKind<"point"> = {
  kind: "point",
  position: { x: 1, y: 2, z: 0 },
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  xAxisAngle: 0,
};
const LWPOLYLINE: EntityOfKind<"lwpolyline"> = {
  kind: "lwpolyline",
  closed: true,
  vertices: [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 5 },
  ],
  bulges: undefined,
  widths: undefined,
  constantWidth: undefined,
  elevation: undefined,
  thickness: undefined,
  extrusion: undefined,
};
const TEXT: EntityOfKind<"text"> = {
  kind: "text",
  insertion: { x: 5, y: 5 },
  elevation: undefined,
  alignment: undefined,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  obliqueAngle: undefined,
  rotation: undefined,
  height: 2.5,
  widthFactor: undefined,
  valueBytes: ascii("SALON"),
  generation: undefined,
  horizontalAlignment: undefined,
  verticalAlignment: undefined,
};
const INSERT: EntityOfKind<"insert"> = {
  kind: "insert",
  position: { x: 30, y: 4, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  rotation: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  attributesFollow: false,
};

const file = writeDwg({
  layers: [{ name: ascii("MUROS"), colorIndex: 1 }],
  blocks: [{ name: ascii("PUERTA"), entities: [LINE] }],
  entities: [
    { entity: LINE, layerIndex: 1 },
    { entity: CIRCLE },
    { entity: ARC },
    { entity: POINT },
    { entity: LWPOLYLINE },
    { entity: TEXT },
    { entity: INSERT, insertBlockIndex: 0 },
  ],
});

// ─── 1. Las siete entidades que el writer sabe fabricar llegan completas ──
// El perfil V3 tiene DOCE tipos; los otros cinco (ELLIPSE, SPLINE, MTEXT,
// DIMENSION, HATCH) se prueban en la sección 2 porque el writer del
// laboratorio todavía no los emite —no pueden fabricarse como bytes DWG
// reales hoy—, así que esto no es "el perfil entero", es la mitad que sí
// puede probarse contra bytes de verdad.
const database = readDwgNeutralDatabase(file);
const kinds = database.modelSpaceEntities.map((record) => record.entity.kind).sort();
assert.deepEqual(
  kinds,
  ["arc", "circle", "insert", "line", "lwpolyline", "point", "text"].sort(),
  "las siete entidades que el writer fabrica llegan a la base neutral",
);
assert.equal(database.layers.length, 2, "la capa \"0\" del esqueleto más la declarada llegan");
assert.ok(
  database.layers.some((layer) => layer.colorIndex === 1),
  "la capa declarada llega con sus propiedades",
);
// El esqueleto del writer también trae *Model_Space y *Paper_Space (sin
// contenido); el de usuario ("PUERTA") es el único con una entidad dentro.
const puerta = database.blocks.find((block) => block.entities.length > 0);
assert.ok(puerta, "el bloque de usuario llega junto al esqueleto del writer");
assert.equal(puerta!.entities.length, 1, "y su contenido con él");

// ─── 2. Perfil V3: lo que entra y lo que sigue fuera ───────────────────────
// El writer sólo emite las siete entidades de la sección 1, así que esto se
// prueba con `toBetaProfileDatabase`, la mitad PURA del adaptador,
// directamente — igual que dwg-document-bridge.spec.ts prueba su mitad pura
// con bases hechas a mano.
const ELLIPSE: EntityOfKind<"ellipse"> = {
  kind: "ellipse",
  center: { x: 0, y: 0, z: 0 },
  majorAxisEndpoint: { x: 5, y: 0, z: 0 },
  extrusion: { x: 0, y: 0, z: 1 },
  axisRatio: 0.5,
  startAngle: 0,
  endAngle: Math.PI * 2,
};
const SPLINE_OK: EntityOfKind<"spline"> = {
  kind: "spline",
  scenario: 1,
  degree: 3,
  rational: false,
  closed: false,
  periodic: false,
  knotTolerance: undefined,
  controlTolerance: undefined,
  knots: [0, 0, 0, 0, 1, 1, 1, 1],
  controlPoints: [
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 4, z: 0 },
    { x: 6, y: 4, z: 0 },
    { x: 8, y: 0, z: 0 },
  ],
  weights: undefined,
  fitTolerance: undefined,
  startTangent: undefined,
  endTangent: undefined,
  fitPoints: undefined,
};
// Mismo escenario 1, pero RACIONAL: el perfil V2 lo deja fuera a propósito
// porque `CadDxfPrimitive` no lleva pesos — ver el comentario junto a
// `toBetaProfileGeometry`.
const SPLINE_RATIONAL: EntityOfKind<"spline"> = {
  ...SPLINE_OK,
  rational: true,
  weights: [1, 1, 1, 1],
};
// Escenario 2 (puntos de ajuste + tangentes): otra forma de quedar fuera,
// independiente de `rational`. Las dos ramas del filtro necesitan su propio
// caso o una se queda sin probar.
const SPLINE_FIT: EntityOfKind<"spline"> = {
  kind: "spline",
  scenario: 2,
  degree: 3,
  rational: undefined,
  closed: undefined,
  periodic: undefined,
  knotTolerance: 1e-7,
  controlTolerance: 1e-7,
  knots: undefined,
  controlPoints: undefined,
  weights: undefined,
  fitTolerance: 1e-7,
  startTangent: { x: 1, y: 0, z: 0 },
  endTangent: { x: 0, y: 1, z: 0 },
  fitPoints: [
    { x: 0, y: 0, z: 0 },
    { x: 4, y: 4, z: 0 },
  ],
};
// MTEXT ya entra en V3: el mapeo semántico que le faltaba a V2 es
// exactamente lo que M2b añadió (dwg-document-bridge.ts reutiliza el mismo
// decodificador de contenido con formato que usa DXF).
const MTEXT: EntityOfKind<"mtext"> = {
  kind: "mtext",
  insertion: { x: 0, y: 0, z: 0 },
  extrusion: { x: 0, y: 0, z: 1 },
  xAxisDirection: { x: 1, y: 0, z: 0 },
  rectWidth: 40,
  height: 2.5,
  attachment: 1,
  drawingDirection: 1,
  extentsHeight: 2.5,
  extentsWidth: 40,
  valueBytes: ascii("NOTA GENERAL"),
  lineSpacingStyle: 1,
  lineSpacingFactor: 1,
  trailingBit: 0,
};
// DIMENSION entra salvo angular de dos líneas (ver el comentario junto a
// `toBetaProfileGeometry`); ALIGNED es la variante más simple para probar
// que el resto de la familia sí pasa el filtro por tipo.
const DIMENSION_ALIGNED: EntityOfKind<"dimension"> = {
  kind: "dimension",
  dimensionKind: "aligned",
  extrusion: { x: 0, y: 0, z: 1 },
  textMidpoint: { x: 50, y: 30 },
  elevation: 0,
  flags: 0,
  userTextBytes: [],
  textRotation: 0,
  horizontalDirection: 0,
  insertScale: { x: 1, y: 1, z: 1 },
  insertRotation: 0,
  attachment: 5,
  lineSpacingStyle: 1,
  lineSpacingFactor: 1,
  actualMeasurement: 100,
  clonePoint: { x: 0, y: 0 },
  definitionPoint: { x: 50, y: 30, z: 0 },
  point13: { x: 0, y: 0, z: 0 },
  point14: { x: 100, y: 0, z: 0 },
  point15: undefined,
  point16: undefined,
  extensionLineRotation: undefined,
  dimensionRotation: undefined,
  leaderLength: undefined,
  ordinateFlags: undefined,
};
// Angular DE DOS LÍNEAS: excluida por tipo, no por valores — intersecar dos
// rectas es el mismo riesgo de mandar el vértice al infinito que ya declina
// `dxf-read-foreign-dimensions.ts` para una cota DXF ajena.
const DIMENSION_ANGULAR2LN: EntityOfKind<"dimension"> = {
  ...DIMENSION_ALIGNED,
  dimensionKind: "angular2ln",
};
// HATCH con un único camino poligonal: entra completo. El camino curvo se
// prueba aparte, en dwg-document-bridge.spec.ts, camino a camino.
const HATCH_OK: EntityOfKind<"hatch"> = {
  kind: "hatch",
  elevation: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  nameBytes: ascii("ANSI31"),
  solidFill: false,
  associative: false,
  paths: [
    {
      kind: "polyline",
      flags: 0,
      closed: true,
      vertices: [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 6 },
        { x: 0, y: 6 },
      ],
      bulges: undefined,
      boundaryObjectCount: 0,
    },
  ],
  style: 0,
  patternType: 0,
  angle: 0,
  scaleOrSpacing: 1,
  doubleHatch: undefined,
  definitionLines: undefined,
  pixelSize: undefined,
  seedPoints: [{ x: 3, y: 3 }],
};
// Un tipo que el perfil V3 no cubre EN ABSOLUTO (no es cuestión de variante
// ni de contenido): RAY no tiene ruta de mapeo y no la tiene ningún hito
// hasta ahora. Sigue siendo "fuera de perfil", nunca "no decodificado": el
// laboratorio lo lee completo.
const RAY: EntityOfKind<"ray"> = {
  kind: "ray",
  basePoint: { x: 0, y: 0, z: 0 },
  direction: { x: 1, y: 0, z: 0 },
};

const mkRecord = (handle: number, entity: DwgGeometryEntity) => ({
  handle,
  entity,
  layerHandle: undefined,
  insertedBlockName: undefined,
  attributes: undefined,
  vertices: undefined,
  sequenceEndHandle: undefined,
});

const perfilV3 = toBetaProfileDatabase({
  layers: [],
  blocks: [],
  modelSpaceEntities: [
    mkRecord(0x50, ELLIPSE),
    mkRecord(0x51, SPLINE_OK),
    mkRecord(0x52, SPLINE_RATIONAL),
    mkRecord(0x53, SPLINE_FIT),
    mkRecord(0x54, MTEXT),
    mkRecord(0x55, DIMENSION_ALIGNED),
    mkRecord(0x56, DIMENSION_ANGULAR2LN),
    mkRecord(0x57, HATCH_OK),
    mkRecord(0x58, RAY),
  ],
  unsupported: [],
  diagnostics: [],
});

assert.deepEqual(
  perfilV3.modelSpaceEntities.map((record) => record.entity.kind).sort(),
  ["dimension", "ellipse", "hatch", "mtext", "spline"],
  "ELLIPSE, SPLINE no racional de escenario 1, MTEXT, DIMENSION (salvo angular2ln) y HATCH entran",
);
const excluded = perfilV3.diagnostics.filter(
  (diagnostic) => diagnostic.code === "dwg_beta_profile_entity_excluded",
);
assert.equal(
  excluded.length,
  4,
  "spline racional, spline de escenario 2, la angular de dos líneas y RAY quedan fuera del perfil",
);
assert.ok(
  excluded.some((d) => d.offset === 0x52 && d.message.includes("spline")),
  "el spline racional se declara fuera de perfil, con su handle",
);
assert.ok(
  excluded.some((d) => d.offset === 0x53 && d.message.includes("spline")),
  "el spline de escenario 2 también, por una razón distinta",
);
assert.ok(
  excluded.some((d) => d.offset === 0x56 && d.message.includes("dimension")),
  "la angular de dos líneas queda fuera por tipo, no por sus valores",
);
assert.ok(
  excluded.some((d) => d.offset === 0x58 && d.message.includes("ray")),
  "RAY queda fuera: ningún hito lo cubre todavía",
);
assert.equal(
  perfilV3.unsupported.length,
  0,
  "nada de esto es 'no decodificado': eso sería falso, el laboratorio SÍ lo lee",
);

// ─── 3. El puente ya probado proyecta lo que entra y hereda lo que no ─────
const informe = dwgNeutralDatabaseToCadDocument(database);
assert.equal(informe.format, "dwg");
assert.ok(
  informe.importedEntityCount >= 6,
  "las siete entidades de la sección 1 llegan al documento canónico",
);
const informeV3 = dwgNeutralDatabaseToCadDocument(perfilV3);
assert.equal(
  informeV3.importedEntityCount,
  5,
  "ELLIPSE, SPLINE, MTEXT, DIMENSION y HATCH se proyectan a entidades canónicas de verdad",
);
assert.ok(
  informeV3.document.entities.some((entity) => entity.type === "ellipse"),
  "la elipse llega como entidad canónica ellipse",
);
assert.ok(
  informeV3.document.entities.some((entity) => entity.type === "spline"),
  "el spline llega como entidad canónica spline",
);
assert.ok(
  informeV3.document.entities.some((entity) => entity.type === "mtext"),
  "el mtext llega como entidad canónica mtext",
);
assert.ok(
  informeV3.document.entities.some((entity) => entity.type === "dimension"),
  "la cota llega como entidad canónica dimension",
);
assert.ok(
  informeV3.document.entities.some((entity) => entity.type === "hatch"),
  "el hatch llega como entidad canónica hatch",
);
assert.ok(
  informeV3.document.lossManifest.some((entry) => entry.detail.includes("ray")),
  "el manifiesto de pérdidas del documento hereda el diagnóstico de fuera de perfil",
);

// ─── 4. Otra versión reconocida se rechaza NOMBRANDO la versión ───────────
const ac1018Like = new Uint8Array(128);
ac1018Like.set(ascii("AC1018"), 0);
assert.throws(
  () => readDwgNeutralDatabase(ac1018Like),
  /2004|AC1018/,
  "AC1018 se rechaza nombrando la versión detectada, no como 'archivo corrupto'",
);

// ─── 5. Basura no se confunde con "versión reconocida pero ajena" ─────────
assert.throws(
  () => readDwgNeutralDatabase(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])),
  /no se reconoce como DWG/,
  "una firma inválida se rechaza como tal, no como una versión conocida",
);

console.log(
  "dwg-native-reader: perfil V3 completo (bytes reales + ELLIPSE/SPLINE/MTEXT/DIMENSION/HATCH " +
    "puros), fuera-de-perfil declarado, versión ajena nombrada, puente canónico verificado",
);
