/**
 * Interacción: `command` y la familia `get*`.
 *
 * ## `command` NO es un segundo intérprete de comandos
 *
 * El producto ya tiene uno: `CAD_COMMAND_REGISTRY_V2`, con sus diecinueve
 * comandos, sus alias de `acad.pgp` y sus máquinas de estado puras. Escribir
 * aquí un despachador propio habría creado un tercer sistema de comandos que no
 * conoce a los otros dos — exactamente el problema que el motor vino a
 * resolver. Así que este módulo TRADUCE: convierte los argumentos de `command`
 * en `CadCommandInput` y hace avanzar la máquina del registro.
 *
 * La consecuencia buena es automática: el día que alguien registre TRIM, las
 * rutinas `.lsp` podrán llamarlo sin tocar una línea de este archivo.
 *
 * ## Lo que `command` NO hace, y por qué se dice en voz alta
 *
 * En AutoCAD, `(command "LINE" p1 p2)` deja el comando ACTIVO esperando más
 * puntos del usuario, y la rutina continúa. Reproducir eso exige que el estado
 * del comando sobreviva al final de la llamada LISP y lo recoja el anfitrión de
 * la línea de comandos, que está fuera del alcance de este subsistema. Aquí, un
 * `command` que no completa su comando se CANCELA y da error diciendo qué
 * pedía el comando cuando se quedó sin argumentos.
 *
 * Es una limitación real y está declarada como tal. La alternativa —tragarse el
 * final y no crear nada— dejaría a la rutina creyendo que dibujó.
 *
 * ## `initget` arma la siguiente `get*`
 *
 * `(initget 1 "Si No")` dice «la próxima pregunta no admite vacío y acepta
 * estas palabras clave». Se guarda en la pizarra de la sesión, no en un símbolo
 * LISP: un símbolo lo puede pisar la rutina y entonces `initget` dejaría de
 * armar lo que su autor escribió, en silencio.
 */
import type { CadPoint2 } from "../../cad/cad-document";
import {
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  CAD_COMMAND_REGISTRY_V2,
  cadCommandIfLoaded,
  loadCadCommand,
  type CadCommandContext,
  type CadCommandRegistry,
  type CadCommandInput,
  type CadCommandStep,
} from "../../cad/engine";
import { CAD_ENTITY_REGISTRY } from "../../cad/entity-runtime";
import {
  cadSystemVariableDef,
  type CadSystemVariableDef,
  type CadSystemVariableValue,
  type CadVariableAccess,
} from "../../cad/system-variables";
import { insunitsOfDocument } from "../document-host";
import { LispError } from "../errors";
import { printLisp } from "../printer";
import {
  NIL,
  int,
  pointOf,
  real,
  str,
  type LispCallContext,
  type LispEval,
  type LispHostServices,
  type LispValue,
} from "../values";
import { pluginGrantOf, type PluginCommandGrant } from "../plugins/api";
import { requireHost } from "./entities";
import { defgen, defsubr, wantString, type BuiltinTable } from "./define";

/**
 * Clave de la pizarra bajo la que el anfitrión puede dejar un registro de
 * comandos COMPUESTO (producto + plugins). Se declara aquí, junto a quien lo
 * lee, para que la constante no viva en dos sitios con dos ortografías.
 */
export const COMMAND_REGISTRY = "commandRegistry";

/** Lo que `initget` dejó armado para la siguiente pregunta. */
interface InitgetState {
  bits: number;
  keywords: string[];
}

const INITGET = "initget";

function takeInitget(ctx: LispCallContext): InitgetState {
  const armed = (ctx.state.get(INITGET) as InitgetState | undefined) ?? { bits: 0, keywords: [] };
  // Se consume: `initget` arma UNA pregunta, como en el original. Dejarlo
  // pegado haría que la segunda `getpoint` de la rutina rechazara el vacío sin
  // que nadie lo hubiera pedido.
  ctx.state.delete(INITGET);
  return armed;
}

/** Bit 1 de `initget`: no se admite respuesta vacía. */
const NO_EMPTY = 1;

function promptText(args: readonly LispValue[], index: number, fallback: string): string {
  const value = args[index];
  return value && value.t === "str" ? value.v : fallback;
}

