/**
 * Kernel de teselado de curvas con dos motores intercambiables: WebAssembly y
 * JavaScript.
 *
 * ## Qué problema resuelve
 *
 * Teselar es convertir arcos, elipses y splines en cadenas de puntos, y es lo
 * que el pipeline hace millones de veces al replanificar un plano denso. Es un
 * bucle numérico puro, sin DOM y sin objetos: el candidato natural para un
 * núcleo compilado. Este módulo lo encapsula detrás de UNA interfaz para que el
 * resto del producto no sepa —ni tenga que saber— cuál de los dos motores está
 * corriendo.
 *
 * ## Por qué la interfaz habla de LOTES y de `Float64Array`
 *
 * Porque la frontera JS↔wasm se paga por llamada y por copia. Teselar un arco
 * cuesta microsegundos; cruzar la frontera para pedirlo cuesta un orden de
 * magnitud parecido, así que un kernel «por arco» no sería una optimización,
 * sería un impuesto. El contrato es por tanto: un `Float64Array` plano de
 * entrada, una llamada, un `Float64Array` plano de salida. El motor JavaScript
 * respeta el MISMO contrato aunque no lo necesite, porque si cada motor
 * devolviera su forma preferida la comparación de paridad estaría comparando
 * dos empaquetados y no dos matemáticas.
 *
 * ## Por qué el motor JavaScript no reimplementa nada
 *
 * Delega en `curve-tessellate.ts`, que es el teselador que el producto ya usa.
 * Si aquí se escribiera una segunda versión «de referencia», la paridad
 * mediría el parecido entre dos copias mías y no entre el kernel compilado y el
 * producto. La referencia tiene que ser el código que se ejecuta hoy.
 *
 * ## Fallo cerrado
 *
 * El binario puede faltar, llegar corrupto, declarar otra ABI o quedarse sin
 * memoria. Ninguno de esos casos debe romper el editor: `createCadCurveKernel`
 * SIEMPRE devuelve un kernel utilizable, y cuando no puede ser el de wasm
 * devuelve el de JavaScript con `fallbackReason` explicando por qué. Lo que sí
 * es un error tipado y explícito es que el kernel de wasm ya cargado se
 * comporte mal en marcha —capacidad insuficiente, código de error—, porque eso
 * no es una degradación aceptable sino un defecto que hay que ver.
 */
import { normalizeArcSweepDegrees } from "../arc-sweep";
import {
  tessellateArc,
  tessellateEllipse,
  tessellateSpline,
} from "../curve-tessellate";

/** ABI que este código sabe hablar. Ver `crates/valle-cad-kernel/src/lib.rs`. */
export const CAD_CURVE_KERNEL_ABI = 1;

/** Ruta pública desde la que el navegador sirve el binario. */
export const CAD_CURVE_KERNEL_URL = "/wasm/valle-cad-kernel.wasm";

/** `f64` por arco en el búfer de entrada: cx, cy, r, inicio°, fin°. */
export const CAD_ARC_STRIDE = 5;
/** `f64` por elipse: cx, cy, mx, my, razón, inicio°, fin°. */
export const CAD_ELLIPSE_STRIDE = 7;

/** Códigos de error de la ABI, en el mismo orden que el crate. */
const KERNEL_ERRORS: Record<number, string> = {
  [-1]: "argumentos que el kernel no puede honrar",
  [-2]: "la salida no cabe en la capacidad ofrecida",
  [-3]: "el asignador de la memoria lineal no pudo crecer",
};

/**
 * Defecto del kernel ya cargado. NO se usa para «no había binario»: eso es una
 * degradación prevista y se resuelve con el motor JavaScript.
 */
export class CadCurveKernelError extends Error {
  constructor(
    readonly operation: string,
    readonly code: number,
  ) {
    super(
      `kernel de curvas: ${operation} devolvió ${code} — ${
        KERNEL_ERRORS[code] ?? "código desconocido"
      }`,
    );
    this.name = "CadCurveKernelError";
  }
}

/** Salida de un lote: cuántos puntos trajo cada curva, y los puntos. */
export interface CadCurveBatch {
  /** Puntos por curva, en el orden de entrada. */
  counts: Uint32Array;
  /** Pares `x, y` concatenados. Longitud = 2 · Σ counts. */
  points: Float64Array;
}

