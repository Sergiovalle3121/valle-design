/**
 * Construcción de la escena de enganche, ya fuera del monolito.
 *
 * Estas cien líneas vivían dentro de un manejador de `pointermove` en un
 * archivo de veintidós mil, y por eso no tenían ni una aserción: la mitad del
 * OSNAP del producto —la que decide QUÉ se puede enganchar— no se podía
 * ejecutar sin montar un lienzo. Aquí se ancla lo que hace, incluida una fuga
 * que sólo se vio al moverla.
 */
import assert from "node:assert/strict";
import type { CadNativeEntity } from "./entity-runtime";
import { snap, type Point, type SnapScene } from "./snap-engine";
import {
  CAD_SNAP_SCENE_BOX_LIMIT,
  cadSnapSceneAddEntities,
  cadSnapSceneFromBoxes,
} from "./snap-scene";

// ---------------------------------------------------------------------------
// 1. Una caja da esquinas, aristas, puntos medios y centro
// ---------------------------------------------------------------------------
{
  const scene = cadSnapSceneFromBoxes([{ x: 0, y: 0, w: 100, h: 60 }], { x: 0, y: 0 });
  assert.equal(scene.endpoints?.length, 4, "cuatro esquinas");
  assert.equal(scene.segments?.length, 4, "cuatro aristas");
  assert.equal(scene.perpendicularSegments?.length, 4, "y las cuatro sirven de perpendicular");
  assert.equal(scene.midpoints?.length, 4, "un punto medio por arista");
  assert.deepEqual(scene.centers, [{ x: 50, y: 30 }], "el centro es el centro");
  assert.deepEqual(scene.geometricCenters, [{ x: 50, y: 30 }]);
  assert.deepEqual(scene.insertions, [{ x: 50, y: 30 }]);

  // Y el motor lo resuelve: un cursor junto a una esquina engancha a la esquina.
  const hit = snap({ x: 98, y: 2 }, scene, { tolerance: 5 });
  assert.equal(hit?.type, "endpoint");
  assert.deepEqual(hit?.point, { x: 100, y: 0 });
}

// ---------------------------------------------------------------------------
// 2. Las cajas se ordenan por cercanía al cursor y se acotan
// ---------------------------------------------------------------------------
{
  // Sesenta cajas en fila; el cursor está sobre la última. El tope es 48, así
  // que la caja 0 —la más lejana— tiene que quedarse fuera.
  const boxes = Array.from({ length: 60 }, (_, index) => ({
    x: index * 100,
    y: 0,
    w: 10,
    h: 10,
  }));
  const cursor: Point = { x: 5_905, y: 5 };
  const scene = cadSnapSceneFromBoxes(boxes, cursor);
  assert.equal(
    scene.centers?.length,
    CAD_SNAP_SCENE_BOX_LIMIT,
    "sólo las 48 más cercanas alimentan el motor",
  );
  // El motor cruza los tramos entre sí buscando intersecciones, que es O(n²):
  // sin este tope, una planta con miles de cajas convertiría cada movimiento
  // del ratón en millones de pruebas.
  const centers = scene.centers ?? [];
  assert.ok(
    centers.every((centre) => centre.x >= 1_205),
    "y son las cercanas, no las primeras de la lista",
  );
  assert.ok(
    !centers.some((centre) => centre.x === 5),
    "la caja más lejana se queda fuera",
  );
}

// ---------------------------------------------------------------------------
// 3. Una entidad canónica aporta sus tramos con vecindad declarada
// ---------------------------------------------------------------------------
{
  const line: CadNativeEntity = {
    id: "linea",
    type: "line",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 200, y: 0, z: 0 },
    layer: "0",
  };
  const scene: SnapScene = { segments: [], midpoints: [], perpendicularSegments: [], endpoints: [] };
  cadSnapSceneAddEntities(scene, [line], { x: 0, y: 0 });

  assert.equal(scene.segments?.length, 1, "una línea es un tramo");
  assert.equal(scene.segments?.[0].pathId, "linea:0", "con su identidad de trazo");
  assert.equal(scene.segments?.[0].ordinal, 0);
  // Sólo una LÍNEA aporta punto medio semántico: las cuerdas de un arco
  // teselado no son aristas del dibujo y llenarían la pantalla de puntos
  // medios que no existen en el papel.
  assert.deepEqual(scene.midpoints, [{ x: 100, y: 0 }], "y su punto medio de verdad");
  assert.equal(scene.perpendicularSegments?.length, 1);

  const arc: CadNativeEntity = {
    id: "arco",
    type: "arc",
    center: { x: 0, y: 0, z: 0 },
    radius: 50,
    startAngle: 0,
    endAngle: 180,
    layer: "0",
  };
  const curved: SnapScene = { segments: [], midpoints: [], endpoints: [] };
  cadSnapSceneAddEntities(curved, [arc], { x: 0, y: 0 });
  assert.ok((curved.segments?.length ?? 0) > 1, "un arco se tesela en varios tramos");
  assert.equal(curved.midpoints?.length, 0, "y ninguna de sus cuerdas es un punto medio CAD");
  assert.ok((curved.endpoints?.length ?? 0) > 0, "pero sí aporta puntos notables");
}

// ---------------------------------------------------------------------------
// 4. LA FUGA: los puntos de control no pueden crecer dentro del array del DXF
// ---------------------------------------------------------------------------
{
  // Éste es el fallo que apareció al sacar el código del monolito. `nodes` es
  // el array VIVO de puntos del DXF de fondo, y el código original empujaba ahí
  // los puntos de control de cada entidad bajo el cursor. En una sesión larga
  // el array crecía sin tope, y los puntos de control de una spline seguían
  // imantando mucho después de que el cursor se hubiera ido a otro sitio.
  const dxfNodes: Point[] = [{ x: 1, y: 1 }];
  const spline: CadNativeEntity = {
    id: "spline",
    type: "spline",
    controlPoints: [
      { x: 0, y: 0, z: 0 },
      { x: 50, y: 100, z: 0 },
      { x: 100, y: 0, z: 0 },
    ],
    degree: 2,
    knots: [0, 0, 0, 1, 1, 1],
    layer: "0",
  };
  const scene = cadSnapSceneFromBoxes([], { x: 0, y: 0 }, dxfNodes);
  assert.equal(scene.nodes, dxfNodes, "sin puntos de control, la escena comparte el array");

  cadSnapSceneAddEntities(scene, [spline], { x: 0, y: 0 });
  assert.equal(dxfNodes.length, 1, "el array del DXF NO ha crecido");
  assert.notEqual(scene.nodes, dxfNodes, "la escena se llevó su propia copia");
  assert.ok((scene.nodes?.length ?? 0) > 1, "y sí recogió los puntos de control");
  assert.deepEqual(scene.nodes?.[0], { x: 1, y: 1 }, "conservando los del DXF por delante");

  // Dos pasadas seguidas no acumulan: es la definición de que la fuga se fue.
  const second = cadSnapSceneFromBoxes([], { x: 0, y: 0 }, dxfNodes);
  cadSnapSceneAddEntities(second, [spline], { x: 0, y: 0 });
  assert.equal(dxfNodes.length, 1, "ni tras la segunda consulta");
  assert.equal(
    second.nodes?.length,
    scene.nodes?.length,
    "y cada consulta ve exactamente lo mismo, no lo de antes más lo de ahora",
  );
}

console.log(
  "snap-scene.spec: cajas acotadas, tramos con vecindad y el array del DXF que ya no crece",
);
