import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const spec = fs.readFileSync(
  path.join(root, "packages/contracts/specs/design-api.v1.yaml"),
  "utf8",
);
const generated = fs.readFileSync(
  path.join(root, "packages/design-sdk/src/generated/design-api.ts"),
  "utf8",
);
const controllerDir = path.join(root, "apps/api/src/modules/cad");
const controllerSources = fs
  .readdirSync(controllerDir)
  .filter((name) => name.endsWith(".controller.ts"))
  .map((name) => fs.readFileSync(path.join(controllerDir, name), "utf8"));
const controllers = controllerSources.join("\n");

const operations = [
  ...spec.matchAll(/^  (\/v1\/[^:]+):[\s\S]*?^      operationId: (\w+)/gm),
].map(([, route, id], index, all) => ({ route, id }));
const generatedIds = new Set(
  [...generated.matchAll(/^    (\w+): \{/gm)].map((match) => match[1]),
);
const implemented = new Set();
for (const source of controllerSources) {
  const prefix =
    source.match(/@Controller\(['"]v1\/cad\/?([^'"]*)['"]\)/)?.[1] ?? "";
  for (const match of source.matchAll(
    /@(Get|Post|Put|Patch|Delete)\(['"]([^'"]*)['"]\)/g,
  )) {
    implemented.add(
      `${match[1].toUpperCase()} ${[prefix, match[2]].filter(Boolean).join("/")}`,
    );
  }
}
const methodByOperation = [];
for (const [, route, body] of spec.matchAll(
  /^  (\/v1\/[^:]+):\n([\s\S]*?)(?=^  \/v1\/|^components:)/gm,
)) {
  for (const [, method, id] of body.matchAll(
    /^    (get|post|put|patch|delete):[\s\S]*?^      operationId: (\w+)/gm,
  )) {
    methodByOperation.push({ route, method: method.toUpperCase(), id });
  }
}
const missingGenerated = methodByOperation.filter(
  ({ id }) => !generatedIds.has(id),
);
const missingController = [];
for (const { route, method, id } of methodByOperation) {
  const mounted = route.replace(/^\/v1\/?/, "").replaceAll(/\{(\w+)\}/g, ":$1");
  if (!implemented.has(`${method} ${mounted}`))
    missingController.push(`${method} ${route} -> ${id}`);
}
if (missingGenerated.length || missingController.length) {
  console.error(
    JSON.stringify({ missingGenerated, missingController }, null, 2),
  );
  process.exit(1);
}
console.log(
  `Design contract OK: ${methodByOperation.length} operaciones sincronizadas.`,
);
