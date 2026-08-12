import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateFixtures } from "./fixture-validation.js";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

try {
  const report = await validateFixtures(packageRoot);
  console.log(
    `DWG fixtures OK: ${report.fixtureCount} governed files, ${report.byteLength} bytes, ${report.uniqueHashCount} unique SHA-256 values.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
