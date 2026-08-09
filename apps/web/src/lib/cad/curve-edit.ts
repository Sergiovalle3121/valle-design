/**
 * TRIM y EXTEND sobre CUALQUIER curva, expresados como una sola operación.
 *
 * ## La regla, una sola vez
 *
 * Recortar es quedarse con el TRAMO ENTRE LOS DOS CORTES VECINOS al sitio donde
 * se pinchó. Escrita sobre el parámetro de `curve-model.ts`, esa frase vale
 * igual para un segmento, un arco, una elipse y una polilínea, y por eso aquí
 * hay una implementación y no cuatro. Extender es la misma cuenta con la curva
 * sin acotar: se busca el cruce inmediato MÁS ALLÁ del extremo que se estira.
 *
 * ## Una divergencia consciente respecto de AutoCAD
 *
 * En AutoCAD se designa el trozo que SE VA. Aquí se conserva el trozo
 * designado, que es la regla que el producto ya tenía documentada y probada en
 * `modify-edges.spec.ts` («TRIM conserva el trozo del lado DONDE SE PULSÓ»).
 * Este módulo la generaliza en vez de cambiarla: invertirla es una decisión de
 * producto con su propio cambio, no un efecto colateral de admitir arcos.
 *
 * ## Lo que sale de aquí
 *
 * Datos, no mutaciones. `CadCurveEdit` describe qué parche o qué sustitución
 * hay que emitir; convertirlo en `CadEntityCommand[]` es del comando. Este
 * módulo no toca el documento ni llama a `commitChange`, que es lo que separa
 * una función `compute*` de una `apply*`.
 */
import type { CadEntity, CadPoint2, CadPoint3 } from "./cad-document";
import {
  cadEntityCurves,
  curveBoundsOverlap,
  curveBoundsUnion,
  curveClosestParam,
  curveDistanceTo,
  curveExtensionPeriod,
  curveIntersections,
  curveIsClosed,
  curveLength,
  curveParamAt,
  curvePointAt,
  type CadCurve,
  type CadCurveBounds,
} from "./curve-model";
import type { CadNativeEntity, CadPropertyBag } from "./entity-runtime";
import { norm360, type CadVec2 } from "./primitives";

const EPS = 1e-9;

/** Tipos de objetivo que este módulo sabe recortar y alargar. */
export type CadEditableEntity = Extract<
  CadEntity,
  { type: "line" | "arc" | "circle" | "ellipse" | "polyline" }
>;

export const CAD_EDITABLE_TYPES = ["line", "arc", "circle", "ellipse", "polyline"] as const;

export function asCadEditableEntity(entity: CadEntity | undefined): CadEditableEntity | null {
  if (!entity) return null;
  return (CAD_EDITABLE_TYPES as readonly string[]).includes(entity.type)
    ? (entity as CadEditableEntity)
    : null;
}

/**
 * El cambio a aplicar sobre la entidad, conservando SIEMPRE su id.
 *
 * `patch` cuando basta mover números; `replace` cuando cambia el tipo (un
 * círculo recortado es un arco) o cuando la propiedad no es escribible por el
 * adaptador (los vértices de una polilínea). Nunca borrar y crear: eso rompería
 * las cotas asociativas, los sombreados y el orden de dibujo que apuntan a esta
 * entidad.
 */
export interface CadCurveEdit {
  patch?: Partial<CadPropertyBag>;
  replace?: CadNativeEntity;
}

export type CadCurveEditOutcome = CadCurveEdit | { error: string };

// ---------------------------------------------------------------------------
// Parámetro global sobre una entidad de varias curvas
// ---------------------------------------------------------------------------

/** Dominio global: `índice + t`, de 0 a `curves.length`. */
function globalDomain(curves: readonly CadCurve[]): number {
  return curves.length;
}

function globalClosest(curves: readonly CadCurve[], point: CadVec2): number {
  let best = 0;
  let bestDistance = Infinity;
  curves.forEach((curve, index) => {
    const distance = curveDistanceTo(curve, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index + curveClosestParam(curve, point);
    }
  });
  return best;
}

