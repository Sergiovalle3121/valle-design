/**
 * Enrutado del teselado caliente del render al KERNEL DE CURVAS.
 *
 * ## Qué problema resuelve
 *
 * `lib/cad/wasm/curve-kernel.ts` existe desde hace campañas, tiene paridad
 * numérica publicada, fallback cerrado y benchmarks — y NADIE lo importaba
 * fuera de su propio directorio. Un módulo que nadie importa no es una
 * capacidad del producto (regla 6 / regla 1 de la campaña de cimientos): es
 * documentación ejecutable. Este archivo es el cable que faltaba, y cae entero
 * dentro de `render/`, que es donde el teselado se paga de verdad.
 *
 * ## Por qué por LOTES y no entidad a entidad
 *
 * El kernel cobra por CRUCE de frontera, no por curva. Teselar un arco cuesta
 * microsegundos y cruzar a wasm para pedirlo cuesta un orden de magnitud
 * parecido, así que un enrutado «una llamada por arco» no sería una
 * optimización sino un impuesto. Aquí las entidades curvas del lote se agrupan
 * por (tipo × pasos) —y «pasos» es exactamente el escalón de LOD que ya
 * resolvió `cadRenderSegmentBudget`, así que en la práctica hay tres grupos por
 * tipo como mucho— y cada grupo cruza UNA vez con un `Float64Array` plano de
 * ida y otro de vuelta.
 *
 * La spline es la excepción y conviene decir por qué: la ABI v1 del binario no
 * tiene entrada de lote para splines porque cada una trae su vector de nudos de
 * longitud propia, y un lote de longitudes variables necesita un descriptor que
 * la ABI no declara. Así que la spline cruza una vez por curva. No se toca el
 * crate para arreglarlo en este entregable: el binario comprometido reproduce
 * byte a byte y romper su ABI es otra campaña.
 *
 * ## Todo lo demás sigue por los adaptadores, y eso es a propósito
 *
 * Línea, polilínea, sombreado, cota, directriz, INSERT, texto, muro, hueco,
 * sólido: el registro de adaptadores sigue siendo la única fuente de verdad
 * sobre su forma. Sólo se desvían las cuatro primitivas que el kernel sabe
 * hacer —arco, círculo, elipse y spline— y se desvían produciendo EXACTAMENTE
 * los mismos puntos, no unos parecidos: el motor JavaScript del kernel delega
 * en `curve-tessellate.ts`, que es el mismo teselador que los adaptadores
 * llaman. La paridad punto a punto no es una aspiración del spec, es una
 * consecuencia de no haber escrito una segunda implementación.
 *
 * ## Por qué el kernel se INYECTA y por defecto es el de JavaScript
 *
 * `createCadCurveKernel` es asíncrono porque `WebAssembly.instantiate` lo es, y
 * el teselado del pipeline es síncrono de arriba abajo: el planificador reparte
 * trozos de 4 ms y no tiene dónde esperar una promesa. Si este módulo cargara
 * el binario por su cuenta, o el pipeline se volvía asíncrono o el primer lote
 * de cada sesión salía por un camino distinto del resto. Así que el kernel por
 * defecto es el motor JavaScript —síncrono, disponible siempre, idéntico al
 * teselador de hoy— y el binario se INSTALA cuando ya está listo, desde el
 * worker de teselado (ver `tessellate.worker.ts`), que es el camino por el que
 * el navegador tesela de verdad.
 *
 * ## Una divergencia que hay que decir en voz alta
 *
 * Con el motor wasm instalado, arcos y elipses NO son bit-idénticos al motor
 * JavaScript: las funciones trascendentes de Rust y las de V8 no tienen por qué
 * redondear igual. El artefacto `docs/cad/evidence/wasm-parity.json` publica la
 * desviación medida (relativa, del orden de 1e-16) y el spec de paridad del
 * kernel la vigila en cada corrida. La spline sí coincide bit a bit, porque no
 * usa trascendentes. Esa diferencia no produce costuras en el dibujo porque la
 * caché guarda UNA teselación por (entidad × escalón): una entidad concreta
 * sale entera del motor que la calculó, nunca mitad de cada uno.
 */
