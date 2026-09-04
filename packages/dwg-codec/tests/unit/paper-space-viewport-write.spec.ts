/**
 * Spec del ESPACIO PAPEL CON UNA VENTANA — la hoja que salía como modelo.
 *
 * ESTA SPEC EXISTE POR UN AGUJERO ESTRUCTURAL, no por un campo mal escrito.
 * Hasta el 2026-09-04 el archivo mínimo escribía el BLOCK_RECORD
 * `*Paper_Space`, su BLOCK/ENDBLK y el LAYOUT «Layout1» —los andamios de la
 * hoja estaban puestos desde la ola 3— y NINGUNA entidad podía caer ahí: la
 * cadena de entidades era una sola y era la del modelo, así que el cajetín, el
 * marco y la ventana de una lámina o se exportaban ENCIMA del dibujo o no se
 * exportaban. Y `VIEWPORT` era una de las 17 clases que el arnés de
 * re-escritura del corpus marcaba `no-escribible`.
 *
 * QUÉ SE PRUEBA, y por qué así:
 *
 *   1. QUE LA HOJA SEA LA HOJA. No basta con que la entidad «vuelva»: se lee
 *      el flujo de handles del BLOCK_RECORD `*Paper_Space` del archivo
 *      producido y se exige que su primera y su última entidad sean las de la
 *      hoja, y que las del modelo NO estén ahí. Es la comprobación que un
 *      round-trip por el modelo neutral no puede hacer, porque el lector
 *      todavía coloca las entidades de papel en `modelSpaceEntities` con su
 *      diagnóstico.
 *   2. QUE LAS DOS CADENAS ESTÉN SEPARADAS. Cada espacio declara su propio
 *      primero y su propio último; una cadena que los mezclara dejaría un
 *      lector ajeno recorriendo el modelo desde la hoja.
 *   3. QUE EL MODO SEA EL MEDIDO. Una entidad de hoja viaja en modo 1 y una
 *      del modelo en modo 2 (`VALLE-CORPUS-VIEWPORT-PAPEL`, los dos VIEWPORT
 *      de `23-layout-viewport`). El lector lo REPORTA desde este mismo corte,
 *      así que la afirmación se puede comprobar sin bajar a los bits.
 *   4. QUE LOS CAMPOS DEL VIEWPORT SOBREVIVAN, los veintitantos, campo a
 *      campo — incluida la cola de R2000+ que ningún otro tipo de este writer
 *      tiene.
 *   5. QUE LA FRONTERA SIGA CERRADA donde no está medida: capas congeladas por
 *      ventana, una ventana dentro de un bloque de usuario, una entidad de
 *      bloque que declara espacio propio y un VIEWPORT sin su VPORT ENTITY
 *      HEADER.
 *   6. EL CAMINO PÚBLICO. `writeCanonicalDwg` proyecta la hoja desde
 *      `paperSpaces`, escribe UNA ventana y DECLARA lo que no cabe: la
 *      segunda hoja, la segunda ventana y la ventana sin área.
 *
 * EL LÍMITE, SIN SUAVIZAR: esto enfrenta NUESTRO writer con NUESTRO lector.
 * Que un lector AJENO abra esta hoja lo responde `scripts/dwg/oda-roundtrip.mjs`
 * con el caso `hoja-con-ventana`, que exige el binario con licencia del
 * titular y no corre en este entorno.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { BoundedByteCursor } from "../../src/binary/byte-cursor.js";
import { DwgBitReader } from "../../src/codecs/bitcodes.js";
import { parseAc1015FileHeader } from "../../src/container/ac1015-file-header.js";
import { readAc1015ObjectEnvelope } from "../../src/container/ac1015-object-envelope.js";
import { readAc1015ObjectMap } from "../../src/container/ac1015-object-map.js";
import { DEFAULT_DWG_LIMITS } from "../../src/api/limits.js";
import { readDwg } from "../../src/api/read.js";
import { writeCanonicalDwg } from "../../src/api/write.js";
import { dwgDatabaseToCanonicalDocument } from "../../src/api/canonical.js";
import { writeAc1015MinimalFile } from "../../src/writer/ac1015-minimal-file-writer.js";
import { writeAc1015EntityBody } from "../../src/writer/ac1015-entity-writer.js";
import { planAc1015MinimalFile } from "../../src/writer/ac1015-minimal-file-plan.js";
import {
  H_MODEL_RECORD,
  H_PAPER_RECORD,
} from "../../src/writer/ac1015-minimal-file-support.js";
import type { Ac1015MinimalFileOptions } from "../../src/writer/ac1015-minimal-file-writer.js";
import type {
  DwgLineEntity,
  DwgViewportEntity,
} from "../../src/model/entity-geometry.js";
import type { CanonicalCadDocumentJson } from "../../src/api/canonical.js";

// ---------------------------------------------------------------------------
// Material de prueba
// ---------------------------------------------------------------------------

/**
 * La VENTANA con los valores MEDIDOS en `23-layout-viewport`: una A4 apaisada
 * a escala 1, mirando en planta. No son valores bonitos: son los que un
 * productor ajeno escribió, y por eso son los que se ejercitan.
 */
