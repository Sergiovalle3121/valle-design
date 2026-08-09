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
  type CadCommandContext,
  type CadCommandRegistry,
  type CadCommandInput,
  type CadCommandStep,
} from "../../cad/engine";
import { CAD_ENTITY_REGISTRY } from "../../cad/entity-runtime";
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

  defsubr(table, "getvar", 1, 1, (args, ctx) => {
    const host = requireHost(ctx, "getvar");
    const variable = wantString(args[0]).v.toUpperCase();
    // Sólo las variables que el documento canónico sabe responder con certeza.
    // Inventar el resto —`OSMODE`, `CMDECHO`— devolvería un valor plausible que
    // la rutina guardaría y restauraría, creyendo que controla algo.
    if (variable === "CLAYER") return str(host.activeLayer());
    if (variable === "INSUNITS") return int(insunitsOf(host));
    throw new LispError(
      `getvar: la variable de sistema "${variable}" no existe en este producto. ` +
        `Sólo están CLAYER e INSUNITS; las demás no se inventan.`,
    );
  });

  defsubr(table, "setvar", 2, 2, (args) => {
    throw new LispError(
      `setvar: no hay variables de sistema escribibles. Se rechaza en vez de aceptar ` +
        `"${wantString(args[0]).v}" y no aplicarlo, que dejaría a la rutina creyendo que ` +
        `configuró el dibujo.`,
    );
  });

  defsubr(table, "tblsearch", 2, 2, (args, ctx) => {
    const host = requireHost(ctx, "tblsearch");
    const tableName = wantString(args[0]).v.toUpperCase();
    if (tableName !== "LAYER")
      throw new LispError(`tblsearch: sólo está implementada la tabla LAYER, no ${tableName}.`);
    const wanted = wantString(args[1]).v;
    const layer = host.layers().find((candidate) => candidate.name === wanted || candidate.id === wanted);
    if (!layer) return NIL;
    ctx.charge(6);
    return {
      t: "cons",
      car: { t: "cons", car: int(0), cdr: str("LAYER") },
      cdr: {
        t: "cons",
        car: { t: "cons", car: int(2), cdr: str(layer.name) },
        cdr: {
          t: "cons",
          // Bit 1: congelada. Bit 4: bloqueada. Es la codificación del código 70
          // en la tabla de capas del DXF, y las rutinas de comprobación de norma
          // la leen así.
          car: { t: "cons", car: int(70), cdr: int((layer.visible ? 0 : 1) | (layer.locked ? 4 : 0)) },
          cdr: NIL,
        },
      },
    };
  });

  defsubr(table, "getenv", 1, 1, () => NIL);
}

function insunitsOf(host: LispHostServices): number {
  // Códigos INSUNITS del DXF: 1 pulgadas, 4 milímetros, 5 centímetros, 6 metros.
  const unit = host.document().meta.unit;
  return unit === "in" ? 1 : unit === "cm" ? 5 : unit === "m" ? 6 : 4;
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
  return {
    entityIds: host.entityIds(),
    entity: (entityId) => host.entity(entityId),
    selection,
    activeLayer: host.activeLayer(),
    // El motor pide una vista porque los comandos de encuadre la necesitan. Una
    // llamada desde LISP no tiene ventana; se entrega una vista neutra y los
    // comandos de VISTA (`ZOOM`, `PAN`) no producen un resultado significativo
    // por esta ruta. Están declarados `mutates: false`, así que no pueden
    // estropear el dibujo — sencillamente no encuadran nada.
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
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
 * Los comandos que distinguen QUÉ LADO se designó —TRIM, FILLET— no se pueden
 * conducir bien así, y por eso `command` con un ename sobre esos comandos es un
 * uso desaconsejado: se documenta aquí en vez de fingir precisión.
 */
function pickPointOf(host: LispHostServices, entityId: string): CadPoint2 {
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
  if (result.kind === "document" && result.commands.length > 0)
    host.apply(result.commands, `LISP ${descriptor.name}`);
}
