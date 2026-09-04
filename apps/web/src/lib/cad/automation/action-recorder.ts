/**
 * EL GRABADOR DE ACCIONES: lo que se teclea una vez, repetido veinte.
 *
 * ## Qué falta, medido
 *
 * Sondeados treinta y seis nombres de la familia de automatización de AutoCAD
 * contra el registro: **4 de 36**, y la familia entera de grabación —ACTRECORD,
 * ACTSTOP, ACTMANAGER, ACTUSERINPUT, ACTUSERMESSAGE— en **0 de 5**.
 *
 * ## Por qué este motor puede hacerlo mejor que nadie
 *
 * Aquí una orden es una máquina de estados que se alimenta de TOKENS, y un
 * `.scr` es exactamente una lista de tokens (`script-runner.ts`). Así que
 * grabar no es interceptar la interfaz: es guardar lo que ya pasa por la línea
 * de órdenes, y repetir es meterlo por la misma puerta. El resultado de grabar
 * es un `.scr` legible, editable y ejecutable con SCRIPT — no un formato opaco
 * que sólo entienda el grabador.
 *
 * ## Las cuatro decisiones que hacen que un macro sirva
 *
 * 1. **Los puntos se graban TECLEADOS, no como clics.** Un clic vale para el
 *    dibujo donde se hizo y para ningún otro; `1000,2000` vale siempre. El
 *    grabador convierte el punto señalado en su coordenada, que es lo que hace
 *    que un macro se pueda repetir en otro plano.
 * 2. **Una orden CANCELADA no se graba.** Nadie quiere repetir veinte veces un
 *    intento que no llegó a nada; y peor: un `*Cancel*` a mitad de macro deja
 *    el resto de los tokens contestando a la orden equivocada.
 * 3. **ACTRECORD y ACTSTOP no se graban a sí mismos.** Parece obvio hasta que
 *    el macro se ejecuta y vuelve a arrancar el grabador.
 * 4. **Las CONSULTAS sí se graban**, porque un macro que mide y publica su
 *    resultado es un macro útil, y no tocan el dibujo.
 *
 * ## Lo que NO hace, dicho aquí
 *
 * No graba pausas para pedir datos al usuario a mitad de la reproducción —eso
 * es ACTUSERINPUT, y **todavía no existe**—, ni condicionales. Un macro de este
 * grabador repite exactamente lo grabado.
 */
import { parseCadScript } from "../script-runner";

/** Lo que el anfitrión le cuenta al grabador. Un espejo de la línea de órdenes. */
export type CadActionEvent =
  | { kind: "command"; name: string }
  | { kind: "token"; value: string }
  | { kind: "point"; x: number; y: number; z?: number }
  | { kind: "enter" }
  | { kind: "cancel" };

export interface CadActionRecording {
  name: string;
  /** Un renglón por token, en el orden en que se tecleó. */
  lines: string[];
  /** Cuántas órdenes completas entraron. Es lo que se le dice al usuario. */
  commands: number;
}

export interface CadActionRecorderState {
  recording: boolean;
  name: string;
  /** Renglones ya confirmados: pertenecen a órdenes que terminaron. */
  lines: string[];
  /** Renglones de la orden en curso, que se confirman o se tiran. */
  pending: string[];
  commands: number;
}

/** El grabador parado. Es el estado inicial y el que deja ACTSTOP. */
export const CAD_ACTION_RECORDER_IDLE: CadActionRecorderState = {
  recording: false,
  name: "",
  lines: [],
  pending: [],
  commands: 0,
};

/** Las órdenes del propio grabador, que no se graban a sí mismas. */
const PROPIAS = new Set(["ACTRECORD", "ACTSTOP", "ACTMANAGER"]);

/** Cómo se escribe un punto en un `.scr`: tecleado, y sin espacios. */
export function cadActionPointToken(point: { x: number; y: number; z?: number }): string {
  const redondo = (valor: number) => {
    const fijo = Math.round(valor * 1_000) / 1_000;
    return Number.isInteger(fijo) ? String(fijo) : String(fijo);
  };
  return typeof point.z === "number" && point.z !== 0
    ? `${redondo(point.x)},${redondo(point.y)},${redondo(point.z)}`
    : `${redondo(point.x)},${redondo(point.y)}`;
}