import { normalizeArcSweepDegrees } from "../arc-sweep";
import type { CadDocument } from "../cad-document";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../entity-runtime";
import {
  CAD_ARC_STRIDE,
  CAD_ELLIPSE_STRIDE,
  CAD_CURVE_KERNEL_URL,
  createCadCurveKernelJs,
  loadCadCurveKernelFromUrl,
  type CadCurveKernel,
} from "../wasm/curve-kernel";
import { CAD_RENDER_ORIGIN_ZERO, type CadRenderOrigin } from "./render-origin";
// SÓLO el tipo: `import type` se borra al compilar, así que el worker puede
// importar de aquí un VALOR sin cerrar un ciclo de carga.
import type { CadTessellatedEntityPayload } from "./tessellate.worker";

/** Las cuatro primitivas que el kernel sabe teselar. */
export type CadCurveKernelRoute = "arc" | "ellipse" | "spline";

/**
 * Qué carril le toca a una entidad: el del kernel, o `null` para el de
 * adaptadores de siempre.
 *
 * El CÍRCULO viaja por el carril de arcos porque su adaptador es literalmente
 * `tessellateArc(centro, radio, 0, 360)`: en el kernel es un arco de barrido
 * completo, no un caso aparte.
 */
export function cadCurveKernelRouteFor(
  entity: CadNativeEntity,
): CadCurveKernelRoute | null {
  switch (entity.type) {
    case "arc":
    case "circle":
      return "arc";
    case "ellipse":
      return "ellipse";
    case "spline":
      return "spline";
    default:
      return null;
  }
}

/** Reparto real de un lote. El benchmark y los specs lo publican sin adornar. */
export interface CadCurveKernelBatchStats {
  /** Motor que sirvió el lote. */
  backend: CadCurveKernel["backend"];
  /** Por qué NO es wasm, o `null` si sí lo es. */
  fallbackReason: string | null;
  /** Entidades que salieron del kernel. */
  kernelEntities: number;
  /** Entidades que fueron por el registro de adaptadores. */
  adapterEntities: number;
  /** Cruces de frontera: uno por (tipo × pasos) en arcos y elipses, uno por spline. */
  kernelCalls: number;
}

export interface CadCurveKernelBatchResult {
  results: CadTessellatedEntityPayload[];
  transfer: ArrayBufferLike[];
  stats: CadCurveKernelBatchStats;
}

// ---------------------------------------------------------------------------
// El kernel del render: uno por hilo, inyectable, perezoso
// ---------------------------------------------------------------------------

let renderKernel: CadCurveKernel | null = null;

/**
 * El kernel vigente. Perezoso: el motor JavaScript no cuesta nada construirlo,
 * pero construirlo en la carga del módulo obligaría a cada consumidor de
 * `render/` a arrastrar el teselador aunque no tesele una sola curva.
 */
export function getCadRenderCurveKernel(): CadCurveKernel {
  if (!renderKernel)
    renderKernel = createCadCurveKernelJs(
      "el binario aún no se ha calentado en este hilo",
    );
  return renderKernel;
}

/**
 * Instala un kernel (o lo devuelve al motor JavaScript con `null`).
 *
 * NO es sólo API de pruebas: es la puerta por la que el worker instala el
 * binario cuando termina de bajarlo. Que los specs la usen también para
 * ejercitar el motor wasm en Node es un efecto secundario deseable.
 */
export function setCadRenderCurveKernel(kernel: CadCurveKernel | null): void {
  if (renderKernel && renderKernel !== kernel) renderKernel.dispose();
  renderKernel = kernel;
}

/**
 * Baja el binario e instala el kernel resultante.
 *
 * NUNCA lanza y NUNCA deja el render sin teselador: `loadCadCurveKernelFromUrl`
 * ya devuelve el motor JavaScript con su motivo cuando el binario no sirve, y
 * ese motivo se instala igual para que `getCadRenderCurveKernel().fallbackReason`
 * pueda contarlo en vez de que el fallo desaparezca en silencio.
 */
export async function warmCadRenderCurveKernel(
  url: string = CAD_CURVE_KERNEL_URL,
): Promise<CadCurveKernel> {
  const kernel = await loadCadCurveKernelFromUrl(url);
  setCadRenderCurveKernel(kernel);
  return kernel;
}

// ---------------------------------------------------------------------------
// Agrupado por (tipo × pasos)
// ---------------------------------------------------------------------------

