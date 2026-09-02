/**
 * El motor de comandos: un reductor puro.
 *
 * Recibe lo que hace el usuario —teclear, pinchar, pulsar Enter o Esc— y
 * devuelve el estado siguiente más una lista de **efectos** que el anfitrión
 * ejecuta: mostrar un prompt, dibujar una previsualización, aplicar un lote al
 * documento. El motor no toca React, ni THREE, ni el `CadDocument`; por eso se
 * prueba entero en Node.
 *
 * ## Tres comportamientos que definen el tacto de un CAD
 *
 * **Repetir con Espacio.** Sin comando activo, Espacio o Enter repiten el
 * último comando repetible. Es el gesto más usado de AutoCAD y hoy no existe
 * cuando el foco está en el lienzo.
 *
 * **Comandos transparentes.** `'ZOOM` dentro de un LINE encuadra y devuelve el
 * control al LINE en el punto exacto donde estaba, con su prompt intacto. Sin
 * esto hay que cancelar el comando para poder mirar, que es justo lo que un
 * dibujante no quiere hacer a mitad de una polilínea.
 *
 * **Una frontera de deshacer por comando.** El comando acumula sus mutaciones y
 * emite UN efecto `execute` al terminar, que el anfitrión aplica con
 * `executeCadEntityCommandBatch`. Deshacer una polilínea de treinta vértices es
 * un Ctrl+Z, no treinta.
 */
import type { SnapType } from "../snap-engine";
import type { CadEntityCommand } from "../entity-commands";
import {
  cadActiveUcs,
  cadActiveUcsIsInclined,
  cadActiveUcsIsTilted,
  type CadSystemVariableValue,
} from "../system-variables";
import type { CadViewRequest } from "../view/view-navigation";
import type { CadHostRequest } from "./host-requests";
import {
  type CadUiRequest,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandInput,
  type CadCommandStep,
  type CadInputMask,
  type CadPreviewPath,
  type CadPrompt,
} from "./command-types";
import { resolveCadToken, type CadTokenContext } from "./input-pipeline";
import { cadCurrentPresentation, cadWithCurrentPresentation } from "./current-presentation";

export interface CadActiveCommand {
  name: string;
  step: CadCommandStep<unknown>;
  /** Verdadero si se invocó con `'` sobre otro comando. */
  transparent: boolean;
}

export interface CadCommandEngineState {
  active: CadActiveCommand | null;
  /** Pila de comandos en pausa por uno transparente. */
  suspended: readonly CadActiveCommand[];
  lastRepeatable: string | null;
  /** Override de captura pendiente, válido para la próxima captura. */
  osnapOverride: readonly SnapType[] | null;
}

export const EMPTY_CAD_COMMAND_ENGINE: CadCommandEngineState = {
  active: null,
  suspended: [],
  lastRepeatable: null,
  osnapOverride: null,
};

export type CadCommandEffect =
  | { kind: "prompt"; prompt: CadPrompt; accepts: CadInputMask }
  | { kind: "preview"; paths: readonly CadPreviewPath[] }
  | { kind: "execute"; commands: readonly CadEntityCommand[]; label: string }
  /** Encuadre: ZOOM, PAN, VIEW, REGEN. No entra en la pila de deshacer. */
  | { kind: "view"; request: CadViewRequest; label: string }
  /** Trabajo del anfitrión fuera del documento: trazar, publicar, cambiar de espacio. */
  | { kind: "host"; request: CadHostRequest; label: string }
  | { kind: "message"; text: string; level: "info" | "error" }
  /** Escribir variables de sistema. `system` puede tocar las de sólo lectura. */
  | {
      kind: "variables";
      patch: Readonly<Record<string, CadSystemVariableValue>>;
      system: boolean;
    }
  /** Abrir una paleta o un cuadro. El anfitrión decide si sabe servirlo. */
  | { kind: "ui"; request: CadUiRequest }
  /** Dejar designado exactamente esto. */
  | { kind: "selection"; entityIds: readonly string[] }
  | { kind: "osnapOverride"; modes: readonly SnapType[] | null }
  | { kind: "cursor"; cursor: "crosshair" | "pick" | "none" }
  | { kind: "idle" };