const VENTANA: DwgViewportEntity = Object.freeze({
  kind: "viewport",
  center: { x: 148.5, y: 105, z: 0 },
  width: 297,
  height: 210,
  viewTarget: { x: 0, y: 0, z: 0 },
  viewDirection: { x: 0, y: 0, z: 1 },
  twistAngle: 0,
  viewHeight: 210,
  lensLength: 50,
  frontClip: 0,
  backClip: 0,
  snapAngle: 0,
  viewCenter: { x: 148.5, y: 105 },
  snapBase: { x: 0, y: 0 },
  snapSpacing: { x: 10, y: 10 },
  gridSpacing: { x: 10, y: 10 },
  circleZoom: 100,
  frozenLayerCount: 0,
  statusFlags: 0,
  styleSheetBytes: [],
  renderMode: 0,
  ucsAtOrigin: 0,
  ucsPerViewport: 1,
  ucsOrigin: { x: 0, y: 0, z: 0 },
  ucsXAxis: { x: 1, y: 0, z: 0 },
  ucsYAxis: { x: 0, y: 1, z: 0 },
  ucsElevation: 0,
  ucsOrthoViewType: 0,
});

const linea = (x: number): DwgLineEntity =>
  Object.freeze({
    kind: "line",
    start: { x: 0, y: 0, z: 0 },
    end: { x, y: x, z: 0 },
    thickness: 0,
    extrusion: { x: 0, y: 0, z: 1 },
  });

/**
 * Un archivo con DOS entidades en el modelo y DOS en la hoja: es el mínimo
 * que permite ver una cadena partida en dos. Con una entidad por espacio la
 * posición de cadena sería "isolated" en los dos y no se distinguiría de un
 * writer que las mezclara.
 */
const OPCIONES: Ac1015MinimalFileOptions = {
  entities: [
    { entity: linea(10) },
    { entity: linea(20) },
    { entity: VENTANA, space: "paper" },
    { entity: linea(30), space: "paper" },
  ],
};

// ---------------------------------------------------------------------------
// Lectura del flujo de handles de un BLOCK_RECORD del archivo producido
// ---------------------------------------------------------------------------

/**
 * Los punteros de primera y última entidad de un BLOCK_RECORD, leídos del
 * ARCHIVO y no del plan.
 *
 * Baja a los bits a propósito: el modelo neutral del lector no expone estos
 * dos punteros (arma los bloques por PROPIEDAD, no recorriendo la cadena), y
 * son exactamente el hecho que esta ola cambia. Comprobarlo por el plan sería
 * comprobar que el writer coincide consigo mismo.
 *
 * La disposición del flujo es la que emite `writeAc1015StructBlockRecordBody`
 * y la MEDIDA en el corpus: `control H(4) · xdic H(3) · nulo H(5) · BLOCK H(3)
 * · primera H(4) · última H(4) · ENDBLK H(3) · layout H(5)`.
 */
