/**
 * SCRIPT: la puerta tecleable a la automatización.
 *
 * El comando en sí es diminuto porque no puede hacer el trabajo: leer un
 * archivo es del navegador, y volver a meter los renglones por el motor es del
 * anfitrión —el comando está DENTRO del motor y no puede reentrar en él sin
 * reentrar en sí mismo—. Así que SCRIPT pide la interfaz (`script-file`) y el
 * anfitrión lee y ejecuta con `runCadScript`.
 *
 * La parte que importa —analizar el `.scr` y entregarlo renglón a renglón, con
 * la regla de que una línea en blanco es un Enter— vive en
 * `lib/cad/script-runner.ts` y se prueba en Node dibujando de verdad.
 *
 * RSCRIPT repite el último script, como en AutoCAD. Es lo que convierte un
 * script en un bucle.
 */
import {
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

interface ScriptState {
  repeat: boolean;
}

const UNAVAILABLE =
  "Este espacio de trabajo no sabe abrir un archivo de script. Los renglones de un .scr se " +
  "pueden teclear uno a uno en la línea de comandos: hacen exactamente lo mismo.";

function scriptCommand(name: string, repeat: boolean): CadCommandDescriptor<ScriptState> {
  return {
    name,
    aliases: repeat ? ["RS"] : ["SCR"],
    kind: "manage",
    transparent: false,
    selection: "none",
    repeatable: false,
    mutates: true,
    cursor: "none",
    begin: () => ({
      state: { repeat },
      prompt: { message: "", options: [] },
      accepts: 0,
      result: {
        kind: "ui",
        request: {
          target: "script-file",
          params: repeat ? { mode: "repeat" } : { mode: "open" },
          unavailable: UNAVAILABLE,
        },
        text: repeat ? "Repitiendo el último script." : "Elija el archivo .scr que ejecutar.",
      },
    }),
    step: (state): CadCommandStep<ScriptState> => ({
      state,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: { kind: "none" },
    }),
  };
}

export const CAD_AUTOMATION_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(scriptCommand("SCRIPT", false)),
  asCadCommand(scriptCommand("RSCRIPT", true)),
];