export type CadCommandAction =
  /** Texto de la línea de comandos, validado por el pipeline de entrada. */
  | { kind: "token"; value: string }
  /** Entrada ya resuelta: una captura del puntero, Enter, Esc. */
  | { kind: "input"; input: CadCommandInput }
  /** Invocación directa: un botón de la barra, un atajo. */
  | { kind: "invoke"; command: string }
  /** Espacio o Enter con el lienzo enfocado. */
  | { kind: "repeat" };

export interface CadCommandEngineReduction {
  state: CadCommandEngineState;
  effects: readonly CadCommandEffect[];
}

/** Límite de anidamiento de transparentes: evita una pila sin fondo. */
const MAX_SUSPENDED = 4;

export interface CadCommandRegistry {
  get(name: string): CadAnyCommandDescriptor | undefined;
  names(): ReadonlySet<string>;
}

function stepEffects(active: CadActiveCommand, descriptor: CadAnyCommandDescriptor): CadCommandEffect[] {
  const effects: CadCommandEffect[] = [
    { kind: "prompt", prompt: active.step.prompt, accepts: active.step.accepts },
  ];
  if (active.step.preview) effects.push({ kind: "preview", paths: active.step.preview });
  if (active.step.osnapOverride)
    effects.push({ kind: "osnapOverride", modes: active.step.osnapOverride });
  effects.push({ kind: "cursor", cursor: descriptor.cursor ?? "crosshair" });
  return effects;
}

/** Cierra el comando activo y reanuda el que estuviera suspendido debajo. */
function resume(state: CadCommandEngineState, registry: CadCommandRegistry): CadCommandEngineReduction {
  const suspended = [...state.suspended];
  const restored = suspended.pop() ?? null;
  const next: CadCommandEngineState = {
    ...state,
    active: restored,
    suspended,
    osnapOverride: null,
  };
  const effects: CadCommandEffect[] = [{ kind: "osnapOverride", modes: null }];
  if (restored) {
    const descriptor = registry.get(restored.name);
    if (descriptor) effects.push(...stepEffects(restored, descriptor));
  } else {
    effects.push({ kind: "idle" });
  }
  return { state: next, effects };
}

function begin(
  state: CadCommandEngineState,
  name: string,
  transparent: boolean,
  context: CadCommandContext,
  registry: CadCommandRegistry,
): CadCommandEngineReduction {
  const descriptor = registry.get(name);
  if (!descriptor)
    return {
      state,
      effects: [{ kind: "message", text: `Comando desconocido "${name}".`, level: "error" }],
    };

  if (transparent && !descriptor.transparent)
    return {
      state,
      effects: [
        { kind: "message", text: `** ${descriptor.name} no admite uso transparente **`, level: "error" },
      ],
    };

  const suspended = [...state.suspended];
  if (transparent && state.active) {
    if (suspended.length >= MAX_SUSPENDED)
      return {
        state,
        effects: [
          { kind: "message", text: "Demasiados comandos transparentes anidados.", level: "error" },
        ],
      };
    suspended.push(state.active);
  }

  const step = descriptor.begin(context) as CadCommandStep<unknown>;
  const active: CadActiveCommand = { name: descriptor.name, step, transparent };

  // Un comando puede terminar en su primer paso: ERASE sobre una selección
  // previa, o ZOOM con encuadre inmediato.
  if (step.result) {
    const finished = finish(
      { ...state, active, suspended, osnapOverride: null },
      descriptor,
      step,
      registry,
      context,
    );
    return finished;
  }

  return {
    state: { ...state, active, suspended, osnapOverride: null },
    effects: stepEffects(active, descriptor),
  };
}

