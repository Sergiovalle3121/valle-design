import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { serializeCadDocument } from "../cad-document";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../entity-runtime";
import {
  CAD_CORPUS_MIX_IDS,
  CAD_CORPUS_MIX_MANIFEST,
  CAD_CORPUS_MIX_PERIOD,
  CAD_CORPUS_MIX_SIZES,
  CAD_CORPUS_MIXES,
  buildCadCorpusMixSchedule,
  createCadCorpusMix,
  findCadCorpusMixManifestEntry,
} from "./corpus-mixes";

// ---------------------------------------------------------------------------
// El reparto por resto mayor: exacto e INTERCALADO
// ---------------------------------------------------------------------------

assert.throws(
  () => buildCadCorpusMixSchedule([500, 400]),
  /suman 900/,
  "unos pesos que no suman el periodo deben fallar, no repartirse a ojo",
);

const schedule = buildCadCorpusMixSchedule([200, 600, 200]);
assert.equal(schedule.length, CAD_CORPUS_MIX_PERIOD);
const scheduleCounts = [0, 0, 0];
for (const slot of schedule) scheduleCounts[slot] += 1;
assert.deepEqual(
  scheduleCounts,
  [200, 600, 200],
  "el reparto debe ser EXACTO, no aproximado: de ahí salen los 20.000 MTEXT",
);
// Ancla absoluta contra el fallo que importa: que el reparto salga en BLOQUES.
// Si los 200 primeros huecos fueran todos del constructor 0, los MTEXT caerían
// en una esquina del dibujo y el atlas se mediría concentrado en dos tiles.
const firstHundred = new Set(schedule.slice(0, 100));
assert.equal(
  firstHundred.size,
  3,
  "los tres constructores deben aparecer ya en las primeras 100 ranuras",
);
// Y de forma estable: el mismo reparto en cada corrida y en cada runtime.
assert.deepEqual(schedule, buildCadCorpusMixSchedule([200, 600, 200]));

for (const mix of CAD_CORPUS_MIX_IDS) {
  const definition = CAD_CORPUS_MIXES[mix];
  assert.equal(
    definition.slots.reduce((sum, slot) => sum + slot.weight, 0),
    CAD_CORPUS_MIX_PERIOD,
    `los pesos de ${mix} deben sumar ${CAD_CORPUS_MIX_PERIOD}`,
  );
  assert.ok(definition.layers.length > 0, `${mix} necesita capas`);
  assert.ok(definition.title.length > 10 && definition.stresses.length > 10);
}

// ---------------------------------------------------------------------------
// Manifiesto: SHA y recuento por tipo, en los dos escalones
// ---------------------------------------------------------------------------

assert.equal(CAD_CORPUS_MIX_MANIFEST.schemaVersion, 1);
assert.equal(CAD_CORPUS_MIX_MANIFEST.generator.period, CAD_CORPUS_MIX_PERIOD);
assert.equal(
  CAD_CORPUS_MIX_MANIFEST.corpora.length,
  CAD_CORPUS_MIX_IDS.length * CAD_CORPUS_MIX_SIZES.length,
  "el manifiesto cubre CADA mezcla en CADA escalón: 4 × 2",
);

for (const mix of CAD_CORPUS_MIX_IDS) {
  for (const entities of CAD_CORPUS_MIX_SIZES) {
    const entry = findCadCorpusMixManifestEntry(mix, entities);
    assert.ok(entry, `falta ${mix}@${entities} en el manifiesto`);
    const corpus = createCadCorpusMix({ mix, entities });
    assert.equal(corpus.nativeEntities.length, entities);
    assert.equal(
      createHash("sha256")
        .update(serializeCadDocument(corpus.document))
        .digest("hex"),
      entry.sha256,
      `${mix}@${entities} cambió de contenido: regenera el manifiesto con scripts/cad-corpus-mixes-manifest.mts --write y revisa el diff`,
    );
    // El SHA solo diría «cambió algo». El recuento por tipo dice QUÉ, y es lo
    // que impide que un generador que deje de emitir hatches pase por un
    // simple re-registro del hash.
    const observed = Object.fromEntries(
      Object.entries(corpus.entityMix).filter(([, count]) => count > 0),
    );
    assert.deepEqual(observed, entry.entityMix, `${mix}@${entities}`);
    assert.equal(
      Object.values(corpus.entityMix).reduce((sum, count) => sum + count, 0),
      entities,
    );
  }
}

// ---------------------------------------------------------------------------
// ANCLAS ABSOLUTAS — lo que cada mezcla tiene que contener, sin rodeos
// ---------------------------------------------------------------------------

