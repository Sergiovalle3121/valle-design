/**
 * Lotes de líneas instanciadas: UNA instancia por SEGMENTO.
 *
 * ## Qué sustituye
 *
 * El pipeline anterior creaba un `THREE.Line` por entidad. A 100.000 entidades
 * son 100.000 objetos de escena, 100.000 geometrías, 100.000 materiales y
 * 100.000 llamadas de dibujo: el navegador se pasa el cuadro entero en
 * contabilidad y ni siquiera llega a la GPU. Aquí un lote es un
 * `InstancedBufferGeometry` con un quad de cuatro vértices y N instancias, donde
 * N son todos los segmentos de un (tile × cubo de estilo).
 *
 * ## Por qué NO se usa `Line2` de three
 *
 * `Line2` resuelve la expansión del quad en el vertex shader, que es la técnica
 * correcta y la que se copia aquí. Pero crea **un objeto por polilínea**, que es
 * exactamente el problema del que venimos: cambiar 100.000 `THREE.Line` por
 * 100.000 `Line2` no arregla nada. Se toma la técnica, no la unidad de trabajo.
 *
 * ## Lo que habilita: LWT de verdad
 *
 * El grosor viaja por instancia en PÍXELES y el shader lo convierte a unidades
 * de dibujo con `worldPerPixel = 1 / pixelsPerUnit`. Eso es literalmente la
 * definición de lineweight: un grosor que no cambia al acercarse. Con
 * `THREE.LineBasicMaterial` era inalcanzable — `linewidth` se ignora en casi
 * todos los WebGL.
 *
 * ## El orden de dibujo viaja como profundidad
 *
 * `modelSpace.entityIds` decide qué tapa a qué; es semántica, no decoración.
 * Cada instancia lleva su profundidad NDC en `instanceStyle.w` y el shader la
 * escribe en `gl_Position.z`. Bajo cámara ortográfica el mapeo es lineal y w
 * vale 1, así que la asignación es exacta y gratis. Sin esto un sombreado
 * empieza a tapar la geometría que rellena y no se nota hasta que el dibujo es
 * grande.
 *
 * Este módulo es PURO: produce arrays tipados. El ensamblado THREE vive en
 * `line-batch-three.ts` para que todo lo de aquí se pueda probar en Node.
 */
import type { CadTessellation } from "./tessellation-cache";

/** Máximo de tipos de línea que el shader sabe descodificar. */
export const CAD_LINETYPE_SLOTS = 8;

/** Rango de profundidad NDC utilizable. No se llega a ±1 para dejar holgura. */
export const CAD_DRAW_ORDER_DEPTH_RANGE = 0.9;

export interface CadLineStyle {
  /** Color 0xRRGGBB. */
  color: number;
  /** Medio grosor en PÍXELES de pantalla. Invariante al zoom por definición. */
  halfWidthPx: number;
  /** Índice en la tabla de tipos de línea; 0 es continua. */
  linetypeIndex: number;
  /**
   * Capa de la que procede el lote. No la lee el shader: separa cubos para que
   * apagar una capa sea poner `visible = false` en unos pocos objetos en vez de
   * reconstruir la geometría, que es como se resuelve hoy en el overview.
   */
  layer: string;
}

export interface CadLineBatchItem {
  tessellation: CadTessellation;
  style: CadLineStyle;
  /** Profundidad NDC ya calculada con `cadDrawOrderDepth`. */
  depth: number;
}

export interface CadLineBatchArrays {
  /** 2 flotantes por instancia: origen del segmento en unidades de dibujo. */
  instanceStart: Float32Array;
  /** 2 flotantes por instancia: final del segmento. */
  instanceEnd: Float32Array;
  /** 4 flotantes: color empaquetado, medio grosor px, tipo de línea, profundidad. */
  instanceStyle: Float32Array;
  /** 2 flotantes: fase de guionado al inicio del segmento y su longitud. */
  instanceArc: Float32Array;
  instanceCount: number;
}

export interface CadLineBatch extends CadLineBatchArrays {
  bucketKey: string;
  style: CadLineStyle;
}

/**
 * Profundidad NDC de una posición del orden de dibujo.
 *
 * `orderIndex` 0 es lo que se dibuja PRIMERO (queda debajo) y `orderCount - 1`
 * lo último (queda encima). Bajo prueba de profundidad `LESS`, «encima» es
 * «menor z», así que la función es estrictamente DECRECIENTE.
 *
 * Resolución: con 100.000 posiciones el paso es 1,8e-5 en NDC, que en un búfer
 * de profundidad de 24 bits son ~150 escalones por posición. No hay riesgo de
 * que dos entidades consecutivas colapsen al mismo plano.
 */