export interface CadCurveKernel {
  readonly backend: "wasm" | "javascript";
  /** ABI del binario cargado, o `null` con el motor JavaScript. */
  readonly abi: number | null;
  /** Por qué NO se está usando wasm. `null` cuando sí se está usando. */
  readonly fallbackReason: string | null;
  tessellateArcs(input: Float64Array, count: number, steps: number): CadCurveBatch;
  tessellateEllipses(input: Float64Array, count: number, steps: number): CadCurveBatch;
  tessellateSpline(
    control: Float64Array,
    degree: number,
    knots: Float64Array | null,
    steps: number,
  ): Float64Array;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Motor JavaScript
// ---------------------------------------------------------------------------

/**
 * Empaqueta una lista de cadenas de puntos en el formato plano del contrato.
 *
 * Se recorre dos veces —una para contar y otra para copiar— en lugar de crecer
 * un array: a 100.000 curvas el realojo repetido de un `Float64Array` domina el
 * tiempo del motor JavaScript y falsearía la comparación en su contra.
 */
function packBatch(curves: { x: number; y: number }[][]): CadCurveBatch {
  const counts = new Uint32Array(curves.length);
  let total = 0;
  for (let curve = 0; curve < curves.length; curve += 1) {
    counts[curve] = curves[curve].length;
    total += curves[curve].length;
  }
  const points = new Float64Array(total * 2);
  let cursor = 0;
  for (const curve of curves) {
    for (const point of curve) {
      points[cursor] = point.x;
      points[cursor + 1] = point.y;
      cursor += 2;
    }
  }
  return { counts, points };
}

/** Motor de referencia: el teselador que el producto ya ejecuta hoy. */
export function createCadCurveKernelJs(fallbackReason: string | null): CadCurveKernel {
  return {
    backend: "javascript",
    abi: null,
    fallbackReason,
    tessellateArcs(input, count, steps) {
      const curves: { x: number; y: number }[][] = [];
      for (let curve = 0; curve < count; curve += 1) {
        const base = curve * CAD_ARC_STRIDE;
        curves.push(
          tessellateArc(
            { x: input[base], y: input[base + 1] },
            input[base + 2],
            input[base + 3],
            input[base + 4],
            steps,
          ),
        );
      }
      return packBatch(curves);
    },
    tessellateEllipses(input, count, steps) {
      const curves: { x: number; y: number }[][] = [];
      for (let curve = 0; curve < count; curve += 1) {
        const base = curve * CAD_ELLIPSE_STRIDE;
        curves.push(
          tessellateEllipse(
            { x: input[base], y: input[base + 1] },
            { x: input[base + 2], y: input[base + 3] },
            input[base + 4],
            input[base + 5],
            input[base + 6],
            steps,
          ),
        );
      }
      return packBatch(curves);
    },
    tessellateSpline(control, degree, knots, steps) {
      const points: { x: number; y: number }[] = [];
      for (let index = 0; index < control.length; index += 2)
        points.push({ x: control[index], y: control[index + 1] });
      const curve = tessellateSpline(
        points,
        degree,
        knots ? Array.from(knots) : undefined,
        steps,
      );
      const flat = new Float64Array(curve.length * 2);
      for (let index = 0; index < curve.length; index += 1) {
        flat[index * 2] = curve[index].x;
        flat[index * 2 + 1] = curve[index].y;
      }
      return flat;
    },
    dispose() {
      /* nada que liberar */
    },
  };
}

// ---------------------------------------------------------------------------
// Motor WebAssembly
// ---------------------------------------------------------------------------

interface KernelExports {
  memory: WebAssembly.Memory;
  valle_kernel_abi(): number;
  valle_alloc(len: number): number;
  valle_free(ptr: number, len: number): void;
  valle_tessellate_arcs(
    inPtr: number,
    count: number,
    steps: number,
    countsPtr: number,
    outPtr: number,
    outCap: number,
  ): number;
  valle_tessellate_ellipses(
    inPtr: number,
    count: number,
    steps: number,
    countsPtr: number,
    outPtr: number,
    outCap: number,
  ): number;
  valle_tessellate_spline(
    ctrlPtr: number,
    ctrlCount: number,
    degree: number,
    knotsPtr: number,
    knotsCount: number,
    steps: number,
    outPtr: number,
    outCap: number,
  ): number;
}

const REQUIRED_EXPORTS = [
  "memory",
  "valle_kernel_abi",
  "valle_alloc",
  "valle_free",
  "valle_tessellate_arcs",
  "valle_tessellate_ellipses",
  "valle_tessellate_spline",
] as const;

/**
 * Cuántos puntos produce un barrido, con la MISMA cuenta que el kernel.
 *
 * No es una cota generosa sino el número exacto, y por eso el barrido se
 * normaliza aquí igual que allí: un arco cuyos ángulos declaran más de una
 * vuelta —los hay en archivos importados— produce MÁS de `steps + 1` puntos, y
 * una capacidad calculada con la cota ingenua lo habría rechazado con
 * `ERR_CAPACITY` culpando al kernel de un error del llamador.
 */
function sweepPoints(startDeg: number, endDeg: number, steps: number): number {
  // Misma normalización que el crate (`normalized_sweep`): no finito → cero
  // puntos; negativo → módulo con signo; positivo → tope, nunca un bucle.
  const sweep = normalizeArcSweepDegrees(startDeg, endDeg);
  if (Number.isNaN(sweep)) return 0;
  return Math.max(2, Math.ceil((sweep / 360) * steps)) + 1;
}

/** Capacidad exacta de un lote, sumando curva a curva. */
function batchCapacity(
  input: Float64Array,
  count: number,
  stride: number,
  steps: number,
): number {
  if (steps < 1) return 0;
  let total = 0;
  for (let curve = 0; curve < count; curve += 1) {
    const base = curve * stride;
    total += sweepPoints(input[base + stride - 2], input[base + stride - 1], steps);
  }
  return total * 2;
}

/**
 * Envoltorio del binario. Mantiene las reservas VIVAS entre llamadas y sólo
 * crece cuando hace falta: `valle_alloc` puede hacer crecer la memoria lineal,
 * y cada crecimiento invalida las vistas tipadas que JavaScript tenga abiertas
 * sobre ella. Reservar una vez y reutilizar evita ese baile en el bucle
 * caliente, que es donde el kernel tiene que ganar.
 */
class WasmCurveKernel implements CadCurveKernel {
  readonly backend = "wasm" as const;
  readonly abi: number;
  readonly fallbackReason = null;
  private inPtr = 0;
  private inBytes = 0;
  private countsPtr = 0;
  private countsBytes = 0;
  private outPtr = 0;
  private outBytes = 0;
  private disposed = false;

