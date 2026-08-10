import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateProvenance } from "./provenance-validation.js";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = resolve(packageRoot, "..", "..");

try {
  const report = await validateProvenance(repositoryRoot, packageRoot);
  console.log(
    `DWG provenance OK: ${report.allowedSourceCount}/${report.sourceCount} allowed sources cover ${report.governedFileCount} package files and ${report.linkedFixtureCount} fixtures.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
