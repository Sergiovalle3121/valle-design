/**
 * `snap-engine.ts` es puro y sabe resolver los catorce modos de OSNAP dada una
 * `SnapScene`. Lo que este spec verificaba ANTES no probaba eso: construía una
 * `SnapScene` a mano con `insertions`/`geometricCenters`/`tangents` ya
 * rellenos, así que pasaba en verde aunque NINGÚN adaptador del documento
 * emitiera esos cubos — y de hecho no los emitía, porque `CadSnapKind` sólo
 * tenía cinco valores (T-14). Un spec verde sobre una función muerta.
 *
 * Aquí se alimenta la escena con `cadSnapSceneAddEntities`, tal y como la
 * llama el editor de verdad, sobre entidades reales del documento: una LÍNEA,
 * una POLILÍNEA cerrada, un CÍRCULO, un MTEXT, un INSERT y un POINT. Si un
 * adaptador vuelve a mentir sobre su `kind` —o si alguien borra el mapa de
 * `snap-scene.ts` y reintroduce el reparto «todo lo demás → endpoints»—, este
 * spec deja de pasar.
 */
import assert from "node:assert/strict";
import type { CadNativeEntity } from "./entity-runtime";
import { cadSnapSceneAddEntities } from "./snap-scene";
import { apparentIntersection, nearestOnExtension, snap, type SnapScene } from "./snap-engine";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

// --- las dos funciones puras de intersección/extensión, sin escena --------
{
  const apparent = apparentIntersection(
    { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
    { a: { x: 3, y: -2 }, b: { x: 3, y: -1 } },
  );
  assert.deepEqual(apparent, { x: 3, y: 0 });
  checks += 1;
  assert.deepEqual(
    nearestOnExtension({ x: 15, y: 2 }, { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }),
    { x: 15, y: 0 },
  );
  checks += 1;
}

// --- entidades reales del documento, cada una en su propia esquina --------
const line: CadNativeEntity = {
  id: "line-1",
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 10, y: 0, z: 0 },
  layer: "0",
};

const closedPolyline: CadNativeEntity = {
  id: "poly-1",
  type: "polyline",
  vertices: [
    { x: 100, y: -100, z: 0 },
    { x: 110, y: -100, z: 0 },
    { x: 110, y: -90, z: 0 },
    { x: 100, y: -90, z: 0 },
  ],
  closed: true,
  layer: "0",
};

const circleCenter = { x: 500, y: 500 };
const circleRadius = 5;
const circle: CadNativeEntity = {
  id: "circle-1",
  type: "circle",
  center: { x: circleCenter.x, y: circleCenter.y, z: 0 },
  radius: circleRadius,
  layer: "0",
};

// `alignment: "middle-center"` + un ancho/alto explícitos: con la alineación
// por defecto («top-left») la esquina superior izquierda del MTEXT CAE en el
// mismo punto que la inserción, y esa esquina también es un candidato válido
// (kind `control` → cubo `nodes`, de mayor prioridad que `insertion` en el
// desempate). El empate no es un defecto de este arreglo — es harina de otro
// costal (el adaptador de MTEXT) — así que el fixture lo evita en vez de
// esconderlo detrás de un desempate afortunado.
const mtext: CadNativeEntity = {
  id: "mtext-1",
  type: "mtext",
  insertion: { x: 50, y: 50, z: 0 },
  text: "ANTEPROYECTO",
  width: 40,
  height: 10,
  alignment: "middle-center",
  layer: "0",
};