  constructor(private readonly exports: KernelExports) {
    this.abi = exports.valle_kernel_abi();
  }

  /** Reserva perezosa y monótona: nunca encoge, para no realojar en el bucle. */
  private ensure(field: "in" | "counts" | "out", bytes: number): number {
    const ptrKey = `${field}Ptr` as "inPtr" | "countsPtr" | "outPtr";
    const bytesKey = `${field}Bytes` as "inBytes" | "countsBytes" | "outBytes";
    if (this[bytesKey] >= bytes && this[ptrKey] !== 0) return this[ptrKey];
    if (this[ptrKey] !== 0) this.exports.valle_free(this[ptrKey], this[bytesKey]);
    const ptr = this.exports.valle_alloc(bytes);
    if (ptr === 0) {
      this[ptrKey] = 0;
      this[bytesKey] = 0;
      throw new CadCurveKernelError(`reserva de ${bytes} bytes`, -3);
    }
    this[ptrKey] = ptr;
    this[bytesKey] = bytes;
    return ptr;
  }

  private assertLive(): void {
    if (this.disposed)
      throw new CadCurveKernelError("uso de un kernel ya liberado", -1);
  }

  private batch(
    operation: "arcs" | "ellipses",
    input: Float64Array,
    count: number,
    steps: number,
  ): CadCurveBatch {
    this.assertLive();
    if (count === 0) return { counts: new Uint32Array(0), points: new Float64Array(0) };
    const stride = operation === "arcs" ? CAD_ARC_STRIDE : CAD_ELLIPSE_STRIDE;
    const capacity = batchCapacity(input, count, stride, steps);
    const inPtr = this.ensure("in", count * stride * 8);
    const countsPtr = this.ensure("counts", count * 4);
    // Un lote entero de curvas degeneradas da capacidad cero, y `valle_alloc(0)`
    // devuelve el puntero nulo: se pide un `f64` para que el puntero siga siendo
    // válido y el kernel escriba cero en todas las cuentas, que es la respuesta
    // correcta y no un error.
    const outPtr = this.ensure("out", Math.max(capacity, 1) * 8);
    // Las vistas se crean DESPUÉS de las tres reservas: cualquiera de ellas
    // pudo hacer crecer la memoria y desprender un búfer creado antes.
    const buffer = this.exports.memory.buffer;
    new Float64Array(buffer, inPtr, count * stride).set(
      input.subarray(0, count * stride),
    );
    const written =
      operation === "arcs"
        ? this.exports.valle_tessellate_arcs(inPtr, count, steps, countsPtr, outPtr, capacity)
        : this.exports.valle_tessellate_ellipses(inPtr, count, steps, countsPtr, outPtr, capacity);
    if (written < 0) throw new CadCurveKernelError(`teselado de ${operation}`, written);
    const live = this.exports.memory.buffer;
    return {
      counts: new Uint32Array(live, countsPtr, count).slice(),
      points: new Float64Array(live, outPtr, written).slice(),
    };
  }