export function installInteraction(table: BuiltinTable): void {
  defsubr(table, "initget", 1, 2, (args, ctx) => {
    const first = args[0];
    const bits = first.t === "int" || first.t === "real" ? Math.trunc(first.v) : 0;
    const keywordSource = first.t === "str" ? first : args[1];
    const keywords =
      keywordSource && keywordSource.t === "str"
        ? keywordSource.v.split(/\s+/).filter(Boolean)
        : [];
    ctx.state.set(INITGET, { bits, keywords });
    return NIL;
  });

  // --- la familia get* -------------------------------------------------------

  defgen(table, "getpoint", 0, 2, function* (args, ctx): LispEval {
    const armed = takeInitget(ctx);
    const base = args.length > 1 || (args[0] && args[0].t !== "str") ? args[0] : NIL;
    const response = yield {
      kind: "prompt-point",
      message: promptText(args, args.length - 1, "Precise un punto"),
      base: base ?? NIL,
    };
    return finishGet(response, armed, "getpoint", (value) => {
      if (!pointOf(value)) throw new LispError("getpoint: el anfitrión devolvió algo que no es un punto");
      return value;
    });
  });

  defgen(table, "getcorner", 1, 2, function* (args, ctx): LispEval {
    const armed = takeInitget(ctx);
    if (!pointOf(args[0]))
      throw new LispError("bad argument type: getcorner: el primer argumento es el punto base");
    const response = yield {
      kind: "prompt-corner",
      message: promptText(args, 1, "Precise la esquina opuesta"),
      base: args[0],
    };
    return finishGet(response, armed, "getcorner", (value) => value);
  });

  defgen(table, "getreal", 0, 1, function* (args, ctx): LispEval {
    const armed = takeInitget(ctx);
    const response = yield {
      kind: "prompt-number",
      message: promptText(args, 0, "Precise un número"),
      integer: false,
    };
    return finishGet(response, armed, "getreal", (value) => {
      if (value.t === "int") return real(value.v);
      if (value.t !== "real") throw new LispError("getreal: el anfitrión devolvió algo que no es un número");
      return value;
    });
  });

  defgen(table, "getint", 0, 1, function* (args, ctx): LispEval {
    const armed = takeInitget(ctx);
    const response = yield {
      kind: "prompt-number",
      message: promptText(args, 0, "Precise un entero"),
      integer: true,
    };
    return finishGet(response, armed, "getint", (value) => {
      if (value.t === "real") return int(Math.trunc(value.v));
      if (value.t !== "int") throw new LispError("getint: el anfitrión devolvió algo que no es un número");
      return value;
    });
  });

  defgen(table, "getstring", 0, 2, function* (args, ctx): LispEval {
    const armed = takeInitget(ctx);
    // El primer argumento, cuando NO es cadena, dice si se admiten espacios.
    const allowSpaces = args.length > 0 && args[0].t !== "str" && args[0].t !== "nil";
    const response = yield {
      kind: "prompt-string",
      message: promptText(args, args.length - 1, "Escriba un texto"),
      allowSpaces,
    };
    return finishGet(response, armed, "getstring", (value) =>
      value.t === "str" ? value : str(printLisp(value, false)));
  });

  defgen(table, "getkword", 0, 1, function* (args, ctx): LispEval {
    const armed = takeInitget(ctx);
    if (armed.keywords.length === 0)
      throw new LispError(
        "getkword sin palabras clave: hay que armarlo antes con (initget 1 \"Si No\"), " +
          "o la pregunta no admitiría ninguna respuesta.",
      );
    const response = yield {
      kind: "prompt-keyword",
      message: promptText(args, 0, "Elija una opción"),
      keywords: armed.keywords,
    };
    return finishGet(response, armed, "getkword", (value) => {
      const text = value.t === "str" ? value.v : printLisp(value, false);
      const match = armed.keywords.find((keyword) => matchesKeyword(text, keyword));
      if (!match) throw new LispError(`getkword: "${text}" no es ninguna de las opciones ofrecidas`);
      return str(match);
    });
  });

  defgen(table, "getangle", 0, 2, function* (args, ctx): LispEval {
    const armed = takeInitget(ctx);
    const base = args[0] && args[0].t !== "str" ? args[0] : NIL;
    const response = yield {
      kind: "prompt-angle",
      message: promptText(args, args.length - 1, "Precise un ángulo"),
      base,
    };
    return finishGet(response, armed, "getangle", (value) => {
      // El anfitrión puede contestar con un ÁNGULO o con un PUNTO; si contesta
      // con un punto, el ángulo es el del vector desde la base. AutoLISP admite
      // las dos cosas y las rutinas usan las dos.
      const point = pointOf(value);
      const origin = pointOf(base);
      if (point && origin) {
        const raw = Math.atan2(point.y - origin.y, point.x - origin.x);
        return real(raw < 0 ? raw + Math.PI * 2 : raw);
      }
      if (value.t === "int") return real(value.v);
      if (value.t !== "real") throw new LispError("getangle: el anfitrión devolvió algo que no es un ángulo");
      return value;
    });
  });

  defgen(table, "getdist", 0, 2, function* (args, ctx): LispEval {
    const armed = takeInitget(ctx);
    const base = args[0] && args[0].t !== "str" ? args[0] : NIL;
    const response = yield {
      kind: "prompt-distance",
      message: promptText(args, args.length - 1, "Precise una distancia"),
      base,
    };
    return finishGet(response, armed, "getdist", (value) => {
      const point = pointOf(value);
      const origin = pointOf(base);
      if (point && origin) return real(Math.hypot(point.x - origin.x, point.y - origin.y));
      if (value.t === "int") return real(value.v);
      if (value.t !== "real") throw new LispError("getdist: el anfitrión devolvió algo que no es una distancia");
      return value;
    });
  });

  // --- command ---------------------------------------------------------------

  defgen(table, "command", 0, null, function* (args, ctx): LispEval {
    if (args.length === 0) return NIL;
    const host = requireHost(ctx, "command");
    const name = args[0];
    if (name.t !== "str")
      throw new LispError("bad argument type: command: el primer argumento es el nombre del comando");
    // El registro puede venir COMPUESTO con los comandos de los plugins de la
    // organización. Si nadie lo inyectó, manda el del producto.
    const registry = (ctx.state.get(COMMAND_REGISTRY) as CadCommandRegistry | undefined)
      ?? CAD_COMMAND_REGISTRY_V2;
    runCommand(host, name.v, args.slice(1), registry);
    // AutoLISP devuelve nil; las rutinas leen el resultado con `entlast`.
    return NIL;
  });

  /**
   * `getvar` lee la TABLA DEL PRODUCTO, la misma que teclea GETVAR.
   *
   * Antes contestaba sólo CLAYER e INSUNITS. Lo que eso costaba se midió: el
   * prólogo con el que empieza media biblioteca de despacho —`(setq old (getvar
   * "CMDECHO"))`— moría en la primera línea, así que la rutina ajena no llegaba
   * ni a preguntar. Ahora responde las ~55 de la tabla, con su tipo: `int` para
   * las enteras, `real` para las reales y cadena para las de texto, que es lo
   * que la rutina va a comparar y a devolver en el epílogo.
   *
   * Lo que NO cambia: una variable que no está en la tabla sigue lanzando. Que
   * `(getvar "PELLIPSE")` conteste 0 porque suena a booleana sería inventarse
   * el estado de una función que no existe.
   */
  defsubr(table, "getvar", 1, 1, (args, ctx) => {
    const host = requireHost(ctx, "getvar");
    const name = wantString(args[0]).v.trim().toUpperCase();
    const access = host.variables?.();
    // Anfitrión que no expone la tabla: el comportamiento de siempre, ni más ni
    // menos. Contestar valores de fábrica en su lugar sería devolverle a la
    // rutina un estado que nadie guarda.
    if (!access) {
      if (name === "CLAYER") return str(host.activeLayer());
      if (name === "INSUNITS") return int(insunitsOfDocument(host.document()));
      throw unknownVariable("getvar", name);
    }
    const def = cadSystemVariableDef(name);
    if (!def) throw unknownVariable("getvar", name);
    return variableValue(def, access.get(def.name) ?? def.default);
  });

  /**
   * `setvar` ESCRIBE en esa misma tabla, con sus tres reglas intactas.
   *
   *  1. Las de sólo lectura (AREA, PERIMETER, DISTANCE, los ejes del SCU) se
   *     niegan, como en AutoCAD: el resultado de la última medición no es un
   *     dato que se teclee.
   *  2. `coerceCadSystemVariable` valida tipo, rango y enumerado, y devuelve la
   *     RAZÓN. `(setvar "LUNITS" 9)` dice qué admite LUNITS.
   *  3. Lo que no está en la tabla no se crea. Una tabla que crece con lo que
   *     la rutina teclee es una tabla que no significa nada.
   *
   * Devuelve el valor escrito —ya convertido—, que es lo que hace AutoLISP y lo
   * que espera `(setvar "CMDECHO" (setvar "CMDECHO" 0))`.
   */
  defsubr(table, "setvar", 2, 2, (args, ctx) => {
    const host = requireHost(ctx, "setvar");
    const name = wantString(args[0]).v.trim().toUpperCase();
    const access = host.variables?.();
    if (!access)
      throw new LispError(
        `setvar: este anfitrión no expone la tabla de variables de sistema, así que ` +
          `"${name}" no se puede escribir. Se rechaza en vez de aceptarlo y no aplicarlo, ` +
          `que dejaría a la rutina creyendo que configuró el dibujo.`,
      );
    const def = cadSystemVariableDef(name);
    if (!def) throw unknownVariable("setvar", name);
    const outcome = access.set(def.name, variableArgument(args[1], def));
    if (!outcome.ok) throw new LispError(`setvar: ${outcome.reason}`);
    return variableValue(def, outcome.value);
  });

  /**
   * `tblsearch`, `tblnext` y `tblobjname` viven ahora en `tables.ts`, juntas:
   * las tres leen la MISMA tabla de símbolos y tenerlas separadas hacía que
   * enriquecer el registro de capa —el color, el bit de congelada— se hiciera
   * en un sitio y se olvidara en el otro.
   */

  defsubr(table, "getenv", 1, 1, () => NIL);
}

