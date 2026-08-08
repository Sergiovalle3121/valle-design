/**
 * CHAMFER sobre dos LINE canónicas — la gemela de FILLET que faltaba.
 *
 * EL HUECO. `cad-fillet.ts` redondea una esquina con un ARC tangente y está
 * cableado al editor. Su pareja en cualquier CAD 2D —cortar la esquina con un
 * tramo recto— sólo existía para MUROS legacy (`chamferWallsPreview`), que
 * trabaja sobre otro modelo de datos y no toca el documento canónico. Sobre las
 * entidades nativas no había CHAMFER de ninguna forma.
 *
 * Y NO ERA POR FALTA DE MATEMÁTICA: `geom-edit.ts` ya tenía `chamferCorner`,
 * correcta. Nadie la había cableado al documento.
 *
 * LA CONVENCIÓN, que es lo que hace determinista el resultado. Dos rectas se
 * cortan en un punto y eso deja CUATRO esquinas posibles. FILLET ya resolvió esa
 * ambigüedad sin depender de dónde pinchó el ratón: el extremo de cada línea más
 * CERCANO al cruce es el que se mueve, y el otro —el lejano— define la dirección
 * que se conserva. CHAMFER usa exactamente la misma regla, porque las dos
 * órdenes se aplican sobre la misma selección y dar respuestas distintas a la
 * misma pareja de líneas sería incoherente.
 *
 * LAS DOS DISTANCIAS. AutoCAD corta a distancia D1 sobre la primera línea y D2
 * sobre la segunda; con D1 = D2 el chaflán es simétrico. Se admiten distintas,
 * porque un chaflán asimétrico es justo lo que se pide en un despiece.
 */
import assert from "node:assert/strict";
import { applyCadLineChamfer, computeCadLineChamfer } from "./cad-chamfer";
import type { CadDocument, CadEntity } from "./cad-document";

type CadLine = Extract<CadEntity, { type: "line" }>;

const horizontal: CadLine = {
  id: "horizontal",
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 10, y: 0, z: 0 },
  layer: "WALLS",
};
const vertical: CadLine = {
  id: "vertical",
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 0, y: 10, z: 0 },
  layer: "WALLS",
};

const near = (value: number, expected: number, what: string) =>
  assert.ok(
    Math.abs(value - expected) < 1e-9,
    `${what}: se esperaba ${expected} y llegó ${value}`,
  );

// ---------------------------------------------------------------------------
// La esquina recta de manual: 2 y 2 sobre un ángulo de 90°
// ---------------------------------------------------------------------------

{
  const geometry = computeCadLineChamfer(horizontal, vertical, 2, 2, "chaflan");

  // El extremo que se mueve es el CERCANO al cruce (aquí, el origen en ambas).
  near(geometry.lineA.start.x, 2, "la horizontal se recorta a 2 del cruce");
  near(geometry.lineA.start.y, 0, "sin salirse de su propia recta");
  assert.deepEqual(
    geometry.lineA.end,
    horizontal.end,
    "y el extremo lejano no se toca",
  );
  near(geometry.lineB.start.y, 2, "la vertical se recorta a 2 del cruce");
  near(geometry.lineB.start.x, 0, "sin salirse de su propia recta");
  assert.deepEqual(geometry.lineB.end, vertical.end, "y su lejano tampoco");

  // El chaflán une los dos puntos de corte y es una LÍNEA, no un arco.
  assert.equal(geometry.chamfer.type, "line", "un chaflán es un tramo recto");
  assert.equal(geometry.chamfer.id, "chaflan");
  assert.deepEqual(geometry.chamfer.start, geometry.lineA.start);
  assert.deepEqual(geometry.chamfer.end, geometry.lineB.start);
  near(
    Math.hypot(
      geometry.chamfer.end.x - geometry.chamfer.start.x,
      geometry.chamfer.end.y - geometry.chamfer.start.y,
    ),
    Math.sqrt(8),
    "la hipotenusa del triángulo 2-2",
  );
  assert.equal(
    geometry.chamfer.layer,
    "WALLS",
    "el chaflán hereda la capa de la primera línea, como hace FILLET",
  );
  near(geometry.intersection.x, 0, "el cruce es el origen");
  near(geometry.intersection.y, 0, "el cruce es el origen");
}

// ---------------------------------------------------------------------------
// Distancias distintas: el chaflán asimétrico del despiece
// ---------------------------------------------------------------------------

{
  const geometry = computeCadLineChamfer(horizontal, vertical, 1, 4, "asim");
  near(geometry.lineA.start.x, 1, "D1 se aplica a la PRIMERA línea");
  near(geometry.lineB.start.y, 4, "y D2 a la segunda, no al revés");
}

// ---------------------------------------------------------------------------
// La esquina se elige por el extremo cercano, no por el orden de los puntos
// ---------------------------------------------------------------------------

{
  // La misma horizontal escrita al revés: su extremo cercano al cruce es ahora
  // `end`. El chaflán tiene que salir en el mismo sitio.
  const reversed: CadLine = {
    ...horizontal,
    start: { x: 10, y: 0, z: 0 },
    end: { x: 0, y: 0, z: 0 },
  };
  const geometry = computeCadLineChamfer(reversed, vertical, 2, 2, "rev");
  near(geometry.lineA.end.x, 2, "se mueve el extremo cercano, sea `start` o `end`");
  assert.deepEqual(
    geometry.lineA.start,
    reversed.start,
    "y el lejano se conserva",
  );
}

