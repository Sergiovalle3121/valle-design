/**
 * Las rutinas `.lsp`, convertidas en comandos del motor.
 *
 * Éste es el sitio donde el subsistema deja de ser una isla. Un
 * `(defun c:CAJETIN …)` de un fichero cargado se convierte aquí en un
 * `CadCommandDescriptor` corriente, del mismo tipo que LINE o TRIM, y entra en
 * el MISMO registro. A partir de ahí no hay nada especial en él: se teclea, se
 * repite con Espacio, se cancela con Esc, y su geometría sale por el efecto
 * `execute` del motor — que en el editor acaba en `commitNativeCommands`, un
 * lote y UN paso de deshacer.
 *
 * ## Por qué encaja tan bien
 *
 * Un comando del motor es una máquina de estados que pide cosas y termina
 * devolviendo un lote. Una rutina AutoLISP es un generador que pide cosas
 * (`getpoint`, `getreal`, `ssget`) y termina habiendo escrito un lote. Son la
 * misma forma. Lo único que hace este módulo es traducir el vocabulario:
 *
 *     LispAsk  →  CadPrompt + máscara de lo que acepta el paso
 *     CadCommandInput  →  LispResponse
 *
 * Gracias a eso, `(getpoint)` dentro de un `.lsp` de 1994 sale por la línea de
 * comandos con el mismo prompt, el mismo Esc y la misma memoria de flechas que
 * cualquier comando nativo.
 *
 * ## La pureza que el motor pide, y cómo se respeta
 *
 * El motor documenta sus comandos como reductores puros y llama a `step` con un
 * texto vacío para refrescar la previsualización sin avanzar. Un generador NO se
 * puede rebobinar, así que ese refresco se detecta y devuelve el paso tal cual.
 * Es la única concesión, está aquí y se prueba.
 */
import {
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandInput,
  type CadCommandStep,
  type CadInputMask,
  type CadKeyword,
  type CadPrompt,
} from "@/lib/cad/engine/command-types";
import type { InteractiveLispRun, LispAsk, LispTurn } from "@/lib/lisp/interactive";
import { printLisp } from "@/lib/lisp/printer";
import {
  NIL,
  ename,
  list,
  pointValue,
  real,
  str,
  type LispResponse,
  type LispValue,
} from "@/lib/lisp/values";
import type { CadLispRuntime } from "./lisp-runtime";

/** Estado del comando. El generador vive dentro de `run` y no se clona. */
export interface CadLispCommandState {
  run: InteractiveLispRun | null;
  invoke: string;
  origin: string;
  ask: LispAsk | null;
}

const NO_PROMPT: CadPrompt = { message: "", options: [] };

/** Prefijo con el que AutoCAD anuncia un error de LISP. Se reproduce tal cual. */
function errorLine(message: string): string {
  return `; error: ${message}`;
}

// ---------------------------------------------------------------------------
// Traducción: petición LISP → prompt del motor
// ---------------------------------------------------------------------------

/**
 * El atajo de una palabra clave de AutoLISP son sus MAYÚSCULAS: `"Si No"`,
 * `"Cerrar Abrir"`. Es la misma regla que aplica `builtins/interaction.ts` al
 * comparar la respuesta, y se repite aquí porque el motor necesita el atajo por
 * separado para pintarlo.
 */
export function lispKeyword(keyword: string): CadKeyword {
  const shortcut = keyword.replace(/[^A-ZÁÉÍÓÚÑ]/g, "");
  return { keyword, shortcut: shortcut || keyword.slice(0, 1).toUpperCase() };
}

export function promptForAsk(ask: LispAsk): CadPrompt {
  if (ask.kind === "prompt-keyword")
    return { message: ask.message, options: ask.keywords.map(lispKeyword) };
  if (ask.kind === "dialog") return { message: `Diálogo ${ask.name}`, options: [] };
  return { message: ask.message, options: [] };
}

export function acceptsForAsk(ask: LispAsk): CadInputMask {
  switch (ask.kind) {
    case "prompt-point":
    case "prompt-corner":
      return CAD_ACCEPT_POINT;
    case "prompt-number":
      // También texto: sin él, `parseCoordinate` se comería un `3/4` mal escrito
      // y devolvería un error de coordenada donde el usuario esperaba «eso no es
      // un número».
      return CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT;
    case "prompt-distance":
      // Una distancia se teclea o se marca con dos puntos; AutoLISP admite las
      // dos y `getdist` ya sabe convertir el punto en medida.
      return CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT | CAD_ACCEPT_TEXT;
    case "prompt-angle":
      return CAD_ACCEPT_ANGLE | CAD_ACCEPT_POINT | CAD_ACCEPT_TEXT;
    case "prompt-string":
      return CAD_ACCEPT_TEXT;
    case "prompt-keyword":
      return CAD_ACCEPT_KEYWORD | CAD_ACCEPT_TEXT;
    case "prompt-selection":
      return CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK;
    default:
      return CAD_ACCEPT_TEXT;
  }
}