/**
 * El error de una variable que no está en la tabla. Es el MISMO para `getvar` y
 * `setvar` a propósito: una rutina que se equivoca de nombre tiene que leer lo
 * mismo lea o escriba, o el autor busca dos defectos donde hay uno.
 */
function unknownVariable(caller: string, name: string): LispError {
  return new LispError(
    `${caller}: la variable de sistema "${name}" no existe en este producto. ` +
      `La tabla es la de SETVAR y GETVAR; las que no están no se inventan.`,
  );
}

/** El valor de la tabla, con el tipo LISP que la rutina espera comparar. */
function variableValue(def: CadSystemVariableDef, raw: CadSystemVariableValue): LispValue {
  if (def.kind === "string") return str(String(raw));
  const parsed = typeof raw === "number" ? raw : Number.parseFloat(raw);
  const numeric = Number.isFinite(parsed) ? parsed : Number(def.default);
  return def.kind === "int" ? int(Math.trunc(numeric)) : real(numeric);
}

/**
 * El argumento de `setvar`, traducido a lo que la tabla admite.
 *
 * Un número entra tal cual en las numéricas y una cadena también —`(setvar
 * "OSMODE" "33")` es como está escrita mucha rutina vieja, y la tabla sabe
 * convertirla—. Lo que se rechaza aquí, antes de llegar a la tabla, es meter un
 * número en una variable de TEXTO: `(setvar "CLAYER" 3)` no es la capa «3», es
 * un descuido, y la tabla lo aceptaría convirtiéndolo a "3".
 */
