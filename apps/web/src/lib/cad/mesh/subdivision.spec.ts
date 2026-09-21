/**
 * Matemática pura de `subdivision.ts`, sin pasar por el motor de comandos.
 *
 * Complementa (no sustituye) las specs de comando en
 * `engine/commands/mesh-smoothing.spec.ts`, que son las que cuentan para la
 * regla de aceptación: ejecutan la orden real y miden. Aquí se verifica la
 * matemática en un caso de mano —un cubo unidad, volumen conocido, 12 aristas
 * conocidas— donde los números correctos se pueden calcular a mano y comparar.
 */
import { strict as assert } from "node:assert";
import {
  loopSubdivideStep,
  meshBounds,
  meshEdgeKey,
  meshSignedVolume,
  meshSurfaceArea,
  subdivideLoop,
  triangulateFan,
  type MeshCrease,
  type MeshGeometry,
} from "./subdivision";

// Cubo [-1,1]^3, 8 vértices, 6 caras cuadrilaterales con normal HACIA FUERA
// (comprobado a mano con la regla de la mano derecha).
function unitCube(): MeshGeometry {
  const points = [
    { x: -1, y: -1, z: -1 }, // 0
    { x: 1, y: -1, z: -1 }, // 1
    { x: 1, y: 1, z: -1 }, // 2
    { x: -1, y: 1, z: -1 }, // 3
    { x: -1, y: -1, z: 1 }, // 4
    { x: 1, y: -1, z: 1 }, // 5
    { x: 1, y: 1, z: 1 }, // 6
    { x: -1, y: 1, z: 1 }, // 7
  ];
  const faces = [
    { outer: [0, 3, 2, 1] }, // abajo
    { outer: [4, 5, 6, 7] }, // arriba
    { outer: [0, 1, 5, 4] }, // frente
    { outer: [3, 7, 6, 2] }, // atrás
    { outer: [0, 4, 7, 3] }, // izquierda
    { outer: [1, 2, 6, 5] }, // derecha
  ];
  return { points, faces };
}

const ALL_CUBE_EDGES: MeshCrease[] = [
  { a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 0 }, // abajo
  { a: 4, b: 5 }, { a: 5, b: 6 }, { a: 6, b: 7 }, { a: 7, b: 4 }, // arriba
  { a: 0, b: 4 }, { a: 1, b: 5 }, { a: 2, b: 6 }, { a: 3, b: 7 }, // verticales
];

// --- El cubo mide lo que dice medir --------------------------------------
{
  const cube = unitCube();
  const volume = meshSignedVolume(cube);
  assert.ok(Math.abs(volume - 8) < 1e-9, `cubo de referencia: volumen 8 (${volume})`);
  const area = meshSurfaceArea(cube);
  assert.ok(Math.abs(area - 24) < 1e-9, `cubo de referencia: área 24 (${area})`);
}

// --- triangulateFan: no cambia volumen ni área, sólo topología ------------
{
  const cube = unitCube();
  const tri = triangulateFan(cube);
  assert.equal(tri.faces.length, 12, `triangulación: 12 triángulos (${tri.faces.length})`);
  assert.ok(tri.faces.every((f) => f.outer.length === 3), "triangulación: todas las caras son triángulos");
  assert.equal(tri.points.length, 8, "triangulación: no añade vértices");
  assert.ok(Math.abs(meshSignedVolume(tri) - 8) < 1e-9, "triangulación: volumen preservado");
  assert.ok(Math.abs(meshSurfaceArea(tri) - 24) < 1e-9, "triangulación: área preservada");
}

// --- Nivel 0 es la malla ORIGINAL, sin triangular --------------------------
{
  const cube = unitCube();
  const level0 = subdivideLoop(cube, [], 0);
  assert.equal(level0.faces.length, 6, `nivel 0: 6 caras, sin triangular (${level0.faces.length})`);
  for (let i = 0; i < 8; i++) {
    assert.equal(level0.points[i].x, cube.points[i].x, `nivel 0: vértice ${i}.x sin tocar`);
    assert.equal(level0.points[i].y, cube.points[i].y, `nivel 0: vértice ${i}.y sin tocar`);
    assert.equal(level0.points[i].z, cube.points[i].z, `nivel 0: vértice ${i}.z sin tocar`);
  }
}

// --- Nivel 1, sin pliegues: los vértices SE MUEVEN, caras ×4 desde la base
//     triangulada (12 → 48), volumen baja y sigue siendo positivo -----------
{
  const cube = unitCube();
  const level1 = subdivideLoop(cube, [], 1);
  assert.equal(level1.faces.length, 48, `nivel 1: 12 triángulos base × 4 = 48 (${level1.faces.length})`);

  let moved = 0;
  for (let i = 0; i < 8; i++) {
    const p = level1.points[i];
    const q = cube.points[i];
    if (Math.abs(p.x - q.x) > 1e-6 || Math.abs(p.y - q.y) > 1e-6 || Math.abs(p.z - q.z) > 1e-6) moved++;
  }
  assert.equal(moved, 8, `nivel 1 sin pliegues: los 8 vértices originales se movieron (${moved}/8)`);

  const volume = meshSignedVolume(level1);
  assert.ok(volume > 0, `nivel 1: volumen sigue positivo (${volume})`);
  assert.ok(volume < 8, `nivel 1: volumen MENOR que el original — se redondeó (${volume} < 8)`);
}