/**
 * Pasos efectivos de una entidad del lote. Es EXACTAMENTE la expresión que el
 * núcleo del worker aplicaba antes de llamar al adaptador; si divergiera, el
 * carril del kernel pediría otro detalle y la paridad dejaría de ser paridad.
 */
function stepsFor(segments: readonly number[], index: number): number {
  return Math.max(2, Math.floor(segments[index] ?? 32));
}

interface KernelGroup {
  /** Curvas del grupo. Se cuenta en la primera pasada y se llena en la segunda. */
  count: number;
  cursor: number;
  input: Float64Array;
  /** Posición de salida de cada curva, en el orden de entrada. */
  slots: Int32Array;
  /** Id de la entidad de cada curva: la salida del kernel no lo trae de vuelta. */
  ids: string[];
  /** Bandera de cierre de cada curva: la decide el tipo, no el kernel. */
  closed: Uint8Array;
}

function group(count: number, stride: number): KernelGroup {
  return {
    count,
    cursor: 0,
    input: new Float64Array(count * stride),
    slots: new Int32Array(count),
    ids: new Array<string>(count),
    closed: new Uint8Array(count),
  };
}

/** ¿Cierra la elipse? Misma regla que `ellipseRenderer` en los adaptadores. */
function ellipseIsClosed(startParameter: number, endParameter: number): boolean {
  return normalizeArcSweepDegrees(startParameter, endParameter) >= 360 - 1e-7;
}

/**
 * Teselado de un lote con el kernel de curvas para lo que sabe hacer y con el
 * registro de adaptadores para todo lo demás.
 *
 * Devuelve los resultados en el MISMO orden de entrada y con la misma regla de
 * omisión que el núcleo del worker: una entidad que el registro nativo no
 * reclama no aparece, y un camino con menos de dos puntos no se emite. Quien
 * llama casa por posición o por `entityId`, y las dos cosas siguen valiendo.
 *
 * El origen flotante se resta en `double` ANTES de escribir el `Float32Array`,
 * igual que en los dos caminos que ya existían: es el punto donde de verdad se
 * pierde precisión con coordenadas grandes.
 */
