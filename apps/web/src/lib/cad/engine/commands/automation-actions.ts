/**
 * ACTRECORD, ACTSTOP y ACTMANAGER: grabar lo que se teclea y repetirlo.
 *
 * ## Qué falta, medido
 *
 * Sondeados treinta y seis nombres de la familia de automatización de AutoCAD
 * contra el registro: **4 de 36**, y la familia de grabación —ACTRECORD,
 * ACTSTOP, ACTMANAGER, ACTUSERINPUT, ACTUSERMESSAGE— en **0 de 5**.
 *
 * ## Por qué las tres son peticiones al anfitrión y no órdenes que escriben
 *
 * Grabar no es un efecto sobre el documento: es quedarse con la SUCESIÓN de
 * acciones, y una orden de este motor ve una entrada cada vez. El único sitio
 * por el que pasan todas es el anfitrión de la línea de órdenes, así que las
 * tres piden allí —`ui`, destino `action-recorder`— y él graba, guarda y
 * repite. Es el mismo reparto que SCRIPT: la orden pide, el anfitrión ejecuta.
 *
 * Y como todas las peticiones de interfaz de este motor, las tres dicen qué se
 * pierde el usuario si su espacio de trabajo no las atiende, en vez de tragarse
 * la orden en silencio.
 *
 * ## Lo que se graba es un `.scr`, no un formato nuestro
 *
 * Ver `automation/action-recorder.ts`. Un macro grabado se puede leer, editar a
 * mano y ejecutar con SCRIPT — y por eso también se puede guardar y llevar a
 * otro proyecto.
 */
import {
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
  type CadUiRequest,
} from "../command-types";

const UNAVAILABLE =
  "El grabador de acciones no está montado en este espacio de trabajo. La automatización sigue " +
  "disponible: un guión .scr hace lo mismo y se ejecuta con SCRIPT.";

function ask(request: CadUiRequest, text: string): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "ui", request, text },
  };
}

const recordCommand: CadCommandDescriptor<{ asked: boolean }> = {
  name: "ACTRECORD",
  aliases: ["GRABARACCION"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  // No escribe el documento: lo que hace es empezar a mirar.
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: { asked: true },
    prompt: { message: "Nombre del macro, Intro para <macro>", options: [] },
    accepts: CAD_ACCEPT_TEXT,
  }),
  step: (state, input) => {
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    const name =
      input.kind === "text" && input.value.trim() !== "" ? input.value.trim() : "macro";
    return ask(
      { target: "action-recorder", params: { action: "start", name }, unavailable: UNAVAILABLE, scriptable: true },
      `Grabando «${name}».`,
    );
  },
};

const stopCommand: CadCommandDescriptor<never> = {
  name: "ACTSTOP",
  aliases: ["PARARACCION"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: () =>
    ask(
      { target: "action-recorder", params: { action: "stop" }, unavailable: UNAVAILABLE, scriptable: true },
      "Cerrando la grabación.",
    ),
  step: (state) => ({
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "none" },
  }),
};

const managerCommand: CadCommandDescriptor<{ asked: boolean }> = {
  name: "ACTMANAGER",
  aliases: ["GESTORACCIONES"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  // Repetir un macro SÍ escribe, pero lo escribe la orden que el macro
  // contiene: aquí sólo se pide. Declararlo mutante haría que el motor pidiera
  // permiso de escritura para listar.
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: { asked: true },
    prompt: { message: "Macro a repetir, Intro para listar los grabados", options: [] },
    accepts: CAD_ACCEPT_TEXT,
  }),
  step: (state, input) => {
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "enter" || (input.kind === "text" && input.value.trim() === ""))
      return ask(
        { target: "action-recorder", params: { action: "list" }, unavailable: UNAVAILABLE, scriptable: true },
        "Macros grabados en esta sesión.",
      );
    if (input.kind !== "text")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    const name = input.value.trim();
    return ask(
      { target: "action-recorder", params: { action: "play", name }, unavailable: UNAVAILABLE, scriptable: true },
      `Repitiendo «${name}».`,
    );
  },
};

export const CAD_ACTION_RECORDER_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(recordCommand),
  asCadCommand(stopCommand),
  asCadCommand(managerCommand),
];
