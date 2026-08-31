#!/usr/bin/env node
/**
 * Gate de autorización por handler HTTP del API.
 *
 * El PermissionsGuard global devuelve `true` cuando un handler no declara
 * permisos: el default de RBAC es fail-open A PROPÓSITO (hay superficies
 * públicas y superficies con barrera imperativa). Lo que no había era nada
 * que obligara a cada handler a ELEGIR — y el día que alguien añadiera un
 * endpoint copiando el vecino sin copiar su barrera, ningún gate lo veía.
 *
 * La regla: todo método con decorador HTTP (@Get/@Post/…) debe llevar UNA de
 *   · @Public()             — superficie pública consciente;
 *   · @RequirePermissions() / @RequirePermission() — RBAC declarativo;
 *   · @ReviewLinkSurface()  — superficie de review link;
 *   (a nivel de método o de clase), O
 *   · una entrada en handler-authorization-exemptions.json que NOMBRA la
 *     función de barrera imperativa que el cuerpo del método invoca, con su
 *     razón. Una exención cuyo check no aparece invocado en el cuerpo falla:
 *     declarar una barrera que no está es peor que no declararla.
 *
 * Y el espejo: una exención que apunta a un handler que ya no existe también
 * falla — una lista de excepciones que sobrevive a su handler es basura que
 * esconde defectos (misma regla que el barrido de cables sueltos).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");

// `@Sse` cuenta como GET: es exactamente lo que registra en el router (ver
// @nestjs/common/decorators/http/sse.decorator.js — compone RequestMapping
// con RequestMethod.GET). Dejarlo fuera de este patrón sería el mismo hueco
// que el gate existe para cerrar: un handler HTTP real sin barrera auditada.
const HTTP_DECORATORS =
  /@(Get|Post|Put|Patch|Delete|Head|Options|All|Sse)\s*\(/u;
const AUTH_DECORATORS =
  /@(Public|RequirePermissions|RequirePermission|ReviewLinkSurface)\s*\(/u;

/** Lista los .controller.ts bajo `root` (recursivo, sin node_modules/dist). */
export function listControllerFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".controller.ts")) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

/**
 * Extrae los handlers de un controller: nombre de método, decoradores del
 * bloque contiguo que lo precede, si la CLASE lleva autorización, y el cuerpo
 * (hasta el siguiente decorador HTTP o el fin del archivo) para verificar la
 * barrera imperativa de una exención.
 */
export function extractHandlers(source) {
  const lines = source.split("\n");
  const handlers = [];
  // Autorización a nivel de clase: el bloque contiguo de decoradores que
  // envuelve a @Controller(...). No vale «todo lo anterior a class»: un DTO
  // puede declararse antes del controller y cortaría la búsqueda.
  const controllerIndex = lines.findIndex((line) =>
    /@Controller\s*\(/u.test(line),
  );
  let classAuthorized = false;
  if (controllerIndex >= 0) {
    let blockStart = controllerIndex;
    while (blockStart > 0 && /^\s*@/u.test(lines[blockStart - 1])) blockStart -= 1;
    let blockEnd = controllerIndex + 1;
    while (blockEnd < lines.length && /^\s*@/u.test(lines[blockEnd])) blockEnd += 1;
    classAuthorized = AUTH_DECORATORS.test(
      lines.slice(blockStart, blockEnd).join("\n"),
    );
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (!HTTP_DECORATORS.test(lines[index])) continue;
    // Bloque contiguo de decoradores alrededor del HTTP: hacia atrás y hacia
    // delante hasta la línea del método.
    let start = index;
    while (start > 0 && /^\s*@/u.test(lines[start - 1])) start -= 1;
    let cursor = index + 1;
    let methodLine = -1;
    while (cursor < lines.length) {
      const line = lines[cursor];
      const method = /^\s*(?:private\s+|public\s+)?(?:async\s+)?(\w+)\s*[(<]/u.exec(line);
      if (method && !/^\s*@/u.test(line)) {
        methodLine = cursor;
        break;
      }
      cursor += 1;
    }
    if (methodLine === -1) continue;
    const decoratorBlock = lines.slice(start, methodLine).join("\n");
    // Cuerpo: desde el método hasta el próximo decorador HTTP o el fin.
    let end = methodLine + 1;
    while (end < lines.length && !HTTP_DECORATORS.test(lines[end])) end += 1;
    // El bloque de decoradores del PRÓXIMO handler no es cuerpo de éste.
    let bodyEnd = end;
    while (bodyEnd > methodLine && /^\s*@/u.test(lines[bodyEnd - 1])) bodyEnd -= 1;
    handlers.push({
      method: /(?:async\s+)?(\w+)\s*[(<]/u.exec(lines[methodLine])[1],
      authorized: classAuthorized || AUTH_DECORATORS.test(decoratorBlock),
      body: lines.slice(methodLine, bodyEnd).join("\n"),
    });
    index = methodLine;
  }
  return handlers;
}

/**
 * Audita todos los controllers. Devuelve { failures, handlers } donde cada
 * fallo trae archivo#método y el motivo.
 */
export function auditHandlerAuthorization({ apiRoot, exemptions }) {
  const failures = [];
  let total = 0;
  const seenKeys = new Set();
  for (const file of listControllerFiles(apiRoot)) {
    const relative = path
      .relative(REPO_ROOT, file)
      .replaceAll("\\", "/");
    const source = fs.readFileSync(file, "utf8");
    for (const handler of extractHandlers(source)) {
      total += 1;
      const key = `${relative}#${handler.method}`;
      seenKeys.add(key);
      if (handler.authorized) continue;
      const exemption = exemptions[key];
      if (!exemption) {
        failures.push(
          `${key}: handler HTTP sin @Public/@RequirePermissions/@ReviewLinkSurface ` +
            `y sin exención declarada en handler-authorization-exemptions.json`,
        );
        continue;
      }
      if (!handler.body.includes(`${exemption.check}(`)) {
        failures.push(
          `${key}: la exención declara la barrera «${exemption.check}» pero el ` +
            `cuerpo del método no la invoca — una barrera declarada que no está ` +
            `es peor que ninguna`,
        );
      }
    }
  }
  for (const key of Object.keys(exemptions)) {
    if (key === "$comment") continue;
    if (!seenKeys.has(key)) {
      failures.push(
        `${key}: la exención apunta a un handler que ya no existe — retírala`,
      );
    }
  }
  return { failures, total };
}

export const EXEMPTIONS_PATH = path.join(
  here,
  "handler-authorization-exemptions.json",
);

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const exemptions = JSON.parse(fs.readFileSync(EXEMPTIONS_PATH, "utf8"));
  const apiRoot = path.join(REPO_ROOT, "apps/api/src");
  const { failures, total } = auditHandlerAuthorization({ apiRoot, exemptions });
  if (failures.length > 0) {
    console.error(`Autorización por handler: ${failures.length} fallo(s):`);
    for (const failure of failures) console.error(`  · ${failure}`);
    process.exit(1);
  }
  const declared = Object.keys(exemptions).filter((key) => key !== "$comment");
  console.log(
    `Autorización por handler OK: ${total} handlers auditados, ` +
      `${declared.length} exención(es) imperativa(s) verificada(s).`,
  );
}
