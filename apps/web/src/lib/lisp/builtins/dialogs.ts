/**
 * Las funciones de diálogo: `load_dialog`, `new_dialog`, `action_tile`,
 * `set_tile`, `get_tile`, `start_dialog`, `done_dialog`.
 *
 * ## El modelo, y en qué se aparta del original
 *
 * En AutoCAD el diálogo es INTERACTIVO mientras está abierto: cada tecla en un
 * `edit_box` puede disparar su `action_tile`, y la rutina reacciona en vivo.
 * Reproducir eso exige que el evaluador se suspenda y se reanude en CADA
 * pulsación, con el diálogo pintado por el anfitrión llamando de vuelta al
 * intérprete entre medias.
 *
 * Lo que hay aquí es el modelo de UN VIAJE: `start_dialog` suspende la rutina
 * entregando el árbol del diálogo y los valores iniciales; el anfitrión lo
 * pinta, deja al usuario rellenarlo y contesta con los valores finales y la
 * clave del control que lo cerró; entonces se ejecuta el `action_tile` de ese
 * control y `start_dialog` devuelve su estado.
 *
 * Cubre el diálogo que de verdad escriben las rutinas —pedir cuatro datos y
 * aceptar— y NO cubre la validación en vivo ni los campos que se habilitan
 * según otro. Está dicho aquí y en la spec en vez de dejar que se descubra
 * cuando un `action_tile` intermedio no se dispare: un `action_tile` que no
 * salta es un fallo mudo, y la rutina sigue con el valor por defecto.
 *
 * ## `action_tile` recibe una CADENA que se evalúa
 *
 * Es así en AutoLISP: `(action_tile "ancho" "(setq ancho (atof $value))")`. La
 * cadena se lee y se evalúa con ESTE intérprete, dentro del mismo presupuesto y
 * del mismo sandbox — no hay ninguna vía nueva hacia el anfitrión. `$value`
 * queda ligado al valor del control y `$key` a su clave, como en el original.
 */
import { parseDcl, findTile, unsupportedTiles, type DclDialog } from "../dcl/parser";
import { LispError } from "../errors";
import { readLispForms } from "../reader";
import {
  NIL,
  T,
  int,
  str,
  toArray,
  type LispCallContext,
  type LispDialogTile,
  type LispEval,
  type LispValue,
} from "../values";
import { defgen, defsubr, wantInt, wantString, type BuiltinTable } from "./define";

interface DialogSlot {
  id: number;
  dialogs: DclDialog[];
}

interface ActiveDialog {
  definition: DclDialog;
  values: Map<string, string>;
  actions: Map<string, string>;
  /** Lo fija `done_dialog`; si nadie lo llama, lo decide el control que cerró. */
  status: number | null;
}

interface DialogState {
  slots: DialogSlot[];
  active: ActiveDialog | null;
  nextId: number;
}

const DIALOGS = "dialogs";

function dialogState(ctx: LispCallContext): DialogState {
  let state = ctx.state.get(DIALOGS) as DialogState | undefined;
  if (!state) {
    state = { slots: [], active: null, nextId: 0 };
    ctx.state.set(DIALOGS, state);
  }
  return state;
}

/** Valores iniciales de los controles con clave, tomados de `value`. */
function initialValues(tile: LispDialogTile, into = new Map<string, string>()): Map<string, string> {
  if (tile.key) into.set(tile.key, tile.attributes.value ?? "");
  for (const child of tile.children) initialValues(child, into);
  return into;
}