function variableArgument(value: LispValue, def: CadSystemVariableDef): CadSystemVariableValue {
  if (value.t === "int" || value.t === "real") {
    if (def.kind === "string")
      throw new LispError(
        `bad argument type: setvar: ${def.name} es de texto y recibió el número ${value.v}.`,
      );
    return value.v;
  }
  if (value.t === "str") return value.v;
  throw new LispError(
    `bad argument type: setvar: no sé usar ${printLisp(value)} como valor de ${def.name}.`,
  );
}

/** `Si` acepta `S`, `SI`, `si`: las mayúsculas de la palabra son el atajo. */
function matchesKeyword(text: string, keyword: string): boolean {
  const upper = text.toUpperCase();
  if (upper === keyword.toUpperCase()) return true;
  const shortcut = keyword.replace(/[^A-ZÁÉÍÓÚÑ]/g, "");
  return shortcut.length > 0 && upper === shortcut;
}

/** Cancelación → nil, salvo que `initget` prohibiera el vacío. */
function finishGet(
  response: { kind: "value"; value: LispValue } | { kind: "cancel" },
  armed: InitgetState,
  name: string,
  convert: (value: LispValue) => LispValue,
): LispValue {
  if (response.kind === "cancel" || response.value.t === "nil") {
    if ((armed.bits & NO_EMPTY) !== 0)
      throw new LispError(`${name}: se canceló una pregunta que (initget 1 …) declaró obligatoria`);
    return NIL;
  }
  return convert(response.value);
}

