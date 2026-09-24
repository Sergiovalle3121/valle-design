import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProductionSbom, normalizeFullSbom } from "./production-sbom.mjs";

const component = (name, path, development = false) => ({
  "bom-ref": `${name}@1.0.0`,
  name,
  version: "1.0.0",
  type: "library",
  properties: [
    { name: "cdx:npm:package:path", value: path },
    ...(development
      ? [{ name: "cdx:npm:package:development", value: "true" }]
      : []),
  ],
  licenses: [{ license: { id: "MIT" } }],
});

function fullSbom() {
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    metadata: {
      component: {
        "bom-ref": "product@1.0.0",
        name: "product",
        version: "1.0.0",
      },
    },
    components: [
      component("express", "node_modules/express"),
      component("qs", "node_modules/qs"),
      component("native-runtime", "node_modules/native-runtime", true),
      component("test-only", "node_modules/test-only", true),
    ],
    dependencies: [
      { ref: "product@1.0.0", dependsOn: ["express@1.0.0", "test-only@1.0.0"] },
      { ref: "express@1.0.0", dependsOn: ["qs@1.0.0", "native-runtime@1.0.0"] },
      { ref: "qs@1.0.0", dependsOn: [] },
      { ref: "native-runtime@1.0.0", dependsOn: [] },
      { ref: "test-only@1.0.0", dependsOn: [] },
    ],
  };
}

const runtimePaths = new Set([
  "",
  "node_modules/express",
  "node_modules/qs",
  "node_modules/native-runtime",
]);
const lockRuntimePaths = new Set(["node_modules/express", "node_modules/qs"]);

test("retains every installed runtime component, including an optional package marked dev by npm", () => {
  const result = buildProductionSbom(
    fullSbom(),
    runtimePaths,
    lockRuntimePaths,
  );
  assert.deepEqual(
    result.components.map((part) => part.name),
    ["express", "qs", "native-runtime"],
  );
  assert.deepEqual(result.dependencies[0].dependsOn, ["express@1.0.0"]);
  assert.deepEqual(result.dependencies[1].dependsOn, [
    "qs@1.0.0",
    "native-runtime@1.0.0",
  ]);
});

test("fails closed when npm SBOM omits an installed production package", () => {
  const incomplete = fullSbom();
  incomplete.components = incomplete.components.filter(
    (part) => part.name !== "qs",
  );
  assert.throws(
    () => buildProductionSbom(incomplete, runtimePaths, lockRuntimePaths),
    /node_modules\/qs.*no aparece en el SBOM/i,
  );
});

test("fails closed when npm production tree omits an installed lockfile runtime package", () => {
  const incomplete = new Set([
    "",
    "node_modules/express",
    "node_modules/native-runtime",
  ]);
  assert.throws(
    () => buildProductionSbom(fullSbom(), incomplete, lockRuntimePaths),
    /node_modules\/qs.*no aparece en npm ls/i,
  );
});

test("rejects a stale SBOM version for an installed package at the same path", () => {
  assert.throws(
    () =>
      buildProductionSbom(
        fullSbom(),
        runtimePaths,
        lockRuntimePaths,
        new Map([["node_modules/qs", "2.0.0"]]),
      ),
    /node_modules\/qs.*versión diferente/i,
  );
});

test("folds npm aliases sharing one bom-ref into a valid component with both installed paths", () => {
  const full = fullSbom();
  const alias = component("express-alias", "node_modules/express-alias");
  alias["bom-ref"] = "express@1.0.0";
  alias.purl = "pkg:npm/express@1.0.0";
  full.components[0].purl = alias.purl;
  full.components.push(alias);
  full.dependencies.push({ ref: "express@1.0.0", dependsOn: ["qs@1.0.0"] });
  const paths = new Set([...runtimePaths, "node_modules/express-alias"]);
  const result = buildProductionSbom(full, paths, lockRuntimePaths);
  const installed = result.components.find(
    (part) => part["bom-ref"] === "express@1.0.0",
  );
  assert.deepEqual(
    installed.properties
      .filter((property) => property.name === "cdx:npm:package:path")
      .map((property) => property.value),
    ["node_modules/express", "node_modules/express-alias"],
  );
  assert.equal(
    result.components.filter((part) => part["bom-ref"] === "express@1.0.0")
      .length,
    1,
  );
  assert.equal(
    result.dependencies.filter((item) => item.ref === "express@1.0.0").length,
    1,
  );
  const normalizedFull = normalizeFullSbom(full);
  assert.equal(
    new Set(normalizedFull.components.map((part) => part["bom-ref"])).size,
    normalizedFull.components.length,
  );
});

test("rejects an incomplete production snapshot even if its licenses are permissive", () => {
  assert.throws(
    () => buildProductionSbom(fullSbom(), new Set(), lockRuntimePaths),
    /raíz del repositorio/i,
  );
});