/** Grados del motor a radianes de AutoLISP. `getangle` devuelve radianes. */
function radians(degrees: number): number {
  const raw = (degrees * Math.PI) / 180;
  return raw < 0 ? raw + Math.PI * 2 : raw;
}

/**
 * Entrada del motor → respuesta LISP. Lanza cuando la entrada no encaja con lo
 * que la rutina pidió; quien llama lo convierte en un fallo con nombre.
 */
export function responseForInput(ask: LispAsk, input: CadCommandInput): LispResponse {
  if (input.kind === "cancel") return { kind: "cancel" };
  // Enter con la caja vacía es `nil`, que es lo que AutoLISP entrega y lo que
  // las rutinas comprueban con `(if (setq p (getpoint)) …)`.
  if (input.kind === "enter") return { kind: "value", value: NIL };

  switch (ask.kind) {
    case "prompt-point":
    case "prompt-corner":
      if (input.kind === "point") return value(pointValue({ ...input.point, z: 0 }));
      if (input.kind === "entityPick") return value(pointValue({ ...input.point, z: 0 }));
      break;
    case "prompt-number":
      if (input.kind === "distance") return value(real(input.value));
      if (input.kind === "text") return value(real(wantNumber(input.value, ask.message)));
      break;
    case "prompt-distance":
      if (input.kind === "distance") return value(real(input.value));
      if (input.kind === "point") return value(pointValue({ ...input.point, z: 0 }));
      if (input.kind === "text") return value(real(wantNumber(input.value, ask.message)));
      break;
    case "prompt-angle":
      if (input.kind === "angle") return value(real(radians(input.degrees)));
      if (input.kind === "point") return value(pointValue({ ...input.point, z: 0 }));
      if (input.kind === "distance") return value(real(radians(input.value)));
      if (input.kind === "text") return value(real(radians(wantNumber(input.value, ask.message))));
      break;
    case "prompt-string":
      if (input.kind === "text") return value(str(input.value));
      break;
    case "prompt-keyword":
      if (input.kind === "keyword") return value(str(input.keyword));
      if (input.kind === "text") return value(str(input.value));
      break;
    case "prompt-selection":
      // `ssget` interactivo espera una LISTA de nombres de entidad; el conjunto
      // lo construye él, con su número de serie.
      if (input.kind === "selection")
        return value(list(input.entityIds.map((entityId) => ename(entityId))));
      if (input.kind === "entityPick") return value(list([ename(input.entityId)]));
      break;
    default:
      break;
  }
  throw new Error(
    `La rutina pedía «${promptForAsk(ask).message}» y se le dio una entrada de tipo "${input.kind}".`,
  );
}

function value(v: LispValue): LispResponse {
  return { kind: "value", value: v };
}

function wantNumber(text: string, prompt: string): number {
  const parsed = Number(text.trim().replace(",", "."));
  if (!Number.isFinite(parsed))
    throw new Error(`«${prompt}» esperaba un número y se escribió "${text}".`);
  return parsed;
}

// ---------------------------------------------------------------------------
// El descriptor
// ---------------------------------------------------------------------------

export interface CadLispCommandOptions {
  /** Nombre canónico en mayúsculas, tal y como se teclea. */
  name: string;
  aliases?: readonly string[];
  /** Lo que se evalúa: `(c:cajetin)` o la expresión que se tecleó. */
  invoke: string;
  /** De dónde salió, para el histórico: el fichero, o «consola». */
  origin: string;
  repeatable?: boolean;
}

/**
 * Construye el comando que ejecuta una invocación LISP.
 *
 * `mutates` es `true` siempre. Una rutina de un tercero puede escribir en el
 * dibujo y no hay forma de saber si lo hará sin ejecutarla; declararla inocua
 * porque suele serlo es justo el error que deja escribir en un dibujo abierto en
 * sólo lectura.
 */