const insert: CadNativeEntity = {
  id: "insert-1",
  type: "insert",
  block: "PUERTA-90",
  insertion: { x: 200, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  rotation: 0,
  layer: "0",
};

const point: CadNativeEntity = {
  id: "point-1",
  type: "point",
  position: { x: -20, y: -20, z: 0 },
  layer: "0",
};

// El cursor de referencia con el que se construye la escena: lejos del
// círculo, para que sus dos tangentes existan (T-14: el cálculo copia el
// bloque que `curve-entity-adapters.ts` ya usa para el arco).
const reference = { x: 20, y: 20 };

// --- la escena la construye EL MISMO camino que el editor -----------------
const scene: SnapScene = {};
cadSnapSceneAddEntities(scene, [line, closedPolyline, circle, mtext, insert, point], reference);

{
  const midOfLine = snap({ x: 5.1, y: 0 }, scene, { tolerance: 1 });
  ok(midOfLine?.type === "midpoint", "el medio de una LINE resuelve `midpoint`, no `center`");
  assert.deepEqual(midOfLine?.point, { x: 5, y: 0 });
  checks += 1;
}

{
  // Golden de la casa: MED sobre un tramo recto de POLILÍNEA — el racimo que
  // antes emitía `control` (que el motor reparte como punto de control, no
  // como midpoint), así que MED nunca imantaba ahí.
  const midOfPolylineSegment = snap({ x: 105.1, y: -100 }, scene, { tolerance: 1 });
  ok(
    midOfPolylineSegment?.type === "midpoint",
    "el medio de un tramo recto de POLYLINE resuelve `midpoint`",
  );
  assert.deepEqual(midOfPolylineSegment?.point, { x: 105, y: -100 });
  checks += 1;
}

{
  const centerOfPolygon = snap({ x: 105.2, y: -95.1 }, scene, { tolerance: 1 });
  ok(
    centerOfPolygon?.type === "geometric-center",
    "el centroide de una POLYLINE cerrada resuelve `geometric-center`, no `center`",
  );
  checks += 1;
}

{
  // Tangente EXACTA desde `reference`, con el mismo cálculo que el adaptador
  // usa (y que `curve-entity-adapters.ts` ya usaba para el arco): no un
  // número mágico, sino la misma trigonometría verificada de otro lado.
  const dx = reference.x - circleCenter.x;
  const dy = reference.y - circleCenter.y;
  const distance = Math.hypot(dx, dy);
  const base = (Math.atan2(dy, dx) * 180) / Math.PI;
  const offset = (Math.acos(circleRadius / distance) * 180) / Math.PI;
  const angle = ((base + offset) * Math.PI) / 180;
  const tangentPoint = {
    x: circleCenter.x + Math.cos(angle) * circleRadius,
    y: circleCenter.y + Math.sin(angle) * circleRadius,
  };
  const tangentHit = snap(tangentPoint, scene, {
    tolerance: 0.01,
    modes: { endpoint: false, center: false, quadrant: false },
  });
  ok(tangentHit?.type === "tangent", "un CÍRCULO ofrece tangente desde el cursor de referencia");
  checks += 1;
}

{
  const insertionOfText = snap({ x: 50.1, y: 50 }, scene, { tolerance: 1 });
  ok(
    insertionOfText?.type === "insertion",
    "la inserción de un MTEXT resuelve `insertion`, no `endpoint`",
  );
  checks += 1;
}

{
  // Sin un `CadDocument` que resuelva la definición del bloque, el trazador
  // de repuesto dibuja una cruz centrada EN la inserción (la marca de «bloque
  // no encontrado»), y sus dos segmentos se cruzan exactamente ahí — un
  // candidato `intersection` legítimo, pero irrelevante para lo que este
  // caso mide. Se aísla `insertion` apagando `intersection`.
  const insertionOfBlock = snap({ x: 200.1, y: 0 }, scene, {
    tolerance: 1,
    modes: { intersection: false, "apparent-intersection": false },
  });
  ok(
    insertionOfBlock?.type === "insertion",
    "la inserción de un INSERT (bloque) resuelve `insertion`, no `endpoint`",
  );
  checks += 1;
}

{
  const nodeOfPoint = snap({ x: -20.1, y: -20 }, scene, { tolerance: 1 });
  ok(nodeOfPoint?.type === "node", "un POINT resuelve `node`, no `endpoint`");
  checks += 1;
}

// --- intersección aparente derivada, sobre segmentos genéricos -------------
{
  const derived: SnapScene = {
    segments: [
      { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
      { a: { x: 3, y: -2 }, b: { x: 3, y: -1 } },
    ],
  };
  const derivedHit = snap({ x: 3.1, y: 0.1 }, derived, {
    tolerance: 0.5,
    modes: { nearest: false, midpoint: false, extension: false },
  });
  ok(derivedHit?.type === "apparent-intersection", "intersección aparente sobre segmentos genéricos");
  assert.deepEqual(derivedHit?.point, { x: 3, y: 0 });
  ok(Math.abs((derivedHit?.distance ?? 0) - Math.hypot(0.1, 0.1)) < 1e-12, "distancia reportada correcta");
  checks += 2;
}

console.log(
  `professional-snapping: ${checks} aserciones — escena construida por cadSnapSceneAddEntities sobre entidades reales, no una SnapScene escrita a mano`,
);
