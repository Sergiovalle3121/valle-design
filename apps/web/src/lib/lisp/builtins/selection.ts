/**
 * Conjuntos de selección: `ssget` y su familia.
 *
 * `ssget` es la función con la que empieza casi cualquier rutina útil: coge lo
 * que hay que procesar y devuelve un conjunto por el que se itera. Su firma es
 * un pequeño lenguaje:
 *
 *     (ssget)                       designa interactivamente
 *     (ssget "X")                   todo el dibujo
 *     (ssget "X" '((0 . "LINE")))   todo lo que sea LINE
 *     (ssget "W" p1 p2 filtro)      lo CONTENIDO en la ventana
 *     (ssget "C" p1 p2 filtro)      lo que la ventana TOCA (crossing)
 *     (ssget "L")                   la última entidad creada
 *
 * ## Ventana y captura no son lo mismo, y confundirlas rompe rutinas
 *
 * «W» exige que la entidad quede ENTERA dentro del rectángulo; «C» basta con
 * que lo cruce. Una rutina que recorta el contenido de una zona usa W y una que
 * busca lo que estorba usa C; intercambiarlas no da error, da un resultado
 * distinto. Aquí las dos se resuelven con el mismo `intersectsWindow` de los
 * adaptadores del registro nativo, que es el que ya usa la selección del
 * editor: así el LISP selecciona EXACTAMENTE lo mismo que seleccionaría el
 * ratón, y no una aproximación por caja envolvente.
 *
 * ## `entsel` designa UNA, y vive aquí
 *
 * `entsel` no es «un `ssget` de uno»: devuelve un PAR —nombre y punto—, y su
 * punto tiene un límite declarado que se lee en su propio comentario. Está en
 * este módulo porque comparte con `ssget` la única petición de designación que
 * el anfitrión atiende; tenerla en otro sitio habría invitado a abrir una
 * segunda.
 *
 * ## Los operadores lógicos se rechazan diciéndolo
 *
 * `(-4 . "<OR")` y compañía construyen filtros con árbol booleano. No están
 * implementados, y un filtro con `-4` se RECHAZA con un error explícito. La
 * alternativa —ignorar el `-4` y aplicar el resto como conjunción— devolvería
 * un conjunto plausible y equivocado, que es la peor forma de fallar: la rutina
 * seguiría, procesando objetos que no debía tocar.
 */
import { CAD_ENTITY_REGISTRY, type CadBounds } from "../../cad/entity-runtime";
import { cadEntityToDxf, dxfTypeOf } from "../dxf/from-entity";
import { dxfEntries } from "../dxf/codes";
import { LispError } from "../errors";
import {
  NIL,
  bool,
  ename,
  int,
  list,
  pickset,
  pointOf,
  pointValue,
  toArray,
  type LispCallContext,
  type LispEval,
  type LispPickset,
  type LispValue,
} from "../values";
import { wcmatch } from "../wcmatch";
import { requireHost } from "./entities";
import { pickPointOf } from "./interaction";
import { defgen, defsubr, wantInt, wantString, type BuiltinTable } from "./define";
import type { CadEntity } from "../../cad/cad-document";

/** Un predicado por par del filtro. Todos deben cumplirse (conjunción). */
type EntityPredicate = (entity: CadEntity) => boolean;

/**
 * Traduce el filtro DXF a predicados. Los códigos admitidos son los que el
 * documento canónico sabe responder con certeza; cualquier otro se rechaza,
 * porque un filtro que se ignora en silencio selecciona de más.
 */
function compileFilter(filter: LispValue): EntityPredicate[] {
  const predicates: EntityPredicate[] = [];
  for (const entry of dxfEntries(filter)) {
    if (entry.code === -4)
      throw new LispError(
        'ssget: los operadores lógicos del filtro ((-4 . "<OR") y similares) no están ' +
          "implementados. Un filtro con -4 se rechaza en vez de aplicarse a medias, que " +
          "devolvería un conjunto plausible y equivocado.",
      );
    const value = entry.value;
    switch (entry.code) {
      case 0: {
        if (value.t !== "str") throw new LispError("ssget: el filtro de tipo (0) necesita una cadena");
        const pattern = value.v;
        predicates.push((entity) => {
          const type = dxfTypeOfEntity(entity);
          return type !== null && wcmatch(type, pattern);
        });
        break;
      }
      case 8: {
        if (value.t !== "str") throw new LispError("ssget: el filtro de capa (8) necesita una cadena");
        const pattern = value.v;
        predicates.push((entity) => wcmatch(entity.layer, pattern));
        break;
      }
      case 2: {
        if (value.t !== "str") throw new LispError("ssget: el filtro de bloque (2) necesita una cadena");
        const pattern = value.v;
        predicates.push((entity) => entity.type === "insert" && wcmatch(entity.block, pattern));
        break;
      }
      case 6: {
        if (value.t !== "str") throw new LispError("ssget: el filtro de tipo de línea (6) necesita una cadena");
        const pattern = value.v;
        predicates.push((entity) => {
          const linetype = entity.context?.presentation?.linetype;
          const name = linetype?.source === "explicit" ? (linetype.value ?? "BYLAYER") : "BYLAYER";
          return wcmatch(name, pattern);
        });
        break;
      }
      default:
        throw new LispError(
          `ssget: el código de filtro ${entry.code} no está implementado. ` +
            `Admitidos: 0 (tipo), 8 (capa), 2 (bloque), 6 (tipo de línea).`,
        );
    }
  }
  return predicates;
}

