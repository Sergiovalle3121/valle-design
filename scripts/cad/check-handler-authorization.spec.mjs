#!/usr/bin/env node
/**
 * Spec del gate de autorización por handler.
 *
 * Lo que hay que probar no es que lea archivos: es que VEA el handler sin
 * barrera (el caso que el guard global deja pasar), que respete las tres
 * formas declarativas y la clase, que verifique que una exención invoca de
 * verdad su barrera, y que una exención huérfana muera. Cada caso feliz
 * tiene su gemelo triste.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  auditHandlerAuthorization,
  extractHandlers,
} from "./check-handler-authorization.mjs";

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

// ─── extractHandlers: las formas reales de un controller ─────────────────────

const declarado = `
import { Controller, Get, Post } from '@nestjs/common';
@Controller('x')
export class XController {
  @Get()
  @RequirePermissions('cad:view')
  async listar() { return []; }

  @Public()
  @Post('abierto')
  abierto() { return {}; }

  @Post('sin-barrera')
  async suelto(@Req() req) {
    return this.hazAlgo(req);
  }
}
`;
{
  const handlers = extractHandlers(declarado);
  eq(handlers.length, 3, "tres handlers HTTP detectados");
  eq(
    handlers.map((h) => [h.method, h.authorized]),
    [
      ["listar", true],
      ["abierto", true],
      ["suelto", false],
    ],
    "la autorización se lee del bloque contiguo de decoradores",
  );
  ok(
    handlers[2].body.includes("hazAlgo("),
    "el cuerpo del handler queda disponible para verificar barreras",
  );
}

// Clase con @Public() al nivel del @Controller — y un DTO declarado ANTES,
// que es el caso que rompía la detección ingenua de cabecera de clase.
const publicoDeClase = `
class CuerpoDto { valor!: string; }
@Public()
@Controller('_harness')
export class HarnessController {
  @Post()
  async ejecutar() { return {}; }
}
`;
{
  const handlers = extractHandlers(publicoDeClase);
  eq(handlers.length, 1, "un handler en el controller de clase pública");
  eq(handlers[0].authorized, true, "@Public() de clase cubre a sus métodos");
}

// ─── auditHandlerAuthorization sobre un árbol de fixtures ────────────────────

const root = fs.mkdtempSync(path.join(os.tmpdir(), "authz-gate-"));
const controllersDir = path.join(root, "modules", "demo");
fs.mkdirSync(controllersDir, { recursive: true });
fs.writeFileSync(
  path.join(controllersDir, "demo.controller.ts"),
  declarado,
  "utf8",
);

{
  const { failures } = auditHandlerAuthorization({
    apiRoot: root,
    exemptions: {},
  });
  eq(failures.length, 1, "el handler sin barrera y sin exención falla");
  ok(
    failures[0].includes("#suelto"),
    "el fallo nombra archivo y método exactos",
  );
}

{
  const { failures, total } = auditHandlerAuthorization({
    apiRoot: root,
    exemptions: {
      [`${failureKey()}`]: {
        check: "hazAlgo",
        reason: "la barrera vive en hazAlgo()",
      },
    },
  });
  eq(failures, [], "una exención cuya barrera SÍ se invoca deja verde");
  eq(total, 3, "se auditan los tres handlers");
}

{
  const { failures } = auditHandlerAuthorization({
    apiRoot: root,
    exemptions: {
      [`${failureKey()}`]: {
        check: "barreraFantasma",
        reason: "declara una barrera que el cuerpo no invoca",
      },
    },
  });
  eq(failures.length, 1, "una barrera declarada que no se invoca falla");
  ok(failures[0].includes("barreraFantasma"), "el fallo nombra la barrera");
}

{
  const { failures } = auditHandlerAuthorization({
    apiRoot: root,
    exemptions: {
      "modules/demo/inexistente.controller.ts#nada": {
        check: "x",
        reason: "huérfana",
      },
      [`${failureKey()}`]: { check: "hazAlgo", reason: "válida" },
    },
  });
  eq(failures.length, 1, "una exención huérfana falla");
  ok(failures[0].includes("ya no existe"), "y dice por qué");
}

/** La clave real que produce el árbol de fixtures para el handler suelto. */
function failureKey() {
  const { failures } = auditHandlerAuthorization({
    apiRoot: root,
    exemptions: {},
  });
  return failures[0].split(":")[0];
}

fs.rmSync(root, { recursive: true, force: true });
console.log(`check-handler-authorization: ${checks} comprobaciones verdes`);
