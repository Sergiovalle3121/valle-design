/**
 * XCLIP: el recorte llega a la geometría RESUELTA.
 *
 * Guardar un contorno en los metadatos es fácil y no vale de nada. Lo que se
 * afirma aquí es que `resolveCadInsert` —el único sitio por el que pasan el
 * render, la designación, los límites y la exportación— devuelve la geometría
 * YA recortada, con las coordenadas exactas del corte.
 *
 * Con anclas absolutas: una línea de 0 a 1000 recortada por un contorno que
 * llega hasta 400 tiene que salir de 0 a 400. «Salen menos entidades» no
 * prueba nada.
 */
import assert from "node:assert/strict";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../cad-document";
import { executeCadEntityCommandBatch } from "../entity-commands";
import { resolveCadInsert } from "../professional-blocks";
import {
  cadClipPath,
  cadDeleteXclipCommands,
  cadPointInsideBoundary,
  cadSetXclipCommands,
  cadToggleXclipCommands,
  cadXclipOf,
  cadXclipRectangle,
} from "./xclip";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (actual: number, expected: number, message: string) => {
  assert.ok(Math.abs(actual - expected) <= 1e-6, `${message}: ${actual} ≠ ${expected}`);
  checks += 1;
};

/** Un bloque con una línea horizontal de 0 a 1000 y un círculo en (1500, 0). */
function documentWithInsert(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [
      {
        id: "insert-1",
        type: "insert",
        block: "block:tira",
        insertion: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: "0",
      } satisfies CadEntity,
    ],
    blocks: [
      {
        id: "block:tira",
        name: "TIRA",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [
          {
            id: "block:tira:entity:0",
            type: "line",
            start: { x: 0, y: 0, z: 0 },
            end: { x: 1_000, y: 0, z: 0 },
            layer: "0",
          },
          {
            id: "block:tira:entity:1",
            type: "circle",
            center: { x: 1_500, y: 0, z: 0 },
            radius: 100,
            layer: "0",
          },
        ],
      },
    ],
  });
}

const segments = (document: CadDocument) =>
  resolveCadInsert(document, "insert-1")
    .entities.filter((entity): entity is Extract<CadEntity, { type: "line" }> => entity.type === "line")
    .map((entity) => [entity.start.x, entity.end.x] as const)
    .sort((a, b) => a[0] - b[0]);

const circles = (document: CadDocument) =>
  resolveCadInsert(document, "insert-1").entities.filter((entity) => entity.type === "circle").length;

// --- 0. Sin recorte, todo se ve -----------------------------------------------
{
  const document = documentWithInsert();
  assert.deepEqual(segments(document), [[0, 1_000]], "la línea entera");
  assert.equal(circles(document), 1, "y el círculo");
  checks += 2;
}

// --- 1. Recorte RECTANGULAR: la línea sale CORTADA ---------------------------
const clipped = (() => {
  const document = documentWithInsert();
  const boundary = cadXclipRectangle({ x: -100, y: -100 }, { x: 400, y: 100 });
  const next = executeCadEntityCommandBatch(
    document,
    cadSetXclipCommands("insert-1", { boundary }),
    "XCLIP",
  ).document;
  const result = segments(next);
  assert.equal(result.length, 1, "queda un solo trozo de la línea");
  near(result[0][0], 0, "el trozo arranca en el origen");
  // ANCLA ABSOLUTA: el corte cae exactamente en el borde del contorno.
  near(result[0][1], 400, "y termina EXACTAMENTE en el borde del recorte");
  assert.equal(circles(next), 0, "el círculo, que queda fuera, desaparece");
  checks += 2;
  return next;
})();

// --- 2. Invertir enseña lo de FUERA ------------------------------------------
{
  const current = cadXclipOf(clipped.entities.find((entity) => entity.id === "insert-1")!)!;
  const inverted = executeCadEntityCommandBatch(
    clipped,
    cadSetXclipCommands("insert-1", { ...current, inverted: true }),
    "XCLIP Invertir",
  ).document;
  const result = segments(inverted);
  assert.equal(result.length, 1, "queda el trozo complementario");
  near(result[0][0], 400, "que arranca donde acababa el otro");
  near(result[0][1], 1_000, "y llega al final de la línea");
  assert.equal(circles(inverted), 1, "y el círculo de fuera vuelve a verse");
  checks += 2;
}