/** Es cerrada la entidad entera (círculo, elipse completa, polilínea cerrada). */
function entityIsClosed(entity: CadEditableEntity, curves: readonly CadCurve[]): boolean {
  if (entity.type === "polyline") return entity.closed === true;
  return curves.length === 1 && curveIsClosed(curves[0]);
}

/**
 * Cortes de la entidad contra las fronteras, en parámetro global y ordenados.
 *
 * `extend` decide si se buscan también los cruces de FUERA del objeto: TRIM no
 * los quiere, EXTEND sólo quiere esos.
 */
function cutParameters(
  curves: readonly CadCurve[],
  boundaries: readonly CadCurve[],
  extend: boolean,
): number[] {
  const cuts: number[] = [];
  curves.forEach((curve, index) => {
    for (const boundary of boundaries)
      for (const hit of curveIntersections(curve, boundary, { extendA: extend })) {
        const parameter = index + hit.tA;
        if (cuts.some((seen) => Math.abs(seen - parameter) <= 1e-7)) continue;
        cuts.push(parameter);
      }
  });
  return cuts.sort((left, right) => left - right);
}

// ---------------------------------------------------------------------------
// Restricción de una curva y reconstrucción de la entidad
// ---------------------------------------------------------------------------

function subCurve(curve: CadCurve, t0: number, t1: number): CadCurve {
  if (curve.kind === "segment")
    return { kind: "segment", a: curvePointAt(curve, t0), b: curvePointAt(curve, t1) };
  if (curve.kind === "arc")
    return {
      kind: "arc",
      center: curve.center,
      radius: curve.radius,
      startAngle: curve.startAngle + curve.sweep * t0,
      sweep: curve.sweep * (t1 - t0),
    };
  return {
    kind: "ellipse",
    center: curve.center,
    major: curve.major,
    ratio: curve.ratio,
    startParam: curve.startParam + curve.sweep * t0,
    sweep: curve.sweep * (t1 - t0),
  };
}

/** `bulge = tan(θ/4)` con θ el barrido con signo, que es la convención DXF. */
function bulgeOf(curve: CadCurve): number {
  if (curve.kind !== "arc") return 0;
  return Math.tan(((curve.sweep * Math.PI) / 180) / 4);
}

function verticesOf(curves: readonly CadCurve[], z: number): (CadPoint3 & { bulge?: number })[] {
  const vertices: (CadPoint3 & { bulge?: number })[] = [];
  for (const curve of curves) {
    const start = curvePointAt(curve, 0);
    const bulge = bulgeOf(curve);
    vertices.push(bulge === 0 ? { x: start.x, y: start.y, z } : { x: start.x, y: start.y, z, bulge });
  }
  const last = curves[curves.length - 1];
  const end = curvePointAt(last, 1);
  vertices.push({ x: end.x, y: end.y, z });
  return vertices;
}

/** El tramo `[from, to]` del recorrido global, como lista de curvas. */
function sliceCurves(curves: readonly CadCurve[], from: number, to: number): CadCurve[] {
  const slices: CadCurve[] = [];
  const total = curves.length;
  let cursor = from;
  // Se avanza tramo a tramo dando la vuelta si hace falta: en una polilínea
  // cerrada el trozo conservado puede cruzar el vértice de cierre.
  while (cursor < to - 1e-12) {
    const index = Math.min(total - 1, Math.floor(cursor + 1e-12) % total);
    const localFrom = cursor - Math.floor(cursor + 1e-12);
    const segmentEnd = Math.floor(cursor + 1e-12) + 1;
    const stop = Math.min(to, segmentEnd);
    const localTo = stop - Math.floor(cursor + 1e-12);
    if (localTo - localFrom > 1e-12) slices.push(subCurve(curves[index], localFrom, localTo));
    cursor = stop;
  }
  return slices;
}

const normalizeDeg = (value: number) => norm360(value);