// ---------------------------------------------------------------------------
// Traducción de `command` a entradas del motor
// ---------------------------------------------------------------------------

function commandContext(host: LispHostServices, selection: readonly string[]): CadCommandContext {
  const variables = host.variables?.();
  return {
    entityIds: host.entityIds(),
    entity: (entityId) => host.entity(entityId),
    selection,
    activeLayer: host.activeLayer(),
    // La tabla de capas del documento. Sin ella, `-LAYER` no encontraba
    // ninguna capa: `(command "-LAYER" "D" "MUROS" "")` contestaba «No existe
    // la capa "MUROS"» teniéndola delante, y `(command "-LAYER" "N" …)` volvía
    // a crear una que ya estaba. Un comando que decide sobre un dato que nadie
    // le pasa decide mal siempre.
    layers: () => host.layers(),
    // El motor pide una vista porque los comandos de encuadre la necesitan. Una
    // llamada desde LISP no tiene ventana; se entrega una vista neutra y los
    // comandos de VISTA (`ZOOM`, `PAN`) no producen un resultado significativo
    // por esta ruta. Están declarados `mutates: false`, así que no pueden
    // estropear el dibujo — sencillamente no encuadran nada.
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    // La tabla del ANFITRIÓN, no una recién fabricada. Es lo que hace que
    // `(command "DIST" …)` imprima en las unidades que el dibujo tiene puestas
    // y que `(command "SETVAR" "OSMODE" 33)` lo vea después `(getvar "OSMODE")`.
    // Sin esto, cada `command` configuraba una tabla de usar y tirar que moría
    // con la llamada: el caso de manual de «éxito sin efecto».
    ...(variables ? { variables } : {}),
    newEntityId: () => host.newEntityId(),
  };
}

/**
 * Traduce UN argumento de `command` a una entrada del motor, mirando qué acepta
 * el paso actual. El orden de las comprobaciones es el que hace que
 * `(command "CIRCLE" '(0 0) 50)` interprete el 50 como RADIO y no como ángulo.
 */
function toCommandInput(
  value: LispValue,
  step: CadCommandStep<unknown>,
  host: LispHostServices,
): CadCommandInput {
  if (value.t === "str" && value.v === "") return { kind: "enter" };

  const point = pointOf(value);
  if (point && (step.accepts & CAD_ACCEPT_POINT) !== 0)
    return { kind: "point", point: { x: point.x, y: point.y }, source: "typed" };

  if (value.t === "int" || value.t === "real") {
    if ((step.accepts & CAD_ACCEPT_DISTANCE) !== 0) return { kind: "distance", value: value.v };
    if ((step.accepts & CAD_ACCEPT_ANGLE) !== 0) return { kind: "angle", degrees: value.v };
    throw new LispError(
      `command: el paso actual («${step.prompt.message}») no acepta un número.`,
    );
  }

  if (value.t === "pickset") {
    if ((step.accepts & CAD_ACCEPT_SELECTION) === 0)
      throw new LispError(
        `command: el paso actual («${step.prompt.message}») no acepta un conjunto de selección.`,
      );
    return { kind: "selection", entityIds: [...value.ids] };
  }

  if (value.t === "ename") {
    if ((step.accepts & CAD_ACCEPT_SELECTION) !== 0)
      return { kind: "selection", entityIds: [value.id] };
    if ((step.accepts & CAD_ACCEPT_ENTITY_PICK) === 0)
      throw new LispError(
        `command: el paso actual («${step.prompt.message}») no acepta una entidad.`,
      );
    return { kind: "entityPick", entityId: value.id, point: pickPointOf(host, value.id) };
  }

  if (value.t === "str") {
    const keyword = step.prompt.options.find(
      (option) =>
        option.keyword.toUpperCase() === value.v.toUpperCase() ||
        option.shortcut.toUpperCase() === value.v.toUpperCase(),
    );
    if (keyword && (step.accepts & CAD_ACCEPT_KEYWORD) !== 0)
      return { kind: "keyword", keyword: keyword.keyword };
    if ((step.accepts & CAD_ACCEPT_TEXT) !== 0) return { kind: "text", value: value.v };
    throw new LispError(
      `command: "${value.v}" no es ninguna de las opciones del paso actual` +
        `${step.prompt.options.length ? ` [${step.prompt.options.map((option) => option.keyword).join("/")}]` : ""}.`,
    );
  }

  if (value.t === "nil") return { kind: "enter" };

  throw new LispError(`command: no sé traducir ${printLisp(value)} a una entrada del comando.`);
}