export function cadDrawOrderDepth(orderIndex: number, orderCount: number): number {
  if (!(orderCount > 0)) return 0;
  const clamped = Math.min(Math.max(orderIndex, 0), orderCount - 1);
  const t = (clamped + 0.5) / orderCount;
  return CAD_DRAW_ORDER_DEPTH_RANGE * (1 - 2 * t);
}

/**
 * Empaqueta 0xRRGGBB en un flotante. Hasta 2^24 los enteros son exactos en
 * float32, así que 0xFFFFFF viaja sin pérdida y el shader lo desempaqueta con
 * dos divisiones.
 */
export function packCadColor(color: number): number {
  return Math.max(0, Math.min(0xff_ff_ff, Math.round(color)));
}

export function unpackCadColor(packed: number): { r: number; g: number; b: number } {
  const value = Math.max(0, Math.min(0xff_ff_ff, Math.round(packed)));
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

/**
 * Clave del cubo de estilo. Todo lo que comparte cubo cabe en una llamada de
 * dibujo; separar por color sería un desastre, y por eso el color viaja POR
 * INSTANCIA y no en el material. Lo que sí separa es lo que el shader no puede
 * variar por instancia sin perder correspondencia visual.
 */
export function cadLineStyleKey(style: CadLineStyle): string {
  return `${style.layer}|${packCadColor(style.color)}|${style.halfWidthPx}|${style.linetypeIndex}`;
}

/** Segmentos que aportará un teselado, para dimensionar los arrays sin realloc. */
export function cadTessellationSegmentCount(tessellation: CadTessellation): number {
  return tessellation.segmentCount;
}

/**
 * Constructor incremental de un lote. Reserva de una vez y escribe en sitio: no
 * hay arrays de JavaScript intermedios ni objetos por segmento, que a 100k
 * entidades serían millones de asignaciones por cuadro.
 */
export class CadLineBatchBuilder {
  private start: Float32Array;
  private end: Float32Array;
  private style: Float32Array;
  private arc: Float32Array;
  private count = 0;

  constructor(capacitySegments = 1_024) {
    const capacity = Math.max(1, Math.floor(capacitySegments));
    this.start = new Float32Array(capacity * 2);
    this.end = new Float32Array(capacity * 2);
    this.style = new Float32Array(capacity * 4);
    this.arc = new Float32Array(capacity * 2);
  }

  get instanceCount(): number {
    return this.count;
  }

  get capacity(): number {
    return this.start.length / 2;
  }

  private ensure(additional: number): void {
    const needed = this.count + additional;
    if (needed <= this.capacity) return;
    let capacity = Math.max(1, this.capacity);
    while (capacity < needed) capacity *= 2;
    const start = new Float32Array(capacity * 2);
    start.set(this.start.subarray(0, this.count * 2));
    const end = new Float32Array(capacity * 2);
    end.set(this.end.subarray(0, this.count * 2));
    const style = new Float32Array(capacity * 4);
    style.set(this.style.subarray(0, this.count * 4));
    const arc = new Float32Array(capacity * 2);
    arc.set(this.arc.subarray(0, this.count * 2));
    this.start = start;
    this.end = end;
    this.style = style;
    this.arc = arc;
  }

  /** Añade todos los segmentos de un teselado. Devuelve cuántos escribió. */
  push(item: CadLineBatchItem): number {
    const { tessellation, style, depth } = item;
    this.ensure(tessellation.segmentCount);
    const packedColor = packCadColor(style.color);
    const halfWidthPx = Math.max(0, style.halfWidthPx);
    const linetypeIndex = Math.max(
      0,
      Math.min(CAD_LINETYPE_SLOTS - 1, Math.floor(style.linetypeIndex)),
    );
    let written = 0;
    for (const path of tessellation.paths) {
      const points = path.xy.length / 2;
      if (points < 2) continue;
      const segments = points - 1 + (path.closed ? 1 : 0);
      // La fase de guionado es acumulativa a lo largo del recorrido: así un
      // guion no se reinicia en cada vértice y la polilínea se ve como una sola
      // línea discontinua, que es lo que dibuja un CAD.
      let phase = 0;
      for (let index = 0; index < segments; index += 1) {
        const from = index * 2;
        const to = ((index + 1) % points) * 2;
        const x0 = path.xy[from];
        const y0 = path.xy[from + 1];
        const x1 = path.xy[to];
        const y1 = path.xy[to + 1];
        const length = Math.hypot(x1 - x0, y1 - y0);
        const slot = this.count;
        this.start[slot * 2] = x0;
        this.start[slot * 2 + 1] = y0;
        this.end[slot * 2] = x1;
        this.end[slot * 2 + 1] = y1;
        this.style[slot * 4] = packedColor;
        this.style[slot * 4 + 1] = halfWidthPx;
        this.style[slot * 4 + 2] = linetypeIndex;
        this.style[slot * 4 + 3] = depth;
        this.arc[slot * 2] = phase;
        this.arc[slot * 2 + 1] = length;
        phase += length;
        this.count += 1;
        written += 1;
      }
    }
    return written;
  }

  /** Vistas ajustadas al contenido real: nada de subir capacidad muerta a la GPU. */
  build(): CadLineBatchArrays {
    return {
      instanceStart: this.start.subarray(0, this.count * 2),
      instanceEnd: this.end.subarray(0, this.count * 2),
      instanceStyle: this.style.subarray(0, this.count * 4),
      instanceArc: this.arc.subarray(0, this.count * 2),
      instanceCount: this.count,
    };
  }

  reset(): void {
    this.count = 0;
  }
}

/**
 * Agrupa un conjunto de entidades ya teseladas en lotes por cubo de estilo.
 * Devuelve los lotes ordenados por clave para que dos ejecuciones con la misma
 * entrada produzcan la misma salida — el benchmark compara hashes.
 */
export function buildCadLineBatches(
  items: readonly CadLineBatchItem[],
): CadLineBatch[] {
  const builders = new Map<string, { style: CadLineStyle; builder: CadLineBatchBuilder }>();
  for (const item of items) {
    if (item.tessellation.segmentCount === 0) continue;
    const key = cadLineStyleKey(item.style);
    let bucket = builders.get(key);
    if (!bucket) {
      bucket = {
        style: { ...item.style },
        builder: new CadLineBatchBuilder(Math.max(64, item.tessellation.segmentCount)),
      };
      builders.set(key, bucket);
    }
    bucket.builder.push(item);
  }
  return [...builders.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bucketKey, bucket]) => ({
      bucketKey,
      style: bucket.style,
      ...bucket.builder.build(),
    }))
    .filter((batch) => batch.instanceCount > 0);
}

