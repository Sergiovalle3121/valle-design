/**
 * edge-ray.ts: designación de aristas por rayo.
 *
 * Verifica que `hitEdge` encuentra la arista más cercana al rayo dentro del
 * umbral, y devuelve el punto correcto sobre la arista.
 */
import { makeBox, vec3 } from "../../brep";
import { check, report } from "../../brep/spec-support";
import { hitEdge, type CadPickRay } from "./edge-ray";

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

report("edge-ray");
