#!/usr/bin/env node
/**
 * R4 del spec de las reglas: una exención sólo vale si su spec CONDUCE el
 * comando y COMPRUEBA su efecto.
 *
 * Vive aparte de `command-integrity-rules.spec.mjs` por el presupuesto de
 * monolito —un archivo no presupuestado no pasa de 800 líneas— y no como spec
 * independiente: el gate ejecuta UN spec de reglas y exige que anuncie su
 * final, así que este bloque se exporta y el spec principal lo llama con su
 * propio contador. Partirlo en dos procesos habría dado dos recuentos que
 * nadie suma.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validarExencion } from "./command-integrity-rules.mjs";

/**
 * @param {(actual: unknown, esperado: unknown, mensaje: string) => void} eq
 *   el comparador del spec principal, que lleva la cuenta de comprobaciones
 */
export function compruebaExenciones(eq) {
  // Las 9 exenciones reales de main, contra sus specs reales.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const web = path.resolve(here, "../../apps/web");
  const leerReal = (spec) => {
    const absoluto = path.resolve(web, spec);
    return existsSync(absoluto) ? readFileSync(absoluto, "utf8") : null;
  };
  const exenciones = JSON.parse(readFileSync(path.join(here, "command-integrity-exemptions.json"), "utf8"));
  for (const [nombre, entrada] of Object.entries(exenciones.noConcluyentes)) {
    eq(validarExencion(nombre, entrada, leerReal), [], `R4: la exención real de ${nombre} se sostiene`);
  }

  // Trampa: DVIEW de la rama de MiMo, que cita transform-3d-viz.spec.ts. Ese spec
  // sólo lo nombra en una lista, mira que esté registrado y lo cancela.
  const TRANSFORM_3D_VIZ = [
    'const NAMES = ["3DMOVE", "CAMERA", "DVIEW", "NAVBAR"];',
    "for (const name of NAMES) {",
    "  assert.ok(CAD_COMMAND_REGISTRY_V2.get(name), `${name} en el registro`);",
    "}",
    "for (const name of NAMES) {",
    "  const result = run(name, [cancel]);",
    '  assert.ok(result?.kind === "message" && result.text.toLowerCase().includes("cancelado"));',
    "}",
    '{ const result = run("DVIEW", [cancel]);',
    '  assert.ok(result?.kind === "document"); }',
    '{ const result = run("CAMERA", [point(0, 0), point(10, 10)]);',
    '  assert.ok(result?.kind === "message", "CAMERA produce mensaje"); }',
    '{ const result = run("NAVBAR", [point(0, 0)]);',
    "  const x = 1;",
    ...Array.from({ length: 30 }, () => "  // relleno"),
    '  assert.ok(result?.kind === "document"); }',
    'const CAM = command("CAMERA");',
    'const DV = command("DVIEW");',
    "{ const r = CAM.step(null, point(0, 0), ctx).result;",
    '  assert.ok(r?.kind === "document"); }',
  ].join("\n");
  const SPEC_FALSO = "src/lib/cad/engine/commands/transform-3d-viz.spec.ts";
  const leerFalso = (spec) => (spec === SPEC_FALSO ? TRANSFORM_3D_VIZ : null);
  const exencion = (conduce, comprueba, spec = SPEC_FALSO) => ({
    razon: "comando interactivo de vista dinámica; el auto-respondedor no completa el flujo.",
    spec,
    conduce,
    comprueba,
  });
  const rechaza = (nombre, entrada, patron, message) => {
    const motivos = validarExencion(nombre, entrada, leerFalso);
    eq(motivos.length, 1, `${message}: se rechaza`);
    eq(patron.test(motivos[0]), true, `${message}: ${motivos[0]}`);
  };

  rechaza(
    "DVIEW",
    "comando interactivo de vista dinámica que cicla opciones de cámara sin producir geometría; el auto-respondedor no completa el flujo. Spec: transform-3d-viz.spec.ts",
    /sin justificación verificable — hace falta/,
    "R4: el formato de texto de siempre (la entrada literal de MiMo)",
  );
  rechaza(
    "DVIEW",
    exencion("run(name, [cancel])", 'assert.ok(result?.kind === "message"'),
    /no nombra DVIEW/,
    "R4: DVIEW sólo aparece en la lista y en el bucle que cancela",
  );
  rechaza(
    "DVIEW",
    exencion('run("DVIEW", [cancel])', 'assert.ok(result?.kind === "document")'),
    /sólo cancela/,
    "R4: nombrarlo para cancelarlo no es conducirlo",
  );
  rechaza(
    "DVIEW",
    exencion("CAD_COMMAND_REGISTRY_V2.get(name)", "assert.ok(CAD_COMMAND_REGISTRY_V2.get(name)"),
    /consulta de registro/,
    "R4: mirar el registro no es conducirlo",
  );
  rechaza(
    "DVIEW",
    exencion("DV.step(null, point(0, 0), ctx)", 'assert.ok(r?.kind === "document")'),
    /no aparece/,
    "R4: un fragmento que el spec no contiene",
  );
  rechaza(
    "DVIEW",
    exencion("CAM.step(null, point(0, 0), ctx).result", 'assert.ok(r?.kind === "document")'),
    /no nombra DVIEW/,
    "R4: un identificador ligado a OTRO comando",
  );
  rechaza(
    "CAMERA",
    exencion('run("CAMERA", [point(0, 0), point(10, 10)])', 'assert.ok(result?.kind === "message"'),
    /comprueba/,
    "R4: una aserción que no habla de efecto",
  );
  rechaza(
    "NAVBAR",
    exencion('run("NAVBAR", [point(0, 0)])', 'assert.ok(result?.kind === "document")'),
    /comprueba/,
    "R4: una aserción más allá de las 30 líneas",
  );
  rechaza(
    "CHAMFEREDGE",
    exencion('apply("CHAMFEREDGE", [select(solidId), distance(10)], document, [solidId])', "assert.ok(", "src/lib/cad/engine/commands/solids-modify.spec.ts"),
    /no existe/,
    "R4: un spec que no existe (la cita que tenían CHAMFEREDGE y FILLETEDGE)",
  );
  rechaza(
    "DVIEW",
    exencion('run("DVIEW", [point(0, 0)])', "assert.ok(result", "transform-3d-viz.spec.ts"),
    /no es un src/,
    "R4: una ruta que CI no ejecuta",
  );
  rechaza(
    "DVIEW",
    exencion('run("DVIEW", [point(0, 0)])', "assert.ok(result", "src/../../scripts/x.spec.ts"),
    /no es un src/,
    "R4: una ruta que se sale de src",
  );
  // Gemelos legítimos sobre el mismo texto.
  eq(
    validarExencion("CAMERA", exencion("CAM.step(null, point(0, 0), ctx).result", 'assert.ok(r?.kind === "document")'), leerFalso),
    [],
    "R4: un identificador ligado a command(\"CAMERA\") y conducido con .step vale",
  );
}
