import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const root = path.resolve(import.meta.dirname, "../..");
const specPath = path.join(root, "packages/contracts/specs/design-api.v1.yaml");
const generatedPath = path.join(
  root,
  "packages/design-sdk/src/generated/design-api.ts",
);
const clientPath = path.join(root, "packages/design-sdk/src/client.ts");
const controllerDir = path.join(root, "apps/api/src/modules/cad");
const methods = new Set(["get", "post", "put", "patch", "delete"]);

const spec = fs.readFileSync(specPath, "utf8").replaceAll("\r\n", "\n");
const generated = fs
  .readFileSync(generatedPath, "utf8")
  .replaceAll("\r\n", "\n");
const client = fs.readFileSync(clientPath, "utf8");
const controllerFiles = fs
  .readdirSync(controllerDir)
  .filter((name) => name.endsWith(".controller.ts"))
  .sort();

function routeKey(method, route) {
  const normalized = route
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replaceAll(/\{([^}]+)\}/g, ":$1");
  return `${method.toUpperCase()} ${normalized}`;
}

function parseSpecOperations(source) {
  const operations = new Map();
  const ids = new Set();
  const errors = [];
  let currentPath = null;
  let pending = null;

  const finishPending = (endLine) => {
    if (!pending) return;
    if (!pending.id) {
      errors.push(
        `Falta operationId en ${pending.method.toUpperCase()} ${pending.path}`,
      );
    } else {
      pending.body = pending.lines.join("\n");
      pending.endLine = endLine;
      const key = routeKey(pending.method, pending.path);
      if (operations.has(key))
        errors.push(`Operación OpenAPI duplicada: ${key}`);
      if (ids.has(pending.id))
        errors.push(`operationId OpenAPI duplicado: ${pending.id}`);
      operations.set(key, pending);
      ids.add(pending.id);
    }
    pending = null;
  };

  const lines = source.split("\n");
  lines.forEach((line, index) => {
    const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
    if (pathMatch) {
      finishPending(index);
      currentPath = pathMatch[1].startsWith("/v1/cad/") ? pathMatch[1] : null;
      return;
    }

    const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/);
    if (currentPath && methodMatch && methods.has(methodMatch[1])) {
      finishPending(index);
      pending = {
        path: currentPath,
        method: methodMatch[1],
        id: null,
        lines: [line],
        startLine: index + 1,
      };
      return;
    }

    if (pending) {
      pending.lines.push(line);
      const idMatch = line.match(/^      operationId:\s*([A-Za-z]\w*)\s*$/);
      if (idMatch) pending.id = idMatch[1];
    }
  });
  finishPending(lines.length);
  return { operations, errors };
}

function parseGeneratedOperations(source) {
  const operations = new Map();
  const errors = [];
  let inPaths = false;
  let currentPath = null;
  for (const line of source.split("\n")) {
    if (line === "export interface paths {") {
      inPaths = true;
      continue;
    }
    if (line.startsWith("export type webhooks")) break;
    if (!inPaths) continue;

    const pathMatch = line.match(/^    "([^"]+)": \{$/);
    if (pathMatch) {
      currentPath = pathMatch[1].startsWith("/v1/cad/") ? pathMatch[1] : null;
      continue;
    }
    const methodMatch = line.match(
      /^        (get|post|put|patch|delete): operations\["([A-Za-z]\w*)"\];$/,
    );
    if (!currentPath || !methodMatch) continue;
    const key = routeKey(methodMatch[1], currentPath);
    if (operations.has(key))
      errors.push(`Operación generada duplicada: ${key}`);
    operations.set(key, { id: methodMatch[2], path: currentPath });
  }
  return { operations, errors };
}

function parseControllerOperations() {
  const operations = new Map();
  const errors = [];
  for (const name of controllerFiles) {
    const source = fs.readFileSync(path.join(controllerDir, name), "utf8");
    const prefixes = [
      ...source.matchAll(/@Controller\(\s*["']([^"']*)["']\s*\)/g),
    ].map((match) => match[1].replace(/^\/+|\/+$/g, ""));
    if (prefixes.length !== 1) {
      errors.push(`${name}: se esperaba exactamente un @Controller literal`);
      continue;
    }
    const prefix = prefixes[0];
    if (prefix !== "v1/cad" && !prefix.startsWith("v1/cad/")) {
      errors.push(`${name}: prefijo no canónico ${prefix}`);
    }
    for (const match of source.matchAll(
      /@(Get|Post|Put|Patch|Delete)\(\s*(?:["']([^"']*)["'])?\s*\)/g,
    )) {
      const route = [prefix, match[2] ?? ""].filter(Boolean).join("/");
      const key = routeKey(match[1], route);
      if (operations.has(key)) {
        errors.push(
          `Ruta Nest duplicada: ${key} (${operations.get(key)}, ${name})`,
        );
      }
      operations.set(key, name);
    }
  }
  return { operations, errors };
}