export function cadLispCommand(
  runtime: CadLispRuntime,
  options: CadLispCommandOptions,
): CadAnyCommandDescriptor {
  const finishTurn = (
    state: CadLispCommandState,
    turn: LispTurn,
  ): CadCommandStep<CadLispCommandState> => {
    const run = state.run;
    if (!run) return messageStep(state, "La ejecución LISP se perdió.");

    // Un diálogo DCL no se puede pintar todavía en el editor. Se le contesta que
    // se canceló —que es un camino que las rutinas ya manejan, porque es lo que
    // devuelve pulsar Cancelar— en vez de abortar la rutina entera.
    let current = turn;
    while (current.kind === "ask" && current.ask.kind === "dialog") {
      runtime.log(
        "info",
        `El diálogo DCL «${current.ask.name}» todavía no se pinta en el editor; ` +
          `la rutina lo recibe como cancelado.`,
        options.origin,
      );
      current = run.answer({ kind: "cancel" });
    }

    if (current.kind === "ask") {
      runtime.noteAsk(promptForAsk(current.ask).message, options.origin);
      return {
        state: { ...state, ask: current.ask },
        prompt: promptForAsk(current.ask),
        accepts: acceptsForAsk(current.ask),
      };
    }

    runtime.settle(run, current, options.invoke, options.origin);

    if (current.kind === "failed")
      return messageStep(state, errorLine(current.failure.message));

    // Geometría antes que texto: si la rutina dibujó, lo que el motor tiene que
    // hacer con ella es aplicarla. El valor devuelto y lo impreso quedan en la
    // consola, que es donde un `.lsp` de verdad escribe sus informes.
    if (run.commands.length > 0)
      return {
        state: { ...state, ask: null },
        prompt: NO_PROMPT,
        accepts: 0,
        result: {
          kind: "document",
          commands: run.commands,
          label: `LISP ${options.name}`,
        },
      };

    const printed = run.output.trim();
    const text = printed ? `${printed}\n${printLisp(current.value)}` : printLisp(current.value);
    return messageStep(state, text);
  };

  return asCadCommand<CadLispCommandState>({
    name: options.name,
    aliases: options.aliases ?? [],
    kind: "manage",
    transparent: false,
    selection: "none",
    repeatable: options.repeatable ?? true,
    mutates: true,
    cursor: "crosshair",
    begin() {
      const state: CadLispCommandState = {
        run: null,
        invoke: options.invoke,
        origin: options.origin,
        ask: null,
      };
      const created = runtime.createRun(options.invoke, options.origin);
      if ("problem" in created) return messageStep(state, errorLine(created.problem));
      const started = { ...state, run: created.run };
      return finishTurn(started, created.run.start(options.invoke));
    },
    step(state, input) {
      const run = state.run;
      const ask = state.ask;
      if (!run || !ask) return messageStep(state, errorLine("No hay ninguna rutina esperando."));

      // Refresco de previsualización: el motor llama con un texto vacío para
      // recalcular el rubber-band sin avanzar. Un generador no se rebobina, así
      // que se devuelve el paso tal cual.
      if (input.kind === "text" && input.value === "")
        return { state, prompt: promptForAsk(ask), accepts: acceptsForAsk(ask) };

      let response: LispResponse;
      try {
        response = responseForInput(ask, input);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        // La rutina se corta: seguir preguntando lo mismo dejaría al usuario
        // atrapado en un prompt que no sabe contestar.
        runtime.settle(
          run,
          { kind: "failed", failure: { kind: "error", message } },
          options.invoke,
          options.origin,
        );
        run.cancel(message);
        return messageStep(state, errorLine(message));
      }
      return finishTurn(state, run.answer(response));
    },
  });
}

function messageStep(
  state: CadLispCommandState,
  text: string,
): CadCommandStep<CadLispCommandState> {
  return {
    state: { ...state, ask: null },
    prompt: NO_PROMPT,
    accepts: 0,
    result: { kind: "message", text },
  };
}

// ---------------------------------------------------------------------------
// Los comandos fijos del subsistema
// ---------------------------------------------------------------------------

/**
 * APPLOAD y la consola.
 *
 * Los dos abren la misma paleta. APPLOAD además le dice que enseñe el selector
 * de fichero, porque venir de APPLOAD significa «quiero cargar algo», y obligar
 * a un clic más en la paleta que acaba de abrirse por eso sobra.
 *
 * El efecto de abrir la paleta ocurre en `begin`, que el motor invoca una vez
 * por invocación. Es un comando de interfaz sin geometría; declararlo
 * `mutates:false` es lo que impide que se le pida permiso de escritura.
 */
export function cadLispFixedCommands(runtime: CadLispRuntime): CadAnyCommandDescriptor[] {
  const open = (pickFile: boolean, name: string, aliases: readonly string[], text: string) =>
    asCadCommand<null>({
      name,
      aliases,
      kind: "manage",
      transparent: true,
      selection: "none",
      repeatable: false,
      mutates: false,
      cursor: "none",
      begin() {
        runtime.show();
        if (pickFile) runtime.requestFilePicker();
        return { state: null, prompt: NO_PROMPT, accepts: 0, result: { kind: "message", text } };
      },
      step() {
        return { state: null, prompt: NO_PROMPT, accepts: 0, result: { kind: "none" } };
      },
    });

  return [
    open(
      true,
      "APPLOAD",
      ["AP", "APLOAD"],
      "Consola LISP abierta: elige un .lsp del disco o carga uno de la biblioteca.",
    ),
    open(
      false,
      "LISPCON",
      ["VLIDE", "LSP"],
      "Consola LISP abierta: histórico, variables y rutinas cargadas.",
    ),
  ];
}
