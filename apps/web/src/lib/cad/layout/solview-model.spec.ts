/**
 * QUIÉN TAPA A QUIÉN EN LA VISTA QUE LLEGA A LA LÁMINA.
 *
 * ## El defecto, medido antes de tocar nada
 *
 * `docs/competitive/distancia-autocad-completo-20260901.md`, defecto (a) del
 * área «de 3D a documentación»:
 *
 *     la vista que llega a la lámina no resuelve qué tapa a qué entre
 *     cuerpos distintos —y se declara exacta
 *
 * Lo comprobé sobre este mismo modelo, con la implementación anterior: un muro
 * ENTERAMENTE detrás de otro salía con **4 aristas VISTAS** —a la capa `-VIS`,
 * encima del muro de delante— y `exact: true`. No era un descuido de una
 * bandera: `cadSolidEdgeVisibility` pregunta por una arista y su propio
 * cuerpo, y nunca mira a los demás, así que el caso no se puede resolver ahí
 * ni en principio.
 *
 * ## Qué se afirma aquí
 *
 * Lo que este archivo fija no es «salen menos líneas»: es que la línea que
 * está tapada está en la lista de OCULTAS, que la que no lo está sigue vista, y
 * que cuando el veredicto no se puede dar, `exact` deja de decir que sí.
 */
import { strict as assert } from "node:assert";
import type { CadViewportView } from "../cad-paper-viewport";
import { cadViewportViewFrame } from "./viewport-view";
import {
  cadSolviewContributions,
  cadSolviewProject,
  cadSolviewSources,
  cadSolviewWindow,
} from "./solview-model";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

const muro = (
  id: string,
  y: number,
  x0: number,
  x1: number,
  z: number,
  height: number,
) => ({
  id,
  type: "wall" as const,
  layer: "0",
  start: { x: x0, y, z },
  end: { x: x1, y, z },
  thickness: 150,
  height,
});

/** Se mira hacia +Y desde el sur: lo que tiene menos Y está DELANTE. */
const ALZADO: CadViewportView = {
  kind: "elevation",
  direction: { x: 0, y: 1, z: 0 },
  up: { x: 0, y: 0, z: 1 },
  target: { x: 2_000, y: 1_000, z: 1_500 },
} as never;

function resolver(entities: readonly unknown[], view: CadViewportView = ALZADO) {
  const outcome = cadViewportViewFrame(view);
  assert.ok(outcome.ok, "la cámara del alzado se resuelve");
  const sources = cadSolviewSources({ entities } as never);
  const window = cadSolviewWindow(sources, outcome.frame, view);
  assert.ok(window, "la vista encuadra algo");
  return {
    sources,
    frame: outcome.frame,
    contributions: cadSolviewContributions(sources, outcome.frame, view, window),
  };
}

// --- 1 · un muro entero detrás de otro NO aporta ni una línea vista ---------
{
  // «detrás» es más corto y más bajo, y arranca más arriba: su proyección cae
  // ESTRICTAMENTE dentro de la del muro de delante. Nada de aristas que
  // coincidan en el papel — ése es otro caso, y el solucionador declara que en
  // él la respuesta es arbitraria.
  const { sources, frame, contributions } = resolver([
    muro("delante", 0, 0, 4_000, 0, 3_000),
    muro("detras", 2_000, 1_000, 3_000, 500, 1_500),
  ]);

  const detras = contributions.find((c) => c.entityId === "detras");
  ok(detras, "el muro de atrás sigue en la vista: se dibuja, pero en su capa");
  eq(detras!.visible.length, 0, "y no aporta NI UNA línea a la capa de vistas");
  ok(detras!.hidden.length > 0, "todas sus aristas son ocultas");

  const delante = contributions.find((c) => c.entityId === "delante");
  ok(delante!.visible.length > 0, "el muro de delante sí se ve");

  // El control que convierte esto en una medición y no en una opinión: la
  // clasificación POR CUERPO —la que había— daba cuatro vistas sobre el mismo
  // modelo. Si algún día vuelve, esta comprobación lo dice con el número.
  const porCuerpo = cadSolviewProject(sources.find((s) => s.entityId === "detras")!, frame, ALZADO);
  eq(porCuerpo.visible.length, 4, "control: por cuerpo salían cuatro vistas (el defecto)");
  eq(porCuerpo.exact, true, "y se declaraba exacta, que era lo peor de todo");
}

// --- 2 · lo que NO está tapado se queda visto --------------------------------
{
  // Dos muros lado a lado, sin taparse. Ninguno debe perder sus vistas: una
  // vista que oculta de más es tan mala como una que oculta de menos.
  const { contributions } = resolver([
    muro("izquierda", 0, 0, 2_000, 0, 3_000),
    muro("derecha", 0, 4_000, 6_000, 0, 3_000),
  ]);
  for (const id of ["izquierda", "derecha"]) {
    const aporte = contributions.find((c) => c.entityId === id);
    ok(aporte, `${id} está en la vista`);
    ok(aporte!.visible.length > 0, `${id} conserva sus líneas vistas`);
  }
}