  tessellateArcs(input: Float64Array, count: number, steps: number): CadCurveBatch {
    return this.batch("arcs", input, count, steps);
  }

  tessellateEllipses(input: Float64Array, count: number, steps: number): CadCurveBatch {
    return this.batch("ellipses", input, count, steps);
  }

  tessellateSpline(
    control: Float64Array,
    degree: number,
    knots: Float64Array | null,
    steps: number,
  ): Float64Array {
    this.assertLive();
    const controlCount = control.length / 2;
    if (controlCount < 2 || steps < 1) return new Float64Array(0);
    const capacity = (steps + 1) * 2;
    // La spline usa el búfer de entrada para los puntos de control y el de
    // cuentas para los nudos: no hay lote, así que no compiten entre sí.
    const ctrlPtr = this.ensure("in", control.length * 8);
    const knotsBytes = knots ? knots.length * 8 : 8;
    const knotsPtr = this.ensure("counts", knotsBytes);
    const outPtr = this.ensure("out", capacity * 8);
    const buffer = this.exports.memory.buffer;
    new Float64Array(buffer, ctrlPtr, control.length).set(control);
    if (knots) new Float64Array(buffer, knotsPtr, knots.length).set(knots);
    const written = this.exports.valle_tessellate_spline(
      ctrlPtr,
      controlCount,
      degree,
      knots ? knotsPtr : 0,
      knots ? knots.length : 0,
      steps,
      outPtr,
      capacity,
    );
    if (written < 0) throw new CadCurveKernelError("teselado de spline", written);
    return new Float64Array(this.exports.memory.buffer, outPtr, written).slice();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.inPtr !== 0) this.exports.valle_free(this.inPtr, this.inBytes);
    if (this.countsPtr !== 0) this.exports.valle_free(this.countsPtr, this.countsBytes);
    if (this.outPtr !== 0) this.exports.valle_free(this.outPtr, this.outBytes);
    this.inPtr = this.countsPtr = this.outPtr = 0;
  }
}

/**
 * Construye el kernel. NUNCA lanza: si el binario no sirve, devuelve el motor
 * JavaScript con el motivo dentro.
 *
 * Las cuatro razones por las que puede caer al motor JavaScript están
 * enumeradas a propósito, y las cuatro se han provocado en el spec de fallback:
 * sin bytes, bytes que no son un módulo válido, módulo sin los exports del
 * contrato, y módulo con otra ABI. Un fallback que sólo se ha probado con el
 * caso «no había archivo» no es un fallback probado.
 */
export async function createCadCurveKernel(
  bytes: BufferSource | null,
  missingReason = "no se proporcionó el binario del kernel",
): Promise<CadCurveKernel> {
  if (!bytes) return createCadCurveKernelJs(missingReason);
  let instance: WebAssembly.Instance;
  try {
    ({ instance } = await WebAssembly.instantiate(bytes, {}));
  } catch (error) {
    return createCadCurveKernelJs(
      `el binario no instanció: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const exports = instance.exports as unknown as KernelExports;
  const missing = REQUIRED_EXPORTS.filter(
    (name) => typeof (exports as unknown as Record<string, unknown>)[name] === "undefined",
  );
  if (missing.length > 0)
    return createCadCurveKernelJs(`al binario le faltan exports: ${missing.join(", ")}`);
  let abi: number;
  try {
    abi = exports.valle_kernel_abi();
  } catch (error) {
    return createCadCurveKernelJs(
      `el binario no responde a valle_kernel_abi: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (abi !== CAD_CURVE_KERNEL_ABI)
    return createCadCurveKernelJs(
      `ABI ${abi} del binario ≠ ${CAD_CURVE_KERNEL_ABI} que este código sabe hablar`,
    );
  return new WasmCurveKernel(exports);
}

/**
 * Carga el binario desde la red del navegador. Cualquier fallo —404, red
 * caída, MIME equivocado— acaba en el motor JavaScript, que es exactamente lo
 * que el producto debe hacer: dibujar más despacio, nunca no dibujar.
 */
export async function loadCadCurveKernelFromUrl(
  url: string = CAD_CURVE_KERNEL_URL,
): Promise<CadCurveKernel> {
  try {
    const response = await fetch(url);
    if (!response.ok)
      return createCadCurveKernelJs(`${url} respondió ${response.status}`);
    return createCadCurveKernel(await response.arrayBuffer());
  } catch (error) {
    return createCadCurveKernelJs(
      `no se pudo descargar ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
