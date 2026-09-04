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

/**
 * Ranuras de tipo de línea y tramos por ranura que el shader sabe
 * descodificar. Son las mismas cifras que `cad-effective-style.ts` y se
 * reexportan para que el empaquetado y el shader lean UNA definición.
 */
export { CAD_LINETYPE_SLOT_LIMIT as CAD_LINETYPE_SLOTS, CAD_LINETYPE_MAX_ELEMENTS } from "../cad-effective-style";
import { CAD_LINETYPE_SLOT_LIMIT, CAD_LINETYPE_MAX_ELEMENTS as MAX_ELEMENTS } from "../cad-effective-style";

/** Los uniformes del tipo de línea, empaquetados: `dash` lleva los tramos con signo y `meta` [tramos, periodo] por ranura. */
export interface CadLinetypeUniformData {
  dash: Float32Array;
  meta: Float32Array;
}

/**
 * Empaqueta las secuencias `.lin` para el shader. Puro y probable en Node: la
 * regla de cobertura que ejecuta el GLSL está escrita una segunda vez en
 * `cadLinetypeCoverage`, y el spec las compara.
 */
export function packCadLinetypeUniforms(
  patterns: ReadonlyArray<readonly number[]>,
): CadLinetypeUniformData {
  const dash = new Float32Array(CAD_LINETYPE_SLOT_LIMIT * MAX_ELEMENTS);
  const meta = new Float32Array(CAD_LINETYPE_SLOT_LIMIT * 2);
  for (let slot = 0; slot < CAD_LINETYPE_SLOT_LIMIT; slot += 1) {
    const pattern = patterns[slot] ?? [];
    const count = Math.min(pattern.length, MAX_ELEMENTS);
    let period = 0;
    for (let element = 0; element < count; element += 1) {
      dash[slot * MAX_ELEMENTS + element] = pattern[element];
      period += Math.abs(pattern[element]);
    }
    meta[slot * 2] = count;
    meta[slot * 2 + 1] = period;
  }
  return { dash, meta };
}

/**
 * ¿Se pinta este punto del trazo? Espejo exacto del bucle del fragment
 * shader: se recorre la secuencia acumulando longitudes (un punto mide
 * `dotLength`, dos píxeles en pantalla) y decide el tramo en el que cae la
 * fase. `phase` es la distancia recorrida a lo largo de la polilínea.
 */
export function cadLinetypeCoverage(
  phase: number,
  packed: CadLinetypeUniformData,
  slot: number,
  scale = 1,
  dotLength = 0,
): boolean {
  const count = packed.meta[slot * 2];
  const period = packed.meta[slot * 2 + 1] * scale;
  if (count <= 0 || period <= 0) return true;
  const local = ((phase % period) + period) % period;
  let accumulated = 0;
  for (let element = 0; element < count; element += 1) {
    const value = packed.dash[slot * MAX_ELEMENTS + element];
    accumulated += value === 0 ? dotLength : Math.abs(value) * scale;
    if (local < accumulated) return value >= 0;
  }
  return true;
}

/**
 * Segmentos que cabe en un BLOQUE de lote antes de abrir el siguiente.
 *
 * ## Qué problema resuelve
 *
 * `CadLineBatchBuilder` crece por duplicación, y duplicar copia todo lo ya
 * escrito. Un cubo que se llena de una vez —porque quien lo llena conoce el
 * total— no paga nada: `buildCadLineBatches` reserva una vez y copia cero. Pero
 * el pipeline llena sus cubos A TROZOS y no sabe el total hasta que ha teselado
 * el tile entero, así que sus cubos crecen por trazo. Medido sobre
 * `architecture@100k` el 2026-09-04: 611 duplicaciones, 120,8 MB copiados y
 * 274,7 MB reservados para 104 MB de contenido; en la sonda pareada esa cadena
 * cuesta ~95 ms sobre los ~105 ms que cuesta escribir los flotantes, es decir,
 * casi DOBLA el empaquetado.
 *
 * ## Por qué un bloque y no una reserva más lista
 *
 * Reservar el total exige conocerlo, y el tile sólo lo conoce cuando ya ha
 * hecho el trabajo. Estimarlo desde las entidades que le quedan sobreestima por
 * 12 veces en el caso medido (8,4 M de segmentos proyectados contra 665.000
 * reales), y una reserva así multiplicada por los 1.983 cubos de una vista es
 * memoria que un CAD en el navegador no tiene. Un bloque de tamaño FIJO acota
 * las dos cosas: lo ya escrito no se vuelve a copiar nunca —el bloque lleno se
 * cierra y se abre otro— y el desperdicio máximo es un bloque a medias por cubo
 * que se pase de tamaño, no el 100 % que la duplicación permite.
 *
 * ## El tamaño, y lo que se paga por él
 *
 * 65.536 segmentos son 2,6 MB de atributos por bloque. Un cubo de 665.000
 * segmentos pasa de un lote a diez, es decir de una llamada de dibujo a diez
 * —cada una sigue siendo un `drawElementsInstanced` de 65.536 instancias—, que
 * frente a las 100.000 llamadas del pipeline anterior no es una cifra que se
 * discuta. A cambio, la cadena de copias de ese cubo baja de ~26 MB a ~3,9.
 */
