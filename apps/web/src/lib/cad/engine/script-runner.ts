/**
 * Ejecutar un `.scr` SIN INTERFAZ GRÁFICA.
 *
 * ## Qué problema resuelve, y por qué no lo resolvía lo que ya había
 *
 * `lib/cad/script-runner.ts` empuja los renglones de un guión por la línea de
 * comandos del editor vivo. Eso vale para el usuario que abre un `.scr` desde
 * el navegador, pero tiene un techo: sólo ve lo que ve quien teclea. Si el
 * motor rechaza un renglón —comando inexistente, coordenada ilegible, palabra
 * clave que no encaja— el rechazo sale como un MENSAJE al diálogo, no como una
 * excepción, y el ejecutor sigue empujando renglones. El resultado es el peor
 * de los posibles: la entrada del comando siguiente se cuela en el comando
 * anterior y el dibujo que sale no es el que nadie escribió.
 *
 * Este módulo ejecuta el mismo guión sin anfitrión ninguno. Es dueño del
 * documento, de las variables y del estado del motor, así que VE TODOS LOS
 * EFECTOS —incluidos los mensajes de error— y se para en el primero, diciendo
 * en qué renglón. Es lo que convierte «se puede teclear un script» en «un
 * guión de despacho se puede ejecutar en un lote, sin que nadie mire».
 *
 * ## Un solo analizador, dos ejecutores, y por qué eso no es divergir
 *
 * El formato del `.scr` —el salto de línea que vale por un espacio, el renglón
 * en blanco que es un Enter, el `;` que comenta— se lee en UN sitio:
 * `parseCadScript`. Los dos ejecutores lo comparten, así que no hay dos
 * lecturas del formato que puedan separarse. Lo que cambia es a dónde van los
 * renglones: al editor vivo o a un motor propio. `script-runner.spec.ts`
 * ejecuta el MISMO guión por los dos caminos y compara el documento que sale.
 *
 * ## Fallo cerrado, y qué significa aquí exactamente
 *
 * Todo lo que impide seguir lanza `CadScriptError` con el número de renglón:
 *
 * - el renglón nombra un comando que no existe;
 * - el comando en curso rechaza lo que trae el renglón;
 * - el comando pediría un CUADRO o un archivo, y nadie va a pulsarlo;
 * - el renglón no hace avanzar al comando —el guión se quedaría dando vueltas—;
 * - el archivo termina con un comando a medias.
 *
 * El último es el que más duele en la práctica: un `LINE` sin su renglón en
 * blanco final deja el documento sin la línea Y sin decirlo. Aquí es un error
 * con el renglón donde EMPEZÓ el comando, que es el que hay que arreglar, no el
 * último del archivo.
 *
 * ## Lo que un guión NO puede hacer, dicho aquí
 *
 * Trazar un PDF, exportar un DXF o cambiar de espacio son trabajo del
 * ANFITRIÓN: necesitan fuentes, `Blob` y una descarga. El guión los deja
 * PEDIDOS en `hostRequests` y quien lo ejecuta decide si sabe servirlos. No se
 * fingen hechos —eso sería un guión que dice que trazó seis láminas sin haber
 * escrito un byte— ni se tratan como fallo, porque pedirlos es legítimo.
 */
import type { CadDocument } from "../cad-document";
import { cadExpandSelectionByGroup } from "../blocks/cad-groups";
import { executeCadEntityCommandBatch } from "../entity-commands";
import {
  CAD_SCRIPT_LINE_ALTERNATIVE,
  CadScriptError,
  cadScriptLineAdvice,
  parseCadScript,
} from "../script-runner";
import { CadSystemVariableStore } from "../system-variables";
import { cadDocumentExtents } from "../view/document-extents";
import {
  cadCommandEngineReduce,
  EMPTY_CAD_COMMAND_ENGINE,
  type CadCommandAction,
  type CadCommandEffect,
  type CadCommandEngineState,
  type CadCommandRegistry,
} from "./command-engine";
import type { CadAnyCommandDescriptor, CadCommandContext } from "./command-types";
import type { CadHostRequest } from "./host-requests";

/** Lo que el ejecutor necesita del registro, sin atarse a una instancia. */
export interface CadScriptRegistry extends CadCommandRegistry {
  all?(): readonly CadAnyCommandDescriptor[];
}

export interface CadScriptExecutionOptions {
  /** Registro de comandos. Se inyecta: el motor no tiene registro global. */
  registry: CadScriptRegistry;
  /** Documento de partida. No se muta: sale otro por el informe. */
  document: CadDocument;
  /**
   * Variables de sistema. Se pasan para poder ARRANCAR de una plantilla —el
   * `.scr` de un estudio da por hecho su LTSCALE y su CLAYER— y para poder
   * leerlas después. Si no se pasan, se crean con los valores de fábrica.
   */
  variables?: CadSystemVariableStore;
  /**
   * Generador de identificadores. Por defecto `e1`, `e2`… — DETERMINISTA a
   * propósito: dos ejecuciones del mismo guión sobre el mismo documento tienen
   * que dar dos documentos comparables, y con `crypto.randomUUID()` no lo son.
   */
  newEntityId?: () => string;
}