function dxfTypeOfEntity(entity: CadEntity): string | null {
  // TEXT ya tiene adaptador nativo: `dxfTypeOf` lo cubre como a cualquier
  // otro tipo del registro. El carril aparte que tenía —era el único tipo sin
  // adaptador con forma DXF honesta— ya no puede alcanzarse.
  if (!CAD_ENTITY_REGISTRY.supports(entity)) return null;
  return dxfTypeOf(entity);
}

/** Entidades con forma DXF: las que una rutina puede leer con `entget`. */
function addressable(host: ReturnType<typeof requireHost>): CadEntity[] {
  const entities: CadEntity[] = [];
  for (const id of host.entityIds()) {
    const entity = host.entity(id);
    if (!entity) continue;
    if (cadEntityToDxf(entity) === null) continue;
    entities.push(entity);
  }
  return entities;
}

function windowOf(a: LispValue, b: LispValue): CadBounds {
  const first = pointOf(a);
  const second = pointOf(b);
  if (!first || !second)
    throw new LispError("ssget: los modos W y C necesitan dos puntos que definan la ventana");
  return {
    minX: Math.min(first.x, second.x),
    minY: Math.min(first.y, second.y),
    maxX: Math.max(first.x, second.x),
    maxY: Math.max(first.y, second.y),
  };
}

function inWindow(
  entity: CadEntity,
  window: CadBounds,
  crossing: boolean,
  document: ReturnType<ReturnType<typeof requireHost>["document"]>,
): boolean {
  if (!CAD_ENTITY_REGISTRY.supports(entity)) return false;
  return CAD_ENTITY_REGISTRY.adapter(entity).hitTester.intersectsWindow(entity, window, crossing, document);
}

