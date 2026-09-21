/**
 * Familia Visualización: 3DWALK, 3DFLY, 3DSWIVEL, VISUALSTYLES, CAMERA, DVIEW,
 * NAVVCUBE y NAVBAR — AÚN NO DISPONIBLES, y lo dicen.
 *
 * Antes pedían entradas (dos puntos, un estilo, una opción) y terminaban en
 * «requiere anfitrión con visor 3D»: el visor 3D existe y no los atendía, así
 * que el usuario daba dos puntos para nada. Este spec afirmaba ese recorrido.
 *
 * Ahora terminan al invocarse con el renglón de `command-availability.ts`, que
 * además dice qué orden sí hace lo que se busca; aquí se conducen con las
 * mismas entradas de antes para comprobar que ninguna llega a pedirse. Que el
 * documento quede idéntico y que no tengan botón lo mide
 * `command-availability.spec.ts`.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { cadMensajeAunNoDisponible } from "../command-availability";
import { cadCommandSummary } from "../command-summaries";
import type { CadCommandContext, CadCommandInput } from "../command-types";

import "@/lib/cad/engine/all-commands";

const dummyContext: CadCommandContext = {
  entityIds: [],
  entity: () => undefined,
  selection: [],
  activeLayer: "0",
  view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
  newEntityId: () => "never",
};

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const enter: CadCommandInput = { kind: "enter" };

/** Las entradas con las que el spec anterior recorría cada orden. */
const CASOS: readonly [string, readonly CadCommandInput[], string][] = [
  ["3DWALK", [enter], "3DORBIT"],
  ["3DFLY", [enter], "3DORBIT"],
  ["3DSWIVEL", [enter], "3DORBIT"],
  ["VISUALSTYLES", [{ kind: "keyword", keyword: "Alambre" }], "VSCURRENT"],
  ["CAMERA", [point(0, 0), point(10, 0)], "3DORBIT"],
  ["DVIEW", [enter, { kind: "keyword", keyword: "Puntos" }, point(0, 0), point(10, 0)], "VPOINT"],
  ["NAVVCUBE", [enter], "línea de comandos"],
  ["NAVBAR", [enter], "línea de comandos"],
];

let comprobaciones = 0;
for (const [name, inputs, pista] of CASOS) {
  const desc = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(desc, `${name} está en el registro`);
  let step = desc.begin(dummyContext);
  let pasos = 0;
  for (const input of inputs) {
    if (step.result) break;
    step = desc.step(step.state, input, dummyContext);
    pasos += 1;
  }
  assert.equal(pasos, 0, `${name} termina al invocarse: no pide puntos ni opciones que luego no usa`);
  assert.ok(
    step.result?.kind === "message" && step.result.text === cadMensajeAunNoDisponible(name),
    `${name} dice que aún no está disponible: ${step.result?.kind === "message" ? step.result.text : step.result?.kind}`,
  );
  assert.ok(!/anfitri/i.test(step.result.text), `${name}: no culpa a un anfitrión con visor 3D («${step.result.text}»)`);
  assert.ok(step.result.text.includes(pista), `${name}: nombra la orden que sí sirve o lo que falta (${pista})`);
  assert.equal(desc.mutates, false, `${name} no modifica el dibujo`);
  comprobaciones += 5;
}

// El cubo y la barra de navegación EXISTEN: el estudio los monta en la esquina
// del visor en 3D. La negativa de NAVVCUBE y NAVBAR —y su resumen en Ctrl+K—
// puede decir que aún no se controlan por orden, nunca que no existen: quien
// los tiene delante en pantalla leería una mentira.
{
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const editor = readFileSync(path.join(aqui, "../../../../components/cad/editor/Layout3DEditor.tsx"), "utf8");
  for (const [name, componente] of [["NAVVCUBE", "CadViewCube"], ["NAVBAR", "CadNavigationBar"]] as const) {
    assert.ok(new RegExp(`<${componente}\\b`).test(editor), `el estudio monta <${componente}> (si deja de hacerlo, revise la negativa de ${name})`);
    for (const texto of [cadMensajeAunNoDisponible(name), cadCommandSummary(name)]) {
      assert.ok(!/no existe|no tiene/i.test(texto), `${name}: no niega un control que está en pantalla («${texto}»)`);
    }
    comprobaciones += 3;
  }
}

console.log(`view-visualization.spec: ${CASOS.length} órdenes de visualización se niegan con honestidad — ${comprobaciones} comprobaciones`);