export const CAD_LINE_BATCH_BLOCK_SEGMENTS = 1 << 16;

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

  /**
   * Reserva sitio para `segments` instancias MÁS, de una vez.
   *
   * Es la puerta pública de `ensure`, y existe porque quien arma un lote suele
   * saber su tamaño ANTES de empezar a escribirlo —`buildCadLineBatches` lo
   * cuenta en una primera pasada— y reservar una vez por LOTE en vez de dejar
   * que el lote crezca por TRAZO ahorra la cadena entera de duplicaciones: cada
   * una asigna cuatro arrays nuevos y copia lo ya escrito, así que un cubo que
   * acaba en 665.000 segmentos empezando por 26.133 copia ~810.000 segmentos
   * —32 MB— por el camino. Medido sobre architecture@100k el 2026-09-04: 611
   * duplicaciones, 120,8 MB copiados y 274,7 MB reservados para 104 MB de
   * contenido final.
   *
   * No encoge nunca: reservar de menos no puede perder lo ya escrito.
   */
  reserve(segments: number): void {
    if (!(segments > 0)) return;
    this.ensure(Math.floor(segments));
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

  /**
   * Añade todos los segmentos de un teselado. Devuelve cuántos escribió.
   *
   * ## Por qué el bucle está escrito así y no de la forma obvia
   *
   * Perfilado sobre `architecture@100k` el 2026-09-04, esta función es la etapa
   * `batchPush`: 2.600.624 segmentos repartidos en 2.413.213 CAMINOS, de los
   * cuales 2.346.349 —el 97,2 %— son caminos ABIERTOS DE DOS PUNTOS. No es una
   * casualidad del corpus: un sombreado emite una línea del patrón por camino,
   * y en el escalón de detalle que se paga al acercarse son ~13.790 por
   * entidad. El coste de esta etapa no está en el segmento, está en el CAMINO:
   * a un segmento por camino, todo lo que se hace «una vez por camino» se paga
   * una vez por segmento.
   *
   * De ahí las tres decisiones que hacen el bucle menos legible de lo que sería
   * natural, cada una medida sobre la forma real (suelo de nueve pasadas):
   *
   * 1. **Los cuatro arrays y el cursor viajan en LOCALES.** Escribir por
   *    `this.start[...]` son diez cargas de campo por segmento que V8 no puede
   *    hundir porque `this` escapa.
   * 2. **El vértice final de un segmento se ARRASTRA como inicial del
   *    siguiente**, en vez de releerlo del array, y el índice pierde el `%`
   *    que sólo existía para el segmento de cierre — que ahora se escribe
   *    aparte, después del bucle, y sólo si el camino es cerrado.
   * 3. **Atajo del camino de dos puntos**, que es el 97,2 %: sin bucle
   *    interior, sin fase acumulada (siempre arranca en 0) y sin cierre.
   *
   * ## La condición que no se negocia
   *
   * La salida es BIT A BIT la misma que la del bucle anterior. Se escriben los
   * mismos vértices en el mismo orden, la fase se acumula sumando las mismas
   * longitudes en la misma secuencia y `Math.hypot` se mantiene: sustituirla
   * por `Math.sqrt(dx*dx + dy*dy)` es 16 veces más rápida —medido: 41 ns contra
   * 2,5— pero da un resultado que puede diferir en el último bit del double, y
   * esa diferencia se propaga a la fase de guionado acumulada. Un empaquetado
   * que mueve un valor no es una optimización. `line-batch.spec.ts` lleva el
   * bucle ANTERIOR escrito como implementación de referencia y compara las
   * cuatro salidas elemento a elemento.
   */
  push(item: CadLineBatchItem): number {
    const { tessellation, style, depth } = item;
    this.ensure(tessellation.segmentCount);
    const packedColor = packCadColor(style.color);
    const halfWidthPx = Math.max(0, style.halfWidthPx);
    const linetypeIndex = Math.max(
      0,
      Math.min(CAD_LINETYPE_SLOT_LIMIT - 1, Math.floor(style.linetypeIndex)),
    );
    const start = this.start;
    const end = this.end;
    const styles = this.style;
    const arc = this.arc;
    const paths = tessellation.paths;
    const pathCount = paths.length;
    const first = this.count;
    let slot = first;
    for (let pathIndex = 0; pathIndex < pathCount; pathIndex += 1) {
      const path = paths[pathIndex];
      const xy = path.xy;
      const points = xy.length >> 1;
      if (points < 2) continue;
      const closed = path.closed;
      if (points === 2 && !closed) {
        // El 97,2 % de los caminos de architecture@100k. Un solo segmento: la
        // fase arranca y acaba en 0 y no hay cierre que escribir.
        const x0 = xy[0];
        const y0 = xy[1];
        const x1 = xy[2];
        const y1 = xy[3];
        const two = slot * 2;
        const four = slot * 4;
        start[two] = x0;
        start[two + 1] = y0;
        end[two] = x1;
        end[two + 1] = y1;
        styles[four] = packedColor;
        styles[four + 1] = halfWidthPx;
        styles[four + 2] = linetypeIndex;
        styles[four + 3] = depth;
        arc[two] = 0;
        arc[two + 1] = Math.hypot(x1 - x0, y1 - y0);
        slot += 1;
        continue;
      }
      // La fase de guionado es acumulativa a lo largo del recorrido: así un
      // guion no se reinicia en cada vértice y la polilínea se ve como una sola
      // línea discontinua, que es lo que dibuja un CAD.
      let phase = 0;
      let x0 = xy[0];
      let y0 = xy[1];
      for (let index = 1; index < points; index += 1) {
        const read = index * 2;
        const x1 = xy[read];
        const y1 = xy[read + 1];
        const length = Math.hypot(x1 - x0, y1 - y0);
        const two = slot * 2;
        const four = slot * 4;
        start[two] = x0;
        start[two + 1] = y0;
        end[two] = x1;
        end[two + 1] = y1;
        styles[four] = packedColor;
        styles[four + 1] = halfWidthPx;
        styles[four + 2] = linetypeIndex;
        styles[four + 3] = depth;
        arc[two] = phase;
        arc[two + 1] = length;
        phase += length;
        slot += 1;
        x0 = x1;
        y0 = y1;
      }
      if (closed) {
        // El segmento de cierre vuelve al primer vértice. Fuera del bucle
        // porque era la única razón del módulo que se pagaba en cada segmento.
        const x1 = xy[0];
        const y1 = xy[1];
        const two = slot * 2;
        const four = slot * 4;
        start[two] = x0;
        start[two + 1] = y0;
        end[two] = x1;
        end[two + 1] = y1;
        styles[four] = packedColor;
        styles[four + 1] = halfWidthPx;
        styles[four + 2] = linetypeIndex;
        styles[four + 3] = depth;
        arc[two] = phase;
        arc[two + 1] = Math.hypot(x1 - x0, y1 - y0);
        slot += 1;
      }
    }
    this.count = slot;
    return slot - first;
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
 * Bloque de un cubo en el que caben `segments` instancias más, abriendo uno
 * nuevo si el vigente ya está a tamaño de bloque y no le caben.
 *
 * Vive aquí y no en el pipeline porque la política de bloques es de este
 * módulo: quién decide cuándo un cubo deja de duplicarse y empieza a encadenar
 * es lo mismo que decide cómo crece un constructor. El pipeline sólo aporta el
 * dato que este módulo no tiene —que su cubo se llena a trozos— y recibe el
 * bloque donde escribir.
 *
 * El bloque nuevo nace con su tamaño entero (o con el de la entidad, si es
 * mayor) y por tanto no crece jamás. Mientras el cubo es pequeño se sigue
 * duplicando: ahí la copia es barata y reservar un bloque entero por cubo
 * serían 2,6 MB multiplicados por los ~2.000 cubos de una vista.
 */
export function cadLineBatchBlockFor(
  blocks: CadLineBatchBuilder[],
  segments: number,
): CadLineBatchBuilder {
  const current = blocks[blocks.length - 1];
  if (
    current.capacity < CAD_LINE_BATCH_BLOCK_SEGMENTS ||
    current.instanceCount + segments <= current.capacity
  )
    return current;
  const opened = new CadLineBatchBuilder(
    Math.max(CAD_LINE_BATCH_BLOCK_SEGMENTS, segments),
  );
  blocks.push(opened);
  return opened;
}

/**
 * Lotes de un tile a partir de sus cubos por bloques, ordenados por clave para
 * que dos ejecuciones con el mismo estado produzcan la misma salida.
 *
 * La clave lleva el TILE por delante del cubo de estilo: un lote es (tile ×
 * estilo × bloque), no sólo estilo. Sin el prefijo, dos tiles del mismo color
 * se pisaban en el mapa de mallas del consumidor y sólo sobrevivía el último
 * —48 lotes acababan siendo 3 objetos de escena— y lo cazó el spec de la
 * escena. El primer bloque conserva esa clave tal cual, porque el caso común es
 * un solo bloque; los siguientes llevan su número detrás por la misma razón.
 */
export function cadTileLineBatches(
  tilePrefix: string,
  buckets: ReadonlyMap<string, { style: CadLineStyle; builders: CadLineBatchBuilder[] }>,
): CadLineBatch[] {
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([styleKey, bucket]) =>
      bucket.builders.map((builder, block) => ({
        bucketKey: block === 0 ? `${tilePrefix}#${styleKey}` : `${tilePrefix}#${styleKey}@${block}`,
        style: bucket.style,
        ...builder.build(),
      })),
    )
    .filter((batch) => batch.instanceCount > 0);
}

/**
 * Agrupa un conjunto de entidades ya teseladas en lotes por cubo de estilo.
 * Devuelve los lotes ordenados por clave para que dos ejecuciones con la misma
 * entrada produzcan la misma salida — el benchmark compara hashes.
 *
 * Se reserva UNA VEZ POR LOTE y no por trazo: quien llama aquí entrega el
 * conjunto entero, así que el tamaño final de cada cubo es contable antes de
 * escribir un solo flotante. Dejar que cada cubo creciera por duplicación
 * costaría, para un cubo que acaba en N segmentos, ~N segmentos copiados y ~2N
 * reservados; con el total en la mano cuesta N reservados y cero copiados. La
 * clave de cubo se calcula en la primera pasada y se reutiliza en la segunda:
 * es una cadena por entidad y hacerla dos veces se comería lo ahorrado.
 */
export function buildCadLineBatches(
  items: readonly CadLineBatchItem[],
): CadLineBatch[] {
  const keys: (string | null)[] = new Array<string | null>(items.length);
  const segmentsByKey = new Map<string, number>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.tessellation.segmentCount === 0) {
      keys[index] = null;
      continue;
    }
    const key = cadLineStyleKey(item.style);
    keys[index] = key;
    segmentsByKey.set(key, (segmentsByKey.get(key) ?? 0) + item.tessellation.segmentCount);
  }
  const builders = new Map<string, { style: CadLineStyle; builder: CadLineBatchBuilder }>();
  for (let index = 0; index < items.length; index += 1) {
    const key = keys[index];
    if (key === null) continue;
    const item = items[index];
    let bucket = builders.get(key);
    if (!bucket) {
      bucket = {
        style: { ...item.style },
        builder: new CadLineBatchBuilder(
          Math.max(64, segmentsByKey.get(key) ?? item.tessellation.segmentCount),
        ),
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
