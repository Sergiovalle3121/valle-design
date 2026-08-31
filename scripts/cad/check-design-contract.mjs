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

/**
 * Módulos cuyo router participa de la biyección OpenAPI↔SDK↔Nest. El gate
 * cubría sólo /v1/cad (43 de 77 operaciones); auth, organizations y
 * commercial vivían fuera — una ruta podía divergir del contrato sin que
 * nada lo dijera. `legal` se sumó cuando `/v1/legal/documents` y
 * `/v1/legal/acceptances` entraron al contrato. `outbox-receiver` queda
 * fuera A PROPÓSITO: sus rutas no están en design-api.v1.yaml (superficie
 * operativa, no del SDK del producto).
 */
const controllerDirs = [
  "apps/api/src/modules/cad",
  "apps/api/src/modules/identity",
  "apps/api/src/modules/organizations",
  "apps/api/src/modules/commercial/controllers",
  "apps/api/src/modules/legal",
  "apps/api/src/modules/support",
  // El centro de comentarios (campaña de firma propia): su superficie es
  // pública para quien tiene sesión, así que va en el contrato como las demás.
  "apps/api/src/modules/feedback",
  // Mensajería de equipo (canales + mensajes anclables al dibujo): mismo
  // trato que `legal`/`feedback` — entra al contrato desde su primer commit.
  "apps/api/src/modules/messaging",
  // Señalización de llamada (WebRTC propio): sala, participantes y buzón de
  // señales, todo bajo /v1/calls.
  "apps/api/src/modules/calls",
].map((dir) => path.join(root, dir));

/** Familias de paths del contrato que el gate cruza contra el router. */
const coveredPrefixes = [
  "/v1/cad",
  "/v1/auth",
  "/v1/organizations",
  "/v1/commercial",
  "/v1/legal",
  "/v1/support",
  "/v1/feedback",
  "/v1/messaging",
  "/v1/calls",
];
const coveredPath = (p) =>
  coveredPrefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));

/**
 * Controllers montados fuera del contrato, con su justificación. Un prefijo
 * `_development/` es una superficie de desarrollo que el bootstrap de
 * producción ni monta; nada más entra aquí sin comentario.
 */
const isOutOfContractPrefix = (prefix) => prefix.startsWith("_development/");

const methods = new Set(["get", "post", "put", "patch", "delete"]);

const spec = fs.readFileSync(specPath, "utf8").replaceAll("\r\n", "\n");
const generated = fs
  .readFileSync(generatedPath, "utf8")
  .replaceAll("\r\n", "\n");
const client = fs.readFileSync(clientPath, "utf8");
const controllerFiles = controllerDirs
  .flatMap((dir) =>
    fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".controller.ts"))
      .map((name) => ({ dir, name })),
  )
  .sort((a, b) => a.name.localeCompare(b.name));

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
      if (coveredPath(pathMatch[1])) {
        currentPath = pathMatch[1];
      } else {
        // El contrato NO puede tener familias que el gate no cruce: una
        // operación publicada en el SDK sin router verificado es exactamente
        // el hueco que este gate existe para cerrar.
        errors.push(
          `Path del contrato fuera del alcance del gate: ${pathMatch[1]} — ` +
            `añade su familia a coveredPrefixes y su módulo a controllerDirs`,
        );
        currentPath = null;
      }
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
      currentPath = coveredPath(pathMatch[1]) ? pathMatch[1] : null;
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
  for (const { dir, name } of controllerFiles) {
    const source = fs.readFileSync(path.join(dir, name), "utf8");
    const prefixes = [
      ...source.matchAll(/@Controller\(\s*["']([^"']*)["']\s*\)/g),
    ].map((match) => match[1].replace(/^\/+|\/+$/g, ""));
    if (prefixes.length !== 1) {
      errors.push(`${name}: se esperaba exactamente un @Controller literal`);
      continue;
    }
    const prefix = prefixes[0];
    if (isOutOfContractPrefix(prefix)) continue;
    if (!coveredPath(`/${prefix}`)) {
      errors.push(`${name}: prefijo no canónico ${prefix}`);
    }
    for (const match of source.matchAll(
      // `@Sse` cuenta como GET: NestJS lo registra literalmente como
      // RequestMethod.GET (ver sse.decorator.js) — es la misma ruta HTTP,
      // sólo con `Content-Type: text/event-stream` en la respuesta. Sin esto
      // una ruta de entrega en vivo real quedaría invisible para este gate.
      /@(Get|Post|Put|Patch|Delete|Sse)\(\s*(?:["']([^"']*)["'])?\s*\)/g,
    )) {
      const httpMethod = match[1] === "Sse" ? "Get" : match[1];
      const route = [prefix, match[2] ?? ""].filter(Boolean).join("/");
      const key = routeKey(httpMethod, route);
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