export interface CadScriptExecution {
  /** Documento resultante. El de entrada queda intacto. */
  document: CadDocument;
  /** Renglones entregados al motor, comentarios aparte. */
  executed: number;
  /** Comandos que llegaron a terminar, en orden de ejecución. */
  commands: readonly string[];
  /** Lo que el motor habría escrito en el diálogo, sin los errores. */
  messages: readonly string[];
  /** Peticiones que quedan para el anfitrión: trazar, exportar, publicar. */
  hostRequests: readonly CadHostRequest[];
  /** Variables al terminar. Es la misma instancia si se pasó una. */
  variables: CadSystemVariableStore;
  /** Etiqueta de cada lote aplicado: un paso de deshacer por comando. */
  changes: readonly string[];
}

/** Cuenta de un comando en curso, para poder señalar dónde empezó. */
interface ActiveTrace {
  name: string;
  line: number;
}

/**
 * Comandos que en su PRIMER paso piden interfaz, leídos del registro.
 *
 * La tabla escrita a mano de `lib/cad/script-runner.ts` es la que ve el
 * anfitrión —que no puede ejecutar comandos para averiguarlo—, y ésta es la
 * verdad del registro de hoy. La spec compara las dos, así que la tabla no
 * puede envejecer en silencio: el día que alguien añada un cuadro nuevo y no lo
 * apunte, la comparación lo dice.
 */
export function cadCommandsNeedingInterface(
  registry: CadScriptRegistry,
  context: CadCommandContext,
): readonly string[] {
  const descriptors = registry.all?.() ?? [];
  const names: string[] = [];
  for (const descriptor of descriptors) {
    let asksForUi = false;
    try {
      asksForUi = descriptor.begin(context).result?.kind === "ui";
    } catch {
      // Un comando que necesita más contexto del que se le da no es un comando
      // con cuadro: se deja fuera en vez de contarlo por no haber podido mirar.
      asksForUi = false;
    }
    if (asksForUi) names.push(descriptor.name);
  }
  return names.sort();
}

/**
 * Ejecuta un `.scr` completo contra un documento. Lanza `CadScriptError`.
 *
 * Devuelve el documento resultante en vez de mutar el de entrada porque un
 * guión que falla a mitad tiene que poder compararse con el punto de partida:
 * quien lo ejecuta decide si se queda con lo hecho o lo tira, y no puede
 * decidirlo si el original ya no existe.
 */