{
  // Esquina en el OTRO cuadrante: dos líneas que se cruzan en (10,10) por sus
  // extremos lejanos del origen.
  const a: CadLine = {
    id: "a",
    type: "line",
    start: { x: 0, y: 10, z: 0 },
    end: { x: 10, y: 10, z: 0 },
    layer: "0",
  };
  const b: CadLine = {
    id: "b",
    type: "line",
    start: { x: 10, y: 0, z: 0 },
    end: { x: 10, y: 10, z: 0 },
    layer: "0",
  };
  const geometry = computeCadLineChamfer(a, b, 3, 3, "esquina");
  near(geometry.lineA.end.x, 7, "el corte cae hacia DENTRO del tramo conservado");
  near(geometry.lineB.end.y, 7, "en las dos líneas");
}

// ---------------------------------------------------------------------------
// Lo que se rechaza, y por qué
// ---------------------------------------------------------------------------

{
  const parallel: CadLine = {
    ...vertical,
    id: "paralela",
    start: { x: 0, y: 1, z: 0 },
    end: { x: 10, y: 1, z: 0 },
  };
  assert.throws(
    () => computeCadLineChamfer(horizontal, parallel, 2, 2, "p"),
    /non-parallel/,
    "dos paralelas no tienen esquina que cortar",
  );
}

{
  assert.throws(
    () => computeCadLineChamfer(horizontal, vertical, 20, 2, "grande"),
    /too large/,
    "una distancia mayor que el tramo conservado se comería la línea entera",
  );
  assert.throws(
    () => computeCadLineChamfer(horizontal, vertical, 2, 20, "grande2"),
    /too large/,
    "y se comprueban las DOS, no sólo la primera",
  );
}

{
  assert.throws(
    () => computeCadLineChamfer(horizontal, horizontal, 2, 2, "misma"),
    /two different/,
    "una línea no se achaflana consigo misma",
  );
  assert.throws(
    () => computeCadLineChamfer(horizontal, vertical, 0, 2, "cero"),
    /greater than zero/,
    "distancia 0 es LIMPIAR LA ESQUINA (unir sin chaflán), otra operación distinta",
  );
  assert.throws(
    () => computeCadLineChamfer(horizontal, vertical, -1, 2, "negativa"),
    /greater than zero/,
    "y una distancia negativa no significa nada",
  );
  assert.throws(
    () => computeCadLineChamfer(horizontal, vertical, 2, 2, "  "),
    /id is required/,
    "el chaflán es una entidad nueva y necesita identidad",
  );
}

// ---------------------------------------------------------------------------
// Sobre el documento: UNA sola entrada de historial y sin reordenar el plano
// ---------------------------------------------------------------------------

const baseDocument: CadDocument = {
  meta: { version: 7, schema: 3, unit: "mm" },
  layers: [
    { id: "WALLS", name: "WALLS", color: "#fff", visible: true, locked: false },
  ],
  entities: [horizontal, vertical],
  history: [],
  modelSpace: { entityIds: ["horizontal", "vertical"] },
  paperSpaces: [],
  styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
  blocks: [],
  constraints: [],
  externalReferences: [],
  unsupportedEntities: [],
  lossManifest: [],
  publications: [],
};

{
  const applied = applyCadLineChamfer(baseDocument, {
    lineAId: "horizontal",
    lineBId: "vertical",
    distanceA: 2,
    distanceB: 2,
    chamferId: "chaflan",
  });

  assert.equal(applied.meta.version, 8, "una versión, no tres");
  assert.equal(
    applied.history.length,
    1,
    "recortar dos líneas y crear el chaflán es UN solo paso deshacible",
  );
  assert.equal(applied.entities.length, 3);
  // `entityIds` es el ORDEN DE DIBUJO. El chaflán va AL FRENTE y no reordena
  // nada de lo que ya había — el mismo defecto que ya se corrigió en FILLET.
  assert.deepEqual(applied.modelSpace.entityIds, [
    "horizontal",
    "vertical",
    "chaflan",
  ]);

  const storedChamfer = applied.entities.find(
    (entity): entity is CadLine => entity.id === "chaflan" && entity.type === "line",
  );
  assert.ok(storedChamfer, "el chaflán llega al documento");
  near(storedChamfer!.start.x, 2, "con la geometría calculada");
  near(storedChamfer!.end.y, 2, "con la geometría calculada");

  const storedA = applied.entities.find(
    (entity): entity is CadLine => entity.id === "horizontal" && entity.type === "line",
  );
  near(storedA!.start.x, 2, "y la línea original queda recortada en el documento");

  // Las entidades de entrada no se mutan.
  assert.deepEqual(horizontal.start, { x: 0, y: 0, z: 0 });
  assert.deepEqual(vertical.start, { x: 0, y: 0, z: 0 });
}

{
  assert.throws(
    () =>
      applyCadLineChamfer(baseDocument, {
        lineAId: "horizontal",
        lineBId: "missing",
        distanceA: 2,
        distanceB: 2,
        chamferId: "x",
      }),
    /two existing LINE/,
    "no se achaflana contra una entidad que no está",
  );
  assert.throws(
    () =>
      applyCadLineChamfer(baseDocument, {
        lineAId: "horizontal",
        lineBId: "vertical",
        distanceA: 2,
        distanceB: 2,
        chamferId: "vertical",
      }),
    /already exists/,
    "y el chaflán no puede pisar el id de una entidad existente",
  );
}

console.log(
  "cad chamfer: dos LINE se achaflanan con la misma regla de esquina que FILLET, en un solo paso deshacible",
);