export function installDialogs(table: BuiltinTable): void {
  /**
   * `load_dialog` recibe el TEXTO del DCL, no una ruta. El intérprete no tiene
   * sistema de ficheros —ni debe tenerlo— y quien monta la sesión es quien sabe
   * de dónde sale el fichero de la organización. Es la misma decisión que en la
   * biblioteca `.lsp`.
   */
  defsubr(table, "load_dialog", 1, 1, (args, ctx) => {
    const source = wantString(args[0]).v;
    const state = dialogState(ctx);
    ctx.charge(source.length);
    let dialogs: DclDialog[];
    try {
      dialogs = parseDcl(source);
    } catch (cause) {
      // AutoLISP devuelve un id negativo cuando el fichero no carga, y las
      // rutinas lo comprueban con `(if (< dcl 0) ...)`. Se conserva el gesto, y
      // además se dice qué pasó por la línea de comandos.
      throw new LispError(cause instanceof Error ? cause.message : String(cause));
    }
    for (const dialog of dialogs) {
      const missing = unsupportedTiles(dialog.tile);
      if (missing.length > 0)
        throw new LispError(
          `load_dialog: el diálogo "${dialog.name}" usa controles que este producto no sabe ` +
            `pintar: ${[...new Set(missing)].join(", ")}. Se rechaza en vez de pintarlo a medias.`,
        );
    }
    state.nextId += 1;
    state.slots.push({ id: state.nextId, dialogs });
    return int(state.nextId);
  });

  defsubr(table, "unload_dialog", 1, 1, (args, ctx) => {
    const state = dialogState(ctx);
    const id = wantInt(args[0]);
    state.slots = state.slots.filter((slot) => slot.id !== id);
    return NIL;
  });

  defsubr(table, "new_dialog", 2, 3, (args, ctx) => {
    const name = wantString(args[0]).v;
    const id = wantInt(args[1]);
    const state = dialogState(ctx);
    const slot = state.slots.find((candidate) => candidate.id === id);
    const definition = slot?.dialogs.find((dialog) => dialog.name === name);
    // nil es la respuesta del original cuando el diálogo no está, y la rutina
    // la comprueba antes de llamar a `start_dialog`.
    if (!definition) return NIL;
    state.active = {
      definition,
      values: initialValues(definition.tile),
      actions: new Map(),
      status: null,
    };
    return T;
  });

  defsubr(table, "action_tile", 2, 2, (args, ctx) => {
    const state = dialogState(ctx);
    if (!state.active) throw new LispError("action_tile: no hay ningún diálogo abierto con new_dialog");
    const key = wantString(args[0]).v;
    const expression = wantString(args[1]).v;
    if (!findTile(state.active.definition.tile, key))
      throw new LispError(
        `action_tile: el diálogo "${state.active.definition.name}" no tiene ningún control con la ` +
          `clave "${key}". Una acción sobre una clave inexistente no salta nunca, y eso es un ` +
          `fallo mudo: la rutina sigue con el valor por defecto.`,
      );
    // Se comprueba que la expresión se puede LEER ahora, no cuando salte: un
    // paréntesis sin cerrar dentro de un action_tile aparecería como «el
    // diálogo no hace nada».
    readLispForms(expression);
    state.active.actions.set(key, expression);
    return T;
  });

  defsubr(table, "set_tile", 2, 2, (args, ctx) => {
    const state = dialogState(ctx);
    if (!state.active) throw new LispError("set_tile: no hay ningún diálogo abierto");
    const key = wantString(args[0]).v;
    const value = wantString(args[1]).v;
    if (!findTile(state.active.definition.tile, key))
      throw new LispError(`set_tile: el diálogo no tiene ningún control con la clave "${key}"`);
    state.active.values.set(key, value);
    return args[1];
  });

  defsubr(table, "get_tile", 1, 1, (args, ctx) => {
    const state = dialogState(ctx);
    if (!state.active) throw new LispError("get_tile: no hay ningún diálogo abierto");
    const key = wantString(args[0]).v;
    // DCL devuelve TEXTO siempre, también para un toggle: "1" o "0".
    return str(state.active.values.get(key) ?? "");
  });

  defsubr(table, "done_dialog", 0, 1, (args, ctx) => {
    const state = dialogState(ctx);
    if (!state.active) throw new LispError("done_dialog: no hay ningún diálogo abierto");
    state.active.status = args.length > 0 ? wantInt(args[0]) : 1;
    return NIL;
  });

  /**
   * `start_dialog` suspende la rutina y espera al anfitrión.
   *
   * La respuesta es una lista de pares: los valores finales de los controles,
   * más `("$action" . "<clave>")` con el control que cerró el diálogo. Se
   * eligió una lista de pares y no un objeto porque es lo que el intérprete ya
   * sabe transportar, y porque así el anfitrión que la construye no necesita
   * conocer ningún tipo del subsistema.
   */
  defgen(table, "start_dialog", 0, 0, function* (_args, ctx): LispEval {
    const state = dialogState(ctx);
    const active = state.active;
    if (!active) throw new LispError("start_dialog: no hay ningún diálogo abierto con new_dialog");

    const response = yield {
      kind: "dialog",
      name: active.definition.name,
      tile: active.definition.tile,
      values: Object.fromEntries(active.values),
    };

    if (response.kind === "cancel") {
      state.active = null;
      return int(0);
    }

    let action = "";
    for (const item of toArray(response.value)) {
      if (item.t !== "cons" || item.car.t !== "str") continue;
      const key = item.car.v;
      const value = item.cdr.t === "str" ? item.cdr.v : "";
      if (key === "$action") action = value;
      else active.values.set(key, value);
    }

    // El `action_tile` del control que cerró se ejecuta con `$value` y `$key`
    // ligados, como en el original. Va DESPUÉS de fijar los valores para que
    // `(get_tile "otro")` dentro de la acción vea lo que el usuario escribió.
    const expression = action ? active.actions.get(action) : undefined;
    if (expression) {
      const saved: Array<[string, LispValue]> = [
        ["$VALUE", ctx.lookup("$VALUE")],
        ["$KEY", ctx.lookup("$KEY")],
      ];
      ctx.setGlobal("$VALUE", str(active.values.get(action) ?? ""));
      ctx.setGlobal("$KEY", str(action));
      try {
        for (const form of readLispForms(expression)) yield* ctx.evaluate(form);
      } finally {
        for (const [name, value] of saved) ctx.setGlobal(name, value);
      }
    }

    // Si el `action_tile` llamó a `done_dialog`, manda su estado. Si no, lo
    // decide el control: `cancel` cierra con 0 y cualquier otro con 1, que es
    // el convenio de DCL.
    const status = active.status ?? (action === "cancel" ? 0 : 1);
    state.active = null;
    return int(status);
  });
}