function finish(
  state: CadCommandEngineState,
  descriptor: CadAnyCommandDescriptor,
  step: CadCommandStep<unknown>,
  registry: CadCommandRegistry,
  context: CadCommandContext,
): CadCommandEngineReduction {
  const effects: CadCommandEffect[] = [];
  const result = step.result;
  if (result?.kind === "document" && result.commands.length > 0)
    effects.push({
      kind: "execute",
      // CECOLOR/CELTYPE/CELWEIGHT sólo tocan lo que se DIBUJA (Ola D): ver
      // current-presentation.ts. Con las variables de fábrica el lote es el mismo.
      commands:
        descriptor.kind === "draw" || descriptor.kind === "annotate"
          ? cadWithCurrentPresentation(result.commands, cadCurrentPresentation(context.variables))
          : result.commands,
      label: result.label,
    });
  if (result?.kind === "document" && result.notice)
    effects.push({ kind: "message", text: result.notice, level: "info" });
  if (result?.kind === "view")
    effects.push({ kind: "view", request: result.request, label: result.label });
  if (result?.kind === "host")
    effects.push({ kind: "host", request: result.request, label: result.label });
  if (result?.kind === "message") effects.push({ kind: "message", text: result.text, level: "info" });
  if (result?.kind === "variables") {
    effects.push({ kind: "variables", patch: result.patch, system: result.system ?? false });
    if (result.text) effects.push({ kind: "message", text: result.text, level: "info" });
  }
  if (result?.kind === "ui") {
    effects.push({ kind: "ui", request: result.request });
    if (result.text) effects.push({ kind: "message", text: result.text, level: "info" });
  }
  if (result?.kind === "selection") {
    effects.push({ kind: "selection", entityIds: result.entityIds });
    if (result.text) effects.push({ kind: "message", text: result.text, level: "info" });
  }
  // Se limpia la previsualización pase lo que pase: si el comando terminó, su
  // rubber-band no debe quedarse pegado en pantalla.
  effects.push({ kind: "preview", paths: [] });

  const remembered: CadCommandEngineState = {
    ...state,
    lastRepeatable: descriptor.repeatable ? descriptor.name : state.lastRepeatable,
  };
  const resumed = resume(remembered, registry);
  return { state: resumed.state, effects: [...effects, ...resumed.effects] };
}

