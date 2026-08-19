#!/usr/bin/env node
/**
 * Genera los datos de la CONSOLA PÚBLICA de la API desde el contrato OpenAPI.
 *
 * POR QUÉ SE GENERA Y NO SE ESCRIBE. Una consola escrita a mano es una tercera
 * copia de la superficie de la API —la primera es el YAML, la segunda el SDK
 * generado— y la tercera copia siempre es la que se queda atrás. Cuando un
 * integrador abre la consola y prueba una operación que ya no existe, no
 * concluye «la documentación está desactualizada»: concluye que la API no es
 * seria. Aquí el YAML manda, igual que manda para el SDK y para el router.
 *
 * POR QUÉ UN JSON Y NO PARSEAR EL YAML EN EL NAVEGADOR. Meter un analizador de
 * YAML en el bundle del web para leer un archivo que sólo cambia cuando cambia
 * el contrato es pagar peso en cada visita por un trabajo que se hace una vez.
 * El JSON generado se importa como dato estático.
 *
 * LA DERIVA SE CIERRA CON UNA SPEC. `apps/web/src/app/docs/api/
 * console-contract.spec.ts` vuelve a generar y compara; si alguien añade una
 * operación al contrato y no regenera, el gate del web lo dice con nombre y
 * apellidos. Sin esa spec, este script sería una sugerencia.
 *
 * Uso:
 *   node scripts/cad/build-api-console.mjs           (escribe)
 *   node scripts/cad/build-api-console.mjs --check   (falla si hay deriva)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '../..');
const SPEC = path.join(
  REPO_ROOT,
  'packages/contracts/specs/design-api.v1.yaml',
);
const OUTPUT = path.join(
  REPO_ROOT,
  'apps/web/src/app/docs/api/operations.generated.json',
);

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

/** Valor escalar de una línea `clave: valor`, sin comillas ni comentarios. */
function scalar(line) {
  const value = line.slice(line.indexOf(':') + 1).trim();
  if (!value || value === '|' || value === '>-' || value === '>') return null;
  return value.replace(/^["']|["']$/g, '');
}

/**
 * Parámetros declarados en `components/parameters`.
 *
 * Hacen falta porque la mitad de las operaciones los referencian por `$ref`:
 * sin resolverlos, la consola mostraría `limit` y `offset` como si no
 * existieran y el integrador no sabría que puede paginar.
 */
function parseComponentParameters(lines) {
  const parameters = new Map();
  let inComponents = false;
  let inParameters = false;
  let currentName = null;
  let current = null;
  const flush = () => {
    if (currentName && current) parameters.set(currentName, current);
    currentName = null;
    current = null;
  };
  for (const line of lines) {
    if (/^components:\s*$/.test(line)) {
      inComponents = true;
      continue;
    }
    if (inComponents && /^  \w+:\s*$/.test(line)) {
      flush();
      inParameters = /^  parameters:\s*$/.test(line);
      continue;
    }
    if (!inParameters) continue;
    const nameMatch = line.match(/^    (\w+):\s*$/);
    if (nameMatch) {
      flush();
      currentName = nameMatch[1];
      current = { name: nameMatch[1], in: 'query', required: false };
      continue;
    }
    if (!current) continue;
    if (/^      name:/.test(line)) current.name = scalar(line) ?? current.name;
    if (/^      in:/.test(line)) current.in = scalar(line) ?? current.in;
    if (/^      required:/.test(line)) current.required = scalar(line) === 'true';
    if (/^      description:/.test(line)) {
      const text = scalar(line);
      if (text) current.description = text;
    }
  }
  flush();
  return parameters;
}

/** Un bloque de parámetros (de ruta o de operación) en una lista de objetos. */
function parseParameterBlock(lines, startIndex, indent, componentParameters) {
  const result = [];
  const itemPrefix = `${' '.repeat(indent)}- `;
  let index = startIndex;
  let current = null;
  const flush = () => {
    if (current) result.push(current);
    current = null;
  };
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;
    const leading = line.length - line.trimStart().length;
    if (leading < indent) break;
    if (line.startsWith(itemPrefix)) {
      flush();
      const inline = line.slice(itemPrefix.length).trim();
      const refMatch = inline.match(/\$ref:\s*"#\/components\/parameters\/(\w+)"/);
      if (refMatch) {
        const resolved = componentParameters.get(refMatch[1]);
        result.push(
          resolved
            ? { ...resolved }
            : { name: refMatch[1], in: 'query', required: false },
        );
        continue;
      }
      current = { name: '', in: 'query', required: false };
      if (inline.startsWith('name:')) current.name = scalar(inline) ?? '';
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith('name:')) current.name = scalar(trimmed) ?? '';
    if (trimmed.startsWith('in:')) current.in = scalar(trimmed) ?? 'query';
    if (trimmed.startsWith('required:')) current.required = scalar(trimmed) === 'true';
    if (trimmed.startsWith('description:')) {
      const text = scalar(trimmed);
      if (text) current.description = text;
    }
  }
  flush();
  return { parameters: result, nextIndex: index };
}

/**
 * Superficie de operaciones del contrato.
 *
 * Se recorre por indentación, igual que `check-design-contract.mjs`, para no
 * añadir una dependencia de YAML al repositorio por leer un archivo cuya forma
 * ya está fijada por ese mismo gate.
 */
export function parseSpec(source) {
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  const componentParameters = parseComponentParameters(lines);
  const operations = [];
  const info = { title: '', version: '', openapi: '' };
  let currentPath = null;
  let pathParameters = [];
  let current = null;
  let inPaths = false;

  const flush = () => {
    if (current) operations.push(current);
    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^openapi:/.test(line)) info.openapi = scalar(line) ?? '';
    if (/^  title:/.test(line) && !info.title) info.title = scalar(line) ?? '';
    if (/^  version:/.test(line) && !info.version)
      info.version = scalar(line) ?? '';
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (/^components:\s*$/.test(line)) {
      flush();
      inPaths = false;
      continue;
    }
    if (!inPaths) continue;

    const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
    if (pathMatch) {
      flush();
      currentPath = pathMatch[1];
      pathParameters = [];
      continue;
    }
    if (currentPath && /^    parameters:\s*$/.test(line) && !current) {
      const block = parseParameterBlock(lines, index + 1, 6, componentParameters);
      pathParameters = block.parameters;
      index = block.nextIndex - 1;
      continue;
    }
    const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/);
    if (currentPath && methodMatch && METHODS.has(methodMatch[1])) {
      flush();
      current = {
        operationId: '',
        method: methodMatch[1].toUpperCase(),
        path: currentPath,
        summary: '',
        tags: [],
        entitlement: null,
        permission: null,
        authentication: 'sessionCookie',
        parameters: [...pathParameters],
        requestBody: null,
        responses: [],
      };
      continue;
    }
    if (!current) continue;

    if (/^      operationId:/.test(line))
      current.operationId = scalar(line) ?? '';
    if (/^      summary:/.test(line)) current.summary = scalar(line) ?? '';
    if (/^      tags:/.test(line)) {
      const raw = scalar(line) ?? '';
      current.tags = raw
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
    if (/^      x-required-entitlement:/.test(line))
      current.entitlement = scalar(line);
    if (/^      x-required-permission:/.test(line))
      current.permission = scalar(line);
    if (/^      security:\s*\[\]\s*$/.test(line))
      current.authentication = 'public';
    if (/^\s+- reviewToken:/.test(line)) current.authentication = 'reviewToken';
    if (/^      parameters:\s*$/.test(line)) {
      const block = parseParameterBlock(lines, index + 1, 8, componentParameters);
      current.parameters = [...pathParameters, ...block.parameters];
      index = block.nextIndex - 1;
      continue;
    }
    if (/^      requestBody:\s*$/.test(line)) {
      current.requestBody = { required: false, schema: null };
      continue;
    }
    if (current.requestBody && /^        required:/.test(line))
      current.requestBody.required = scalar(line) === 'true';
    if (
      current.requestBody &&
      current.requestBody.schema === null &&
      /\$ref:\s*"#\/components\/schemas\/(\w+)"/.test(line)
    ) {
      current.requestBody.schema = line.match(
        /\$ref:\s*"#\/components\/schemas\/(\w+)"/,
      )[1];
    }
    const responseMatch = line.match(/^        "(\d{3})":/);
    if (responseMatch) current.responses.push(responseMatch[1]);
  }
  flush();
  return { info, operations };
}