const hostile = createCadCorpusMix({ mix: "text-hostile", entities: 100_000 });
assert.equal(
  hostile.entityMix.mtext,
  20_000,
  "la mezcla hostil son 20.000 MTEXT EXACTOS en el escalón de 100k",
);
const hostileGlyphs = new Set<string>();
let hostileLongest = 0;
let hostileMultiline = 0;
for (const entity of hostile.nativeEntities) {
  if (entity.type !== "mtext") continue;
  for (const character of entity.text) hostileGlyphs.add(character);
  hostileLongest = Math.max(hostileLongest, entity.text.length);
  if (entity.text.includes("\n")) hostileMultiline += 1;
}
// El atlas escala con caracteres DISTINTOS, no con rótulos: un corpus de
// dígitos llenaría 10 huecos y declararía que el atlas aguanta.
assert.ok(
  hostileGlyphs.size >= 80,
  `el texto hostil debe cubrir ≥80 glifos distintos, cubre ${hostileGlyphs.size}`,
);
assert.ok(hostileLongest >= 40, `MTEXT más largo: ${hostileLongest} caracteres`);
assert.equal(
  hostileMultiline,
  20_000,
  "todos los MTEXT hostiles son de varias líneas",
);

const architecture = createCadCorpusMix({ mix: "architecture", entities: 100_000 });
assert.equal(architecture.entityMix.insert, 34_000);
assert.equal(architecture.entityMix.hatch, 14_000);
assert.equal(architecture.entityMix.dimension, 17_000);
assert.equal(
  architecture.document.blocks.length,
  3,
  "muchos INSERT, POCAS definiciones: 34.000 instancias sobre 3 bloques",
);
const architectureBlockIds = new Set(architecture.document.blocks.map((block) => block.id));
for (const entity of architecture.nativeEntities)
  if (entity.type === "insert")
    assert.ok(
      architectureBlockIds.has(entity.block),
      `INSERT ${entity.id} apunta a un bloque inexistente (${entity.block}); expandirlo daría una caja vacía y el benchmark mediría la nada`,
    );

/**
 * El plano real: lo que lo distingue de `architecture` es el REPARTO, no los
 * tipos. Las anclas son proporciones, porque una proporción que se va es
 * exactamente la forma en que este perfil dejaría de parecerse a un archivo de
 * trabajo sin que ningún hash lo delatara de forma legible.
 */
const plano = createCadCorpusMix({ mix: "plano-real", entities: 10_000 });
assert.equal(
  plano.entityMix.line + plano.entityMix.polyline,
  4_400,
  "muros y trazado lineal son el 44% del plano: es la población dominante",
);
assert.equal(plano.entityMix.dimension, 1_300, "las cotas son la segunda población");
assert.equal(plano.entityMix.insert, 1_400);
assert.equal(
  plano.document.blocks.length,
  4,
  "1.400 INSERT sobre CUATRO definiciones: muchas instancias, pocas definiciones",
);
assert.ok(
  plano.entityMix.insert < createCadCorpusMix({ mix: "architecture", entities: 10_000 }).entityMix.insert,
  "el plano real tiene MENOS inserts que la mezcla hostil de bloques: por cada puerta hay una docena de segmentos de muro",
);
assert.equal(plano.entityMix.hatch, 700, "acabados achurados");
assert.equal(plano.entityMix.mtext, 1_000, "rotulación de local y notas técnicas");
const planoBlockIds = new Set(plano.document.blocks.map((block) => block.id));
for (const entity of plano.nativeEntities)
  if (entity.type === "insert")
    assert.ok(
      planoBlockIds.has(entity.block),
      `INSERT ${entity.id} apunta a un bloque inexistente (${entity.block})`,
    );
// Las cotas tienen que MEDIR algo: una cota de longitud cero pasa el compilador,
// engorda el recuento y no dibuja ni un trazo.
for (const entity of plano.nativeEntities)
  if (entity.type === "dimension")
    assert.ok(
      Math.abs(entity.a.x - entity.b.x) > 1 || Math.abs(entity.a.y - entity.b.y) > 1,
      `la cota ${entity.id} mide cero: no dibujaría nada`,
    );

const cartography = createCadCorpusMix({ mix: "cartography", entities: 100_000 });
let cartographySegments = 0;
for (const entity of cartography.nativeEntities)
  if (entity.type === "polyline")
    cartographySegments += entity.vertices.length - 1 + (entity.closed ? 1 : 0);
assert.ok(
  cartographySegments >= 700_000,
  `«cientos de miles de segmentos» es un ancla, no una intención: ${cartographySegments}`,
);