// --- 3 · un solo cuerpo cóncavo se resuelve, y se declara exacto -------------
{
  // La clasificación por cuerpo NO es exacta sobre un cóncavo y lo declaraba.
  // Con el solucionador analítico sí lo es. Se usa una L de dos muros unidos,
  // que es la pieza cóncava que un arquitecto dibuja todos los días.
  const alaB = {
    id: "ala-b", type: "wall" as const, layer: "0",
    start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 4_000, z: 0 },
    thickness: 150, height: 3_000,
  };
  const { contributions } = resolver([muro("ala-a", 0, 0, 4_000, 0, 3_000), alaB]);
  eq(contributions.length, 2, "las dos alas de la L están en la vista");
  ok(
    contributions.every((aporte) => aporte.exact),
    "la vista se declara exacta porque ahora lo es",
  );
  ok(
    contributions.every((aporte) => aporte.visible.length + aporte.hidden.length > 0),
    "y cada ala aporta trazos de verdad, no una lista vacía",
  );
}

// --- 4 · la envolvente del papel no se mueve --------------------------------
{
  // La PROYECCIÓN sigue siendo la de la ventana: cambia qué capa recibe cada
  // trazo, no dónde cae. Si el encuadre se moviera, cada lámina ya dibujada
  // saldría descolocada al redibujarse.
  const entities = [muro("delante", 0, 0, 4_000, 0, 3_000), muro("detras", 2_000, 1_000, 3_000, 500, 1_500)];
  const { sources, frame, contributions } = resolver(entities);
  for (const aporte of contributions) {
    const porCuerpo = cadSolviewProject(sources.find((s) => s.entityId === aporte.entityId)!, frame, ALZADO);
    const cerca = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    ok(
      cerca(aporte.bounds.x, porCuerpo.bounds.x) &&
        cerca(aporte.bounds.y, porCuerpo.bounds.y) &&
        cerca(aporte.bounds.width, porCuerpo.bounds.width) &&
        cerca(aporte.bounds.height, porCuerpo.bounds.height),
      `${aporte.entityId} ocupa el MISMO rectángulo de papel que antes`,
    );
  }
}

// --- 5 · lo que cuesta resolver una planta entera, MEDIDO ------------------
{
  // Resolver la escena junta cuesta más que preguntar cuerpo a cuerpo, y esa
  // es la razón por la que esto vive en una ORDEN y no en el bucle de dibujo.
  // Cuánto más no se estima: se mide, sobre una planta de oficinas de diez
  // crujías —40 muros—, que es un encargo de verdad y no un cubo.
  const entities: unknown[] = [];
  for (let fila = 0; fila < 10; fila += 1) {
    const y = fila * 3_000;
    entities.push(muro(`h${fila}`, y, 0, 30_000, 0, 3_000));
    for (let columna = 0; columna < 3; columna += 1)
      entities.push({
        id: `v${fila}-${columna}`, type: "wall" as const, layer: "0",
        start: { x: columna * 10_000, y, z: 0 },
        end: { x: columna * 10_000, y: y + 3_000, z: 0 },
        thickness: 150, height: 3_000,
      });
  }
  const outcome = cadViewportViewFrame(ALZADO);
  assert.ok(outcome.ok, "la cámara se resuelve");
  const sources = cadSolviewSources({ entities } as never);
  const window = cadSolviewWindow(sources, outcome.frame, ALZADO);
  assert.ok(window, "la planta encuadra");
  eq(sources.length, 40, "cuarenta muros entran como cuerpos");

  const tiempos: number[] = [];
  let aportes = 0;
  for (let vuelta = 0; vuelta < 5; vuelta += 1) {
    const desde = performance.now();
    aportes = cadSolviewContributions(sources, outcome.frame, ALZADO, window).length;
    tiempos.push(performance.now() - desde);
  }
  tiempos.sort((a, b) => a - b);
  const mediana = tiempos[2];
  eq(aportes, 40, "y los cuarenta llegan a la vista");
  // Medido en el árbol: ~20 ms. El techo es holgado a propósito —un runner
  // compartido no es una máquina de medir—; lo que este número tiene que
  // atrapar es que el coste se dispare, no una décima de más.
  ok(mediana < 400, `una planta de 40 muros se resuelve en ${mediana.toFixed(1)} ms (techo 400)`);
}

console.log(`solview-model: ${verdes} comprobaciones verdes — qué tapa a qué entre cuerpos distintos`);