// --- 3. Desactivar conserva el contorno; suprimir lo borra -------------------
{
  const current = cadXclipOf(clipped.entities.find((entity) => entity.id === "insert-1")!)!;
  const off = executeCadEntityCommandBatch(
    clipped,
    cadToggleXclipCommands("insert-1", current, false),
    "XCLIP Desactivar",
  ).document;
  assert.deepEqual(segments(off), [[0, 1_000]], "desactivado, se ve todo otra vez");
  ok(
    cadXclipOf(off.entities.find((entity) => entity.id === "insert-1")!) !== null,
    "y el contorno sigue guardado, listo para volver a activarse",
  );
  checks += 1;

  const removed = executeCadEntityCommandBatch(
    clipped,
    cadDeleteXclipCommands("insert-1"),
    "XCLIP suPrimir",
  ).document;
  assert.deepEqual(segments(removed), [[0, 1_000]], "suprimido, se ve todo");
  const entity = removed.entities.find((candidate) => candidate.id === "insert-1")!;
  ok(cadXclipOf(entity) === null, "y el contorno ya no está");
  ok(
    entity.context?.metadata === undefined,
    "sin metadatos residuales: dejar la clave vacía cambiaría el serializado",
  );
  checks += 1;
}

// --- 4. Contorno POLIGONAL, y CÓNCAVO ----------------------------------------
{
  // Una «U» invertida: el hueco central deja fuera el tramo de 400 a 600.
  const boundary = [
    { x: -100, y: -100 },
    { x: 1_100, y: -100 },
    { x: 1_100, y: 100 },
    { x: 600, y: 100 },
    { x: 600, y: -50 },
    { x: 400, y: -50 },
    { x: 400, y: 100 },
    { x: -100, y: 100 },
  ];
  ok(cadPointInsideBoundary({ x: 200, y: 50 }, boundary), "el brazo izquierdo está dentro");
  ok(!cadPointInsideBoundary({ x: 500, y: 50 }, boundary), "y el hueco central, fuera");

  // La línea va por y = 0, que atraviesa el hueco: sale partida en DOS.
  const document = executeCadEntityCommandBatch(
    documentWithInsert(),
    cadSetXclipCommands("insert-1", { boundary }),
    "XCLIP Poligonal",
  ).document;
  const result = segments(document);
  assert.equal(result.length, 2, "un contorno cóncavo puede partir una línea en dos trozos");
  near(result[0][0], 0, "primer trozo desde el origen");
  near(result[0][1], 400, "hasta el borde del hueco");
  near(result[1][0], 600, "segundo trozo desde el otro borde");
  near(result[1][1], 1_000, "hasta el final");
  checks += 1;
}

// --- 5. Un contorno degenerado se rechaza ------------------------------------
{
  assert.throws(() => cadSetXclipCommands("insert-1", { boundary: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }), /tres vértices/);
  assert.throws(
    () =>
      cadSetXclipCommands("insert-1", {
        boundary: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 20, y: 0 },
        ],
      }),
    /degenerado/,
    "tres puntos alineados encierran área cero y ocultarían todo el bloque",
  );
  checks += 2;
}

// --- 6. Un recorte ILEGIBLE no oculta el dibujo -------------------------------
{
  const document = executeCadEntityCommandBatch(
    documentWithInsert(),
    [{ type: "metadata", entityId: "insert-1", patch: { "cad:xclip": "{no es json" } }],
    "corrupto",
  ).document;
  assert.deepEqual(
    segments(document),
    [[0, 1_000]],
    "un JSON corrupto se ignora y se ve todo: tratarlo como «recorta todo» haría desaparecer geometría",
  );
  checks += 1;
}

// --- 7. El recortador, sobre un camino suelto ---------------------------------
{
  const pieces = cadClipPath(
    [
      { x: 0, y: 0, z: 0 },
      { x: 1_000, y: 0, z: 0 },
    ],
    { boundary: cadXclipRectangle({ x: 250, y: -10 }, { x: 750, y: 10 }) },
  );
  assert.equal(pieces.length, 1);
  near(pieces[0][0].x, 250, "entra en 250");
  near(pieces[0][pieces[0].length - 1].x, 750, "y sale en 750");
  checks += 1;
}

console.log(`xclip.spec: ${checks} comprobaciones OK`);