export function tessellateCadEntitiesWithCurveKernel(
  entities: readonly CadNativeEntity[],
  segments: readonly number[],
  document?: CadDocument,
  origin: CadRenderOrigin = CAD_RENDER_ORIGIN_ZERO,
  kernel: CadCurveKernel = getCadRenderCurveKernel(),
): CadCurveKernelBatchResult {
  // ---- Pasada 1: contar. Igual que `packBatch` en el kernel, se recorre dos
  // veces en lugar de crecer arrays: a 100.000 entidades el realojo repetido de
  // un `Float64Array` domina el tiempo y falsearía la medida contra el carril
  // de adaptadores, que no realoja nada.
  const arcCounts = new Map<number, number>();
  const ellipseCounts = new Map<number, number>();
  let accepted = 0;
  let kernelEntities = 0;
  let splineCalls = 0;
  for (let index = 0; index < entities.length; index += 1) {
    const entity = entities[index];
    if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
    accepted += 1;
    const route = cadCurveKernelRouteFor(entity);
    if (!route) continue;
    kernelEntities += 1;
    const steps = stepsFor(segments, index);
    if (route === "spline") {
      splineCalls += 1;
      continue;
    }
    const counts = route === "arc" ? arcCounts : ellipseCounts;
    counts.set(steps, (counts.get(steps) ?? 0) + 1);
  }

  const results: CadTessellatedEntityPayload[] = new Array(accepted);
  const transfer: ArrayBufferLike[] = [];
  const arcGroups = new Map<number, KernelGroup>();
  for (const [steps, count] of arcCounts)
    arcGroups.set(steps, group(count, CAD_ARC_STRIDE));
  const ellipseGroups = new Map<number, KernelGroup>();
  for (const [steps, count] of ellipseCounts)
    ellipseGroups.set(steps, group(count, CAD_ELLIPSE_STRIDE));

  // ---- Pasada 2: llenar los búferes del kernel y resolver por adaptador todo
  // lo que no es curva. La spline cruza aquí mismo, curva a curva, porque la
  // ABI v1 no tiene lote para ella (ver cabecera).
  let slot = 0;
  for (let index = 0; index < entities.length; index += 1) {
    const entity = entities[index];
    if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
    const current = slot;
    slot += 1;
    // Se conmuta sobre el TIPO y no sobre el carril: es la misma decisión que
    // `cadCurveKernelRouteFor` tomó en la primera pasada —el `switch` es el
    // mismo— y además le da a TypeScript el estrechamiento que hace falta para
    // leer los campos. Si las dos pasadas clasificaran distinto, un grupo
    // quedaría a medio llenar y `scatter` escribiría en la posición 0.
    switch (entity.type) {
      case "arc":
      case "circle": {
        const bucket = arcGroups.get(stepsFor(segments, index))!;
        const base = bucket.cursor * CAD_ARC_STRIDE;
        bucket.input[base] = entity.center.x;
        bucket.input[base + 1] = entity.center.y;
        bucket.input[base + 2] = entity.radius;
        bucket.input[base + 3] = entity.type === "circle" ? 0 : entity.startAngle;
        bucket.input[base + 4] = entity.type === "circle" ? 360 : entity.endAngle;
        bucket.slots[bucket.cursor] = current;
        bucket.ids[bucket.cursor] = entity.id;
        // El círculo cierra siempre; el arco nunca. Es lo que dicen sus dos
        // adaptadores, y el kernel no tiene forma de saberlo: devuelve puntos.
        bucket.closed[bucket.cursor] = entity.type === "circle" ? 1 : 0;
        bucket.cursor += 1;
        // El resultado se escribe cuando el grupo entero cruce; hasta entonces
        // la posición queda apuntada y nada más.
        break;
      }
      case "ellipse": {
        const bucket = ellipseGroups.get(stepsFor(segments, index))!;
        const base = bucket.cursor * CAD_ELLIPSE_STRIDE;
        bucket.input[base] = entity.center.x;
        bucket.input[base + 1] = entity.center.y;
        bucket.input[base + 2] = entity.majorAxis.x;
        bucket.input[base + 3] = entity.majorAxis.y;
        bucket.input[base + 4] = entity.ratio;
        bucket.input[base + 5] = entity.startParameter;
        bucket.input[base + 6] = entity.endParameter;
        bucket.slots[bucket.cursor] = current;
        bucket.ids[bucket.cursor] = entity.id;
        bucket.closed[bucket.cursor] = ellipseIsClosed(
          entity.startParameter,
          entity.endParameter,
        )
          ? 1
          : 0;
        bucket.cursor += 1;
        break;
      }
      case "spline":
        results[current] = splineViaKernel(
          entity,
          stepsFor(segments, index),
          origin,
          kernel,
          transfer,
        );
        break;
      default:
        results[current] = viaAdapter(
          entity,
          segments[index],
          document,
          origin,
          transfer,
        );
    }
  }

  // ---- Los cruces de lote. Uno por grupo, y cada uno devuelve las cuentas por
  // curva más los puntos concatenados: hay que recorrer la salida con un cursor
  // propio, no reindexar.
  let kernelCalls = splineCalls;
  for (const [steps, bucket] of arcGroups) {
    kernelCalls += 1;
    const batch = kernel.tessellateArcs(bucket.input, bucket.count, steps);
    scatter(batch.counts, batch.points, bucket, results, origin, transfer);
  }
  for (const [steps, bucket] of ellipseGroups) {
    kernelCalls += 1;
    const batch = kernel.tessellateEllipses(bucket.input, bucket.count, steps);
    scatter(batch.counts, batch.points, bucket, results, origin, transfer);
  }

  return {
    results,
    transfer,
    stats: {
      backend: kernel.backend,
      fallbackReason: kernel.fallbackReason,
      kernelEntities,
      adapterEntities: accepted - kernelEntities,
      kernelCalls,
    },
  };
}

/**
 * Reparte la salida plana de un lote a las posiciones que la pidieron.
 *
 * `counts[i]` son los PUNTOS de la curva `i` y `points` los lleva concatenados:
 * el cursor avanza `2 · counts[i]` por curva. Una curva degenerada trae cero
 * puntos —radio no positivo, eje mayor nulo, ángulos no finitos— y se emite sin
 * caminos, que es exactamente lo que el carril de adaptadores hace cuando el
 * teselador devuelve vacío.
 */
