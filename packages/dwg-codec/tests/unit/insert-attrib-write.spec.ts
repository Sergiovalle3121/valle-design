/**
 * Spec de la ESCRITURA del INSERT CON ATTRIB — el cuadro de rótulo que salía
 * mudo.
 *
 * ESTA SPEC EXISTE POR UNA PÉRDIDA MEDIDA. Hasta el 2026-09-04 `emitInsert`
 * fijaba el bit de ATTRIBs a 0 y `validateEntity` rechazaba CERRADO todo
 * INSERT que dijera llevarlos: de las 34 referencias a bloque del corpus
 * ajeno, 4 no se escribían en absoluto — el bloque entero desaparecía del
 * archivo, no sólo su texto. Un cuadro de rótulo o una etiqueta de puerta
 * llegaban sin lo único que las distingue: lo que dicen.
 *
 * QUÉ SE PRUEBA, y por qué así:
 *
 *   1. IDA Y VUELTA con la FORMA MEDIDA en material ajeno. Los handles del
 *      grupo (primer ATTRIB y último como punteros blandos, SEQEND como
 *      propietario duro), la propiedad de cada ATTRIB por su INSERT y la
 *      cadena propia de los atributos salen de `VALLE-CORPUS-INSERT-ATRIBUTOS`
 *      —los cuatro INSERT con atributos de `12-attrib` y `22-nested-attribs`—,
 *      no de una suposición.
 *   2. QUE EL SEQEND CIERRE LA SECUENCIA. El lector ata los miembros por su
 *      propietario, así que el SEQEND tiene que volver como el cierre del
 *      INSERT y no como una entidad suelta del espacio.
 *   3. QUE LA CADENA DEL ESPACIO SOBREVIVA. Los ATTRIB se reparten DESPUÉS de
 *      las entidades del espacio justamente para no romper la cadena ±1; una
 *      entidad detrás del INSERT con rótulo es lo que delata que se rompió.
 *   4. QUE LA FRONTERA SIGA CERRADA. Bandera sin atributos y atributos sin
 *      bandera son las dos formas de un archivo que se contradice: las dos
 *      fallan cerrado.
 *   5. EL CAMINO PÚBLICO. `writeCanonicalDwg` escribe el rótulo desde
 *      `positionedAttributes`, y un mapa plano sin geometría se DECLARA como
 *      pérdida en vez de colocar el texto en un sitio inventado.
 *
 * EL LÍMITE: esto enfrenta NUESTRO writer con NUESTRO lector. Que un lector
 * ajeno abra este rótulo lo responde `scripts/dwg/oda-roundtrip.mjs` con el
 * caso `bloque-con-atributos`, que exige el binario con licencia del titular.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { writeAc1015MinimalFile } from "../../src/writer/ac1015-minimal-file-writer.js";
import { writeAc1015EntityBody } from "../../src/writer/ac1015-entity-writer.js";
import { planAc1015MinimalFile } from "../../src/writer/ac1015-minimal-file-plan.js";
import { writeCanonicalDwg } from "../../src/api/write.js";
import { readDwg } from "../../src/api/read.js";
import { dwgDatabaseToCanonicalDocument } from "../../src/api/canonical.js";
import type {
  Ac1015MinimalFileEntitySpec,
  Ac1015MinimalFileOptions,
} from "../../src/writer/ac1015-minimal-file-writer.js";
import type {
  DwgAttribEntity,
  DwgInsertEntity,
} from "../../src/model/entity-geometry.js";

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));
const decode = (bytes: readonly number[]): string => String.fromCharCode(...bytes);

/**
 * Un ATTRIB con los campos que un cuadro de rótulo real usa. Los valores
 * siguen la forma de los cinco ATTRIB del corpus admitido: etiqueta en
 * mayúsculas, valor libre, altura propia y banderas a cero (su semántica no
 * está medida, así que no se ejercita aquí lo que el writer no afirma).
 */
function attrib(
  tag: string,
  value: string,
  overrides: Partial<DwgAttribEntity> = {},
): DwgAttribEntity {
  return {
    kind: "attrib",
    insertion: { x: 15, y: 30 },
    elevation: undefined,
    alignment: undefined,
    thickness: 0,
    extrusion: { x: 0, y: 0, z: 1 },
    obliqueAngle: undefined,
    rotation: undefined,
    height: 5,
    widthFactor: undefined,
    valueBytes: ascii(value),
    generation: undefined,
    horizontalAlignment: undefined,
    verticalAlignment: undefined,
    tagBytes: ascii(tag),
    fieldLength: 0,
    attributeFlags: 0,
    ...overrides,
  };
}

