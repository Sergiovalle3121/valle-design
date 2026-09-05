/**
 * Las nubes de revisión del diff, medidas con anclas absolutas.
 *
 * Lo que esta spec exige, y por qué cada cosa:
 *
 * 1. **Cada nube CONTIENE su diferencia y NO la de la vecina.** Es la única
 *    propiedad que hace útil una nube: una que se quedara corta mandaría a
 *    obra a mirar al lado del cambio, y una que se comiera el plano entero
 *    diría «algo cambió en alguna parte».
 * 2. **El festón es el de REVCLOUD**, con su `REVCLOUD_BULGE` y combando hacia
 *    fuera. Un contorno con el bulge del signo contrario se dibuja igual de
 *    bien y significa otra cosa.
 * 3. **Las tres capas se crean con sus colores**, y el lote es UNO: aplicarlo
 *    sube la versión del documento una sola vez, así que un solo Ctrl+Z
 *    devuelve el dibujo sin nubes y sin capas.
 *
 * Correr:  npx tsx src/lib/cad/compare-revision-clouds.spec.ts
 */
import assert from "node:assert/strict";
import { migrateCadDocument, type CadDocument, type CadEntity } from "./cad-document";
import { executeCadEntityCommandBatch } from "./entity-commands";
import type { CadBounds } from "./entity-runtime";
import { cadCompareDocuments } from "./compare-documents";
import {
  CAD_COMPARE_CLOUD_LAYERS,
  cadCompareEntryBounds,
  cadCompareRevisionClouds,
  REVCLOUD_BULGE,
} from "./compare-revision-clouds";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const p = (x: number, y: number) => ({ x, y, z: 0 });

const documento = (entities: CadEntity[]): CadDocument =>
  migrateCadDocument({
    meta: { version: 1, schema: 7, unit: "mm" },
    entities,
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });

const contains = (outer: CadBounds, inner: CadBounds) =>
  outer.minX <= inner.minX && outer.minY <= inner.minY && outer.maxX >= inner.maxX && outer.maxY >= inner.maxY;

// ---------------------------------------------------------------------------
// El par de dibujos
// ---------------------------------------------------------------------------

/**
 * Dos añadidos VECINOS (distan 200 unidades), uno añadido LEJOS (19 000), un
 * borrado ENCIMA de los vecinos —para probar que las clases no se funden— y un
 * modificado en su propia esquina.
 */
const base = documento([
  { id: "c-borrado", type: "circle", center: p(300, 0), radius: 300, layer: "0" },
  { id: "m1", type: "wall", start: p(0, 30000), end: p(4000, 30000), thickness: 150, height: 2400, layer: "MUROS" },
]);

const nuevo = documento([
  { id: "l-cerca-a", type: "line", start: p(0, 0), end: p(1000, 0), layer: "0" },
  { id: "l-cerca-b", type: "line", start: p(1200, 0), end: p(1500, 0), layer: "0" },
  { id: "l-lejos", type: "line", start: p(20000, 0), end: p(21000, 0), layer: "0" },
  { id: "m1", type: "wall", start: p(0, 30250), end: p(4000, 30250), thickness: 150, height: 2400, layer: "MUROS" },
]);

const comparison = cadCompareDocuments(base, nuevo);
eq(comparison.summary.added, 3, "tres añadidos");
eq(comparison.summary.deleted, 1, "un borrado");
eq(comparison.summary.modified, 1, "un modificado");
ok(comparison.summary.balanced, "y el recuento cuadra antes de nublar nada");

const plan = cadCompareRevisionClouds(comparison, {
  before: base,
  after: nuevo,
  existingLayers: base.layers.map((layer) => layer.name),
});

// --- 1. La agrupación por vecindad -----------------------------------------

eq(plan.clouds.length, 4, "cuatro nubes: dos de lo nuevo, una de lo borrado y una del cambio");
eq(plan.withoutBounds, 0, "ninguna diferencia se quedó sin envolvente");

const nuevas = plan.clouds.filter((cloud) => cloud.cloudClass === "nuevo");
eq(nuevas.length, 2, "los dos añadidos vecinos comparten nube y el lejano tiene la suya");
const juntas = nuevas.find((cloud) => cloud.entityIds.includes("l-cerca-a"));
const lejana = nuevas.find((cloud) => cloud.entityIds.includes("l-lejos"));
assert.ok(juntas && lejana, "faltan las nubes de lo nuevo");
eq(
  [...juntas.entityIds].sort(),
  ["l-cerca-a", "l-cerca-b"],
  "las dos líneas que distan 200 unidades caen en la MISMA nube",
);
eq(lejana.entityIds, ["l-lejos"], "y la que dista 19 000 se queda sola");