function operationBlock(source, operationId) {
  const operationsStart = source.indexOf("export interface operations {");
  const start = source.indexOf(`    ${operationId}: {`, operationsStart);
  if (start < 0) return "";
  const tail = source.slice(start + 4);
  const next = tail.search(/^    [A-Za-z]\w*: \{$/m);
  return next < 0 ? source.slice(start) : source.slice(start, start + 4 + next);
}

const parsedSpec = parseSpecOperations(spec);
const parsedGenerated = parseGeneratedOperations(generated);
const parsedControllers = parseControllerOperations();
const errors = [
  ...parsedSpec.errors,
  ...parsedGenerated.errors,
  ...parsedControllers.errors,
];

const generatedStart = generated.indexOf("export interface paths");
if (generatedStart < 0) {
  errors.push("El SDK generado no contiene export interface paths");
} else {
  const expectedGenerated = astToString(
    await openapiTS(pathToFileURL(specPath)),
  ).replaceAll("\r\n", "\n");
  const generatedBody = generated.slice(generatedStart);
  if (expectedGenerated.trim() !== generatedBody.trim()) {
    errors.push(
      "El SDK generado no corresponde byte a byte al OpenAPI; ejecuta npm run generate --workspace=@valle/design-sdk",
    );
  }
}

if (parsedSpec.operations.size === 0) {
  errors.push("El contrato no contiene ninguna operación HTTP");
}
if (parsedGenerated.operations.size === 0) {
  errors.push("El SDK generado no contiene ninguna operación HTTP");
}
if (parsedControllers.operations.size === 0) {
  errors.push("El router Nest no contiene ninguna operación HTTP CAD");
}

for (const [key, operation] of parsedSpec.operations) {
  const generatedOperation = parsedGenerated.operations.get(key);
  if (!generatedOperation) {
    errors.push(`Falta en SDK generado: ${key} -> ${operation.id}`);
  } else if (generatedOperation.id !== operation.id) {
    errors.push(
      `operationId divergente en ${key}: OpenAPI=${operation.id}, SDK=${generatedOperation.id}`,
    );
  }
  if (!parsedControllers.operations.has(key)) {
    errors.push(`Falta en router Nest: ${key} -> ${operation.id}`);
  }
}
for (const [key, operation] of parsedGenerated.operations) {
  if (!parsedSpec.operations.has(key)) {
    errors.push(`Operación generada sin contrato: ${key} -> ${operation.id}`);
  }
}
for (const [key, file] of parsedControllers.operations) {
  if (!parsedSpec.operations.has(key)) {
    errors.push(`Ruta Nest sin contrato: ${key} (${file})`);
  }
}

const listDocuments = [...parsedSpec.operations.values()].find(
  (operation) => operation.id === "listCadDocuments",
);
for (const queryName of ["model", "revision"]) {
  if (!listDocuments?.body.includes(`- name: ${queryName}`)) {
    errors.push(`listCadDocuments no declara el query param ${queryName}`);
  }
}
const generatedListDocuments = operationBlock(generated, "listCadDocuments");
for (const queryName of ["model", "revision"]) {
  if (!generatedListDocuments.includes(`${queryName}?:`)) {
    errors.push(
      `El SDK generado no expone ${queryName} en listCadDocuments; regenera el SDK`,
    );
  }
}

if (/\bmountPrefix\b/.test(client) || /replace\(\s*\/\^\\?\/v1/.test(client)) {
  errors.push("El cliente SDK conserva un remapeo de prefijo prohibido");
}
if (errors.length) {
  console.error(
    `Contrato CAD divergente:\n${errors.map((e) => `- ${e}`).join("\n")}`,
  );
  process.exit(1);
}

console.log(
  `Design contract OK: ${parsedSpec.operations.size} operaciones OpenAPI = SDK generado = router Nest.`,
);
