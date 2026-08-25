/**
 * `wallAdapter.properties` — la vía por la que un `material` de muro se
 * vuelve editable desde el panel de propiedades genérico (`CAD_ENTITY_
 * REGISTRY.adapter(entity).properties`), y por la que el comando
 * `{ type: "properties" }` de `entity-commands.ts` lo escribe. No hay spec
 * previo de este adaptador — el resto de su superficie (grips, hit-test,
 * uniones) sale probada por `wall-geometry.spec.ts`/`wall-joins.spec.ts`/
 * `wall-openings.spec.ts` contra los módulos puros que consume; lo que
 * falta y este archivo fija es la traducción bolsa-de-propiedades↔entidad
 * que el material acaba de sumar.
 *
 * El contrato que importa: un `material` fuera de la paleta NUNCA corrompe
 * el muro (se ignora, se conserva el anterior) — la misma disciplina fail-
 * closed que ya tenían `kind`/`swing`/`hinge` del hueco en este mismo
 * patrón de adaptador.
 */
import { strict as assert } from "node:assert";
import { wallAdapter } from "./wall-entity-adapter";
import type { CadWallEntity } from "./cad-entities-v6";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const wall = (override: Partial<CadWallEntity> = {}): CadWallEntity => ({
  id: "w1",
  type: "wall",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 3_000, y: 0, z: 0 },
  thickness: 150,
  height: 2_400,
  layer: "0",
  ...override,
});

// --- read: el material SIEMPRE aparece en la bolsa, vacío si no hay uno ----
// (a diferencia de `symbolBlock` del hueco, que se omite: aquí la fila tiene
// que existir en TODO muro para poder descubrirse y teclearse desde el panel
// de propiedades la primera vez — `commonKeys` sólo ofrece filas de claves
// que ya están en la bolsa).
{
  const bag = wallAdapter.properties.read(wall());
  ok("material" in bag, "sin material, la bolsa SÍ trae la clave (vacía)");
  ok(bag.material === "", "…con cadena vacía, no `undefined` ni ausente");

  const withMaterial = wallAdapter.properties.read(wall({ material: "brick" }));
  ok(withMaterial.material === "brick", "con material, la bolsa lo trae tal cual");
}

// --- write: un material válido se escribe -----------------------------------
{
  const after = wallAdapter.properties.write(wall(), { material: "concrete" });
  ok(after.material === "concrete", "un material de la paleta se escribe");
  // El resto de la receta no se mueve por escribir sólo el material.
  ok(after.thickness === 150 && after.height === 2_400, "grosor y altura intactos");
}

// --- write: un material fuera de la paleta se IGNORA, nunca corrompe -------
{
  const clean = wall();
  const after = wallAdapter.properties.write(clean, { material: "unobtainium" });
  ok(after.material === undefined, "un material inválido no se escribe sobre 'sin declarar'");

  const declared = wall({ material: "wood" });
  const afterOverwrite = wallAdapter.properties.write(declared, {
    material: "unobtainium",
  });
  ok(
    afterOverwrite.material === "wood",
    "un material inválido conserva el que ya estaba, no lo borra",
  );
}

// --- write: cadena vacía BORRA el material (única vía sin selector) --------
{
  const declared = wall({ material: "stucco" });
  const cleared = wallAdapter.properties.write(declared, { material: "" });
  ok(cleared.material === undefined, "cadena vacía vuelve el muro al genérico");
}

// --- write: material AUSENTE del patch no toca lo que ya había -------------
{
  const declared = wall({ material: "drywall" });
  const after = wallAdapter.properties.write(declared, { thickness: 200 });
  ok(
    after.material === "drywall",
    "editar sólo el grosor no le borra el material al muro",
  );
  ok(after.thickness === 200, "…y el grosor sí cambió, para que quede claro qué se probó");
}

console.log(
  `wall-entity-adapter: ${checks} aserciones verdes. El material SIEMPRE aparece en ` +
    `la bolsa de propiedades del muro (vacío si no hay uno, para poder descubrirlo y ` +
    `teclearlo), un valor fuera de la paleta nunca corrompe la entidad, y editar otro ` +
    `campo no le toca el material.`,
);
