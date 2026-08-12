/**
 * La geometría DERIVADA del muro y su adaptador de entidad.
 *
 * Lo que se fija aquí no es que el contorno exista, sino que sea EL contorno
 * correcto: esquinas a media anchura del eje, recorrido antihorario (el área
 * con signo positiva es lo que espera todo consumidor de anillos), rayado
 * dentro del contorno, y —la recompensa de persistir la receta— que editar el
 * grosor por el bolsillo de propiedades REDERIVE la doble línea sin tocar el
 * eje.
 */
import { strict as assert } from "node:assert";
import type { CadWallEntity } from "./cad-entities-v6";
import { CAD_ENTITY_REGISTRY } from "./entity-runtime";
import { ringSignedArea } from "./solid3d-adapter";
import {
  wallFillSegments,
  wallFootprint,
  wallLength,
  wallMidpoint,
} from "./wall-geometry";

const wall = (override: Partial<CadWallEntity> = {}): CadWallEntity => ({
  id: "w1",
  type: "wall",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 3000, y: 0, z: 0 },
  thickness: 150,
  height: 2400,
  layer: "0",
  ...override,
});

const near = (actual: number, expected: number, what: string, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${what}: ${actual}, se esperaba ${expected}`);

// --- el contorno: media anchura a cada lado del eje, antihorario --------------
{
  const footprint = wallFootprint(wall());
  assert.ok(footprint, "un muro sano produce contorno");
  assert.equal(footprint.length, 4);
  // Eje horizontal de (0,0) a (3000,0) con grosor 150: caras en y=±75.
  assert.deepEqual(
    footprint.map((corner) => [corner.x, corner.y]),
    [[0, 75], [0, -75], [3000, -75], [3000, 75]],
  );
  assert.ok(ringSignedArea(footprint) > 0, "el recorrido es antihorario");
  near(Math.abs(ringSignedArea(footprint)), 3000 * 150, "el área es eje × grosor");
}

// --- la orientación del eje no cambia el cuerpo, sólo el punto de arranque ----
{
  const forward = wallFootprint(wall());
  const backward = wallFootprint(
    wall({ start: { x: 3000, y: 0, z: 0 }, end: { x: 0, y: 0, z: 0 } }),
  );
  assert.ok(forward && backward);
  assert.ok(ringSignedArea(backward) > 0, "también antihorario recorrido al revés");
  near(Math.abs(ringSignedArea(backward)), Math.abs(ringSignedArea(forward)), "misma área");
}

// --- receta degenerada: null, no un polígono colapsado ------------------------
{
  assert.equal(wallFootprint(wall({ end: { x: 0, y: 0, z: 0 } })), null, "eje nulo");
  assert.equal(wallFootprint(wall({ thickness: 0 })), null, "grosor cero");
  assert.equal(wallFootprint(wall({ thickness: -5 })), null, "grosor negativo");
}

// --- el rayado vive DENTRO del contorno y gira con el muro --------------------
{
  const straight = wallFillSegments(wall());
  assert.ok(straight.length > 0, "un muro de 3000×150 tiene sitio para rayado");
  for (const segment of straight) {
    for (const point of [segment.a, segment.b]) {
      assert.ok(point.x >= -1e-9 && point.x <= 3000 + 1e-9, "dentro del largo");
      assert.ok(Math.abs(point.y) <= 75 + 1e-9, "dentro del grosor");
    }
  }
  // Girado 90°: el mismo número de trazos, ahora dentro de x=±75.
  const turned = wallFillSegments(
    wall({ start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 3000, z: 0 } }),
  );
  assert.equal(turned.length, straight.length, "el rayado es del muro, no del mundo");
  for (const segment of turned)
    for (const point of [segment.a, segment.b])
      assert.ok(Math.abs(point.x) <= 75 + 1e-9, "girado, el rayado gira también");
  // Un muro más corto que un paso de rayado no dibuja trazos recortados.
  assert.equal(wallFillSegments(wall({ end: { x: 100, y: 0, z: 0 } })).length, 0);
}

// --- ayudas ------------------------------------------------------------------
{
  near(wallLength(wall()), 3000, "longitud del eje");
  assert.deepEqual(wallMidpoint(wall()), { x: 1500, y: 0 });
}

// --- el REGISTRO REAL reclama el muro y sus propiedades rederivan -------------
{
  const entity = wall();
  assert.ok(CAD_ENTITY_REGISTRY.supports(entity), "el registro de adaptadores reclama `wall`");
  const adapter = CAD_ENTITY_REGISTRY.adapter(entity);

  const bag = adapter.properties.read(entity);
  assert.equal(bag.thickness, 150);
  assert.equal(bag.height, 2400);
  near(Number(bag.length), 3000, "la longitud sale derivada");

  // Editar el grosor REDERIVA el contorno sin tocar el eje: es la razón de
  // persistir la receta y no las cuatro esquinas.
  const thicker = adapter.properties.write(entity, { thickness: 300 });
  if (thicker.type !== "wall") throw new Error("tipo");
  assert.deepEqual(thicker.start, entity.start, "el eje no se toca");
  const footprint = wallFootprint(thicker);
  assert.ok(footprint);
  near(footprint[0].y, 150, "la cara superior se separa a la nueva media anchura");

  // Un grosor no positivo tecleado no degenera el muro: se conserva el vigente.
  const unharmed = adapter.properties.write(entity, { thickness: 0 });
  if (unharmed.type !== "wall") throw new Error("tipo");
  assert.equal(unharmed.thickness, 150);

  // SCALE ×2: el grosor acompaña (es geometría en planta); la altura NO — por
  // decisión del producto, escalar una planta no sube los muros.
  const scaled = adapter.commands.transform(entity, { scale: 2, origin: { x: 0, y: 0 } });
  if (scaled.type !== "wall") throw new Error("tipo");
  near(scaled.thickness, 300, "el grosor escala con la planta");
  assert.equal(scaled.height, 2400, "la altura no escala");
  near(scaled.end.x, 6000, "el eje escala");

  // MIRROR: el contorno sigue siendo un anillo positivo — un espejo no
  // convierte el muro en un agujero.
  const mirrored = adapter.commands.transform(entity, {
    mirror: { point: { x: 0, y: 0 }, direction: { x: 0, y: 1 } },
  });
  if (mirrored.type !== "wall") throw new Error("tipo");
  const mirroredFootprint = wallFootprint(mirrored);
  assert.ok(mirroredFootprint);
  assert.ok(ringSignedArea(mirroredFootprint) > 0, "espejado, el anillo sigue positivo");
  assert.ok(mirrored.thickness > 0, "el grosor no cambia de signo bajo reflexión");

  // Se pincha por dentro, como un cuerpo, y por el borde con tolerancia.
  assert.ok(adapter.hitTester.hitTest(entity, { x: 1500, y: 0 }, 1), "interior");
  assert.ok(adapter.hitTester.hitTest(entity, { x: 1500, y: 76 }, 2), "borde con tolerancia");
  assert.ok(!adapter.hitTester.hitTest(entity, { x: 1500, y: 200 }, 1), "fuera");

  // El render enseña el contorno cerrado más el rayado, nunca el eje pelado.
  const paths = adapter.renderer.paths(entity);
  assert.ok(paths.length >= 2, "contorno más rayado");
  assert.equal(paths[0].closed, true);
  assert.equal(paths[0].points.length, 4);
}

console.log("wall-geometry: contorno, rayado, adaptador y rederivación verificados");
