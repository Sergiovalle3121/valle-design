/**
 * `U`, `UNDO` y `REDO`: el gesto más repetido del día, que no existía.
 *
 * ## Qué estaba roto, medido
 *
 * `docs/competitive/distancia-autocad-completo-20260903.md` lo publica: los
 * cuatro nombres (`U`, `UNDO`, `REDO`, `OOPS`) NO estaban en el registro, así
 * que teclearlos respondía «Comando desconocido». Deshacer existía —Ctrl+Z y el
 * botón de la barra— pero no por su NOMBRE, y el renglón 10 de la prueba de los
 * diez segundos (`e2e/golden/85-cad-diez-segundos.spec.ts`) lo reprobaba.
 *
 * No es una carencia de capacidad: es una carencia de VOCABULARIO. Un dibujante
 * que viene de AutoCAD teclea `U` ⏎ decenas de veces al día sin mirar, y que la
 * línea de comandos le conteste «desconocido» es el momento exacto en que deja
 * de confiar en ella.
 *
 * ## Por qué son dos comandos y no uno con alias
 *
 * En AutoCAD `U` y `UNDO` son órdenes DISTINTAS y la diferencia importa: `U`
 * deshace un paso y no pregunta nada; `UNDO` pide cuántas operaciones, con `1`
 * por defecto. Hacer `U` un alias de `UNDO` obligaría a pulsar Enter dos veces
 * para el gesto que se hace sin mirar, y ese medio segundo es justo lo que la
 * memoria muscular no perdona.
 *
 * ## Por qué piden y no hacen
 *
 * La pila de deshacer la sostiene el editor (`CanonicalHistory`): es estado de
 * SESIÓN y no del documento. El comando emite `{kind:"history"}` y el anfitrión
 * viaja; el renglón que se lee («Deshecho: 1 operación») lo devuelve el
 * anfitrión, que es el único que sabe si había algo que deshacer.
 *
 * ## OOPS, todavía no, y por qué
 *
 * `OOPS` restituye lo último BORRADO sin deshacer lo que vino después, y para
 * eso hace falta saber qué hizo cada entrada del historial. `CanonicalHistory`
 * guarda snapshots sin etiqueta (`canonical-history.ts`: `before`, `after`,
 * `groupKey`, `recordedAt`, `retainedBytes`), así que hoy no hay forma honesta
 * de distinguir un ERASE de un MOVE mirando la pila. Añadir la etiqueta es
 * tocar una estructura que la recuperación por pestaña también lee, y eso no
 * cabe en esta ola: queda declarado en `docs/parity/ESCALERA.md`.
 */
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

type State = Record<string, never>;

const DONE = (action: "undo" | "redo", steps: number, label: string): CadCommandStep<State> => ({
  state: {},
  prompt: { message: "", options: [] },
  accepts: 0,
  result: { kind: "host", request: { kind: "history", action, steps }, label },
});

const NOTHING: CadCommandStep<State> = {
  state: {},
  prompt: { message: "", options: [] },
  accepts: 0,
  result: { kind: "none" },
};

/** `U` y `REDO`: un paso, sin preguntar. Es el gesto, no un diálogo. */
function oneStep(
  name: "U" | "REDO",
  aliases: readonly string[],
  action: "undo" | "redo",
): CadCommandDescriptor<State> {
  return {
    name,
    aliases,
    kind: "modify",
    transparent: false,
    selection: "none",
    // Espacio lo repite, que es como se deshacen cinco pasos seguidos.
    repeatable: true,
    mutates: true,
    cursor: "none",
    begin: () => DONE(action, 1, name),
    step: () => NOTHING,
  };
}

/**
 * `UNDO`: cuántas operaciones, con 1 por defecto.
 *
 * Las opciones de control de AutoCAD (Auto, Control, BEgin/End, Mark/Back) no
 * están y se dice: marcar un punto de retorno exige que la pila tenga marcas,
 * que es la misma estructura que le falta a OOPS. Lo que sí hace —deshacer N de
 * una vez— es lo que se usa a diario.
 */
const UNDO: CadCommandDescriptor<State> = {
  name: "UNDO",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: () => ({
    state: {},
    prompt: {
      message: "Indique el número de operaciones que se deshacen",
      options: [],
      defaultValue: "1",
    },
    accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
  }),
  step: (_state, input) => {
    if (input.kind === "enter") return DONE("undo", 1, "UNDO 1");
    if (input.kind === "cancel") return NOTHING;
    const raw = input.kind === "distance" ? input.value : input.kind === "text" ? Number(input.value) : NaN;
    const steps = Math.floor(raw);
    if (!Number.isFinite(steps) || steps < 1)
      return {
        state: {},
        prompt: {
          message: "El número de operaciones tiene que ser un entero de 1 en adelante",
          options: [],
          defaultValue: "1",
        },
        accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
      };
    return DONE("undo", steps, `UNDO ${steps}`);
  },
};

export const CAD_HISTORY_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(oneStep("U", [], "undo")),
  asCadCommand(oneStep("REDO", ["MREDO"], "redo")),
  asCadCommand(UNDO),
];
