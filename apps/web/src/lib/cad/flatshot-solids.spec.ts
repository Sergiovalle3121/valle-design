/**
 * Que el modelo del ARQUITECTO entre en el aplanado.
 *
 * El defecto (c) del informe de distancia decía que FLATSHOT rechaza los muros.
 * Lo que se afirma aquí es lo contrario, y con qué límites: un muro levanta un
 * prisma con su giro y su cota, una columna redonda se aproxima con un polígono
 * declarado, y lo que no tiene volumen SE CUENTA en vez de desaparecer.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "./cad-document";
import {
  CAD_FLATSHOT_ROUND_SIDES,
  cadFlatshotBodies,
  cadFlatshotFootprint,
  cadFlatshotPrism,
} from "./flatshot-solids";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};
const cerca = (actual: number, esperado: number, mensaje: string, tol = 1e-6) => {
  assert.ok(Math.abs(actual - esperado) <= tol, `${mensaje} (${actual} vs ${esperado})`);
  verdes += 1;
};

const muro = (extra: Partial<Extract<CadEntity, { type: "box" }>> = {}): CadEntity =>
  ({
    id: "muro-1",
    type: "box",
    kind: "wall",
    x: 0, y: 0, w: 3_000, h: 150,
    rotation: 0,
    layer: "0",
    shape: "rect",
    ...extra,
  }) as CadEntity;

const alturas = (kind: string) =>
  kind === "wall"
    ? { height: 3_000 }
    : kind === "column"
      ? { height: 3_200 }
      : kind === "door"
        ? { height: 2_200, opening: true }
        : null;

// --- 1 · un muro levanta un prisma -----------------------------------------
{
  const cuerpo = cadFlatshotPrism(muro() as never, 3_000);
  ok(cuerpo, "un muro de 3.000 × 150 con 3.000 de alto produce cuerpo");
  const zs = cuerpo!.vertices.map((vertice) => vertice.point.z);
  cerca(Math.min(...zs), 0, "arranca en la cota 0");
  cerca(Math.max(...zs), 3_000, "y llega a la altura declarada");
  eq(cuerpo!.vertices.length, 8, "un prisma rectangular tiene ocho vértices");
}

// --- 2 · la cota del objeto sube el prisma entero ---------------------------
{
  const enPlantaAlta = cadFlatshotPrism(
    muro({ context: { elevation: 3_200 } } as never) as never,
    3_000,
    3_200,
  );
  const zs = enPlantaAlta!.vertices.map((vertice) => vertice.point.z);
  cerca(Math.min(...zs), 3_200, "el muro de la planta alta arranca en su cota");
  cerca(Math.max(...zs), 6_200, "y sube su altura desde ahí");
}

// --- 3 · el giro va en la planta, no en un campo aparte ---------------------
{
  const derecho = cadFlatshotFootprint(muro() as never);
  const girado = cadFlatshotFootprint(muro({ rotation: 90 }) as never);
  const ancho = (puntos: { x: number }[]) => Math.max(...puntos.map((p) => p.x)) - Math.min(...puntos.map((p) => p.x));
  const alto = (puntos: { y: number }[]) => Math.max(...puntos.map((p) => p.y)) - Math.min(...puntos.map((p) => p.y));
  cerca(ancho(derecho), 3_000, "derecho mide 3.000 de ancho");
  cerca(ancho(girado), 150, "a 90° el ancho pasa a ser el espesor", 1e-9);
  cerca(alto(girado), 3_000, "y el largo pasa a la otra dirección", 1e-9);
}

// --- 4 · un objeto redondo se aproxima, y se declara con cuántos lados ------
{
  const columna = cadFlatshotFootprint(
    muro({ id: "col", kind: "column", w: 400, h: 400, shape: "circle" }) as never,
  );
  eq(columna.length, CAD_FLATSHOT_ROUND_SIDES, "el polígono tiene los lados declarados");
  eq(CAD_FLATSHOT_ROUND_SIDES, 24, "veinticuatro, y el número está escrito donde se puede medir");
  const radios = columna.map((punto) => Math.hypot(punto.x - 200, punto.y - 200));
  ok(radios.every((radio) => Math.abs(radio - 200) < 1e-6), "todos sus vértices caen en la circunferencia");
}

// --- 5 · lo que no tiene volumen SE CUENTA ---------------------------------
{
  const entidades: CadEntity[] = [
    muro(),
    { id: "linea", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer: "0" } as CadEntity,
    muro({ id: "sin-altura", kind: "mesa" }),
    muro({ id: "sin-area", w: 0 }),
  ];
  const resultado = cadFlatshotBodies(entidades, alturas);
  eq(resultado.bodies.length, 1, "sólo entra el muro");
  eq(resultado.skipped.length, 3, "y los otros tres se cuentan, no desaparecen");
  ok(
    resultado.skipped.some((fuera) => fuera.entityId === "linea" && /no tiene volumen/.test(fuera.reason)),
    "la línea dice por qué no entra",
  );
  ok(
    resultado.skipped.some((fuera) => fuera.entityId === "sin-altura" && /no declara altura/.test(fuera.reason)),
    "el objeto sin altura declarada, también",
  );
  ok(
    resultado.skipped.some((fuera) => fuera.entityId === "sin-area" && /no tiene área/.test(fuera.reason)),
    "y el que no tiene planta",
  );
}

// --- 6 · una altura no positiva no inventa un volumen ----------------------
eq(cadFlatshotPrism(muro() as never, 0), null, "altura cero no produce cuerpo");
eq(cadFlatshotPrism(muro() as never, -100), null, "y una negativa tampoco");

// --- 7 · un HUECO se resta del muro, no se dibuja encima -------------------
{
  // Muro de 6 m con una puerta de 1 m atravesándolo por el centro. La puerta es
  // MÁS GRUESA que el muro a propósito: así corta de lado a lado, que es lo que
  // hace una puerta de verdad.
  const entidades: CadEntity[] = [
    muro({ id: "muro", w: 6_000, h: 150 }),
    muro({ id: "puerta", kind: "door", x: 2_500, y: -100, w: 1_000, h: 350 }),
  ];
  const resultado = cadFlatshotBodies(entidades, alturas);
  eq(resultado.bodies.length, 1, "el hueco no es un cuerpo más: sólo queda el muro");
  eq(resultado.openings, 1, "y se cuenta que se restó uno");
  eq(resultado.skipped.length, 0, "sin nada excluido");

  // El muro con hueco tiene MÁS vértices que el muro entero: la resta dejó el
  // dintel y las dos jambas.
  const entero = cadFlatshotBodies([muro({ id: "muro", w: 6_000, h: 150 })], alturas);
  ok(
    resultado.bodies[0].vertices.length > entero.bodies[0].vertices.length,
    `el muro con hueco tiene más vértices que el entero (${resultado.bodies[0].vertices.length} vs ${entero.bodies[0].vertices.length})`,
  );

  // Y el hueco llega hasta la altura de la puerta, no hasta arriba: queda dintel.
  const zs = resultado.bodies[0].vertices.map((vertice) => vertice.point.z);
  cerca(Math.max(...zs), 3_000, "el muro sigue midiendo 3.000 de alto", 1e-6);
  ok(zs.some((z) => Math.abs(z - 2_200) < 1e-6), "y hay vértices a la altura del dintel");
}

// --- 8 · una puerta lejos del muro no corta nada, y no se cuenta -----------
{
  const resultado = cadFlatshotBodies(
    [muro({ id: "muro", w: 1_000, h: 150 }), muro({ id: "puerta", kind: "door", x: 50_000, y: 50_000, w: 1_000, h: 350 })],
    alturas,
  );
  eq(resultado.bodies.length, 1, "el muro sigue entero");
  eq(resultado.openings, 0, "y no se cuenta un hueco que no cortó nada");
  // Y NO se calla: una puerta que no toca ningún muro casi siempre es un
  // objeto mal colocado, y el dibujante tiene que enterarse por la orden.
  eq(resultado.skipped.length, 1, "el hueco que no cortó nada se cuenta");
  eq(resultado.skipped[0].entityId, "puerta", "con su identificador");
  ok(/no toca ningún cuerpo/.test(resultado.skipped[0].reason), "y con el motivo exacto");
}

console.log(`flatshot-solids: ${verdes} comprobaciones verdes`);