/**
 * Punto de designación de una entidad. Se usa el centro de su caja envolvente,
 * que es donde pincharía alguien que quisiera «esta entidad» sin más intención.
 *
 * Lo comparte `entsel` (`selection.ts`), y con el mismo límite escrito: el
 * punto que devuelve NO es el del clic del usuario. El anfitrión contesta a una
 * designación con nombres de entidad, no con coordenadas, así que aquí se
 * calcula el centro; una rutina que use ese punto para decidir QUÉ LADO se
 * designó —el trozo de línea que recorta TRIM, la mitad de un círculo— tomará
 * una decisión que el usuario no tomó.
 * Los comandos que distinguen QUÉ LADO se designó —TRIM, FILLET— no se pueden
 * conducir bien así, y por eso `command` con un ename sobre esos comandos es un
 * uso desaconsejado: se documenta aquí en vez de fingir precisión.
 */
export function pickPointOf(host: LispHostServices, entityId: string): CadPoint2 {
  const entity = host.entity(entityId);
  if (!entity || !CAD_ENTITY_REGISTRY.supports(entity)) return { x: 0, y: 0 };
  const bounds = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity, host.document());
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

/** Hace avanzar la máquina del comando con los argumentos dados. */
export function runCommand(
  host: LispHostServices,
  name: string,
  args: readonly LispValue[],
  registry: CadCommandRegistry = CAD_COMMAND_REGISTRY_V2,
): void {
  const descriptor = registry.get(name);
  if (!descriptor)
    throw new LispError(
      `command: el comando "${name.toUpperCase()}" no existe en este producto. ` +
        `Los comandos disponibles son los del registro del motor.`,
    );

  /**
   * El contexto arranca SIN selección previa aunque el primer argumento sea un
   * conjunto. Sembrarla haría que un comando con `selection: "required"`
   * —ERASE— terminase en su primer paso, y entonces el `ss` que la rutina
   * escribió sobraría: `(command "ERASE" ss "")` fallaría por argumentos de
   * más. El conjunto entra como ENTRADA, que es su sitio.
   */
  // La IMPLEMENTACIÓN llega a demanda (`engine/lazy-commands.ts`) y este
  // evaluador es síncrono: no puede esperar a una carga a mitad de una
  // expresión. Quien invoca una rutina calienta el registro entero antes
  // (`CadCommandEngineHost.cargaPendiente`, marca `"lisp"`), así que llegar aquí
  // sin implementación significa que la rutina se evaluó por otra puerta. Se
  // dice, en vez de fallar luego por «sobran argumentos», que no explica nada.
  if (registry === CAD_COMMAND_REGISTRY_V2 && !cadCommandIfLoaded(descriptor.name)) {
    void loadCadCommand(descriptor.name).catch(() => {
      /* el siguiente intento lo vuelve a pedir; el renglón ya avisó */
    });
    throw new LispError(
      `command: "${descriptor.name}" todavía no terminó de cargar. Se está trayendo ahora; ` +
        `vuelva a ejecutar la rutina en un instante.`,
    );
  }

  const context = commandContext(host, []);
  let step = descriptor.begin(context) as CadCommandStep<unknown>;

  let index = 0;
  while (!step.result && index < args.length) {
    const input = toCommandInput(args[index], step, host);
    index += 1;
    step = descriptor.step(step.state as never, input, context) as CadCommandStep<unknown>;
  }

  if (!step.result) {
    throw new LispError(
      `command: (command "${descriptor.name}" …) se quedó sin argumentos y el comando seguía ` +
        `pidiendo «${step.prompt.message}». A diferencia de AutoCAD, aquí el comando no queda ` +
        `activo esperando al usuario: se cancela para no dejar el dibujo a medias.`,
    );
  }

  /**
   * Las cadenas vacías de más se ignoran. `(command "ERASE" ss "")` es como
   * está escrita media biblioteca: el `""` final es el Enter que en AutoCAD
   * cierra la designación, y sobra cuando el conjunto ya la cerró. Rechazarlo
   * convertiría en error una rutina correcta. Cualquier otro sobrante SÍ es un
   * error, porque significa que la rutina creía estar pasando algo más.
   */
  const leftovers = args.slice(index).filter((value) => !(value.t === "nil" || (value.t === "str" && value.v === "")));
  if (leftovers.length > 0)
    throw new LispError(
      `command: sobran ${leftovers.length} argumentos después de que "${descriptor.name}" ` +
        `terminara: ${leftovers.map((value) => printLisp(value)).join(" ")}.`,
    );

  const result = step.result;
  /**
   * ¿De quién es este comando? Si vino de un plugin, su lote NO se aplica en
   * nombre del LISP: se aplica en nombre del plugin, con su permiso comprobado
   * y su etiqueta en el historial.
   *
   * Sin esta comprobación, un plugin sin `documento:escritura` habría
   * registrado un comando que dibuja y habría dibujado —la API de documento le
   * cierra la puerta, pero el motor de comandos es otra puerta— y los permisos
   * habrían quedado en un adorno de la mitad de la superficie.
   */
  const grant = pluginGrantOf(registry, descriptor.name);
  if (result.kind === "document" && result.commands.length > 0) {
    if (grant) grant.permisos.exigir("documento:escritura", `ejecutar ${descriptor.name}`);
    host.apply(result.commands, undoLabelFor(grant, descriptor.name));
  }
  if (result.kind === "variables") {
    // La tabla de sesión también es escritura: `CLAYER` decide en qué capa nace
    // lo siguiente que se dibuje, y `OSMODE` dónde engancha el cursor del
    // dibujante. Un plugin de sólo lectura que pudiera cambiarlas estaría
    // escribiendo en el dibujo por el camino largo.
    if (grant) grant.permisos.exigir("documento:escritura", `ejecutar ${descriptor.name}`);
    applyVariables(host, descriptor.name, result);
  }
}

