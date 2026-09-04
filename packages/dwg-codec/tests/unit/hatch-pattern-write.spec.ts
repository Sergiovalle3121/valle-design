/**
 * Spec de la ESCRITURA del HATCH CON TRAMA — el bloque de patrón que el
 * writer descartaba.
 *
 * ESTA SPEC EXISTE POR UNA PÉRDIDA MEDIDA. Hasta el 2026-09-04 `emitHatch`
 * fijaba el bit de relleno sólido a 1 y `validateEntity` rechazaba cerrado
 * todo sombreado que no fuera sólido: de las cuatro entidades HATCH del
 * corpus ajeno, dos se regrababan y dos se declaraban perdidas. No era un
 * campo mal escrito — era un achurado que desaparecía del archivo.
 *
 * QUÉ SE PRUEBA, y por qué así:
 *
 *   1. IDA Y VUELTA con los valores MEDIDOS en material ajeno. El ANSI31 de
 *      `11-hatch` (bundle `foundational-entities-ac1015`) guarda ángulo de
 *      línea 0.7853981633974483 rad y desfase (−0.0883883476483184,
 *      0.0883883476483184); el DXF del oráculo del MISMO bundle escribe para
 *      esa línea 53 = 45.0 y 45/46 con esos mismos dos números. Los valores
 *      de esta spec son ésos, no unos inventados.
 *   2. QUE EL BLOQUE ACABE DONDE DEBE. La trama va ENTRE el tipo de patrón y
 *      los puntos semilla, así que un sombreado con semilla es la prueba de
 *      que el bloque no se pasó ni se quedó corto: un solo bit de más y la
 *      semilla vuelve con otro número.
 *   3. QUE LA FRONTERA SIGA CERRADA. Sin definición no se inventa una trama:
 *      el writer falla cerrado, y quien llama declara la pérdida.
 *
 * EL LÍMITE: esto enfrenta NUESTRO writer con NUESTRO lector. Que un lector
 * ajeno abra esta trama lo responde `scripts/dwg/oda-roundtrip.mjs` con el
 * caso `sombreado-patron`, que exige el binario con licencia del titular.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { writeAc1015MinimalFile } from "../../src/writer/ac1015-minimal-file-writer.js";
import { writeAc1015EntityBody } from "../../src/writer/ac1015-entity-writer.js";
import { writeCanonicalDwg } from "../../src/api/write.js";
import { readDwg } from "../../src/api/read.js";
import type {
  DwgHatchEntity,
  DwgHatchPath,
} from "../../src/model/entity-geometry.js";

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));
const decode = (bytes: readonly number[]): string => String.fromCharCode(...bytes);

/** Los dos números del ANSI31 tal como los guarda el corpus ajeno. */
const ANSI31_LINE_ANGLE = 0.7853981633974483;
const ANSI31_OFFSET = { x: -0.0883883476483184, y: 0.0883883476483184 };

const CONTORNO: DwgHatchPath = {
  kind: "polyline",
  flags: 0,
  closed: true,
  vertices: [
    { x: 0, y: 0 },
    { x: 80, y: 0 },
    { x: 80, y: 80 },
    { x: 0, y: 80 },
  ],
  bulges: undefined,
  boundaryObjectCount: 0,
};

function hatchConTrama(overrides: Partial<DwgHatchEntity> = {}): DwgHatchEntity {
  return {
    kind: "hatch",
    elevation: 0,
    extrusion: { x: 0, y: 0, z: 1 },
    nameBytes: ascii("ANSI31"),
    solidFill: false,
    associative: false,
    paths: [CONTORNO],
    style: 0,
    patternType: 0,
    angle: 0,
    scaleOrSpacing: 1,
    doubleHatch: false,
    definitionLines: [
      {
        angle: ANSI31_LINE_ANGLE,
        basePoint: { x: 0, y: 0 },
        offset: ANSI31_OFFSET,
        dashes: [],
      },
    ],
    pixelSize: undefined,
    seedPoints: [],
    ...overrides,
  };
}