/**
 * La entidad reducida al tramo `[from, to]` del parámetro global.
 *
 * Devuelve `patch` cuando la entidad conserva su tipo y sus campos son
 * escribibles, y `replace` cuando no: un círculo recortado deja de ser un
 * círculo, y los vértices de una polilínea no pasan por el bolsillo de
 * propiedades.
 */
function restrict(
  entity: CadEditableEntity,
  curves: readonly CadCurve[],
  from: number,
  to: number,
): CadCurveEditOutcome {
  if (to - from <= 1e-9) return { error: "el tramo conservado quedaría vacío" };

  if (entity.type === "line") {
    const piece = subCurve(curves[0], from, to);
    if (piece.kind !== "segment") return { error: "una LINE sólo puede reducirse a un segmento" };
    return {
      patch: { startX: piece.a.x, startY: piece.a.y, endX: piece.b.x, endY: piece.b.y },
    };
  }

  if (entity.type === "arc" || entity.type === "circle") {
    const piece = subCurve(curves[0], from, to);
    if (piece.kind !== "arc") return { error: "un arco sólo puede reducirse a un arco" };
    // Un arco DXF se recorre siempre CCW: un barrido negativo se escribe
    // intercambiando los extremos, no guardando un signo que el formato no
    // admite.
    const startAngle = normalizeDeg(piece.sweep >= 0 ? piece.startAngle : piece.startAngle + piece.sweep);
    const endAngle = normalizeDeg(startAngle + Math.abs(piece.sweep));
    if (entity.type === "arc") return { patch: { startAngle, endAngle } };
    return {
      replace: {
        id: entity.id,
        type: "arc",
        center: { ...entity.center },
        radius: entity.radius,
        startAngle,
        endAngle,
        layer: entity.layer,
        ...(entity.context ? { context: entity.context } : {}),
      },
    };
  }

  if (entity.type === "ellipse") {
    const piece = subCurve(curves[0], from, to);
    if (piece.kind !== "ellipse") return { error: "una elipse sólo puede reducirse a una elipse" };
    const startParameter = normalizeDeg(
      piece.sweep >= 0 ? piece.startParam : piece.startParam + piece.sweep,
    );
    const endParameter = normalizeDeg(startParameter + Math.abs(piece.sweep));
    return { patch: { startParameter, endParameter } };
  }

  const slices = sliceCurves(curves, from, to);
  if (slices.length === 0) return { error: "el tramo conservado quedaría vacío" };
  const z = entity.vertices[0]?.z ?? 0;
  return {
    replace: {
      id: entity.id,
      type: "polyline",
      vertices: verticesOf(slices, z),
      // Recortar una polilínea CERRADA la abre: si siguiera cerrada, el tramo
      // que se acaba de quitar volvería como cuerda de cierre.
      closed: false,
      layer: entity.layer,
      ...(entity.context ? { context: entity.context } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// TRIM
// ---------------------------------------------------------------------------

export interface CadCurveEditInput {
  target: CadEditableEntity;
  /** Bordes de corte o de contorno, ya resueltos desde el documento. */
  boundaries: readonly CadEntity[];
  /** Dónde pinchó el usuario, en unidades de dibujo. */
  pick: CadPoint2;
}

/**
 * Las curvas de los bordes, ya convertidas.
 *
 * `within` descarta por caja envolvente lo que ni se acerca al objetivo. No es
 * una micro-optimización: TRIM con la opción `Todos` pasa el dibujo ENTERO como
 * borde, y sin este filtro un plano de 100.000 entidades pagaría una
 * intersección curva-curva —hasta 720 muestras si hay una elipse por medio— por
 * cada objeto del plano y por cada recorte. La caja es un SUPERCONJUNTO, así
 * que sólo puede dejar pasar de más.
 *
 * EXTEND no la usa: allí el objetivo se prolonga sin límite y una caja calculada
 * sobre su geometría actual descartaría justo los contornos lejanos que EXTEND
 * existe para alcanzar.
 */
function boundaryCurves(
  target: CadEditableEntity,
  boundaries: readonly CadEntity[],
  within?: CadCurveBounds | null,
): { curves: CadCurve[]; convertible: number } {
  const curves: CadCurve[] = [];
  let convertible = 0;
  for (const boundary of boundaries) {
    if (boundary.id === target.id) continue;
    const converted = cadEntityCurves(boundary);
    // Lo que no se sabe convertir NO se aproxima. Un SPLINE aplanado cortaría
    // en el sitio equivocado, y un corte en el sitio equivocado es peor que no
    // cortar: el usuario ve una geometría plausible y falsa.
    if (!converted) continue;
    convertible += 1;
    // Descartado por caja: el borde EXISTE y sabe cortar, sólo que no llega.
    // Se cuenta como convertible para que el mensaje siga siendo «no cruza
    // ningún borde» y no «ningún borde sabe cortar», que serían cosas
    // distintas y sólo una es cierta.
    if (within) {
      const bounds = curveBoundsUnion(converted);
      if (bounds && !curveBoundsOverlap(bounds, within, 1e-6)) continue;
    }
    curves.push(...converted);
  }
  return { curves, convertible };
}

/**
 * TRIM: conserva el tramo entre los cortes vecinos al punto designado.
 *
 * En una curva CERRADA el tramo da la vuelta —hacen falta dos cortes— y en una
 * abierta los extremos hacen de cortes implícitos, que es lo que convierte
 * «recortar contra un borde» en «acortar hasta él».
 */
export function computeCadCurveTrim(input: CadCurveEditInput): CadCurveEditOutcome {
  const curves = cadEntityCurves(input.target);
  if (!curves || curves.length === 0)
    return { error: `${input.target.type.toUpperCase()} no tiene geometría que recortar.` };
  const boundaries = boundaryCurves(input.target, input.boundaries, curveBoundsUnion(curves));
  if (boundaries.convertible === 0) return { error: "ningún borde designado sabe cortar." };

  const cuts = cutParameters(curves, boundaries.curves, false);
  if (cuts.length === 0) return { error: "no cruza ningún borde." };

  const domain = globalDomain(curves);
  const pick = globalClosest(curves, input.pick);
  const closed = entityIsClosed(input.target, curves);

  if (closed) {
    if (cuts.length < 2)
      return { error: "una curva cerrada necesita DOS cortes para poder recortarse." };
    // Sector que contiene el clic, dando la vuelta si el clic cae antes del
    // primer corte o después del último.
    const after = cuts.find((cut) => cut > pick);
    const before = [...cuts].reverse().find((cut) => cut < pick);
    const from = before ?? cuts[cuts.length - 1];
    const to = after ?? cuts[0] + domain;
    return restrict(input.target, curves, from, to > from ? to : to + domain);
  }

  const from = [...cuts].reverse().find((cut) => cut < pick - EPS) ?? 0;
  const to = cuts.find((cut) => cut > pick + EPS) ?? domain;
  if (from <= EPS && to >= domain - EPS)
    return { error: "el punto designado no queda entre dos cortes." };
  return restrict(input.target, curves, from, to);
}

// ---------------------------------------------------------------------------
// EXTEND
// ---------------------------------------------------------------------------

/**
 * EXTEND: alarga por el extremo más cercano al punto designado hasta el primer
 * cruce que haya por ese lado.
 *
 * El extremo lo elige el clic, igual que en AutoCAD: se designa el objeto
 * CERCA del lado que se quiere estirar. Una curva cerrada no tiene extremos y
 * se rechaza diciéndolo.
 */
export function computeCadCurveExtend(input: CadCurveEditInput): CadCurveEditOutcome {
  const curves = cadEntityCurves(input.target);
  if (!curves || curves.length === 0)
    return { error: `${input.target.type.toUpperCase()} no tiene geometría que alargar.` };
  if (entityIsClosed(input.target, curves))
    return { error: "una curva cerrada no tiene extremos que alargar." };
  const boundaries = boundaryCurves(input.target, input.boundaries);
  if (boundaries.convertible === 0) return { error: "ningún contorno designado sabe alargar." };

  const domain = globalDomain(curves);
  const pick = globalClosest(curves, input.pick);
  const extendEnd = pick >= domain / 2;

  // Sólo el tramo TERMINAL se prolonga: alargar por el medio de una polilínea
  // no significa nada.
  const index = extendEnd ? curves.length - 1 : 0;
  const terminal = curves[index];
  const period = curveExtensionPeriod(terminal);

  let best: number | null = null;
  for (const boundary of boundaries.curves)
    for (const hit of curveIntersections(terminal, boundary, { extendA: true })) {
      // Un arco extendido da la vuelta: un cruce a 3/4 de vuelta hacia delante
      // es en realidad 1/4 hacia atrás, y sin restar el periodo EXTEND
      // alargaría por el lado contrario.
      const forward = hit.tA;
      const backward = period === null ? hit.tA : hit.tA - period;
      if (extendEnd) {
        if (forward > 1 + EPS && (best === null || forward < best)) best = forward;
      } else if (backward < -EPS && (best === null || backward > best)) best = backward;
    }
  if (best === null)
    return {
      error: extendEnd
        ? "no hay ningún contorno más allá de su extremo final."
        : "no hay ningún contorno más allá de su extremo inicial.",
    };

  const localFrom = extendEnd ? 0 : best;
  const localTo = extendEnd ? best : 1;
  return reshapeTerminal(input.target, curves, index, localFrom, localTo);
}

/**
 * Sustituye el tramo TERMINAL por su versión reparametrizada.
 *
 * Para una entidad de una sola curva es exactamente `restrict`. Para una
 * polilínea conserva todos los demás tramos intactos, que es lo que distingue
 * «alargar la polilínea» de «rehacerla».
 */
function reshapeTerminal(
  target: CadEditableEntity,
  curves: readonly CadCurve[],
  index: number,
  from: number,
  to: number,
): CadCurveEditOutcome {
  if (curves.length === 1) return restrict(target, curves, from, to);
  const grown = [...curves];
  grown[index] = subCurve(curves[index], from, to);
  const z = target.type === "polyline" ? target.vertices[0]?.z ?? 0 : 0;
  return {
    replace: {
      id: target.id,
      type: "polyline",
      vertices: verticesOf(grown, z),
      closed: false,
      layer: target.layer,
      ...(target.context ? { context: target.context } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// LENGTHEN
// ---------------------------------------------------------------------------

export type CadLengthenMode = "delta" | "percent" | "total" | "dynamic";

export interface CadLengthenInput {
  target: CadEditableEntity;
  /** Dónde se designó: decide QUÉ EXTREMO crece o encoge. */
  pick: CadPoint2;
  mode: CadLengthenMode;
  /** Incremento, porcentaje o longitud total, según el modo. */
  value?: number;
  /** Destino del arrastre, en el modo dinámico. */
  toPoint?: CadPoint2;
}

/**
 * LENGTHEN: cambia la longitud por el extremo designado.
 *
 * Sólo LINE, ARC y POLILÍNEA abierta. Una ELIPSE se rechaza a propósito: su
 * longitud de arco no es proporcional a su parámetro —no hay forma cerrada— y
 * repartir una longitud pedida como si lo fuera dejaría el extremo en un sitio
 * distinto del que dice el número. Un error de milímetros que nadie ve es peor
 * que una negativa.
 */
export function computeCadCurveLengthen(input: CadLengthenInput): CadCurveEditOutcome {
  const curves = cadEntityCurves(input.target);
  if (!curves || curves.length === 0)
    return { error: `${input.target.type.toUpperCase()} no tiene longitud que cambiar.` };
  if (entityIsClosed(input.target, curves))
    return { error: "una curva cerrada no tiene extremos que alargar." };
  if (curves.some((curve) => curve.kind === "ellipse"))
    return {
      error:
        "una ELIPSE no se alarga por longitud: su arco no es proporcional a su parámetro y el extremo caería donde no dice el número.",
    };

  const domain = globalDomain(curves);
  const pick = globalClosest(curves, input.pick);
  const growEnd = pick >= domain / 2;
  const index = growEnd ? curves.length - 1 : 0;
  const terminal = curves[index];

  if (input.mode === "dynamic") {
    if (!input.toPoint) return { error: "el modo dinámico necesita un punto de destino." };
    const t = curveParamAt(terminal, input.toPoint);
    // Arrastrar más allá del otro extremo invertiría la curva sobre sí misma.
    if (growEnd ? t <= EPS : t >= 1 - EPS)
      return { error: "el punto de destino cruza el otro extremo: la curva se daría la vuelta." };
    return reshapeTerminal(input.target, curves, index, growEnd ? 0 : t, growEnd ? t : 1);
  }

  const lengths = curves.map(curveLength);
  const total = lengths.reduce((sum, value) => sum + value, 0);
  if (!(total > EPS)) return { error: "el objeto tiene longitud cero." };
  const value = input.value ?? 0;
  const target =
    input.mode === "delta" ? total + value : input.mode === "percent" ? (total * value) / 100 : value;
  if (!Number.isFinite(target) || target <= EPS)
    return { error: `la longitud pedida (${target}) no es positiva.` };

  const terminalLength = lengths[index];
  const newTerminal = terminalLength + (target - total);
  if (!(newTerminal > EPS))
    return {
      error:
        "el cambio se comería el tramo del extremo entero; LENGTHEN sólo estira o encoge el último tramo.",
    };
  const ratio = newTerminal / terminalLength;
  return reshapeTerminal(
    input.target,
    curves,
    index,
    growEnd ? 0 : 1 - ratio,
    growEnd ? ratio : 1,
  );
}

/**
 * Corta la curva en `at` conservando el lado donde está `pick`, y ALARGÁNDOLA
 * si `at` cae fuera.
 *
 * Es lo que necesita FILLET: el punto de tangencia puede quedar dentro del
 * objeto (hay que recortar) o más allá de su extremo (hay que prolongar), y en
 * los dos casos el trozo que sobrevive es el del lado por donde se designó.
 * Tratar los dos casos como operaciones distintas fue lo que dejó a FILLET
 * admitiendo sólo líneas.
 */
export function computeCadCurveKeepSide(
  target: CadEditableEntity,
  at: CadPoint2,
  pick: CadPoint2,
): CadCurveEditOutcome {
  const curves = cadEntityCurves(target);
  if (!curves || curves.length === 0)
    return { error: `${target.type.toUpperCase()} no tiene geometría que cortar.` };
  if (curves.length !== 1)
    return { error: "una polilínea no se corta por un punto suelto; use TRIM o BREAK." };
  if (entityIsClosed(target, curves))
    return { error: "una curva cerrada no se corta en un solo punto." };

  const curve = curves[0];
  const pickParam = curveClosestParam(curve, pick);
  let cut = curveParamAt(curve, at);
  const period = curveExtensionPeriod(curve);
  // Un arco extendido da la vuelta: el mismo punto se puede leer como «tres
  // cuartos hacia delante» o «un cuarto hacia atrás». Se toma la lectura más
  // cercana al lado por el que se designó, o FILLET recortaría el arco entero.
  if (period !== null && Math.abs(cut - period - pickParam) < Math.abs(cut - pickParam))
    cut -= period;

  return cut < pickParam ? restrict(target, curves, cut, 1) : restrict(target, curves, 0, cut);
}

/** Longitud total de la entidad, o `null` si no es una curva de las tratables. */
export function cadEntityLength(entity: CadEntity): number | null {
  const curves = cadEntityCurves(entity);
  if (!curves || curves.length === 0) return null;
  return curves.reduce((sum, curve) => sum + curveLength(curve), 0);
}