export function installSelectionFunctions(table: BuiltinTable): void {
  defgen(table, "ssget", 0, 4, function* (args, ctx): LispEval {
    const host = requireHost(ctx, "ssget");
    const modeValue = args[0];

    // Sin modo: designación interactiva. Se SUSPENDE y espera al anfitrión.
    if (args.length === 0 || modeValue.t !== "str") {
      const filter = args.length > 0 && modeValue.t !== "str" ? modeValue : NIL;
      const response = yield { kind: "prompt-selection", message: "Designe objetos" };
      if (response.kind === "cancel") return NIL;
      const ids = toArray(response.value)
        .filter((item): item is Extract<LispValue, { t: "ename" }> => item.t === "ename")
        .map((item) => item.id);
      return finish(ctx, host, ids, filter);
    }

    const mode = modeValue.v.toUpperCase();
    const entities = addressable(host);

    if (mode === "X" || mode === "A") {
      const filter = args[1] ?? NIL;
      return finish(ctx, host, entities.map((entity) => entity.id), filter);
    }

    if (mode === "L") {
      const last = entities[entities.length - 1];
      return finish(ctx, host, last ? [last.id] : [], args[1] ?? NIL);
    }

    if (mode === "W" || mode === "C") {
      const window = windowOf(args[1] ?? NIL, args[2] ?? NIL);
      const document = host.document();
      const crossing = mode === "C";
      const selected = entities
        .filter((entity) => inWindow(entity, window, crossing, document))
        .map((entity) => entity.id);
      return finish(ctx, host, selected, args[3] ?? NIL);
    }

    throw new LispError(
      `ssget: el modo "${mode}" no está implementado. Admitidos: X, A, L, W, C, ` +
        `y la designación interactiva sin modo.`,
    );
  });

  /**
   * `(entsel [mensaje])` designa UNA entidad y devuelve `(<nombre> <punto>)`.
   *
   * Es la puerta por la que empieza una rutina de edición —«designe el objeto a
   * modificar»— y por la que sigue: `(car (entsel))` va a `entget`, y `(cadr
   * (entsel))` es el punto que la rutina usa para decidir por dónde cortar.
   *
   * ## El punto es el CENTRO del contorno, no el clic. Está declarado
   *
   * El anfitrión contesta a una designación con nombres de entidad, no con
   * coordenadas: la línea de comandos entrega lo que el usuario designó, y el
   * punto exacto del ratón no viaja por ese canal. Así que el segundo elemento
   * es el centro de la caja envolvente —el mismo `pickPointOf` que usa
   * `command` para conducir un comando con una entidad—, y eso tiene una
   * consecuencia que quien porte una rutina tiene que saber: lo que dependa de
   * QUÉ LADO se designó (el trozo que TRIM recorta, la mitad de un arco) saldrá
   * del lado del centro, no del lado del clic.
   *
   * Devolver sólo el nombre y omitir el punto habría sido peor: `(cadr (entsel))`
   * daría nil, y la rutina dibujaría en el origen sin quejarse.
   *
   * Un Esc devuelve nil, que es lo que comprueba `(if (setq e (entsel)) …)`.
   */
  defgen(table, "entsel", 0, 1, function* (args, ctx): LispEval {
    const host = requireHost(ctx, "entsel");
    const message = args.length > 0 && args[0].t === "str" ? args[0].v : "Designe un objeto";
    const response = yield { kind: "prompt-selection", message };
    if (response.kind === "cancel") return NIL;
    // El anfitrión puede contestar con un nombre suelto o con una lista de
    // ellos —es la misma petición que atiende `ssget` sin modo—. `entsel`
    // designa UNO: se toma el primero y se ignora el resto, como AutoCAD.
    const picked =
      response.value.t === "ename"
        ? response.value
        : toArray(response.value).find((item) => item.t === "ename");
    if (!picked || picked.t !== "ename") return NIL;
    if (!host.entity(picked.id))
      throw new LispError(
        `entsel: se designó ${picked.id}, que ya no está en el dibujo.`,
      );
    ctx.charge(4);
    const point = pickPointOf(host, picked.id);
    return list([picked, pointValue(point)]);
  });

  defsubr(table, "sslength", 1, 1, (args) => int(wantPickset(args[0], "sslength").ids.length));

  defsubr(table, "ssname", 2, 2, (args) => {
    const set = wantPickset(args[0], "ssname");
    const index = wantInt(args[1]);
    // Fuera de rango devuelve nil, que es cómo termina el bucle clásico
    // `(while (setq e (ssname ss i)) ...)`.
    return index >= 0 && index < set.ids.length ? ename(set.ids[index]) : NIL;
  });

  /** `ssadd` sin argumentos crea un conjunto vacío; con ellos, añade. */
  defsubr(table, "ssadd", 0, 2, (args, ctx) => {
    if (args.length === 0) return pickset(ctx.nextPicksetSerial(), []);
    if (args[0].t !== "ename")
      throw new LispError("bad argument type: ssadd: se esperaba un nombre de entidad");
    const id = args[0].id;
    if (args.length === 1) return pickset(ctx.nextPicksetSerial(), [id]);
    const set = wantPickset(args[1], "ssadd");
    // Mutación EN EL SITIO, como el original: el conjunto que tiene la rutina
    // en su variable crece. Devolver una copia rompería `(ssadd e ss)` usado
    // por su efecto, que es como se escribe.
    if (!set.index.has(id)) {
      set.index.add(id);
      set.ids.push(id);
      ctx.charge(1);
    }
    return set;
  });

  defsubr(table, "ssdel", 2, 2, (args) => {
    if (args[0].t !== "ename")
      throw new LispError("bad argument type: ssdel: se esperaba un nombre de entidad");
    const set = wantPickset(args[1], "ssdel");
    const id = args[0].id;
    if (!set.index.has(id)) return NIL;
    set.index.delete(id);
    set.ids.splice(set.ids.indexOf(id), 1);
    return set;
  });

  defsubr(table, "ssmemb", 2, 2, (args) => {
    if (args[0].t !== "ename") return NIL;
    const set = wantPickset(args[1], "ssmemb");
    return set.index.has(args[0].id) ? args[0] : NIL;
  });

  defsubr(table, "wcmatch", 2, 2, (args) =>
    bool(wcmatch(wantString(args[0]).v, wantString(args[1]).v)));
}

function wantPickset(value: LispValue, name: string): LispPickset {
  if (value.t !== "pickset")
    throw new LispError(`bad argument type: ${name}: se esperaba un conjunto de selección`);
  return value;
}

/**
 * Aplica el filtro y construye el conjunto. Un conjunto VACÍO se devuelve como
 * `nil`, no como un pickset de cero elementos: es lo que hace AutoLISP, y de
 * ello depende el `(if (setq ss (ssget ...)) ...)` con el que empieza media
 * biblioteca de rutinas.
 */
function finish(
  ctx: LispCallContext,
  host: ReturnType<typeof requireHost>,
  ids: readonly string[],
  filter: LispValue,
): LispValue {
  const predicates = filter.t === "nil" ? [] : compileFilter(filter);
  const kept = ids.filter((id) => {
    const entity = host.entity(id);
    if (!entity || cadEntityToDxf(entity) === null) return false;
    return predicates.every((predicate) => predicate(entity));
  });
  if (kept.length === 0) return NIL;
  ctx.charge(kept.length);
  return pickset(ctx.nextPicksetSerial(), kept);
}