// --- 2. Contiene lo suyo y no lo de al lado --------------------------------

const boundsDe = (id: string): CadBounds => {
  const entry = comparison.entries.find((candidate) => candidate.entityId === id);
  assert.ok(entry, `no hay diferencia ${id}`);
  const bounds = cadCompareEntryBounds(entry, { before: base, after: nuevo });
  assert.ok(bounds, `no hay envolvente de ${id}`);
  return bounds;
};

ok(contains(juntas.bounds, boundsDe("l-cerca-a")), "la nube contiene la primera línea que marca");
ok(contains(juntas.bounds, boundsDe("l-cerca-b")), "y la segunda");
ok(!contains(juntas.bounds, boundsDe("l-lejos")), "y NO alcanza la línea lejana");
ok(contains(lejana.bounds, boundsDe("l-lejos")), "la nube lejana contiene la suya");
ok(!contains(lejana.bounds, boundsDe("l-cerca-a")), "y no las de la primera");
ok(
  lejana.bounds.minX > juntas.bounds.maxX,
  "las dos nubes de lo nuevo ni se tocan: 19 000 unidades no son la misma revisión",
);
eq(juntas.tightBounds.minX, 0, "la envolvente ceñida del grupo arranca en la primera línea");
eq(juntas.tightBounds.maxX, 1500, "y termina en la segunda");
eq(juntas.bounds.minX, -250, "la nube se separa 250 unidades de lo que marca");
eq(juntas.bounds.maxX, 1750, "por los cuatro lados");

// La vecindad es un PARÁMETRO, no una constante escondida: con holgura cero las
// dos líneas de antes dejan de ser la misma revisión.
const sinVecindad = cadCompareRevisionClouds(comparison, { before: base, after: nuevo, gap: 0 });
eq(
  sinVecindad.clouds.filter((cloud) => cloud.cloudClass === "nuevo").length,
  3,
  "con gap 0 los tres añadidos tienen su propia nube",
);

// La nube del muro contiene DONDE ESTABA y DONDE ESTÁ: 250 mm de diferencia.
const muro = plan.clouds.find((cloud) => cloud.cloudClass === "cambiado");
assert.ok(muro, "falta la nube del cambio");
eq(muro.entityIds, ["m1"], "la del muro modificado");
ok(
  muro.tightBounds.maxY - muro.tightBounds.minY >= 250,
  "y abarca los dos sitios del muro, no sólo el nuevo: el hueco que dejó también es la revisión",
);

// --- 3. Las clases no se funden aunque se pisen ----------------------------

const borrado = plan.clouds.find((cloud) => cloud.cloudClass === "borrado");
assert.ok(borrado, "falta la nube de lo borrado");
eq(borrado.entityIds, ["c-borrado"], "el círculo que ya no está");
ok(
  borrado.bounds.minX <= juntas.bounds.maxX &&
    juntas.bounds.minX <= borrado.bounds.maxX &&
    borrado.bounds.minY <= juntas.bounds.maxY &&
    juntas.bounds.minY <= borrado.bounds.maxY,
  "la nube de lo borrado se SOLAPA con la de lo nuevo: el círculo estaba encima de las líneas",
);
eq(borrado.layer, "VD-COMPARE-BORRADO", "y aun así va a su capa");
eq(juntas.layer, "VD-COMPARE-NUEVO", "y la otra a la suya: añadido y borrado son dos noticias, no una");

// --- 4. El festón es el de REVCLOUD ----------------------------------------

const cloudCommands = plan.commands.filter(
  (command): command is Extract<typeof command, { type: "insert" }> => command.type === "insert",
);
eq(cloudCommands.length, 4, "cuatro polilíneas, una por nube");
for (const command of cloudCommands) {
  const entity = command.entity;
  assert.equal(entity.type, "polyline");
  if (entity.type !== "polyline") continue;
  ok(entity.closed === true, "una nube de revisión es un contorno CERRADO");
  ok(entity.vertices.length >= 3, "y tiene contorno de verdad, no dos puntos");
  ok(
    entity.vertices.every((vertex) => Math.abs(vertex.bulge ?? 0) === REVCLOUD_BULGE),
    "cada festón lleva exactamente REVCLOUD_BULGE, el mismo que dibuja la orden REVCLOUD",
  );
  ok(
    entity.vertices.every((vertex) => (vertex.bulge ?? 0) < 0),
    "y comba hacia FUERA: el contorno se recorre antihorario, donde el bulge positivo entraría",
  );
}
eq(REVCLOUD_BULGE, 0.5, "el festón clásico sobresale un cuarto de su cuerda");