export function cadCommandEngineReduce(
  state: CadCommandEngineState,
  action: CadCommandAction,
  context: CadCommandContext,
  registry: CadCommandRegistry,
): CadCommandEngineReduction {
  if (action.kind === "invoke") return begin(state, action.command, false, context, registry);

  if (action.kind === "repeat") {
    if (state.active)
      // Con un comando en curso, Espacio y Enter significan «acepta»; que lo
      // decida el comando, no el motor.
      return cadCommandEngineReduce(state, { kind: "input", input: { kind: "enter" } }, context, registry);
    if (!state.lastRepeatable) return { state, effects: [] };
    return begin(state, state.lastRepeatable, false, context, registry);
  }

  if (action.kind === "token") {
    const tokenContext: CadTokenContext = {
      accepts: state.active?.step.accepts,
      prompt: state.active?.step.prompt,
      lastPoint: lastPointOf(state),
      cursor: context.cursor ?? null,
      knownCommands: registry.names(),
      // El SCU llega hasta el analizador de coordenadas: `10,20` es diez y
      // veinte SOBRE EL PLANO DE TRABAJO, no sobre el suelo. Sin esto el SCU
      // decidía cómo se leía un punto pero no cómo se escribía, que es media
      // función y la mitad que menos se usa.
      ...(context.variables ? { ucs: cadActiveUcs(context.variables) } : {}),
    };
    const resolved = resolveCadToken(action.value, tokenContext);
    if (resolved.kind === "error")
      return { state, effects: [{ kind: "message", text: resolved.message, level: "error" }] };
    if (resolved.kind === "invoke")
      return begin(state, resolved.command, resolved.transparent, context, registry);
    if (resolved.kind === "osnapOverride")
      return {
        // El override no consume el paso: el prompt sigue siendo el mismo y el
        // usuario todavía tiene que pinchar.
        state: { ...state, osnapOverride: resolved.modes },
        effects: [{ kind: "osnapOverride", modes: resolved.modes }],
      };
    return cadCommandEngineReduce(state, { kind: "input", input: resolved.input }, context, registry);
  }

  // --- action.kind === "input" ------------------------------------------------
  const active = state.active;
  if (!active) {
    // Sin comando activo, Esc limpia lo que hubiera pendiente y el resto se
    // ignora en silencio: un clic en el vacío no es un error.
    if (action.input.kind === "cancel")
      return { state: { ...state, osnapOverride: null }, effects: [{ kind: "osnapOverride", modes: null }] };
    return { state, effects: [] };
  }

  const descriptor = registry.get(active.name);
  if (!descriptor)
    return {
      state: { ...state, active: null },
      effects: [{ kind: "message", text: `Comando "${active.name}" ya no existe.`, level: "error" }],
    };

  if (action.input.kind === "cancel") {
    const resumed = resume({ ...state, active: null }, registry);
    return {
      state: resumed.state,
      effects: [{ kind: "preview", paths: [] }, ...resumed.effects],
    };
  }

  // Fallo cerrado ante un SCU que no es el plano z = 0 del mundo: un comando
  // que escribe geometría y no se ha declarado espacial aplanaría el punto
  // contra el suelo sin decir nada. Se comprueba aquí, en el único sitio por el
  // que pasan TODOS los puntos —los tecleados y los del puntero—, en vez de en
  // cada comando. Dos grados (Ola C): un SCU ELEVADO lo honra cualquier
  // `spatial` (`true` o `"elevation"`); uno INCLINADO, sólo `spatial: true`.
  if (
    action.input.kind === "point" &&
    descriptor.mutates &&
    descriptor.spatial !== true &&
    context.variables
  ) {
    const inclined = cadActiveUcsIsInclined(context.variables);
    if (inclined || (!descriptor.spatial && cadActiveUcsIsTilted(context.variables)))
      return {
        state,
        effects: [
          {
            kind: "message",
            text: inclined
              ? `${descriptor.name} todavía no sabe dibujar sobre un plano inclinado, y el SCU activo lo está: ` +
                "el trazo se guardaría en planta, donde no lo puso usted. Vuelva al SCU universal con UCS " +
                "Universal, o use LINE, PLINE o RECTANG, que sí dibujan en el plano del SCU."
              : `${descriptor.name} todavía no sabe dibujar fuera del plano XY del mundo, y el SCU activo está ` +
                "elevado: el trazo se guardaría a cota cero, donde no lo puso usted. Vuelva al SCU universal " +
                "con UCS Universal, o use LINE, que sí conserva la cota.",
            level: "error",
          },
        ],
      };
  }

  let step: CadCommandStep<unknown>;
  try {
    step = descriptor.step(active.step.state as never, action.input, context) as CadCommandStep<unknown>;
  } catch (cause) {
    // Un comando que lanza no debe dejar el motor colgado con un prompt vivo.
    const resumed = resume({ ...state, active: null }, registry);
    return {
      state: resumed.state,
      effects: [
        { kind: "message", text: cause instanceof Error ? cause.message : String(cause), level: "error" },
        { kind: "preview", paths: [] },
        ...resumed.effects,
      ],
    };
  }

  const advanced: CadActiveCommand = { ...active, step };
  if (step.result) return finish({ ...state, active: advanced }, descriptor, step, registry, context);

  return {
    // Una captura consume el override; el siguiente punto vuelve a los modos
    // corrientes, que es como se comporta un override de una sola vez.
    state: {
      ...state,
      active: advanced,
      osnapOverride: action.input.kind === "point" ? null : state.osnapOverride,
    },
    effects: [
      ...(action.input.kind === "point" && state.osnapOverride
        ? [{ kind: "osnapOverride" as const, modes: null }]
        : []),
      ...stepEffects(advanced, descriptor),
    ],
  };
}

/**
 * Último punto fijado por el comando en curso. Lo necesitan `@relativo` y la
 * entrada directa de distancia; se expone como función para que el motor no
 * obligue a cada comando a publicar su estado interno.
 */
function lastPointOf(state: CadCommandEngineState): { x: number; y: number } | null {
  const step = state.active?.step;
  if (!step) return null;
  const candidate = (step.state as { points?: { x: number; y: number }[] } | undefined)?.points;
  if (Array.isArray(candidate) && candidate.length > 0) return candidate[candidate.length - 1];
  return null;
}