function cadenaDelBlockRecord(
  file: Uint8Array,
  recordHandle: number,
): { first: number; last: number } {
  const cursor = new BoundedByteCursor(file);
  const header = parseAc1015FileHeader(cursor);
  const mapRecord = header.records.find((record) => record.id === 2);
  assert.ok(mapRecord, "el archivo declara su mapa de objetos");
  const entries = readAc1015ObjectMap(
    cursor,
    { start: mapRecord.start, size: mapRecord.size },
    DEFAULT_DWG_LIMITS,
  );
  const reserved = header.records.map((record) => ({
    start: record.start,
    size: record.size,
  }));
  const entry = entries.find((candidate) => candidate.handle === recordHandle);
  assert.ok(entry, `el mapa lista el BLOCK_RECORD 0x${recordHandle.toString(16)}`);
  const envelope = readAc1015ObjectEnvelope(cursor, entry.offset, reserved);
  const reader = new DwgBitReader(new BoundedByteCursor(envelope.bodyBytes));
  reader.readBS(); // tipo
  const bitSize = reader.readRL();
  while (reader.bitPosition < bitSize) reader.readB();
  reader.readH(); // control
  reader.readH(); // xdictionary
  reader.readH(); // nulo del formato
  reader.readH(); // BLOCK
  const first = reader.readH();
  const last = reader.readH();
  return { first: first.value, last: last.value };
}

// ---------------------------------------------------------------------------
// 1-3. La hoja es la hoja, con cadena propia y modo propio
// ---------------------------------------------------------------------------

test("la hoja cuelga de *Paper_Space y el modelo de *Model_Space, con cadenas separadas", () => {
  const plan = planAc1015MinimalFile(OPCIONES);
  const file = writeAc1015MinimalFile(OPCIONES);

  assert.equal(plan.modelEntityHandles.length, 2);
  assert.equal(plan.paperEntityHandles.length, 2);
  // Ningún handle puede estar en las dos listas: si lo estuviera, una entidad
  // se dibujaría dos veces o ninguna, según por dónde entrara el lector.
  for (const handle of plan.paperEntityHandles) {
    assert.ok(!plan.modelEntityHandles.includes(handle));
  }

  const modelo = cadenaDelBlockRecord(file, H_MODEL_RECORD);
  assert.deepEqual(modelo, {
    first: plan.modelEntityHandles[0],
    last: plan.modelEntityHandles[1],
  });

  const hoja = cadenaDelBlockRecord(file, H_PAPER_RECORD);
  assert.deepEqual(hoja, {
    first: plan.paperEntityHandles[0],
    last: plan.paperEntityHandles[1],
  });
  // Y lo que hace de esto una afirmación y no una coincidencia: la hoja NO
  // apunta a ninguna entidad del modelo.
  assert.ok(!plan.modelEntityHandles.includes(hoja.first));
  assert.ok(!plan.modelEntityHandles.includes(hoja.last));
});

test("una hoja vacía deja *Paper_Space sin cadena, como antes de esta ola", () => {
  const file = writeAc1015MinimalFile({ entities: [{ entity: linea(10) }] });
  assert.deepEqual(cadenaDelBlockRecord(file, H_PAPER_RECORD), {
    first: 0,
    last: 0,
  });
});

test("el lector declara el espacio de cada entidad: papel para la hoja, modelo para el modelo", () => {
  const database = readDwg(writeAc1015MinimalFile(OPCIONES));
  // El lector todavía COLOCA la entidad de papel en model space (pendiente
  // declarado, con su diagnóstico); lo que ya no hace es perder el dato.
  const espacios = database.modelSpaceEntities.map((record) => record.space);
  assert.deepEqual(espacios, ["model", "model", "paper", "paper"]);
  assert.equal(
    database.diagnostics.filter(
      (diagnostic) => diagnostic.code === "database-paper-space-entity",
    ).length,
    2,
  );
});

// ---------------------------------------------------------------------------
// 4. Los campos de la ventana sobreviven
// ---------------------------------------------------------------------------

test("el VIEWPORT vuelve campo a campo, incluida la cola de R2000+", () => {
  const database = readDwg(writeAc1015MinimalFile(OPCIONES));
  const ventana = database.modelSpaceEntities.find(
    (record) => record.entity.kind === "viewport",
  );
  assert.ok(ventana, "la ventana vuelve del archivo");
  assert.deepEqual(ventana.entity, VENTANA);
});