export function cadActionRecorderStart(name: string): CadActionRecorderState {
  return { ...CAD_ACTION_RECORDER_IDLE, recording: true, name: name.trim() || "macro" };
}

/**
 * Un evento entra en el grabador.
 *
 * `command` CONFIRMA lo pendiente y abre una orden nueva: cuando la línea de
 * órdenes empieza otra, la anterior terminó. `cancel` TIRA lo pendiente, que es
 * la decisión (2) de la cabecera.
 */
export function cadActionRecorderReduce(
  state: CadActionRecorderState,
  event: CadActionEvent,
): CadActionRecorderState {
  if (!state.recording) return state;
  switch (event.kind) {
    case "command": {
      const nombre = event.name.trim().toUpperCase();
      const confirmado = state.pending.length > 0;
      const base: CadActionRecorderState = {
        ...state,
        lines: confirmado ? [...state.lines, ...state.pending] : state.lines,
        commands: confirmado ? state.commands + 1 : state.commands,
        pending: [],
      };
      // Las del propio grabador no se graban, pero SÍ cierran la anterior: si
      // no, ACTSTOP se llevaría por delante la última orden tecleada.
      return PROPIAS.has(nombre) ? base : { ...base, pending: [nombre] };
    }
    case "token":
      return { ...state, pending: [...state.pending, event.value] };
    case "point":
      return { ...state, pending: [...state.pending, cadActionPointToken(event)] };
    case "enter":
      // Un renglón EN BLANCO es un Enter en un `.scr`. Es la regla que un lector
      // de archivos descarta por instinto y la que deja el guión colgado.
      return { ...state, pending: [...state.pending, ""] };
    case "cancel":
      return { ...state, pending: [] };
  }
}

/**
 * Cierra la grabación.
 *
 * Lo pendiente se CONFIRMA: cuando el usuario para el grabador, la última orden
 * terminó de verdad —o la canceló, y entonces ya no hay pendiente—.
 */
export function cadActionRecorderStop(state: CadActionRecorderState): CadActionRecording {
  const lines = state.pending.length > 0 ? [...state.lines, ...state.pending] : state.lines;
  return {
    name: state.name,
    lines,
    commands: state.commands + (state.pending.length > 0 ? 1 : 0),
  };
}

/**
 * El macro como `.scr`, con su cabecera.
 *
 * La cabecera va en comentarios (`;`), que es lo que el formato admite, y dice
 * de dónde salió: dentro de un año alguien abrirá este archivo y tiene que
 * poder saber qué es sin ejecutarlo.
 */
export function cadActionScript(recording: CadActionRecording, date = new Date()): string {
  const fecha = date.toISOString().slice(0, 10);
  const cabecera = [
    `; ${recording.name}`,
    `; Grabado con ACTRECORD el ${fecha}: ${recording.commands} orden(es).`,
    "; Es un script normal: se puede leer, editar y ejecutar con SCRIPT.",
  ];
  // El salto FINAL no es decorativo. `parseCadScript` descarta exactamente un
  // renglón vacío al final cuando el archivo termina en salto de línea —el que
  // pone cualquier editor—, así que un macro que acaba en Enter perdería
  // justamente ese Enter y dejaría la última orden a medias al repetirlo.
  // Terminando SIEMPRE en salto, el que se descarta es el del archivo y el
  // Enter grabado sobrevive. Lo comprueba `cadActionScriptRoundTrip`.
  return `${[...cabecera, ...recording.lines].join("\n")}\n`;
}

/**
 * ¿Se puede volver a leer lo grabado?
 *
 * Se comprueba con el MISMO analizador que ejecuta los `.scr`. Un macro que el
 * ejecutor no sabe leer es un archivo que se guarda hoy y falla dentro de un
 * mes, cuando ya nadie recuerda cómo se grabó.
 */
export function cadActionScriptRoundTrip(recording: CadActionRecording): {
  ok: boolean;
  tokens: string[];
} {
  const tokens = parseCadScript(cadActionScript(recording)).map((linea) => linea.token);
  return { ok: tokens.length === recording.lines.length, tokens };
}
