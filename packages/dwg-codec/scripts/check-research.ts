import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateResearchGovernance } from "./research-validation.js";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = resolve(packageRoot, "..", "..");

try {
  const report = await validateResearchGovernance(repositoryRoot, packageRoot);
  console.log(
    `DWG research governance OK: ${report.allowedFactCount} allowed facts, ${report.familyCount} families, ${report.propertyCount} family-scoped properties, ${report.matrixCellCount} scope cells, ${report.evidenceCount} evidence records and class registry incomplete.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