/** Agrupa por familia de recurso para que la consola no sea una lista plana. */
function groupOperations(operations) {
  const groups = new Map();
  for (const operation of operations) {
    const family = operation.path.startsWith('/v1/cad/')
      ? 'cad'
      : operation.path.startsWith('/v1/auth')
        ? 'auth'
        : operation.path.startsWith('/v1/organizations')
          ? 'organizations'
          : 'commercial';
    const tag = operation.tags[0] ?? family;
    const key = `${family}:${tag}`;
    if (!groups.has(key)) groups.set(key, { family, tag, operations: [] });
    groups.get(key).operations.push(operation.operationId);
  }
  return [...groups.values()];
}

export function buildConsoleData(source) {
  const { info, operations } = parseSpec(source);
  return {
    $comment:
      'GENERADO por scripts/cad/build-api-console.mjs desde el contrato OpenAPI. No editar a mano: console-contract.spec.ts falla si difiere del YAML.',
    generatedFrom: 'packages/contracts/specs/design-api.v1.yaml',
    openapi: info.openapi,
    apiTitle: info.title,
    apiVersion: info.version,
    operationCount: operations.length,
    cadOperationCount: operations.filter((operation) =>
      operation.path.startsWith('/v1/cad/'),
    ).length,
    groups: groupOperations(operations),
    operations,
  };
}

function main() {
  const source = fs.readFileSync(SPEC, 'utf8');
  const data = buildConsoleData(source);
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    const existing = fs.existsSync(OUTPUT)
      ? fs.readFileSync(OUTPUT, 'utf8').replaceAll('\r\n', '\n')
      : '';
    if (existing !== serialized) {
      console.error(
        '[build-api-console] DERIVA: operations.generated.json no coincide con el contrato. Ejecuta `node scripts/cad/build-api-console.mjs`.',
      );
      process.exit(1);
    }
    console.log(
      `[build-api-console] OK — ${data.operationCount} operaciones sincronizadas con el contrato.`,
    );
    return;
  }
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, serialized, 'utf8');
  console.log(
    `[build-api-console] ${data.operationCount} operaciones (${data.cadOperationCount} de /v1/cad) escritas en ${path.relative(REPO_ROOT, OUTPUT)}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