export interface CadLineVertexInput {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  halfWidthPx: number;
  /** Posición a lo largo del segmento, 0 → origen, 1 → final. */
  along: number;
  /** Lado del quad, −1 o +1. */
  side: number;
  /** El zoom. `worldPerPixel` es su inverso. */
  pixelsPerUnit: number;
}

/**
 * Especificación EJECUTABLE de la expansión del quad que hace el vertex shader.
 *
 * El GLSL de `line-batch-three.ts` es una transcripción literal de esta función.
 * Existe porque un shader no se puede probar en Node y una fórmula sin prueba se
 * rompe en silencio: aquí se comprueba que el grosor sale exactamente en
 * píxeles y que no depende del zoom, que es la definición de lineweight y la
 * razón entera de escribir el shader.
 */
export function cadLineVertexWorldPosition(
  input: CadLineVertexInput,
): { x: number; y: number } {
  const deltaX = input.endX - input.startX;
  const deltaY = input.endY - input.startY;
  const length = Math.hypot(deltaX, deltaY);
  const unitX = length > 0 ? deltaX / length : 1;
  const unitY = length > 0 ? deltaY / length : 0;
  const halfWidthWorld =
    Math.max(input.halfWidthPx, 0.5) / Math.max(input.pixelsPerUnit, 1e-6);
  return {
    x: input.startX + deltaX * input.along + -unitY * input.side * halfWidthWorld,
    y: input.startY + deltaY * input.along + unitX * input.side * halfWidthWorld,
  };
}

export interface CadLineBatchStats {
  batches: number;
  instances: number;
  /** Bytes de atributo por instancia que viajan a la GPU. */
  attributeBytes: number;
}

export function cadLineBatchStats(batches: readonly CadLineBatch[]): CadLineBatchStats {
  let instances = 0;
  for (const batch of batches) instances += batch.instanceCount;
  // 2 + 2 + 4 + 2 flotantes de 4 bytes por instancia.
  return { batches: batches.length, instances, attributeBytes: instances * 10 * 4 };
}