/** El único HATCH del archivo escrito, releído. */
function releer(entity: DwgHatchEntity): DwgHatchEntity {
  const bytes = writeAc1015MinimalFile({ entities: [{ entity }] });
  const database = readDwg(bytes);
  const record = database.modelSpaceEntities[0];
  assert.ok(record, "el sombreado llega al archivo");
  assert.equal(record.entity.kind, "hatch");
  if (record.entity.kind !== "hatch") throw new Error("inalcanzable");
  return record.entity;
}

test("la trama de ANSI31 medida en el corpus vuelve idéntica", () => {
  const releido = releer(hatchConTrama());
  assert.equal(decode(releido.nameBytes), "ANSI31");
  assert.equal(releido.solidFill, false, "el bit de sólido sale del modelo");
  assert.equal(releido.angle, 0, "el giro del patrón");
  assert.equal(releido.scaleOrSpacing, 1);
  assert.equal(releido.doubleHatch, false);
  assert.deepEqual(releido.definitionLines, [
    {
      angle: ANSI31_LINE_ANGLE,
      basePoint: { x: 0, y: 0 },
      offset: ANSI31_OFFSET,
      dashes: [],
    },
  ]);
});

test("una trama de VARIAS familias con TRAZOS vuelve línea a línea", () => {
  // Dos familias cruzadas con secuencia de trazos y hueco: es lo que separa
  // «escribimos un ángulo» de «escribimos una trama». El recuento de trazos
  // es un BS delante de sus longitudes, así que una secuencia de distinta
  // longitud en cada familia es justo lo que delata un recuento mal puesto.
  const releido = releer(
    hatchConTrama({
      nameBytes: ascii("EARTH"),
      angle: Math.PI / 6,
      scaleOrSpacing: 2.5,
      doubleHatch: true,
      definitionLines: [
        {
          angle: 0,
          basePoint: { x: 1, y: 2 },
          offset: { x: 0, y: 2.5 },
          dashes: [2.5, -2.5],
        },
        {
          angle: Math.PI / 2,
          basePoint: { x: -1.5, y: 0 },
          offset: { x: -2.5, y: 0 },
          dashes: [1.25, -0.5, 0, -0.5],
        },
      ],
    }),
  );
  assert.equal(releido.angle, Math.PI / 6);
  assert.equal(releido.scaleOrSpacing, 2.5);
  assert.equal(releido.doubleHatch, true, "el bit de doble trama viaja");
  assert.equal(releido.definitionLines?.length, 2);
  assert.deepEqual(releido.definitionLines?.[0]?.dashes, [2.5, -2.5]);
  assert.deepEqual(releido.definitionLines?.[1]?.dashes, [1.25, -0.5, 0, -0.5]);
  assert.deepEqual(releido.definitionLines?.[1]?.basePoint, { x: -1.5, y: 0 });
  assert.deepEqual(releido.definitionLines?.[1]?.offset, { x: -2.5, y: 0 });
});

test("EL BLOQUE ACABA DONDE DEBE: la semilla de después vuelve intacta", () => {
  // La trama va entre el tipo de patrón y los puntos semilla. Si sobrara o
  // faltara un solo bit, esta semilla volvería con otras coordenadas: es la
  // prueba de posición, no de contenido.
  const releido = releer(
    hatchConTrama({ seedPoints: [{ x: 12.5, y: -7.25 }] }),
  );
  assert.deepEqual(releido.seedPoints, [{ x: 12.5, y: -7.25 }]);
  assert.equal(releido.definitionLines?.length, 1);
});

test("el relleno SÓLIDO sigue sin bloque de trama y vuelve igual", () => {
  const releido = releer(
    hatchConTrama({
      nameBytes: ascii("SOLID"),
      solidFill: true,
      angle: undefined,
      scaleOrSpacing: undefined,
      doubleHatch: undefined,
      definitionLines: undefined,
      seedPoints: [{ x: 3, y: 4 }],
    }),
  );
  assert.equal(releido.solidFill, true);
  assert.equal(releido.definitionLines, undefined, "el sólido no lleva trama");
  assert.deepEqual(releido.seedPoints, [{ x: 3, y: 4 }]);
});

