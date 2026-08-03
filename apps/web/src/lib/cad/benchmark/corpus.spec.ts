import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { serializeCadDocument, type CadDocument } from "../cad-document";
import {
  CAD_BENCHMARK_MANIFEST,
  createCadBenchmarkCorpus,
  createCadBenchmarkRng,
} from "./corpus";

const profiles = CAD_BENCHMARK_MANIFEST.profiles;
assert.equal(CAD_BENCHMARK_MANIFEST.schemaVersion, 1);
assert.deepEqual(
  profiles.map((profile) => profile.entities),
  [10_000, 100_000, 500_000, 1_000_000],
);
assert.deepEqual(
  profiles.map((profile) => profile.tier),
  ["smoke", "smoke", "scale", "scale"],
);
assert.ok(
  profiles
    .filter((profile) => profile.tier === "smoke")
    .every((profile) => profile.budgetEnforcement === "blocking"),
);
assert.ok(
  profiles
    .filter((profile) => profile.tier === "scale")
    .every(
      (profile) =>
        profile.budgetEnforcement === "report-only" &&
        profile.hardware.minimumTotalMemoryBytes > 0,
    ),
);
for (const profile of profiles) {
  assert.ok(profile.queries >= 100);
  assert.ok(profile.dxfSampleEntities <= profile.entities);
  assert.ok(
    Object.values(profile.budgets).every(
      (budget) => Number.isFinite(budget) && budget > 0,
    ),
  );
}

const rngA = createCadBenchmarkRng(CAD_BENCHMARK_MANIFEST.generator.seed);
const rngB = createCadBenchmarkRng(CAD_BENCHMARK_MANIFEST.generator.seed);
assert.deepEqual(
  Array.from({ length: 16 }, rngA),
  Array.from({ length: 16 }, rngB),
);

const fixture = CAD_BENCHMARK_MANIFEST.determinismFixture;
const first = createCadBenchmarkCorpus({ entities: fixture.entities });
const second = createCadBenchmarkCorpus({ entities: fixture.entities });
const firstSerialized = serializeCadDocument(first.document);
const secondSerialized = serializeCadDocument(second.document);
assert.equal(firstSerialized, secondSerialized);
assert.equal(
  createHash("sha256").update(firstSerialized).digest("hex"),
  fixture.sha256,
);
assert.equal(
  Object.values(first.entityMix).reduce((total, count) => total + count, 0),
  fixture.entities,
);
assert.ok(first.entityMix.line > 0);
assert.ok(first.entityMix.circle > 0);
assert.ok(first.entityMix.arc > 0);
assert.ok(
  first.nativeEntities.every((entity) =>
    ["line", "circle", "arc"].includes(entity.type),
  ),
);

// `layers` y `entities` son CONJUNTOS: el orden en que lleguen no es
// información, así que la serialización canónica debe absorberlo.
const reordered: CadDocument = {
  ...first.document,
  layers: [...first.document.layers].reverse(),
  entities: [...first.document.entities].reverse(),
};
assert.equal(
  serializeCadDocument(reordered),
  firstSerialized,
  "canonical serialization makes the corpus digest input-order independent",
);

// `modelSpace.entityIds` NO es un conjunto: es el orden de dibujo. Invertirlo
// invierte el z-order del plano entero, así que DEBE cambiar el serializado.
// Esta aserción antes exigía lo contrario y con ello fijaba la pérdida de
// datos: cada guardado reescribía el orden de dibujo.
const drawOrderReversed: CadDocument = {
  ...first.document,
  modelSpace: {
    entityIds: [...first.document.modelSpace.entityIds].reverse(),
  },
};
assert.notEqual(
  serializeCadDocument(drawOrderReversed),
  firstSerialized,
  "reversing draw order is a semantic change and must not serialize identically",
);

console.log(
  `ok CAD benchmark manifest/determinism: ${profiles.length} profiles, fixture ${fixture.entities}`,
);