function insert(attributesFollow: boolean): DwgInsertEntity {
  return {
    kind: "insert",
    position: { x: 100, y: 40, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    extrusion: { x: 0, y: 0, z: 1 },
    attributesFollow,
  };
}

const LINE = {
  kind: "line" as const,
  start: { x: 0, y: 0, z: 0 },
  end: { x: 10, y: 0, z: 0 },
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
};

/** Un archivo con un bloque "ROTULO" y el INSERT que lo coloca con su texto. */
function archivoConRotulo(
  attributes: readonly DwgAttribEntity[],
  extra: readonly Ac1015MinimalFileEntitySpec[] = [],
): Ac1015MinimalFileOptions {
  return {
    blocks: [{ name: ascii("ROTULO"), entities: [LINE] }],
    entities: [
      {
        entity: insert(attributes.length > 0),
        insertBlockIndex: 0,
        ...(attributes.length === 0
          ? {}
          : { attributes: attributes.map((entity) => ({ entity })) }),
      },
      ...extra,
    ],
  };
}

test("etiqueta, valor y posición de cada atributo vuelven del archivo", () => {
  const options = archivoConRotulo([
    attrib("PLANO", "PLANTA BAJA"),
    attrib("ESCALA", "1:50", { insertion: { x: 15, y: 15 }, height: 4 }),
  ]);
  const database = readDwg(writeAc1015MinimalFile(options));
  const record = database.modelSpaceEntities[0];
  assert.ok(record, "el INSERT llega al archivo");
  assert.equal(record.entity.kind, "insert");
  if (record.entity.kind !== "insert") throw new Error("inalcanzable");
  assert.equal(
    record.entity.attributesFollow,
    true,
    "el bit de ATTRIBs sale del modelo, no clavado a 0",
  );
  const attributes = record.attributes ?? [];
  assert.equal(attributes.length, 2, "los dos atributos vuelven atados al INSERT");
  const [primero, segundo] = attributes;
  assert.ok(primero && segundo);
  assert.equal(primero.entity.kind, "attrib");
  if (primero.entity.kind !== "attrib") throw new Error("inalcanzable");
  assert.equal(decode(primero.entity.tagBytes), "PLANO");
  assert.equal(decode(primero.entity.valueBytes), "PLANTA BAJA");
  assert.deepEqual(primero.entity.insertion, { x: 15, y: 30 });
  assert.equal(primero.entity.height, 5);
  if (segundo.entity.kind !== "attrib") throw new Error("inalcanzable");
  assert.equal(decode(segundo.entity.tagBytes), "ESCALA");
  assert.equal(decode(segundo.entity.valueBytes), "1:50");
  assert.deepEqual(segundo.entity.insertion, { x: 15, y: 15 });
  assert.equal(segundo.entity.height, 4);
});

test("el SEQEND cierra la secuencia, y no queda suelto en model space", () => {
  const options = archivoConRotulo([attrib("PLANO", "PLANTA BAJA")]);
  const plan = planAc1015MinimalFile(options);
  const grupo = plan.modelAttributeHandles[0];
  assert.ok(grupo, "el plan reparte un grupo ATTRIB+SEQEND");
  const database = readDwg(writeAc1015MinimalFile(options));
  assert.equal(
    database.modelSpaceEntities.length,
    1,
    "ni el ATTRIB ni el SEQEND se cuelan como entidades del espacio",
  );
  const record = database.modelSpaceEntities[0]!;
  assert.equal(
    record.sequenceEndHandle,
    grupo.seqendHandle,
    "el SEQEND vuelve como el cierre de ESTE INSERT",
  );
  assert.equal((record.attributes ?? []).length, 1);
});

test("UN SOLO atributo: primero y último son el mismo, como en el corpus", () => {
  // El INSERT 0x117 de `22-nested-attribs` escribe first y last apuntando al
  // MISMO ATTRIB, y ese atributo viaja con la cadena aislada (prev y next
  // nulos). Esta prueba fija esa forma: con un atributo no hay ±1 que seguir.
  const options = archivoConRotulo([attrib("CLAVE", "VD-101")]);
  const plan = planAc1015MinimalFile(options);
  const grupo = plan.modelAttributeHandles[0]!;
  assert.equal(grupo.attributeHandles.length, 1);
  const database = readDwg(writeAc1015MinimalFile(options));
  const attributes = database.modelSpaceEntities[0]?.attributes ?? [];
  assert.equal(attributes.length, 1);
  assert.equal(attributes[0]?.handle, grupo.attributeHandles[0]);
});

test("LA CADENA DEL ESPACIO SOBREVIVE al rótulo: lo que sigue al INSERT vuelve", () => {
  // Los handles del grupo se reparten DESPUÉS de las entidades del espacio
  // precisamente para que la cadena ±1 siga siendo cierta. Una entidad detrás
  // del INSERT con rótulo es lo que delataría que se rompió.
  const options = archivoConRotulo(
    [attrib("PLANO", "PLANTA BAJA"), attrib("ESCALA", "1:50")],
    [{ entity: LINE }],
  );
  const plan = planAc1015MinimalFile(options);
  assert.equal(
    plan.modelEntityHandles[1],
    plan.modelEntityHandles[0]! + 1,
    "las entidades del espacio siguen consecutivas",
  );
  assert.ok(
    plan.modelAttributeHandles[0]!.attributeHandles[0]! >
      plan.modelEntityHandles[1]!,
    "los atributos se reparten detrás de todo el espacio",
  );
  const database = readDwg(writeAc1015MinimalFile(options));
  assert.deepEqual(
    database.modelSpaceEntities.map((entity) => entity.entity.kind),
    ["insert", "line"],
  );
});

test("un rótulo DENTRO de un bloque se ata igual que en model space", () => {
  // `22-nested-attribs` trae justamente esto: un INSERT en modo 0, dentro de
  // otro bloque, con sus ATTRIB colgando de él. La propiedad es del INSERT,
  // no del BLOCK_RECORD, así que el bloque anidado no cambia la forma.
  const bytes = writeAc1015MinimalFile({
    blocks: [
      { name: ascii("ROTULO"), entities: [LINE] },
      {
        name: ascii("PORTADA"),
        entities: [
          {
            entity: insert(true),
            insertBlockIndex: 0,
            attributes: [{ entity: attrib("PROYECTO", "CASA VALLE") }],
          },
        ],
      },
    ],
    entities: [],
  });
  const database = readDwg(bytes);
  const portada = database.blocks.find((block) => decode(block.name) === "PORTADA");
  assert.ok(portada, "el bloque contenedor existe");
  assert.equal(portada.entities.length, 1, "el ATTRIB no se cuela como contenido");
  const anidado = portada.entities[0]!;
  assert.equal(anidado.entity.kind, "insert");
  const attributes = anidado.attributes ?? [];
  assert.equal(attributes.length, 1);
  if (attributes[0]!.entity.kind !== "attrib") throw new Error("inalcanzable");
  assert.equal(decode(attributes[0]!.entity.tagBytes), "PROYECTO");
  assert.ok(anidado.sequenceEndHandle !== undefined, "y su SEQEND lo cierra");
});

test("BANDERA SIN ATRIBUTOS: el writer falla cerrado", () => {
  assert.throws(
    () => writeAc1015EntityBody(insert(true), 0x100, { insertBlockHandle: 0x200 }),
    (error: unknown) => /first and last ATTRIB/.test(String((error as Error).message)),
    "prometer atributos que el archivo no lleva se rechaza",
  );
  assert.throws(
    () =>
      writeAc1015MinimalFile({
        blocks: [{ name: ascii("ROTULO"), entities: [LINE] }],
        entities: [{ entity: insert(true), insertBlockIndex: 0 }],
      }),
    (error: unknown) =>
      /attributesFollow exactly when/.test(String((error as Error).message)),
  );
});

test("ATRIBUTOS SIN BANDERA: el writer falla cerrado", () => {
  assert.throws(
    () =>
      writeAc1015MinimalFile({
        blocks: [{ name: ascii("ROTULO"), entities: [LINE] }],
        entities: [
          {
            entity: insert(false),
            insertBlockIndex: 0,
            attributes: [{ entity: attrib("PLANO", "PLANTA BAJA") }],
          },
        ],
      }),
    (error: unknown) =>
      /attributesFollow exactly when/.test(String((error as Error).message)),
    "escribir objetos que la bandera no anuncia se rechaza",
  );
});

test("sólo un INSERT lleva atributos, y sólo ATTRIB son atributos", () => {
  assert.throws(
    () =>
      writeAc1015MinimalFile({
        entities: [{ entity: LINE, attributes: [{ entity: attrib("A", "B") }] }],
      }),
    (error: unknown) => /Only an INSERT entity may carry/.test(String((error as Error).message)),
  );
  assert.throws(
    () =>
      writeAc1015MinimalFile({
        blocks: [{ name: ascii("ROTULO"), entities: [LINE] }],
        entities: [
          { entity: insert(true), insertBlockIndex: 0, attributes: [{ entity: LINE }] },
        ],
      }),
    (error: unknown) => /must be ATTRIB entities/.test(String((error as Error).message)),
  );
});

test("un ATTRIB sin etiqueta se rechaza: no sería el dato que era", () => {
  assert.throws(
    () => writeAc1015EntityBody(attrib("", "PLANTA BAJA"), 0x100),
    (error: unknown) =>
      /non-finite or impossible geometry/.test(String((error as Error).message)),
  );
});

test("EL CAMINO PÚBLICO escribe el rótulo desde positionedAttributes", () => {
  const documento = {
    meta: { version: 1, schema: 10, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [
      {
        id: "i1",
        type: "insert",
        block: "ROTULO",
        insertion: { x: 100, y: 40, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: "0",
        attributes: { PLANO: "PLANTA BAJA" },
        positionedAttributes: [
          {
            tag: "PLANO",
            value: "PLANTA BAJA",
            insertion: { x: 15, y: 30, z: 0 },
            height: 5,
          },
        ],
      },
    ],
    history: [],
    modelSpace: { entityIds: ["i1"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [
      {
        id: "b1",
        name: "ROTULO",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [
          { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, layer: "0" },
        ],
      },
    ],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as unknown as Parameters<typeof writeCanonicalDwg>[0];
  const { bytes, lossManifest } = writeCanonicalDwg(documento);
  assert.ok(
    !lossManifest.some((loss) => loss.code === "insert-attributes-without-geometry"),
    "con geometría no se declara la pérdida del mapa plano",
  );
  const database = readDwg(bytes);
  const attributes = database.modelSpaceEntities[0]?.attributes ?? [];
  assert.equal(attributes.length, 1);
  if (attributes[0]!.entity.kind !== "attrib") throw new Error("inalcanzable");
  assert.equal(decode(attributes[0]!.entity.valueBytes), "PLANTA BAJA");

  // Y la vuelta: el canónico recupera las DOS proyecciones del atributo.
  const canonical = dwgDatabaseToCanonicalDocument(database);
  const vuelto = canonical.document.entities[0] as Record<string, unknown>;
  assert.deepEqual(vuelto["attributes"], { PLANO: "PLANTA BAJA" });
  const posicionados = vuelto["positionedAttributes"] as Record<string, unknown>[];
  assert.equal(posicionados.length, 1);
  assert.equal(posicionados[0]!["tag"], "PLANO");
  assert.deepEqual(posicionados[0]!["insertion"], { x: 15, y: 30, z: 0 });
  assert.equal(posicionados[0]!["height"], 5);
});

test("UN MAPA PLANO SIN GEOMETRÍA SE DECLARA, no se dibuja al azar", () => {
  const documento = {
    meta: { version: 1, schema: 10, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [
      {
        id: "i1",
        type: "insert",
        block: "ROTULO",
        insertion: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: "0",
        attributes: { PLANO: "PLANTA BAJA" },
      },
    ],
    history: [],
    modelSpace: { entityIds: ["i1"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [
      {
        id: "b1",
        name: "ROTULO",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [
          { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, layer: "0" },
        ],
      },
    ],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as unknown as Parameters<typeof writeCanonicalDwg>[0];
  const { bytes, lossManifest } = writeCanonicalDwg(documento);
  const perdida = lossManifest.find(
    (loss) => loss.code === "insert-attributes-without-geometry",
  );
  assert.ok(perdida, "la pérdida se declara con su código propio");
  assert.equal(perdida.severity, "warning");
  const database = readDwg(bytes);
  const record = database.modelSpaceEntities[0]!;
  assert.equal(record.entity.kind, "insert");
  if (record.entity.kind !== "insert") throw new Error("inalcanzable");
  assert.equal(
    record.entity.attributesFollow,
    false,
    "el bloque llega sin rótulo, pero el archivo no promete uno",
  );
});