/**
 * La etiqueta del paso de deshacer. `LISP LINE` cuando el comando es del
 * producto; `plugin:marco-lamina MARCOLAMINA` cuando lo trajo un plugin — el
 * mismo prefijo que pone `createPluginDocumentApi`, para que el historial se
 * lea igual venga el cambio por donde venga.
 */
function undoLabelFor(grant: PluginCommandGrant | undefined, commandName: string): string {
  return grant ? `plugin:${grant.pluginId} ${commandName}` : `LISP ${commandName}`;
}

/**
 * Aplica el efecto de las órdenes que CONFIGURAN en vez de dibujar.
 *
 * `runCommand` aplicaba sólo `result.kind === "document"`, y por eso `(command
 * "SETVAR" …)`, `(command "UNITS" …)`, COLOR, LTSCALE y LWEIGHT devolvían nil
 * sin hacer nada: la rutina creía haber configurado el dibujo y no había
 * configurado nada. Es exactamente el «éxito sin efecto» que la regla 2 de la
 * casa prohíbe, y se cierra aquí escribiendo en la tabla del anfitrión.
 *
 * `system` distingue quién escribe: las consultas —AREA, DIST, LIST— PUBLICAN
 * su resultado y por eso pueden tocar las de sólo lectura; lo que teclea la
 * rutina va por `set` y se topa con la misma negativa que en AutoCAD.
 */
function applyVariables(
  host: LispHostServices,
  commandName: string,
  result: { patch: Readonly<Record<string, CadSystemVariableValue>>; system?: boolean },
): void {
  const access: CadVariableAccess | undefined = host.variables?.();
  const names = Object.keys(result.patch);
  if (names.length === 0) return;
  if (!access)
    throw new LispError(
      `command: "${commandName}" configura variables de sistema (${names.join(", ")}) y este ` +
        `anfitrión no expone la tabla. Se dice, en vez de devolver nil como si se hubiera aplicado.`,
    );
  for (const [name, value] of Object.entries(result.patch)) {
    const outcome = result.system ? access.publish(name, value) : access.set(name, value);
    if (!outcome.ok)
      throw new LispError(`command: "${commandName}" no pudo escribir ${name}: ${outcome.reason}`);
  }
}
