/**
 * `osnap`: engancharse a un punto notable del dibujo desde una rutina.
 *
 * `(osnap punto "end,mid")` es cómo una rutina heredada encuentra el extremo de
 * un muro sin recorrer entidades a mano. Es, además, la función que hace útil a
 * `entsel`: se designa un objeto, y con el punto de la designación se pide el
 * extremo o el centro de verdad.
 *
 * ## Se conduce el motor del producto, no se calcula aquí
 *
 * Los puntos notables salen de `snap-engine.ts` alimentado por
 * `snap-scene.ts` — los MISMOS dos módulos que usa el cursor del editor. Un
 * cálculo propio aquí habría creado dos verdades sobre dónde está el punto
 * medio de un arco tesselado, y la rutina habría dibujado un milímetro al lado
 * de donde imana el ratón.
 *
 * Los nombres de los modos se traducen con la tabla de `osnap-bits.ts`, que es
 * la misma que traduce OSMODE. Así `(osnap p "cen")` y `SETVAR OSMODE 4`
 * hablan del mismo modo, y no de dos «centros» que puedan divergir.
 *
 * ## El límite: aquí no hay APERTURA, porque no hay ventana
 *
 * En AutoCAD la búsqueda se acota a la apertura del cursor, que se mide en
 * PÍXELES. Una rutina LISP corre sin ventana —igual que `command`, que ya
 * trabaja con una vista neutra—, así que no hay píxeles que convertir a
 * unidades de dibujo. Inventar una apertura en unidades sería peor que no
 * tenerla: veinte unidades son dos centímetros en un plano en milímetros y
 * veinte metros en uno de topografía, y el mismo `.lsp` engancharía en uno y
 * no en el otro sin decir por qué.
 *
 * Así que `osnap` busca en TODO el dibujo y devuelve el punto notable MÁS
 * CERCANO de los modos pedidos. La consecuencia, declarada: no devuelve nil por
 * «estar lejos»; devuelve nil cuando los modos pedidos no tienen ningún
 * candidato —«cen» en un dibujo sin círculos— o cuando el dibujo está vacío.
 *
 * ## Y por qué manda la DISTANCIA y no la prioridad
 *
 * El cursor del editor ordena al revés: primero la prioridad (extremo antes que
 * centro) y sólo entre iguales la distancia. Puede, porque todos sus candidatos
 * están DENTRO de la apertura y por tanto a un pelo unos de otros. Sin apertura,
 * esa misma regla convertiría `(osnap p "end,cen")` junto a un círculo en el
 * extremo de una línea que está al otro lado del plano — un valor plausible y
 * absurdo, de los que la rutina no puede detectar.
 *
 * Así que se resuelve MODO A MODO con el motor y gana el candidato más cercano;
 * la prioridad del editor sólo desempata entre dos que estén a la misma
 * distancia. Es la traducción honesta de la regla de AutoCAD a un sitio donde no
 * hay apertura, y está aquí escrita para que se pueda discutir.
 *
 * ## Una divergencia heredada, declarada: «cen» sobre una LÍNEA
 *
 * El adaptador de LINE del producto publica su punto medio como enganche de
 * clase `center` (`basic-native-adapters.ts`, etiqueta «Punto medio»), así que
 * `(osnap p "cen")` sobre una línea contesta su punto medio, cosa que AutoCAD no
 * hace: allí CENtro sólo imanta arcos, círculos y elipses. No se corrige aquí
 * —filtrar el candidato en este módulo dejaría al cursor del editor imantando
 * una cosa y a la rutina otra, que es la divergencia peor— y el adaptador está
 * fuera de este territorio: la corrección va escrita como petición P-ext-02 en
 * `docs/history/execution/frentes-superar-20260904/ext-peticiones.md`. Mientras tanto, esto engancha
 * EXACTAMENTE lo que engancha el ratón, que es la promesa que sí se puede
 * sostener.
 */
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../../cad/entity-runtime";
import { CAD_OSNAP_BITS } from "../../cad/osnap-bits";
import {
  SNAP_PRIORITY,
  snap,
  type SnapResult,
  type SnapScene,
  type SnapType,
} from "../../cad/snap-engine";
import { cadSnapSceneAddEntities } from "../../cad/snap-scene";
import { LispError } from "../errors";
import { NIL, pointOf, pointValue, type LispValue } from "../values";
import { defsubr, wantString, type BuiltinTable } from "./define";
import { requireHost } from "./entities";

/**
 * Cuántas entidades alimentan el motor.
 *
 * El motor cruza los tramos de la escena entre sí buscando intersecciones, que
 * es O(n²) — el mismo motivo por el que el editor limita las cajas a cuarenta y
 * ocho. Aquí el tope es mayor porque una rutina no corre en cada movimiento del
 * ratón, pero existe: sin él, `(osnap p "int")` sobre un DXF importado de diez
 * mil líneas se comería el presupuesto de la rutina entera en una llamada.
 */
const MAX_ENTITIES = 400;

/**
 * Los nombres de modo de AutoLISP → modos del motor.
 *
 * Se aceptan las tres formas con las que están escritas las rutinas reales: el
 * nombre inglés de tres letras (`end`), el largo (`endpoint`) y el atajo
 * castellano de la línea de comandos del producto (`fin`), que es el que teclea
 * quien escribe la rutina aquí. El guion bajo de `"_end"` —la marca de
 * «vocabulario en inglés» de AutoCAD— se ignora, porque aparece en casi
 * cualquier rutina publicada.
 */
