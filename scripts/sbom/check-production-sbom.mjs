#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertExactProductionSbom,
  productionInventory,
} from "./production-sbom.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sbom = JSON.parse(readFileSync(join(root, "sbom.cdx.json"), "utf8"));
const inventory = productionInventory(root);
const count = assertExactProductionSbom(sbom, inventory);
console.log(
  `Cobertura de SBOM OK: ${count} componentes del árbol de producción instalado.`,
);