test("SIN definición no se inventa una trama: el writer falla cerrado", () => {
  const sinTrama = hatchConTrama({
    angle: undefined,
    scaleOrSpacing: undefined,
    doubleHatch: undefined,
    definitionLines: undefined,
  });
  assert.throws(
    () => writeAc1015EntityBody(sinTrama, 0x100),
    (error: unknown) =>
      /pattern definition lines/.test(String((error as Error).message)),
    "un sombreado de trama sin su definición se rechaza, no se emite sólido",
  );
});

test("una definición ROTA se rechaza en vez de desincronizar el cuerpo", () => {
  const rota = hatchConTrama({
    definitionLines: [
      {
        angle: Number.NaN,
        basePoint: { x: 0, y: 0 },
        offset: ANSI31_OFFSET,
        dashes: [],
      },
    ],
  });
  assert.throws(() => writeAc1015EntityBody(rota, 0x100));
});

/** Documento canónico mínimo con un solo sombreado. */
const documentoCon = (hatch: Record<string, unknown>) =>
  ({
    meta: { version: 1, schema: 9, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#FFFFFF", visible: true, locked: false }],
    entities: [hatch],
    history: [],
    modelSpace: { entityIds: ["h1"] },
    paperSpaces: [],
    blocks: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  }) as never;

const CONTORNO_CANONICO = [
  { x: 0, y: 0, z: 0 },
  { x: 40, y: 0, z: 0 },
  { x: 40, y: 40, z: 0 },
  { x: 0, y: 40, z: 0 },
];

test("el camino público escribe la trama que el documento TRAE", () => {
  const { bytes, lossManifest } = writeCanonicalDwg(
    documentoCon({
      id: "h1",
      type: "hatch",
      pattern: "ANSI31",
      solid: false,
      boundaries: [CONTORNO_CANONICO],
      layer: "0",
      patternDefinition: {
        angle: 0,
        scale: 1,
        double: false,
        lines: [
          {
            angle: ANSI31_LINE_ANGLE,
            basePoint: { x: 0, y: 0 },
            offset: ANSI31_OFFSET,
            dashes: [],
          },
        ],
      },
    }),
  );
  const database = readDwg(bytes);
  assert.equal(database.modelSpaceEntities.length, 1, "el sombreado ya no desaparece");
  const written = database.modelSpaceEntities[0]!.entity;
  assert.equal(written.kind, "hatch");
  if (written.kind !== "hatch") throw new Error("inalcanzable");
  assert.equal(written.solidFill, false);
  assert.equal(decode(written.nameBytes), "ANSI31");
  assert.equal(written.definitionLines?.[0]?.angle, ANSI31_LINE_ANGLE);
  assert.deepEqual(written.definitionLines?.[0]?.offset, ANSI31_OFFSET);
  assert.ok(
    !lossManifest.some((loss) => loss.code === "hatch-pattern-definition-missing"),
    "y no se declara perdido lo que sí viajó",
  );
});

test("una trama a medias no se cuela por el camino público", () => {
  // `entities` es `Record<string, unknown>`: cualquiera puede poner cualquier
  // cosa ahí. Media línea de definición no daría una trama fea — daría un
  // recuento que no cuadra con lo que sigue. Se acepta entera o ninguna.
  const { lossManifest } = writeCanonicalDwg(
    documentoCon({
      id: "h1",
      type: "hatch",
      pattern: "ANSI31",
      solid: false,
      boundaries: [CONTORNO_CANONICO],
      layer: "0",
      patternDefinition: {
        angle: 0,
        scale: 1,
        double: false,
        lines: [{ angle: ANSI31_LINE_ANGLE, offset: ANSI31_OFFSET }],
      },
    }),
  );
  assert.ok(
    lossManifest.some((loss) => loss.code === "hatch-pattern-definition-missing"),
    "la definición incompleta se declara como si no hubiera llegado",
  );
});
