/**
 * Matemática de tiling UV: dimensión real de la superficie → `.repeat`
 * correcto, y forma del catálogo. Corre en Node puro (sin `document`/canvas) a
 * propósito — `architecturalSurfaceMaps()` (la parte que SÍ dibuja) no se toca
 * aquí porque `run-specs.mjs` no tiene DOM; esa parte la ejercita el golden
 * Playwright de un muro con textura.
 */
import { strict as assert } from "node:assert";
import {
  ARCHITECTURAL_MATERIALS,
  ARCHITECTURAL_MATERIAL_CATEGORIES,
  architecturalMaterialDef,
  architecturalSurfaceRepeat,
  architecturalTileRepeat,
} from "./architectural-material-library";

// ---------------------------------------------------------------------------
// Forma del catálogo
// ---------------------------------------------------------------------------

assert.ok(ARCHITECTURAL_MATERIALS.length >= 5, "biblioteca curada: madera, concreto, ladrillo, vidrio y pintura");

const ids = ARCHITECTURAL_MATERIALS.map((m) => m.id);
assert.equal(new Set(ids).size, ids.length, "ids únicos — se persisten como materialId");

for (const material of ARCHITECTURAL_MATERIALS) {
  assert.ok(material.tileMetersW > 0, `${material.id}: tileMetersW debe ser positivo`);
  assert.ok(material.tileMetersH > 0, `${material.id}: tileMetersH debe ser positivo`);
  assert.ok(material.label.length > 0, `${material.id}: etiqueta en español obligatoria`);
}

const paints = ARCHITECTURAL_MATERIALS.filter((m) => m.category === "pintura");
assert.ok(paints.length >= 2, "pintura en un par de colores, como pide la tarea");

for (const kind of ["madera", "concreto", "ladrillo", "vidrio"] as const) {
  assert.ok(
    ARCHITECTURAL_MATERIALS.some((m) => m.category === kind),
    `falta categoría ${kind}`,
  );
}

assert.equal(architecturalMaterialDef("brick-red")?.label, "Ladrillo");
assert.equal(architecturalMaterialDef("no-existe-este-id"), undefined, "id desconocido: undefined, no throw");

{
  const grouped = ARCHITECTURAL_MATERIAL_CATEGORIES.flatMap((c) => c.items.map((i) => i.id));
  assert.deepEqual(
    [...grouped].sort(),
    [...ids].sort(),
    "las categorías agrupan cada material del catálogo exactamente una vez",
  );
}

// ---------------------------------------------------------------------------
// architecturalTileRepeat: dimensión real → repeat
// ---------------------------------------------------------------------------

{
  const { repeatX, repeatY } = architecturalTileRepeat(4, 3, 0.4, 0.14);
  assert.equal(repeatX, 10, "4m de ancho / 0.4m de tile = 10 repeticiones exactas");
  assert.ok(Math.abs(repeatY - 3 / 0.14) < 1e-9, "3m de alto / 0.14m de tile");
}

{
  // Duplicar la dimensión real duplica el repeat: la relación es lineal, no
  // hay un término constante escondido que rompa el "no estirar" a otra escala.
  const small = architecturalTileRepeat(2, 2, 0.5, 0.5);
  const doubled = architecturalTileRepeat(4, 4, 0.5, 0.5);
  assert.equal(doubled.repeatX, small.repeatX * 2);
  assert.equal(doubled.repeatY, small.repeatY * 2);
}

{
  // Duplicar el TILE (textura más "grande" en el mundo) reduce el repeat a la
  // mitad para la MISMA superficie — es la comprobación inversa de la anterior.
  const fineTile = architecturalTileRepeat(3, 3, 0.5, 0.5);
  const coarseTile = architecturalTileRepeat(3, 3, 1, 1);
  assert.equal(coarseTile.repeatX, fineTile.repeatX / 2);
  assert.equal(coarseTile.repeatY, fineTile.repeatY / 2);
}

{
  // Dimensiones inválidas (superficie de ancho 0, o negativa por un bug
  // upstream) no deben producir un repeat negativo o NaN que rompa
  // `texture.repeat.set()`.
  assert.equal(architecturalTileRepeat(0, 5, 0.4, 0.14).repeatX, 0);
  assert.equal(architecturalTileRepeat(-3, 5, 0.4, 0.14).repeatX, 0);
  assert.ok(Number.isFinite(architecturalTileRepeat(5, 5, 0, 0).repeatX), "tile de 0 no produce Infinity/NaN");
}

// ---------------------------------------------------------------------------
// architecturalSurfaceRepeat: el mismo cálculo, resolviendo el tile por id
// ---------------------------------------------------------------------------

{
  const brick = architecturalMaterialDef("brick-red")!;
  const bySurface = architecturalSurfaceRepeat("brick-red", 3.6, 2.4)!;
  const byHand = architecturalTileRepeat(3.6, 2.4, brick.tileMetersW, brick.tileMetersH);
  assert.deepEqual(bySurface, byHand, "architecturalSurfaceRepeat delega en la misma matemática pura");
  // Un muro de 3.6m con ladrillos de 0.4m no debe dejar un resto que se note
  // como una hilada cortada a la mitad justo en el borde — 9 repeticiones
  // exactas es la selección de escala deliberada del catálogo para este caso.
  assert.equal(bySurface.repeatX, 9);
}

assert.equal(
  architecturalSurfaceRepeat("no-existe-este-id", 3, 3),
  undefined,
  "id de material desconocido (borrado del catálogo, documento viejo): undefined, no throw",
);

console.log(
  "architectural-material-library: catálogo curado y matemática de tiling UV (dimensión real → repeat) verificados",
);