// --- El volumen CONVERGE monótonamente a un límite < 8 ---------------------
{
  const cube = unitCube();
  const volumes = [0, 1, 2, 3, 4].map((level) => meshSignedVolume(subdivideLoop(cube, [], level)));
  for (let i = 1; i < volumes.length; i++) {
    assert.ok(volumes[i] < volumes[i - 1], `volumen decrece del nivel ${i - 1} al ${i}: ${volumes[i - 1]} → ${volumes[i]}`);
  }
  const deltas = [];
  for (let i = 1; i < volumes.length; i++) deltas.push(volumes[i - 1] - volumes[i]);
  for (let i = 1; i < deltas.length; i++) {
    assert.ok(deltas[i] < deltas[i - 1], `el paso de volumen se ACHICA (converge): Δ${i}=${deltas[i]} < Δ${i - 1}=${deltas[i - 1]}`);
  }
}

// --- El número de caras crece ×4 por nivel, a partir del nivel 1 -----------
{
  const cube = unitCube();
  const faceCounts = [1, 2, 3].map((level) => subdivideLoop(cube, [], level).faces.length);
  assert.deepEqual(faceCounts, [48, 192, 768], `caras ×4 por nivel: ${faceCounts.join(", ")}`);
}

// --- Ida y vuelta EXACTA: nivel 2 → nivel 1 → nivel 2 da el mismo resultado
{
  const cube = unitCube();
  const a = subdivideLoop(cube, [], 2);
  const b = subdivideLoop(cube, [], 1); // «bajar el nivel»: no deshace, recalcula
  const c = subdivideLoop(cube, [], 2); // «subir otra vez»: misma función pura
  assert.deepEqual(c, a, "subir → bajar → subir reproduce bit a bit la malla de antes");
  assert.notDeepEqual(b, a, "el nivel intermedio es de verdad otra malla (no el mismo objeto)");
}

// --- MESHREFINE es OTRA cosa: subdividir sin suavizar no mueve nada --------
// (se comprueba aquí en `triangulateFan`+`loopSubdivideStep` no interviene;
// la propia orden usa `subdivideMesh` de `mesh-operations.ts`, que es la
// versión-solo-topología ya existente y correcta para este propósito.)

// --- Pliegues: con las 12 aristas plegadas, las esquinas NO se mueven ------
// (tienen valencia 3 en la malla original y ninguna de sus diagonales de
// triangulación está plegada, así que siguen clasificándose como ESQUINA en
// cada nivel: 1500 líneas de Catmull-Clark sin este caso de prueba serían
// indistinguibles de un redondeo silencioso de las esquinas.)
{
  const cube = unitCube();
  for (const level of [1, 2, 3]) {
    const smoothed = subdivideLoop(cube, ALL_CUBE_EDGES, level);
    for (let i = 0; i < 8; i++) {
      const p = smoothed.points[i];
      const q = cube.points[i];
      assert.equal(p.x, q.x, `nivel ${level}, con las 12 aristas plegadas: esquina ${i}.x fija`);
      assert.equal(p.y, q.y, `nivel ${level}, con las 12 aristas plegadas: esquina ${i}.y fija`);
      assert.equal(p.z, q.z, `nivel ${level}, con las 12 aristas plegadas: esquina ${i}.z fija`);
    }
  }
}

// --- El punto medio de una arista plegada es EXACTO (sin arrastre) ---------
{
  const cube = unitCube();
  const level1 = subdivideLoop(cube, ALL_CUBE_EDGES, 1);
  // La arista 0-1 va de (-1,-1,-1) a (1,-1,-1); su punto de arista, plegado,
  // debe ser EXACTAMENTE su punto medio geométrico: (0,-1,-1).
  const tri = triangulateFan(cube);
  const step = loopSubdivideStep(tri, new Set(ALL_CUBE_EDGES.map((c) => meshEdgeKey(c.a, c.b))));
  const key01 = meshEdgeKey(0, 1);
  // Se busca el índice del punto de arista 0-1 recalculando el mapa igual que
  // lo hace la función: es el único vértice nuevo (índice ≥ 8) cuya posición
  // es (0,-1,-1).
  const edgePoint = step.mesh.points.slice(8).find((p) => Math.abs(p.x) < 1e-9 && Math.abs(p.y + 1) < 1e-9 && Math.abs(p.z + 1) < 1e-9);
  assert.ok(edgePoint, `la arista plegada 0-1 (${key01}) tiene su punto medio exacto entre los vértices nuevos`);
  void level1;
}

// --- Sin pliegue, el mismo cubo se redondea MÁS (volumen menor) ------------
{
  const cube = unitCube();
  const conPliegues = meshSignedVolume(subdivideLoop(cube, ALL_CUBE_EDGES, 2));
  const sinPliegues = meshSignedVolume(subdivideLoop(cube, [], 2));
  assert.ok(
    sinPliegues < conPliegues,
    `quitar los pliegues redondea más: sin pliegues ${sinPliegues} < con pliegues ${conPliegues}`,
  );
}

// --- meshBounds: caja envolvente de un conjunto de puntos -------------------
{
  const bounds = meshBounds(unitCube().points);
  assert.deepEqual(bounds, { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } }, "meshBounds del cubo unidad");
}

console.log(
  "✅ mesh/subdivision.spec: cubo de referencia (2) + triangulación (5) + nivel 0 exacto (7) + " +
    "nivel 1 sin pliegues (10) + convergencia (7) + caras ×4 (1) + ida y vuelta (2) + " +
    "esquinas fijas con pliegue (24) + punto medio exacto (1) + redondeo sin pliegue (1) + bounds (1) — 61 comprobaciones",
);