test("una ventana con otros valores también vuelve entera (no son constantes del writer)", () => {
  const otra: DwgViewportEntity = {
    ...VENTANA,
    center: { x: 60, y: 40, z: 0 },
    width: 100,
    height: 70,
    viewDirection: { x: 0, y: -1, z: 0 },
    twistAngle: 0.25,
    viewHeight: 350,
    lensLength: 35,
    frontClip: 1.5,
    backClip: -2.5,
    snapAngle: 0.5,
    viewCenter: { x: 12.5, y: -7.25 },
    snapSpacing: { x: 2.5, y: 2.5 },
    circleZoom: 1000,
    statusFlags: 33,
    renderMode: 2,
    ucsAtOrigin: 1,
    ucsPerViewport: 0,
    ucsElevation: 3.5,
    ucsOrthoViewType: 4,
    styleSheetBytes: [...":estilo"].map((c) => c.charCodeAt(0)),
  };
  const database = readDwg(
    writeAc1015MinimalFile({ entities: [{ entity: otra, space: "paper" }] }),
  );
  assert.deepEqual(database.modelSpaceEntities[0]?.entity, otra);
});

test("la ventana lleva su VPORT ENTITY HEADER y el control de la tabla lo lista", () => {
  const plan = planAc1015MinimalFile(OPCIONES);
  const cabeceras = plan.paperViewportHeaderHandles;
  assert.equal(cabeceras.length, 2);
  assert.equal(typeof cabeceras[0], "number"); // la ventana
  assert.equal(cabeceras[1], null); // la línea de la hoja no es una ventana
  // Sin ventanas no se reparte ni un handle de más: el archivo de siempre.
  const sinVentana = planAc1015MinimalFile({ entities: [{ entity: linea(10) }] });
  assert.deepEqual(sinVentana.modelViewportHeaderHandles, [null]);
  // El archivo se abre entero con la entrada dentro (si el control mintiera
  // sobre su recuento, el lector fallaría al recorrer la tabla).
  const database = readDwg(writeAc1015MinimalFile(OPCIONES));
  assert.equal(database.unsupported.length, 0);
});

// ---------------------------------------------------------------------------
// 5. La frontera sigue cerrada donde no está medida
// ---------------------------------------------------------------------------

test("capas congeladas por ventana: se rechaza cerrado en vez de escribir el recuento sin sus handles", () => {
  assert.throws(
    () =>
      writeAc1015MinimalFile({
        entities: [
          { entity: { ...VENTANA, frozenLayerCount: 2 }, space: "paper" },
        ],
      }),
    /non-finite or impossible geometry/,
  );
});

test("una ventana de área cero no se escribe", () => {
  assert.throws(
    () =>
      writeAc1015MinimalFile({
        entities: [{ entity: { ...VENTANA, width: 0 }, space: "paper" }],
      }),
    /non-finite or impossible geometry/,
  );
});

test("una ventana dentro de un bloque de usuario se rechaza cerrado", () => {
  assert.throws(
    () =>
      writeAc1015MinimalFile({
        blocks: [{ name: [0x41], entities: [{ entity: VENTANA }] }],
      }),
    /viewport entity cannot live inside a user block/,
  );
});

test("una entidad de bloque no puede declarar espacio propio", () => {
  assert.throws(
    () =>
      writeAc1015MinimalFile({
        blocks: [
          { name: [0x41], entities: [{ entity: linea(5), space: "paper" }] },
        ],
      }),
    /cannot declare a space of its own/,
  );
});

test("un VIEWPORT sin su VPORT ENTITY HEADER se rechaza cerrado", () => {
  // El archivo completo lo reparte solo; esta es la puerta de aceptación que
  // usan el arnés del corpus y cualquier llamador de bajo nivel, y las dos
  // ventanas del corpus apuntan a una entrada real. Un nulo «a ver qué pasa»
  // estrenaría una forma que ningún archivo ajeno muestra.
  assert.throws(
    () => writeAc1015EntityBody(VENTANA, 0x100),
    /requires the handle of its VPORT entity header/,
  );
  assert.throws(
    () =>
      writeAc1015EntityBody(linea(5), 0x100, {
        viewportEntityHeaderHandle: 0x200,
      }),
    /Only a viewport entity may reference a VPORT entity header/,
  );
});