const MODE_NAMES: Readonly<Record<string, SnapType>> = {
  end: "endpoint",
  endp: "endpoint",
  endpoint: "endpoint",
  mid: "midpoint",
  midp: "midpoint",
  midpoint: "midpoint",
  cen: "center",
  center: "center",
  gcen: "geometric-center",
  nod: "node",
  node: "node",
  qua: "quadrant",
  quad: "quadrant",
  quadrant: "quadrant",
  int: "intersection",
  intersection: "intersection",
  app: "apparent-intersection",
  appint: "apparent-intersection",
  ins: "insertion",
  insert: "insertion",
  per: "perpendicular",
  perp: "perpendicular",
  perpendicular: "perpendicular",
  tan: "tangent",
  tangent: "tangent",
  nea: "nearest",
  near: "nearest",
  nearest: "nearest",
  ext: "extension",
  extension: "extension",
};

/** Los atajos castellanos, tomados de la tabla de OSMODE para no duplicarla. */
function spanishShortcut(name: string): SnapType | null {
  const entry = CAD_OSNAP_BITS.find((candidate) => candidate.shortcut.toLowerCase() === name);
  return entry?.snap ?? null;
}

function parseModes(caller: string, source: string): SnapType[] {
  const modes: SnapType[] = [];
  for (const raw of source.split(",")) {
    const name = raw.trim().replace(/^_/, "").toLowerCase();
    if (name === "") continue;
    const mode = MODE_NAMES[name] ?? spanishShortcut(name);
    if (!mode)
      throw new LispError(
        `${caller}: "${raw.trim()}" no es un modo de referencia a objetos. Admitidos: ` +
          `end, mid, cen, gcen, nod, qua, int, app, ins, per, tan, nea y ext (y los atajos ` +
          `castellanos de la línea de comandos).`,
      );
    if (!modes.includes(mode)) modes.push(mode);
  }
  if (modes.length === 0)
    throw new LispError(
      `${caller}: la cadena de modos vino vacía. Se rechaza en vez de enganchar a cualquier ` +
        `cosa: una rutina que pide "" no ha decidido a qué quiere engancharse.`,
    );
  return modes;
}

export function installOsnap(table: BuiltinTable): void {
  /**
   * `(osnap punto "modo[,modo…]")` → el punto enganchado, o nil.
   *
   * El punto que se le pasa hace de cursor Y de origen del elástico: es desde
   * él desde donde se mide la perpendicular y la tangente, que son los dos
   * modos que dependen de dónde mira quien dibuja.
   */
  defsubr(table, "osnap", 2, 2, (args, ctx) => {
    const host = requireHost(ctx, "osnap");
    const cursor = pointOf(args[0]);
    if (!cursor)
      throw new LispError("bad argument type: osnap: el primer argumento es un punto");
    const modes = parseModes("osnap", wantString(args[1]).v);

    const document = host.document();
    const entities: CadNativeEntity[] = [];
    for (const id of host.entityIds()) {
      if (entities.length >= MAX_ENTITIES) break;
      const entity = host.entity(id);
      if (!entity || !CAD_ENTITY_REGISTRY.supports(entity)) continue;
      entities.push(entity);
    }
    // El coste real está en teselar y cruzar: se cobra por entidad para que una
    // rutina que llame a `osnap` dentro de un bucle sobre mil objetos se tope
    // con el presupuesto en vez de con el reloj del navegador.
    ctx.charge(entities.length);
    if (entities.length === 0) return NIL;

    const scene: SnapScene = {};
    cadSnapSceneAddEntities(scene, entities, cursor, undefined, document);

    let best: SnapResult | null = null;
    for (const mode of modes) {
      // Los modos se apagan TODOS y se enciende UNO. El motor entiende «no
      // dicho» como «encendido» —le sirve al cursor, que arranca con todo—, así
      // que enumerar sólo el pedido habría enganchado además a los otros trece:
      // `(osnap p "end")` habría contestado un punto medio y la rutina no
      // tendría forma de notarlo.
      const enabled: Partial<Record<SnapType, boolean>> = {};
      for (const type of SNAP_PRIORITY) enabled[type] = false;
      enabled[mode] = true;
      const found = snap(cursor, scene, {
        modes: enabled,
        // Sin ventana no hay apertura: dentro del modo gana el más cercano.
        tolerance: Number.POSITIVE_INFINITY,
        from: cursor,
      });
      if (found && (best === null || closerThan(found, best))) best = found;
    }
    if (!best) return NIL;
    const result: LispValue = pointValue({ x: best.point.x, y: best.point.y, z: 0 });
    return result;
  });
}

/**
 * Qué candidato gana entre dos modos distintos: el más cercano.
 *
 * El empate exacto —dos modos que caen en el mismo punto, como el extremo de una
 * línea y el cuadrante del círculo que arranca ahí— lo decide la prioridad del
 * editor, que es la de AutoCAD. Sin ese desempate, el resultado dependería del
 * orden en que la rutina escribió los modos en la cadena, y `"end,cen"` y
 * `"cen,end"` darían puntos distintos sobre el mismo dibujo.
 */
function closerThan(candidate: SnapResult, best: SnapResult): boolean {
  const difference = candidate.distance - best.distance;
  if (Math.abs(difference) > 1e-9) return difference < 0;
  return SNAP_PRIORITY.indexOf(candidate.type) < SNAP_PRIORITY.indexOf(best.type);
}
