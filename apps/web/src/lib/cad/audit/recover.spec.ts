import { strict as assert } from "node:assert";
import { recoverCadDocument } from "./recover";

let checks = 0;

// --- un documento sano pasa entero, sin pérdidas ------------------------------
{
  const result = recoverCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [{ id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, layer: "0" }],
  });
  assert.equal(result.recovered, true);
  assert.deepEqual(result.manifest, { totalEntities: 1, recoveredEntities: 1, lost: [], layersSynthesized: [] });
  assert.equal(result.document?.entities.length, 1);
  checks += 3;
}

// --- salva las entidades sanas y declara, una por una, las que no lo son ------
{
  const result = recoverCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [
      { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, layer: "0" },
      { id: "bad-coords", type: "line", start: { x: 0, y: 0 }, end: { x: NaN, y: 0 }, layer: "0" },
      { id: "l1", type: "line", start: { x: 20, y: 0 }, end: { x: 30, y: 0 }, layer: "0" }, // id duplicado
      { id: "weird", type: "spaceship", layer: "0" },
      { id: "orphan-insert", type: "insert", block: "no-existe", insertion: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, layer: "0" },
      "no soy una entidad",
    ],
  });
  assert.equal(result.recovered, true);
  assert.equal(result.manifest.totalEntities, 6);
  assert.equal(result.manifest.recoveredEntities, 1);
  assert.deepEqual(result.document?.entities.map((entity) => entity.id), ["l1"]);
  const reasons = result.manifest.lost.map((loss) => loss.entityId ?? `#${loss.index}`);
  for (const expected of ["bad-coords", "l1", "weird", "orphan-insert", "#5"])
    assert.ok(reasons.includes(expected), `se esperaba «${expected}» entre las pérdidas`);
  assert.match(result.manifest.lost.find((loss) => loss.entityId === "weird")?.reason ?? "", /tipo desconocido/);
  assert.match(result.manifest.lost.find((loss) => loss.entityId === "orphan-insert")?.reason ?? "", /bloque/);
  checks += 9;
}

// --- sintetiza la capa que una entidad nombraba sin declarar ------------------
{
  // Una entidad rota en cualquier otro punto del documento fuerza el
  // salvamento entidad por entidad: un documento sano de punta a punta no
  // pasa nunca por `salvage()`, aunque le falte declarar una capa —eso lo
  // rechaza la API al guardar, no `migrateCadDocument` al abrir.
  const result = recoverCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [
      { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, layer: "FANTASMA" },
      { id: "bad", type: "line", start: { x: 0, y: 0 }, end: { x: NaN, y: 0 }, layer: "0" },
    ],
  });
  assert.equal(result.recovered, true);
  assert.equal(result.manifest.recoveredEntities, 1);
  assert.deepEqual(result.manifest.layersSynthesized, ["FANTASMA"]);
  assert.ok(result.document?.layers.some((layer) => layer.id === "FANTASMA"));
  checks += 4;
}

// --- conserva un INSERT cuando el bloque sí existe, por id o por nombre -------
{
  const result = recoverCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    blocks: [{ id: "blk-1", name: "SILLA", basePoint: { x: 0, y: 0, z: 0 }, entities: [] }],
    entities: [
      { id: "i1", type: "insert", block: "SILLA", insertion: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, layer: "0" },
    ],
  });
  assert.equal(result.recovered, true);
  assert.deepEqual(result.manifest.lost, []);
  checks += 2;
}

// --- declara pérdida total cuando el candidato no es ni siquiera un objeto ----
{
  const result = recoverCadDocument("esto no es JSON de un documento");
  assert.equal(result.recovered, false);
  assert.equal(result.document, null);
  assert.equal(result.manifest.lost.length, 1);
  checks += 3;
}

// --- un candidato sin entidades recupera un documento vacío, sin pérdidas -----
{
  const result = recoverCadDocument({ meta: { version: 1, schema: 4, unit: "mm" } });
  assert.equal(result.recovered, true);
  assert.deepEqual(result.manifest, { totalEntities: 0, recoveredEntities: 0, lost: [], layersSynthesized: [] });
  checks += 2;
}

console.log(`audit/recover.spec: ${checks} comprobaciones OK`);