export function executeCadScript(
  source: string,
  options: CadScriptExecutionOptions,
): CadScriptExecution {
  const registry = options.registry;
  const variables = options.variables ?? new CadSystemVariableStore();
  let ids = 0;
  const newEntityId = options.newEntityId ?? (() => `e${(ids += 1)}`);

  let document = options.document;
  let state: CadCommandEngineState = EMPTY_CAD_COMMAND_ENGINE;
  let selection: readonly string[] = [];
  let active: ActiveTrace | null = null;

  const commands: string[] = [];
  const messages: string[] = [];
  const hostRequests: CadHostRequest[] = [];
  const changes: string[] = [];
  let executed = 0;

  const context = (): CadCommandContext => {
    const entities = document.entities;
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    const clayer = String(variables.get("CLAYER") ?? "0").trim();
    const known = entities.length > 0 || document.layers.length > 0;
    return {
      entityIds: entities.map((entity) => entity.id),
      entity: (entityId) => byId.get(entityId),
      blocks: () => document.blocks ?? [],
      layers: () => document.layers,
      document: () => document,
      selection: cadExpandSelectionByGroup(selection, entities),
      // Misma regla que el editor: `CLAYER` manda si nombra una capa que
      // existe. Es lo que hace que `-LAYER definir MUROS` dentro del guión
      // decida dónde van las entidades de los renglones siguientes.
      activeLayer: document.layers.some(
        (layer) => layer.name.toUpperCase() === clayer.toUpperCase(),
      )
        ? clayer
        : "0",
      variables,
      paperSpaces: () => document.paperSpaces ?? [],
      ...(document.meta?.unit ? { unit: document.meta.unit } : {}),
      drawingExtents: () => (known ? cadDocumentExtents(document) : null),
      // Sin lienzo no hay escala de pantalla ni cursor. Se declara el valor
      // neutro en vez de inventar un encuadre: los comandos que de verdad
      // necesitan el puntero —la entrada directa de distancia— responden «mueve
      // el cursor», que en un guión es la verdad y no un punto plausible.
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      newEntityId,
    };
  };

  const lines = parseCadScript(source);

  for (const entry of lines) {
    const before = state.active;
    const beforeStepState = before?.step.state;
    // Un renglón en blanco es un Enter. Se entrega como Enter y NO como
    // «repetir el último comando», que es lo que haría AutoCAD sin comando en
    // curso. La divergencia es deliberada y se declara: un guión con un
    // renglón vacío de más repetiría el comando anterior y dibujaría dos
    // veces, y un dibujo con geometría duplicada que nadie escribió es más
    // caro de descubrir que un renglón que no hizo nada.
    const action: CadCommandAction =
      entry.token === "" ? { kind: "input", input: { kind: "enter" } } : { kind: "token", value: entry.token };

    const head = entry.token.split(/\s+/)[0]?.toUpperCase() ?? "";
    // Se comprueba ANTES de despachar cuando no hay comando en curso: así el
    // consejo nombra el comando que el autor escribió y no el efecto que salió.
    if (!before && head in CAD_SCRIPT_LINE_ALTERNATIVE)
      throw new CadScriptError(
        "needs-interface",
        entry.line,
        entry.token,
        `"${head}" abre un cuadro y un guión no puede pulsarlo. ${cadScriptLineAdvice(head)}`,
        head,
      );

    let reduction;
    try {
      reduction = cadCommandEngineReduce(state, action, context(), registry);
    } catch (cause) {
      throw new CadScriptError(
        "threw",
        entry.line,
        entry.token,
        cause instanceof Error ? cause.message : String(cause),
        before?.name ?? null,
      );
    }

    for (const effect of reduction.effects) {
      const failure = failureOf(effect, entry.line, entry.token, before?.name ?? null);
      if (failure) throw failure;
      if (effect.kind === "execute") {
        const applied = executeCadEntityCommandBatch(document, effect.commands, effect.label);
        document = applied.document;
        changes.push(effect.label);
      } else if (effect.kind === "variables") {
        for (const [name, value] of Object.entries(effect.patch)) {
          const outcome = effect.system ? variables.publish(name, value) : variables.set(name, value);
          if (!outcome.ok)
            throw new CadScriptError(
              "rejected",
              entry.line,
              entry.token,
              outcome.reason,
              before?.name ?? null,
            );
        }
      } else if (effect.kind === "host") {
        hostRequests.push(effect.request);
      } else if (effect.kind === "selection") {
        selection = effect.entityIds;
      } else if (effect.kind === "message") {
        messages.push(effect.text);
      }
    }

    // El comando terminó en este renglón: se apunta y se olvida dónde empezó.
    // Los que terminan en su PRIMER paso —`ZOOM E`, `SETVAR` con sus dos
    // argumentos— nunca llegan a estar activos, así que se reconocen por el
    // nombre que el renglón invocó; sin esto, el informe se los comería.
    if (!reduction.state.active) {
      const finished = before?.name ?? (head ? (registry.get(head)?.name ?? null) : null);
      if (finished) commands.push(finished);
      active = null;
    } else if (!before) {
      active = { name: reduction.state.active.name, line: entry.line };
    }

    // Ni avanzó ni terminó: mismo comando y MISMO objeto de estado. Un guión
    // así no se cuelga —termina— pero deja el documento a medias sin que nada
    // lo haya dicho, que es exactamente el fallo que hay que cerrar.
    if (
      before &&
      reduction.state.active &&
      reduction.state.active.name === before.name &&
      reduction.state.active.step.state === beforeStepState
    )
      throw new CadScriptError(
        "stalled",
        entry.line,
        entry.token,
        `${before.name} no ha avanzado con este renglón: sigue esperando ` +
          `«${before.step.prompt.message || "entrada"}».`,
        before.name,
      );

    state = reduction.state;
    executed += 1;
  }

  if (state.active)
    throw new CadScriptError(
      "unfinished",
      active?.line ?? lines[lines.length - 1]?.line ?? 1,
      "",
      `el guión ha terminado con ${state.active.name} a medias: le falta un Enter —un renglón ` +
        "en blanco— para cerrarlo. El documento se queda sin lo que ese comando iba a dibujar.",
      state.active.name,
    );

  return { document, executed, commands, messages, hostRequests, variables, changes };
}

/**
 * Traduce un efecto en fallo, si lo es.
 *
 * Los dos que paran un guión son el mensaje de ERROR —es como el motor rechaza
 * lo tecleado— y la petición de interfaz. Se separan en códigos distintos
 * porque el arreglo no se parece: uno es un renglón mal escrito y el otro es un
 * comando que en un guión no se puede usar.
 */
function failureOf(
  effect: CadCommandEffect,
  line: number,
  token: string,
  command: string | null,
): CadScriptError | null {
  if (effect.kind === "ui") {
    const target = effect.request.target;
    return new CadScriptError(
      "needs-interface",
      line,
      token,
      `este renglón pide la interfaz («${target}») y en un lote no hay nadie que la pulse. ` +
        effect.request.unavailable,
      command,
    );
  }
  if (effect.kind !== "message" || effect.level !== "error") return null;
  return new CadScriptError(
    effect.text.includes("desconocido") ? "unknown-command" : "rejected",
    line,
    token,
    effect.text,
    command,
  );
}
