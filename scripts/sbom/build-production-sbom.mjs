#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertExactProductionSbom,
  buildProductionSbom,
  normalizeFullSbom,
  productionInventory,
} from "./production-sbom.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const raw = JSON.parse(
  readFileSync(join(root, "sbom.full.raw.cdx.json"), "utf8"),
);
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const inventory = productionInventory(root);
const full = normalizeFullSbom(raw);
const production = buildProductionSbom(
  raw,
  inventory.productionPaths,
  inventory.installedLockPaths,
  inventory.installedVersions,
);
production.metadata.component.name = manifest.name;
production.metadata.component.version = manifest.version;
full.metadata.component.name = manifest.name;
full.metadata.component.version = manifest.version;
assertExactProductionSbom(production, inventory);
writeFileSync(
  join(root, "sbom.full.cdx.json"),
  `${JSON.stringify(full, null, 2)}\n`,
);
writeFileSync(
  join(root, "sbom.cdx.json"),
  `${JSON.stringify(production, null, 2)}\n`,
);
console.log(
  `SBOM completo OK: ${full.components.length} componentes; producción: ${production.components.length}; ` +
    `${inventory.installedLockPaths.size} paquetes runtime instalados del lockfile cubiertos.`,
);