test("un espacio que el formato no tiene se rechaza cerrado", () => {
  assert.throws(
    () =>
      writeAc1015MinimalFile({
        entities: [
          {
            entity: linea(5),
            space: "layout7" as unknown as "paper",
          },
        ],
      }),
    /must be either model or paper/,
  );
});

// ---------------------------------------------------------------------------
// 6. El camino público
// ---------------------------------------------------------------------------

/** Un documento canónico mínimo con una lámina y su ventana. */
function documentoConHoja(
  overrides: Partial<CanonicalCadDocumentJson> = {},
): CanonicalCadDocumentJson {
  return {
    meta: { version: 1, schema: 9, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ],
    entities: [
      { id: "e1", type: "line", layer: "0", start: { x: 0, y: 0 }, end: { x: 5, y: 5 } },
      { id: "cajetin", type: "line", layer: "0", start: { x: 0, y: 0 }, end: { x: 297, y: 0 } },
    ],
    history: [],
    modelSpace: { entityIds: ["e1"] },
    paperSpaces: [
      {
        id: "hoja-1",
        name: "Lámina 1",
        entityIds: ["cajetin"],
        viewports: [
          {
            id: "v1",
            paperBounds: { x: 10, y: 10, width: 277, height: 190 },
            modelBounds: { x: 0, y: 0, width: 554, height: 380 },
            viewDirection: { x: 0, y: 0, z: -1 },
          },
        ],
      },
    ],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
    ...overrides,
  } as CanonicalCadDocumentJson;
}

test("writeCanonicalDwg escribe la hoja: su ventana y lo que se dibuja sobre ella", () => {
  const { bytes, lossManifest } = writeCanonicalDwg(documentoConHoja());
  const database = readDwg(bytes);
  const porEspacio = database.modelSpaceEntities.map((record) => ({
    kind: record.entity.kind,
    space: record.space,
  }));
  assert.deepEqual(porEspacio, [
    { kind: "line", space: "model" }, // la del modelo
    { kind: "line", space: "paper" }, // el cajetín de la lámina
    { kind: "viewport", space: "paper" }, // la ventana
  ]);
  // La hoja completa no deja pérdidas: es el caso que esta ola sí escribe.
  assert.deepEqual(
    lossManifest.filter((loss) => loss.sourceType === "PAPER_SPACE"),
    [],
  );

  const ventana = database.modelSpaceEntities.find(
    (record) => record.entity.kind === "viewport",
  )?.entity;
  assert.ok(ventana && ventana.kind === "viewport");
  // El rectángulo de PAPEL da centro y tamaño de la ventana…
  assert.deepEqual(ventana.center, { x: 148.5, y: 105, z: 0 });
  assert.equal(ventana.width, 277);
  assert.equal(ventana.height, 190);
  // …y el de MODELO da lo que se ve por ella, de donde sale la escala 1:2.
  assert.deepEqual(ventana.viewCenter, { x: 277, y: 190 });
  assert.equal(ventana.viewHeight, 380);
  assert.equal(ventana.height / ventana.viewHeight, 0.5);
  // La dirección se INVIERTE: el documento mira del ojo a la escena y el
  // archivo guarda del objetivo al ojo.
  assert.deepEqual(ventana.viewDirection, { x: 0, y: 0, z: 1 });
});

test("la segunda hoja y la segunda ventana se declaran, no se escriben en silencio", () => {
  const base = documentoConHoja();
  const primera = base.paperSpaces[0]!;
  const documento = documentoConHoja({
    paperSpaces: [
      {
        ...primera,
        viewports: [
          primera.viewports![0]!,
          {
            id: "v2",
            paperBounds: { x: 10, y: 210, width: 100, height: 60 },
            modelBounds: { x: 0, y: 0, width: 200, height: 120 },
          },
        ],
      },
      { id: "hoja-2", name: "Lámina 2", entityIds: [], viewports: [] },
    ],
  });
  const { bytes, lossManifest } = writeCanonicalDwg(documento);
  const codigos = lossManifest.map((loss) => loss.code);
  assert.ok(codigos.includes("paper-space-beyond-first-not-written"));
  assert.ok(codigos.includes("paper-space-extra-viewport-not-written"));
  // Y una sola ventana en el archivo, no dos ni ninguna.
  const database = readDwg(bytes);
  assert.equal(
    database.modelSpaceEntities.filter(
      (record) => record.entity.kind === "viewport",
    ).length,
    1,
  );
});

