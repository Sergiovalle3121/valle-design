/**
 * `splitMeshFace` en aislamiento — matemática pura, sin motor de comandos.
 * Las specs de comando (`engine/commands/mesh-split.spec.ts`) son las que
 * cuentan para la regla de aceptación: ejecutan MESHSPLIT de verdad.
 */
import { strict as assert } from "node:assert";
import { splitMeshFace } from "./mesh-face-split";
import { meshSignedVolume, type MeshPoint } from "./subdivision";

// Un cuadrado 10×10 en el plano XY, más una tapa a z=-1 y cuatro caras
// laterales para tener un SÓLIDO cerrado (volumen medible antes/después).
function squareBox(): { points: MeshPoint[]; faces: { outer: number[] }[] } {
  const points: MeshPoint[] = [
    { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }, { x: 0, y: 10, z: 0 }, // arriba, 0-3
    { x: 0, y: 0, z: -1 }, { x: 10, y: 0, z: -1 }, { x: 10, y: 10, z: -1 }, { x: 0, y: 10, z: -1 }, // abajo, 4-7
  ];
  const faces = [
    { outer: [0, 1, 2, 3] }, // arriba, normal +z
    { outer: [4, 7, 6, 5] }, // abajo, normal -z
    { outer: [0, 4, 5, 1] }, // frente
    { outer: [1, 5, 6, 2] }, // derecha
    { outer: [2, 6, 7, 3] }, // atrás
    { outer: [3, 7, 4, 0] }, // izquierda
  ];
  return { points, faces };
}

// --- Cuerda entre los puntos medios de dos aristas opuestas → dos caras ----
{
  const box = squareBox();
  const volumeBefore = meshSignedVolume(box);
  const result = splitMeshFace(box.points, box.faces, 0, { x: 5, y: 0, z: 0 }, { x: 5, y: 10, z: 0 });
  assert.ok(typeof result !== "string", `la cuerda entre los puntos medios divide la cara (${result})`);
  if (typeof result === "string") throw new Error(result);

  assert.equal(result.faces.length, 7, `una cara de más: 6 → 7 (${result.faces.length})`);
  assert.equal(result.points.length, 10, `dos vértices nuevos: 8 → 10 (${result.points.length})`);

  const volumeAfter = meshSignedVolume({ points: result.points, faces: result.faces });
  assert.ok(Math.abs(volumeAfter - volumeBefore) < 1e-9, `el volumen NO cambia al partir una cara (${volumeBefore} → ${volumeAfter})`);

  const split = result.faces.filter((f) => f.outer.length === 4 && f !== result.faces[1]);
  assert.ok(split.length >= 2, "las dos mitades son cuadriláteros");
}

// --- Los dos puntos en la MISMA arista: se niega, no toca nada -------------
{
  const box = squareBox();
  const result = splitMeshFace(box.points, box.faces, 0, { x: 3, y: 0, z: 0 }, { x: 7, y: 0, z: 0 });
  assert.equal(typeof result, "string", "los dos puntos en la misma arista se niegan");
  assert.ok((result as string).includes("misma arista"), `mensaje honesto: ${result}`);
}

// --- Los dos puntos en el MISMO vértice: se niega ---------------------------
{
  const box = squareBox();
  const result = splitMeshFace(box.points, box.faces, 0, { x: 0.001, y: 0.001, z: 0 }, { x: -0.001, y: 0.001, z: 0 });
  assert.equal(typeof result, "string", "los dos puntos en el mismo vértice se niegan");
}

// --- Vértice a vértice (diagonal): también es una cuerda válida ------------
{
  const box = squareBox();
  const result = splitMeshFace(box.points, box.faces, 0, { x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 0 });
  assert.ok(typeof result !== "string", `la diagonal vértice-a-vértice divide la cara (${result})`);
  if (typeof result === "string") throw new Error(result);
  assert.equal(result.points.length, 8, "vértice a vértice no crea vértices nuevos");
  const triangles = result.faces.filter((f) => f.outer.length === 3);
  assert.equal(triangles.length, 2, "la diagonal produce dos triángulos");
}

// --- Cara fuera de rango: se niega ------------------------------------------
{
  const box = squareBox();
  const result = splitMeshFace(box.points, box.faces, 99, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 });
  assert.equal(typeof result, "string", "una cara fuera de rango se niega");
}

console.log("✅ mesh/mesh-face-split.spec: cuerda entre aristas opuestas (4) + misma arista (2) + mismo vértice (1) + diagonal (3) + fuera de rango (1) — 11 comprobaciones");