function scatter(
  counts: Uint32Array,
  points: Float64Array,
  bucket: KernelGroup,
  results: CadTessellatedEntityPayload[],
  origin: CadRenderOrigin,
  transfer: ArrayBufferLike[],
): void {
  let cursor = 0;
  for (let curve = 0; curve < bucket.count; curve += 1) {
    const pointCount = counts[curve];
    const target = bucket.slots[curve];
    const entityId = bucket.ids[curve];
    if (pointCount < 2) {
      cursor += pointCount * 2;
      results[target] = { entityId, paths: [], closed: [] };
      continue;
    }
    const xy = new Float32Array(pointCount * 2);
    for (let point = 0; point < pointCount; point += 1) {
      // La resta en `double`, antes del `Float32Array`: misma técnica y mismo
      // motivo que en `tessellation-cache.ts` y en el núcleo del worker.
      xy[point * 2] = points[cursor + point * 2] - origin.x;
      xy[point * 2 + 1] = points[cursor + point * 2 + 1] - origin.y;
    }
    cursor += pointCount * 2;
    transfer.push(xy.buffer);
    results[target] = {
      entityId,
      paths: [xy],
      closed: [bucket.closed[curve] === 1],
    };
  }
}

/** Una spline por llamada: la ABI v1 no tiene lote para nudos de longitud libre. */
function splineViaKernel(
  entity: Extract<CadNativeEntity, { type: "spline" }>,
  steps: number,
  origin: CadRenderOrigin,
  kernel: CadCurveKernel,
  transfer: ArrayBufferLike[],
): CadTessellatedEntityPayload {
  const control = new Float64Array(entity.controlPoints.length * 2);
  for (let index = 0; index < entity.controlPoints.length; index += 1) {
    control[index * 2] = entity.controlPoints[index].x;
    control[index * 2 + 1] = entity.controlPoints[index].y;
  }
  // Un vector de nudos VACÍO se manda como «no hay nudos» y no como un array de
  // longitud cero: `tessellateSpline` sintetiza clamped en los dos casos —así
  // que la geometría es la misma— pero el motor wasm pediría una reserva de
  // cero bytes, y `valle_alloc(0)` devuelve el puntero nulo, que su envoltorio
  // trata como fallo de reserva. Misma salida, sin el error inventado.
  const knots =
    entity.knots && entity.knots.length > 0 ? Float64Array.from(entity.knots) : null;
  const flat = kernel.tessellateSpline(control, entity.degree, knots, steps);
  const pointCount = flat.length / 2;
  if (pointCount < 2) return { entityId: entity.id, paths: [], closed: [] };
  const xy = new Float32Array(flat.length);
  for (let point = 0; point < pointCount; point += 1) {
    xy[point * 2] = flat[point * 2] - origin.x;
    xy[point * 2 + 1] = flat[point * 2 + 1] - origin.y;
  }
  transfer.push(xy.buffer);
  return { entityId: entity.id, paths: [xy], closed: [entity.closed === true] };
}

/**
 * El carril de siempre: el registro de adaptadores. Es el cuerpo que tenía el
 * núcleo del worker, movido aquí para que haya UNA sola copia de la regla de
 * empaquetado (omitir caminos de menos de dos puntos, restar el origen, ceder
 * el búfer) y no dos que puedan desviarse.
 */
function viaAdapter(
  entity: CadNativeEntity,
  segments: number | undefined,
  document: CadDocument | undefined,
  origin: CadRenderOrigin,
  transfer: ArrayBufferLike[],
): CadTessellatedEntityPayload {
  const paths: Float32Array[] = [];
  const closed: boolean[] = [];
  for (const path of CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(
    entity,
    Math.max(2, Math.floor(segments ?? 32)),
    document,
  )) {
    if (path.points.length < 2) continue;
    const xy = new Float32Array(path.points.length * 2);
    for (let point = 0; point < path.points.length; point += 1) {
      xy[point * 2] = path.points[point].x - origin.x;
      xy[point * 2 + 1] = path.points[point].y - origin.y;
    }
    paths.push(xy);
    closed.push(path.closed);
    transfer.push(xy.buffer);
  }
  return { entityId: entity.id, paths, closed };
}