test("una ventana sin área se declara y la hoja se escribe sin ella", () => {
  const primera = documentoConHoja().paperSpaces[0]!;
  const { bytes, lossManifest } = writeCanonicalDwg(
    documentoConHoja({
      paperSpaces: [
        {
          ...primera,
          viewports: [
            {
              id: "v1",
              paperBounds: { x: 10, y: 10, width: 0, height: 190 },
              modelBounds: { x: 0, y: 0, width: 554, height: 380 },
            },
          ],
        },
      ],
    }),
  );
  assert.ok(
    lossManifest.some((loss) => loss.code === "paper-space-viewport-empty"),
  );
  const database = readDwg(bytes);
  assert.equal(
    database.modelSpaceEntities.filter(
      (record) => record.entity.kind === "viewport",
    ).length,
    0,
  );
  // El cajetín de la lámina sigue en la hoja: sin ventana no es sin lámina.
  assert.deepEqual(
    database.modelSpaceEntities.map((record) => record.space),
    ["model", "paper"],
  );
});

test("la hoja sobrevive la vuelta entera: archivo → canónico → archivo", () => {
  // ES LA PRUEBA QUE EL ARNÉS DEL ORÁCULO NECESITA. Su gemelo «-publico»
  // reescribe cada caso pasando por el canónico; si la ida DWG→canónico
  // disolviera la hoja en el modelo —que es lo que hacía hasta este corte—,
  // el gemelo público del caso `hoja-con-ventana` llegaría al oráculo sin
  // ventana y la comparación mentiría sobre el camino público.
  const primero = writeAc1015MinimalFile(OPCIONES);
  const canonico = dwgDatabaseToCanonicalDocument(readDwg(primero));
  assert.equal(canonico.document.paperSpaces.length, 1);
  assert.deepEqual(canonico.document.paperSpaces[0]?.viewports?.[0]?.paperBounds, {
    x: 0,
    y: 0,
    width: 297,
    height: 210,
  });
  const segundo = writeCanonicalDwg(canonico.document);
  const database = readDwg(segundo.bytes);
  const ventana = database.modelSpaceEntities.find(
    (record) => record.entity.kind === "viewport",
  );
  assert.equal(ventana?.space, "paper");
  assert.ok(ventana && ventana.entity.kind === "viewport");
  // Los campos que el canónico SÍ transporta vuelven exactos.
  assert.deepEqual(ventana.entity.center, VENTANA.center);
  assert.equal(ventana.entity.width, VENTANA.width);
  assert.equal(ventana.entity.height, VENTANA.height);
  assert.deepEqual(ventana.entity.viewCenter, VENTANA.viewCenter);
  assert.equal(ventana.entity.viewHeight, VENTANA.viewHeight);
  assert.deepEqual(ventana.entity.viewDirection, VENTANA.viewDirection);
  // Y la línea que se dibujaba sobre la hoja sigue sobre la hoja.
  assert.deepEqual(
    database.modelSpaceEntities.map((record) => record.space),
    ["model", "model", "paper", "paper"],
  );
});

test("un documento sin hojas escribe exactamente lo de siempre", () => {
  const conHoja = documentoConHoja();
  const sinHoja = writeCanonicalDwg(documentoConHoja({ paperSpaces: [] }));
  assert.deepEqual(
    readDwg(sinHoja.bytes).modelSpaceEntities.map((record) => record.space),
    ["model", "model"],
  );
  // Y con hoja el archivo es OTRO: la comparación existe para que «escribe la
  // hoja» no pueda pasar por casualidad con un writer que la ignorara.
  assert.notEqual(
    Buffer.from(sinHoja.bytes).toString("base64"),
    Buffer.from(writeCanonicalDwg(conHoja).bytes).toString("base64"),
  );
});