const mechanical = createCadCorpusMix({ mix: "mechanical", entities: 10_000 });
assert.ok(mechanical.entityMix.spline > 0 && mechanical.entityMix.ellipse > 0);
let toleranced = 0;
let smallArcs = 0;
for (const entity of mechanical.nativeEntities) {
  if (entity.type === "dimension" && entity.suffix?.includes("±")) toleranced += 1;
  if (entity.type === "arc" && entity.radius <= 5) smallArcs += 1;
}
assert.equal(toleranced, mechanical.entityMix.dimension, "toda cota mecánica lleva tolerancia");
assert.equal(smallArcs, mechanical.entityMix.arc, "todos los arcos mecánicos son pequeños");

// ---------------------------------------------------------------------------
// Cada entidad tiene que DIBUJARSE, no sólo tipar
// ---------------------------------------------------------------------------

/**
 * Ancla contra el modo de fallo más silencioso de un corpus: entidades bien
 * tipadas que el registro produce vacías. Un spline con nudos incoherentes o un
 * hatch sin contorno pasan el compilador, engordan el recuento y se dibujan
 * como nada — y el benchmark diría «100.000 entidades» midiendo aire.
 */
for (const mix of CAD_CORPUS_MIX_IDS) {
  const corpus = createCadCorpusMix({ mix, entities: 10_000 });
  const types = new Set<CadNativeEntity["type"]>();
  for (const entity of corpus.nativeEntities) {
    assert.ok(CAD_ENTITY_REGISTRY.supports(entity), `${mix}: ${entity.type} sin adaptador`);
    types.add(entity.type);
    // Las cajas del INSERT necesitan el documento para expandir el bloque.
    const bounds = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity, corpus.document);
    assert.ok(
      Number.isFinite(bounds.minX) &&
        Number.isFinite(bounds.minY) &&
        Number.isFinite(bounds.maxX) &&
        Number.isFinite(bounds.maxY),
      `${mix}: ${entity.id} (${entity.type}) tiene caja no finita`,
    );
    assert.ok(
      bounds.maxX >= bounds.minX && bounds.maxY >= bounds.minY,
      `${mix}: ${entity.id} tiene caja invertida`,
    );
  }
  assert.ok(types.size >= 3, `${mix} sólo emite ${types.size} tipos distintos`);

  let drawn = 0;
  let points = 0;
  for (const entity of corpus.nativeEntities) {
    const paths = CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(
      entity,
      64,
      corpus.document,
    );
    const usable = paths.filter((path) => path.points.length >= 2);
    if (usable.length > 0) drawn += 1;
    for (const path of usable) points += path.points.length;
  }
  // MTEXT no aporta trazos —va por el atlas de glifos—, así que el ancla es
  // «todo lo que NO es texto se dibuja», y se cuenta en absoluto.
  const nonText = corpus.nativeEntities.filter((entity) => entity.type !== "mtext").length;
  assert.ok(
    drawn >= nonText,
    `${mix}: ${drawn} entidades con trazos frente a ${nonText} no textuales`,
  );
  assert.ok(points > nonText * 2, `${mix}: sólo ${points} puntos para ${nonText} entidades`);
}

// ---------------------------------------------------------------------------
// Determinismo entre corridas del MISMO proceso y entre semillas distintas
// ---------------------------------------------------------------------------

for (const mix of CAD_CORPUS_MIX_IDS) {
  const first = createCadCorpusMix({ mix, entities: 2_048 });
  const second = createCadCorpusMix({ mix, entities: 2_048 });
  assert.equal(
    serializeCadDocument(first.document),
    serializeCadDocument(second.document),
    `${mix} no es reproducible`,
  );
  const other = createCadCorpusMix({ mix, entities: 2_048, seed: 12_345 });
  assert.notEqual(
    serializeCadDocument(other.document),
    serializeCadDocument(first.document),
    `${mix} ignora la semilla: el generador no estaría usando el RNG`,
  );
  // …pero la PROPORCIÓN no depende de la semilla. Es la separación que hace
  // calibrable un presupuesto de atlas.
  assert.deepEqual(other.entityMix, first.entityMix);
}

console.log(
  `ok CAD corpus mixes: ${CAD_CORPUS_MIX_IDS.length} mezclas × ${CAD_CORPUS_MIX_SIZES.length} escalones, ` +
    `hostil ${hostile.entityMix.mtext} MTEXT / ${hostileGlyphs.size} glifos, ` +
    `arquitectura ${architecture.entityMix.insert} INSERT sobre ${architecture.document.blocks.length} bloques, ` +
    `cartografía ${cartographySegments} segmentos`,
);
