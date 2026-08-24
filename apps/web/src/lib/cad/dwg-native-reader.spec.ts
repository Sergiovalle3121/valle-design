/**
 * `dwg-native-reader.ts`: el único punto del producto que toca el códec DWG
 * propio en runtime, probado de punta a punta con bytes DWG REALES.
 *
 * El harness escribe un AC1015 100% con el propio writer del laboratorio
 * (`writeDwg`, ya validado por oráculo externo dentro de `dwg-codec`), lo
 * pasa por `readDwgNeutralDatabase` —el adaptador— y verifica que el perfil
 * de beta `AC1015_MODELSPACE_2D_V1` llega completo, que lo que el
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
// Fuera del perfil V1 A PROPÓSITO: el laboratorio SÍ decodifica ELLIPSE
// (§2 más abajo), pero su writer sólo emite las siete del perfil V1 —no
// puede fabricarse como bytes reales todavía—, así que esta constante no
// entra al `writeDwg()` de más abajo.
const ELLIPSE: EntityOfKind<"ellipse"> = {
  kind: "ellipse",
  center: { x: 0, y: 0, z: 0 },
  majorAxisEndpoint: { x: 5, y: 0, z: 0 },
  extrusion: { x: 0, y: 0, z: 1 },
  axisRatio: 0.5,
  startAngle: 0,
  endAngle: Math.PI * 2,
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

// ─── 1. El perfil V1 llega completo, desde bytes DWG reales ────────────────
const database = readDwgNeutralDatabase(file);
const kinds = database.modelSpaceEntities.map((record) => record.entity.kind).sort();
assert.deepEqual(
  kinds,
  ["arc", "circle", "insert", "line", "lwpolyline", "point", "text"].sort(),
  "las siete entidades del perfil V1 llegan a la base neutral",
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

// ─── 2. Lo fuera de perfil se declara, no se calla ni se cuenta mal ────────
// El writer sólo emite el perfil V1 (§1), así que esto no puede probarse con
// bytes reales todavía: se prueba `toBetaProfileDatabase`, la mitad PURA del
// adaptador, directamente — igual que dwg-document-bridge.spec.ts prueba su
// mitad pura con bases hechas a mano.
const conEllipse = toBetaProfileDatabase({
  layers: [],
  blocks: [],
  modelSpaceEntities: [
    {
      handle: 0x50,
      entity: ELLIPSE,
      layerHandle: undefined,
      insertedBlockName: undefined,
      attributes: undefined,
      vertices: undefined,
      sequenceEndHandle: undefined,
    },
  ],
  unsupported: [],
  diagnostics: [],
});
assert.equal(conEllipse.modelSpaceEntities.length, 0, "la ELLIPSE no entra al perfil V1");
assert.ok(
  conEllipse.diagnostics.some(
    (d) => d.code === "dwg_beta_profile_entity_excluded" && d.message.includes("ellipse"),
  ),
  "pero SÍ consta, con su propio código: el laboratorio la decodificó, el perfil no la cubre",
);
assert.equal(
  conEllipse.unsupported.length,
  0,
  "no es 'no decodificada': eso sería falso, el laboratorio SÍ la lee",
);

// ─── 3. El puente ya probado la proyecta, y hereda el diagnóstico ─────────
const informe = dwgNeutralDatabaseToCadDocument(database);
assert.equal(informe.format, "dwg");
assert.ok(
  informe.importedEntityCount >= 6,
  "las entidades del perfil V1 llegan al documento canónico",
);
const informeEllipse = dwgNeutralDatabaseToCadDocument(conEllipse);
assert.ok(
  informeEllipse.document.lossManifest.some((entry) => entry.detail.includes("ellipse")),
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
  "dwg-native-reader: perfil V1 completo desde bytes DWG reales, fuera-de-perfil declarado, " +
    "versión ajena nombrada, puente canónico verificado",
);