// La nube de una diferencia degenerada sigue siendo una nube.
const puntual = cadCompareRevisionClouds(
  cadCompareDocuments({ entities: [] }, { entities: [{ id: "pt", type: "point", position: p(0, 0), layer: "0" }] }),
  { margin: 0 },
);
eq(puntual.clouds.length, 1, "un punto añadido también se marca");
const puntualEntity = puntual.commands.find((command) => command.type === "insert");
assert.ok(puntualEntity && puntualEntity.type === "insert" && puntualEntity.entity.type === "polyline");
ok(
  puntualEntity.entity.vertices.length >= 4,
  "y su nube no sale degenerada aunque la envolvente del punto lo sea",
);

// --- 5. Las tres capas, con sus colores ------------------------------------

const layerCommands = plan.commands.filter(
  (command): command is Extract<typeof command, { type: "layer"; op: "upsert" }> =>
    command.type === "layer" && command.op === "upsert",
);
eq(layerCommands.length, 3, "tres capas dedicadas");
eq(
  layerCommands.map((command) => command.layer.name),
  ["VD-COMPARE-NUEVO", "VD-COMPARE-BORRADO", "VD-COMPARE-CAMBIADO"],
  "con los nombres que la orden anuncia",
);
eq(
  layerCommands.map((command) => command.layer.color),
  ["#00ff00", "#ff0000", "#ffff00"],
  "y el calco de colores de DWG Compare: verde lo del dibujo abierto, rojo lo del comparado, amarillo lo retocado",
);
eq(
  plan.commands.findIndex((command) => command.type === "insert") >
    plan.commands.findLastIndex((command) => command.type === "layer"),
  true,
  "las capas se dan de alta ANTES de las nubes: ninguna nace en la capa activa",
);
eq(CAD_COMPARE_CLOUD_LAYERS.nuevo.name, "VD-COMPARE-NUEVO", "la tabla de capas es pública y estable");

// Una capa que ya existe no se vuelve a crear.
const conCapas = cadCompareRevisionClouds(comparison, {
  before: base,
  after: nuevo,
  existingLayers: ["0", "vd-compare-nuevo"],
});
eq(
  conCapas.layers.map((layer) => layer.name),
  ["VD-COMPARE-BORRADO", "VD-COMPARE-CAMBIADO"],
  "la capa que el dibujo ya tiene no se pisa, y el nombre no distingue mayúsculas (como en DXF)",
);

// --- 6. UN lote: un solo deshacer ------------------------------------------

const applied = executeCadEntityCommandBatch(nuevo, plan.commands, "COMPARE");
eq(applied.document.meta.version, nuevo.meta.version + 1, "siete órdenes, UNA versión: un solo Ctrl+Z");
eq(applied.createdEntityIds.length, 4, "las cuatro nubes entraron en el dibujo");
eq(
  applied.document.layers.filter((layer) => layer.name.startsWith("VD-COMPARE-")).length,
  3,
  "y las tres capas quedaron dadas de alta",
);
for (const cloud of plan.clouds) {
  const entity = applied.document.entities.find((candidate) => candidate.id === cloud.cloudId);
  assert.ok(entity, `la nube ${cloud.cloudId} no llegó al documento`);
  eq(entity.layer, cloud.layer, `${cloud.cloudId} quedó en su capa`);
  eq(
    entity.context?.metadata?.["compare:class"],
    cloud.cloudClass,
    `${cloud.cloudId} deja escrito de qué clase es, para poder volver a encontrarla`,
  );
}

// --- 7. Sin diferencias no hay nube ni capa --------------------------------

const iguales = cadCompareRevisionClouds(cadCompareDocuments(base, base), { before: base, after: base });
eq(iguales.commands.length, 0, "comparar un dibujo consigo mismo no escribe NADA");
eq(iguales.clouds.length, 0, "ni una nube");
eq(iguales.layers.length, 0, "ni una capa: un dibujo sin cambios no se ensucia con tres capas vacías");

// --- 8. Lo que no tiene envolvente se cuenta, no se pierde -----------------

const opaca = cadCompareRevisionClouds(
  cadCompareDocuments(
    { entities: [] },
    {
      entities: [
        { id: "op", type: "station", x: 0, y: 0, w: 10, h: 10, rotation: 0, layer: "0" },
        { id: "l", type: "line", start: p(0, 0), end: p(100, 0), layer: "0" },
      ],
    },
  ),
);
eq(opaca.withoutBounds, 1, "la entidad cuyo tipo no reclama el registro se declara sin nube");
eq(opaca.clouds.length, 1, "y la que sí tiene envolvente se marca igual");

console.log(`compare-revision-clouds.spec: ${checks} comprobaciones OK`);
