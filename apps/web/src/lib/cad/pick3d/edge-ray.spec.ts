/**
 * edge-ray.ts: designación de aristas por rayo.
 *
 * Verifica que `hitEdge` encuentra la arista más cercana al rayo dentro del
 * umbral, y devuelve el punto correcto sobre la arista.
 */
import { makeBox, vec3 } from "../../brep";
import { check, report } from "../../brep/spec-support";
import { hitEdge, raySegmentDistance, type CadPickRay } from "./edge-ray";

// ---------------------------------------------------------------------------
// 1. Rayo que pasa cerca de una arista vertical de una caja
// ---------------------------------------------------------------------------
{
  const body = makeBox({ min: vec3(0, 0, 0), max: vec3(1000, 600, 500) });

  // Rayo que pasa a 50 unidades de la arista en x=1000, y=0, z=0..500
  const ray: CadPickRay = {
    origin: { x: 1050, y: 0, z: 250 },
    direction: { x: 0, y: 0, z: -1 },
  };

  const hit = hitEdge(body, ray, { maxDistance: 100 });
  check("edge-ray: encuentra una arista", hit !== null, `hit=${hit?.edge}`);
  if (hit) {
    check("edge-ray: la arista está dentro del umbral", hit.distance < 100, `distance=${hit.distance}`);
    check("edge-ray: el punto está sobre la arista", hit.point.x > 999, `x=${hit.point.x}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Rayo lejano no encuentra nada
// ---------------------------------------------------------------------------
{
  const body = makeBox({ min: vec3(0, 0, 0), max: vec3(100, 100, 100) });

  const ray: CadPickRay = {
    origin: { x: 5000, y: 5000, z: 5000 },
    direction: { x: 0, y: 0, z: -1 },
  };

  const hit = hitEdge(body, ray, { maxDistance: 10 });
  check("edge-ray lejano: no encuentra", hit === null, `hit=${hit}`);
}

// ---------------------------------------------------------------------------
// 3. Rayo que pasa por el centro de una arista horizontal
// ---------------------------------------------------------------------------
{
  const body = makeBox({ min: vec3(0, 0, 0), max: vec3(200, 200, 200) });

  // La arista inferior en Y=0 va de (0,0,0) a (200,0,0).
  // Rayo que pasa exactamente por el punto medio (100, 0, 0).
  const ray: CadPickRay = {
    origin: { x: 100, y: -100, z: 0 },
    direction: { x: 0, y: 1, z: 0 },
  };

  const hit = hitEdge(body, ray, { maxDistance: 50 });
  check("edge-ray centro: encuentra", hit !== null, `hit=${hit?.edge}`);
  if (hit) {
    check("edge-ray centro: distancia ≈ 0", hit.distance < 1, `distance=${hit.distance}`);
    check("edge-ray centro: punto ≈ (100,0,0)", Math.abs(hit.point.x - 100) < 1, `x=${hit.point.x}`);
  }
}

// ---------------------------------------------------------------------------
// 4. PARALELO: arista vertical, rayo vertical → t > 0, no t = 0
// ---------------------------------------------------------------------------
{
  // Rayo vertical en x=1001, segmento vertical en x=1000 de z=0 a z=500.
  // Antes de D39: t=0 (descartado por hitEdge por t>0) y distance≈750.
  const result = raySegmentDistance(
    { x: 1001, y: 0, z: 1000 },
    { x: 0, y: 0, z: -1 },
    { x: 1000, y: 0, z: 0 },
    { x: 1000, y: 0, z: 500 },
  );
  check("paralelo: distance ≈ 1", Math.abs(result.distance - 1) < 1e-9, `distance=${result.distance}`);
  check("paralelo: t ≈ 750 (no 0)", Math.abs(result.t - 750) < 1e-9, `t=${result.t}`);
}

// ---------------------------------------------------------------------------
// 5. CLAMP: punto más cercano cae más allá del extremo → distancia real
// ---------------------------------------------------------------------------
{
  // Rayo desde (15,0,1) en dirección (-1,1,0), segmento de (0,0,0) a (10,0,0).
  // El parámetro u sin restricción sale >1, se acota a u=1 (extremo (10,0,0)).
  // t se recalcula como la proyección de (10,0,0) sobre el rayo.
  const result = raySegmentDistance(
    { x: 15, y: 0, z: 1 },
    { x: -1, y: 1, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
  );
  check("clamp: u=1 (extremo más cercano)", result.u === 1, `u=${result.u}`);
  check("clamp: t ≈ 2.5", Math.abs(result.t - 2.5) < 1e-9, `t=${result.t}`);
  // Distancia euclídea real: rayo en t=2.5 → (12.5, 2.5, 1); extremo → (10, 0, 0)
  const expectedDist = Math.hypot(12.5 - 10, 2.5, 1);
  check("clamp: distancia euclídea real", Math.abs(result.distance - expectedDist) < 1e-9, `distance=${result.distance}`);
}

// ---------------------------------------------------------------------------
// 6. REGRESIÓN: los tres bloques existentes siguen pasando
// ---------------------------------------------------------------------------
{
  const body = makeBox({ min: vec3(0, 0, 0), max: vec3(1000, 600, 500) });
  const ray: CadPickRay = { origin: { x: 1050, y: 0, z: 250 }, direction: { x: 0, y: 0, z: -1 } };
  const hit = hitEdge(body, ray, { maxDistance: 100 });
  check("regresión: encuentra arista", hit !== null, `hit=${hit?.edge}`);
  if (hit) {
    check("regresión: punto sobre arista", hit.point.x > 999, `x=${hit.point.x}`);
  }
}

report("edge-ray");
