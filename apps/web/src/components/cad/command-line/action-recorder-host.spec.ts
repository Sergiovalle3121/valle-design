/**
 * EL GRABADOR DE ACCIONES, DENTRO DEL ANFITRIÓN.
 *
 * El módulo puro (`lib/cad/automation/action-recorder.ts`) ya mide las reglas
 * del macro. Lo que sólo se puede medir aquí es lo que hace que el grabador
 * grabe lo que de verdad pasó: que un punto SEÑALADO en el lienzo se guarde
 * como coordenada, que el motor distinga «token que arranca una orden» de
 * «token que contesta a un prompt» —de eso depende dónde empieza cada orden en
 * el macro—, y que repetir un macro no se grabe a sí mismo.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "@/lib/cad/cad-document";
import { CAD_COMMAND_REGISTRY_V2 } from "@/lib/cad/engine";
import { cadActionScript } from "@/lib/cad/automation/action-recorder";
import { CadCommandEngineHost } from "./command-engine-host";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

function makeHost() {
  const entities = new Map<string, CadEntity>();
  let ids = 0;
  const host = new CadCommandEngineHost(CAD_COMMAND_REGISTRY_V2, {
    context: () => ({
      entityIds: [...entities.keys()],
      entity: (entityId) => entities.get(entityId),
      selection: [],
      activeLayer: "0",
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId: () => `e${++ids}`,
    }),
    apply: (commands) => {
      for (const command of commands)
        if (command.type === "insert") entities.set(command.entity.id, command.entity);
    },
    preview: () => {},
    osnapOverride: () => {},
    cursor: () => {},
  });
  return { host, entities };
}

// --- 1 · una línea señalada con el ratón entra como COORDENADAS -----------
{
  const { host, entities } = makeHost();
  ok(host.startRecording("muro tipo").includes("grabando «muro tipo»"), "el grabador arranca y lo dice");

  host.submit("LINE");
  host.pickPoint({ x: 0, y: 0 });
  host.pickPoint({ x: 3_000, y: 0 });
  host.accept();
  eq(entities.size, 1, "la línea se dibujó de verdad mientras se grababa");

  const parado = host.stopRecording();
  ok(!("message" in parado), "y el macro se guarda");
  if ("recording" in parado) {
    assert.deepEqual(
      parado.recording.lines,
      ["LINE", "0,0", "3000,0", ""],
      "el clic se guardó como coordenada: es lo que hace que el macro sirva en otro plano",
    );
    verdes += 1;
    eq(parado.recording.commands, 1, "una orden");
  }
}

// --- 2 · un token con el motor LIBRE arranca orden; con orden en curso, no --
{
  const { host } = makeHost();
  host.startRecording("dos");
  host.submit("LINE");
  host.submit("0,0");
  host.submit("1000,0");
  host.accept();
  host.submit("CIRCLE");
  host.submit("2000,2000");
  host.submit("500");
  const parado = host.stopRecording();
  if ("recording" in parado) {
    eq(parado.recording.commands, 2, "dos órdenes, porque el segundo LINE/CIRCLE abrió la suya");
    assert.deepEqual(
      parado.recording.lines,
      ["LINE", "0,0", "1000,0", "", "CIRCLE", "2000,2000", "500"],
      "y los renglones salen en el orden tecleado",
    );
    verdes += 1;
  }
}

// --- 3 · lo cancelado no se graba, y el dibujo lo confirma ----------------
{
  const { host, entities } = makeHost();
  host.startRecording("con arrepentimiento");
  host.submit("CIRCLE");
  host.pickPoint({ x: 500, y: 500 });
  host.cancel();
  host.submit("LINE");
  host.pickPoint({ x: 0, y: 0 });
  host.pickPoint({ x: 1_000, y: 0 });
  host.accept();
  eq(entities.size, 1, "sólo se dibujó la línea: el círculo se canceló de verdad");
  const parado = host.stopRecording();
  if ("recording" in parado) {
    ok(
      !parado.recording.lines.includes("CIRCLE"),
      `y el macro no lo lleva: ${parado.recording.lines.join(" | ")}`,
    );
    eq(parado.recording.commands, 1, "ni lo cuenta");
  }
}

// --- 4 · un macro vacío no se guarda -------------------------------------
{
  const { host } = makeHost();
  host.startRecording("nada");
  const parado = host.stopRecording();
  ok(
    "message" in parado && /quedó vacío/.test(parado.message),
    "un macro que no hace nada no se guarda, y se dice",
  );
  eq(host.recordedMacros().length, 0, "y no aparece en la lista");
}

// --- 5 · parar sin grabar, y grabar dos veces -----------------------------
{
  const { host } = makeHost();
  const sinGrabar = host.stopRecording();
  ok("message" in sinGrabar && /No se está grabando/.test(sinGrabar.message), "parar sin grabar se dice");
  host.startRecording("uno");
  ok(host.startRecording("otro").includes("Ya se está grabando «uno»"), "y no se abren dos grabaciones");
}

// --- 6 · REPETIR el macro dibuja otra vez, y NO se graba a sí mismo -------
{
  const { host, entities } = makeHost();
  host.startRecording("muro");
  host.submit("LINE");
  host.pickPoint({ x: 0, y: 0 });
  host.pickPoint({ x: 1_000, y: 0 });
  host.accept();
  const parado = host.stopRecording();
  assert.ok("recording" in parado);
  verdes += 1;
  const antes = entities.size;

  // Se repite POR LA MISMA PUERTA que un `.scr`: renglón a renglón.
  host.startRecording("segunda");
  host.replay(() => {
    for (const line of parado.recording.lines) {
      if (line === "") host.accept();
      else host.submit(line);
    }
  });
  eq(entities.size, antes + 1, "repetir el macro dibujó otra línea");
  const segunda = host.stopRecording();
  ok(
    "message" in segunda && /quedó vacío/.test(segunda.message),
    "y la repetición NO se grabó: un macro que se graba repitiéndose se duplica solo",
  );

  // El macro sigue en la sesión y se encuentra sin distinguir mayúsculas.
  ok(host.recordedMacro("MURO") !== null, "el macro se busca sin distinguir mayúsculas");
  ok(
    cadActionScript(host.recordedMacro("muro")!).includes("; muro"),
    "y su guión lleva la cabecera con su nombre",
  );
}

console.log(
  `Grabador de acciones en el anfitrión: ${verdes} comprobaciones verdes — el clic se graba como coordenada, cada orden empieza donde debe, lo cancelado no entra y repetir no se graba a sí mismo`,
);
