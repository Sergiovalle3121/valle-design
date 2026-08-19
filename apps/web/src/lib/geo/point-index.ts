/**
 * Índice espacial a escala de nube de puntos.
 *
 * ## Por qué NO se reutiliza el índice que ya hay
 *
 * El producto ya tiene un índice espacial y funciona: `CadSpatialIndex`, en
 * `lib/cad/entity-runtime.ts`, es el que sostiene la designación por ventana y
 * las referencias a objetos. Lo primero que se hizo aquí fue intentar usarlo, y
 * la respuesta es que no sirve para esto — no por estar mal hecho, sino por
 * estar hecho para otra cosa:
 *
 * · Indexa entidades con EXTENSIÓN. Un muro ocupa muchas celdas, y por eso cada
 *   entrada guarda la lista de celdas que ocupa y un conjunto de
 *   desbordamiento para las entidades infinitas. Un punto no tiene extensión:
 *   toda esa maquinaria es peso muerto repetido diez millones de veces.
 * · Su clave es una CADENA (`"12:−7"`) y su valor un `Set<string>` de
 *   identificadores. A diez millones de puntos eso son decenas de millones de
 *   cadenas y de objetos que el recolector tiene que rastrear en cada pausa.
 * · Es INCREMENTAL: `upsert` y `remove` uno a uno, porque un dibujo cambia
 *   mientras se usa. Una nube de puntos no cambia: llega entera de un archivo y
 *   se consulta millones de veces sin que nadie mueva un punto.
 *
 * `docs/cad/evidence/point-cloud-scale.json` publica la comparación MEDIDA
 * entre los dos en el mismo equipo y con los mismos puntos, en vez de dejar
 * este razonamiento como opinión.
 *
 * ## Lo que se construye en su lugar
 *
 * Una rejilla uniforme con ordenación por conteo, entera en arreglos tipados:
 *
 *   · `cellStart` — un `Int32Array` de `celdas + 1` con las sumas acumuladas.
 *   · `order` — un `Int32Array` de `n` con los índices de punto agrupados por
 *     celda. El punto j de la celda c es `order[cellStart[c] + j]`.
 *
 * Son cuatro bytes por punto y cuatro por celda. Ni un objeto, ni una cadena,
 * ni una asignación dentro del bucle de construcción. La construcción es de dos
 * pasadas —contar y colocar— y por tanto lineal.
 *
 * ## Por qué la rejilla es de DOS dimensiones
 *
 * Porque un levantamiento topográfico es 2,5D: la variación en cota es de
 * decenas de metros sobre una extensión de kilómetros. Una rejilla 3D con celdas
 * cúbicas del mismo lado dejaría casi todas las celdas vacías y multiplicaría la
 * memoria del índice por el número de niveles, sin acelerar nada. Las consultas
 * SÍ pueden medir en tres dimensiones —`queryRadius3D`—; lo que es plano es el
 * índice, no la geometría.
 *
 * ## Fallo cerrado
 *
 * Una coordenada no finita aborta la construcción. Un índice que acepta un NaN
 * produce una celda `NaN`, que no es igual a sí misma: ese punto deja de
 * aparecer en toda consulta y la nube queda con un agujero invisible.
 */
import { GeoError, geoAssert } from "./errors";

/**
 * Puntos por celda que se persigue al elegir el lado.
 *
 * Ocho es el compromiso habitual de una rejilla uniforme: con menos, la
 * consulta pasa más tiempo saltando de celda que mirando puntos; con más, cada
 * celda obliga a examinar puntos que quedan fuera de la ventana. No es un
 * número mágico sino un punto de partida, y el banco de pruebas publica el
 * tiempo real para que se pueda discutir con datos.
 */
export const GEO_POINT_INDEX_TARGET_PER_CELL = 8;

/**
 * Tope de celdas del índice.
 *
 * Cuatro millones de celdas son 16 MB de sumas acumuladas. Por encima, el
 * índice costaría más memoria que la propia nube, que es justo lo que un índice
 * no debe hacer. Al llegar al tope se agranda la celda en vez de fallar: una
 * consulta algo más lenta es mejor que un error, porque aquí no hay ninguna
 * ambigüedad que pudiera producir un resultado falso.
 */
export const GEO_POINT_INDEX_MAX_CELLS = 4_000_000;

export interface GeoPointIndexStats {
  pointCount: number;
  cellCountX: number;
  cellCountY: number;
  cellSize: number;
  /** Celdas con al menos un punto. */
  occupiedCells: number;
  /** Puntos en la celda más poblada. */
  maxPointsPerCell: number;
  /** Bytes que ocupan las estructuras del índice, sin contar las coordenadas. */
  indexBytes: number;
}

/**
 * Índice de una nube de puntos. Se construye una vez y no se modifica.
 *
 * No hay `insert` ni `remove` a propósito: una nube llega entera de un archivo
 * y no cambia. Ofrecer mutación obligaría a mantener huecos en `order` o a
 * reconstruir, y las dos opciones cuestan en el caso que sí importa —consultar—
 * para servir a un caso que no existe.
 */
export class GeoPointIndex {
  readonly minX: number;
  readonly minY: number;
  readonly cellSize: number;
  readonly cellCountX: number;
  readonly cellCountY: number;

  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  private readonly cellStart: Int32Array;
  private readonly order: Int32Array;

  private constructor(
    xs: Float64Array,
    ys: Float64Array,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    cellSize: number,
  ) {
    this.xs = xs;
    this.ys = ys;
    this.minX = bounds.minX;
    this.minY = bounds.minY;
    this.cellSize = cellSize;
    this.cellCountX = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cellSize) + 1);
    this.cellCountY = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / cellSize) + 1);

    const buckets = bucketize(
      xs,
      ys,
      bounds.minX,
      bounds.minY,
      cellSize,
      this.cellCountX,
      this.cellCountY,
    );
    this.cellStart = buckets.cellStart;
    this.order = buckets.order;
  }

  /**
   * Construye el índice sobre las coordenadas de una nube.
   *
   * Los arreglos NO se copian: el índice se queda con la referencia. Copiar
   * diez millones de dobles serían 160 MB duplicados para nada, porque la nube
   * ya es inmutable —viene de un archivo y nadie la modifica.
   */
  static build(
    xs: Float64Array,
    ys: Float64Array,
    options: { cellSize?: number; targetPerCell?: number } = {},
  ): GeoPointIndex {
    geoAssert(
      xs.length === ys.length,
      "indice-incoherente",
      "Las abscisas y las ordenadas no tienen la misma longitud.",
      { detail: { xs: xs.length, ys: ys.length } },
    );
    geoAssert(
      xs.length > 0,
      "geometria-invalida",
      "No se puede indexar una nube vacía.",
      {},
    );

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < xs.length; index += 1) {
      const x = xs[index];
      const y = ys[index];
      // Un NaN produciría una celda NaN, que no es igual a sí misma: el punto
      // desaparecería de TODA consulta y la nube quedaría con un agujero que no
      // se ve. Es exactamente el resultado plausible y falso que no se admite.
      //
      // La comprobación va escrita a mano, y no con `geoAssert`, porque el
      // mensaje de esa función se construye SIEMPRE: pasarle una plantilla con
      // el índice y las dos coordenadas fabricaba una cadena y un objeto por
      // cada punto de la nube. A cuatro millones de puntos eso costaba 1,3 µs
      // por punto —veinte veces más que leerlos del archivo— y todo el gasto era
      // en mensajes de error que no se iban a lanzar. Aquí el mensaje sólo se
      // arma cuando de verdad hay que lanzarlo.
      if (!Number.isFinite(x) || !Number.isFinite(y))
        throw new GeoError(
          "coordenada-invalida",
          `El punto ${index} tiene la coordenada (${x}, ${y}), que no se puede indexar.`,
          { detail: { index, x: String(x), y: String(y) } },
        );
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    return new GeoPointIndex(
      xs,
      ys,
      { minX, minY, maxX, maxY },
      options.cellSize ?? chooseCellSize(xs.length, minX, minY, maxX, maxY, options.targetPerCell),
    );
  }

  private cellOf(x: number, y: number): number {
    return this.rowOf(y) * this.cellCountX + this.columnOf(x);
  }

  /**
   * Recorre los puntos dentro de una ventana rectangular.
   *
   * Se entrega el ÍNDICE del punto, no un objeto con sus coordenadas: crear
   * diez millones de `{x, y}` para tirarlos acto seguido es exactamente el
   * coste que este índice existe para evitar. Quien necesite la coordenada la
   * lee del arreglo, que ya tiene.
   *
   * El visitante puede devolver `false` para cortar el recorrido. Es lo que
   * hace posible «¿hay algún punto aquí?» sin recorrer los cien mil que hay.
   */
  forEachInBox(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    visit: (index: number) => boolean | void,
  ): void {
    // Un NaN en la ventana no puede tratarse como «sin resultados» ni como
    // «todo»: `NaN <= x` es falso para cualquier x, así que la comparación de
    // recorte lo convertiría en silencio en la columna cero y la consulta
    // devolvería un trozo arbitrario de la nube con aspecto de respuesta.
    geoAssert(
      !Number.isNaN(minX) && !Number.isNaN(minY) && !Number.isNaN(maxX) && !Number.isNaN(maxY),
      "coordenada-invalida",
      "La ventana de consulta tiene algún lado que no es un número.",
      { detail: { minX: String(minX), minY: String(minY), maxX: String(maxX), maxY: String(maxY) } },
    );
    if (maxX < minX || maxY < minY) return;
    const fromColumn = this.columnOf(minX);
    const toColumn = this.columnOf(maxX);
    const fromRow = this.rowOf(minY);
    const toRow = this.rowOf(maxY);
    for (let row = fromRow; row <= toRow; row += 1) {
      const base = row * this.cellCountX;
      // Las celdas de una fila son CONTIGUAS en `order`, así que la fila entera
      // se recorre con un solo intervalo en vez de con una vuelta por celda.
      const start = this.cellStart[base + fromColumn];
      const end = this.cellStart[base + toColumn + 1];
      for (let slot = start; slot < end; slot += 1) {
        const index = this.order[slot];
        const x = this.xs[index];
        const y = this.ys[index];
        if (x >= minX && x <= maxX && y >= minY && y <= maxY)
          if (visit(index) === false) return;
      }
    }
  }

  /** Cuántos puntos caen en la ventana. Sin reservar nada. */
  countInBox(minX: number, minY: number, maxX: number, maxY: number): number {
    let total = 0;
    this.forEachInBox(minX, minY, maxX, maxY, () => {
      total += 1;
    });
    return total;
  }

  /** Los índices de los puntos de la ventana, hasta `limit`. */
  queryBox(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    limit = Number.POSITIVE_INFINITY,
  ): number[] {
    const found: number[] = [];
    this.forEachInBox(minX, minY, maxX, maxY, (index) => {
      found.push(index);
      return found.length < limit;
    });
    return found;
  }

  /** Puntos a menos de `radius` del punto dado, midiendo en planta. */
  queryRadius(x: number, y: number, radius: number, limit = Number.POSITIVE_INFINITY): number[] {
    geoAssert(
      Number.isFinite(radius) && radius >= 0,
      "coordenada-invalida",
      `Radio de consulta ${radius}.`,
      { detail: { radius: String(radius) } },
    );
    const squared = radius * radius;
    const found: number[] = [];
    this.forEachInBox(x - radius, y - radius, x + radius, y + radius, (index) => {
      const dx = this.xs[index] - x;
      const dy = this.ys[index] - y;
      if (dx * dx + dy * dy <= squared) found.push(index);
      return found.length < limit;
    });
    return found;
  }

  /**
   * El punto más cercano en planta, o −1 si la nube está vacía de ese lado.
   *
   * Se buscan anillos de celdas cada vez más anchos alrededor del punto y se
   * PARA cuando el anillo siguiente ya no puede contener nada mejor. Esa
   * condición de parada es la parte delicada: cortar en cuanto se encuentra
   * algo devuelve el vecino equivocado siempre que el punto esté cerca del
   * borde de su celda, que es la mitad de las veces.
   */
  nearest(x: number, y: number): number {
    const column = this.columnOf(x);
    const row = this.rowOf(y);
    const reach = Math.max(this.cellCountX, this.cellCountY);
    let best = -1;
    let bestSquared = Number.POSITIVE_INFINITY;

    for (let ring = 0; ring <= reach; ring += 1) {
      // Distancia MÍNIMA a la que puede estar cualquier punto del anillo
      // siguiente. Si ya se tiene algo más cerca, no hay nada que buscar.
      if (best >= 0 && (ring - 1) * this.cellSize > Math.sqrt(bestSquared)) break;
      for (let r = row - ring; r <= row + ring; r += 1) {
        if (r < 0 || r >= this.cellCountY) continue;
        const onHorizontalEdge = r === row - ring || r === row + ring;
        for (let c = column - ring; c <= column + ring; c += 1) {
          if (c < 0 || c >= this.cellCountX) continue;
          // Sólo el BORDE del anillo: el interior ya se recorrió en las vueltas
          // anteriores y volver a mirarlo multiplicaría el trabajo por el área.
          if (!onHorizontalEdge && c !== column - ring && c !== column + ring) continue;
          const cell = r * this.cellCountX + c;
          const end = this.cellStart[cell + 1];
          for (let slot = this.cellStart[cell]; slot < end; slot += 1) {
            const index = this.order[slot];
            const dx = this.xs[index] - x;
            const dy = this.ys[index] - y;
            const squared = dx * dx + dy * dy;
            if (squared < bestSquared) {
              bestSquared = squared;
              best = index;
            }
          }
        }
      }
    }
    return best;
  }

  /**
   * Vecinos dentro de una esfera, midiendo también en cota.
   *
   * La rejilla sigue siendo plana —filtra por planta— y la cota se comprueba
   * punto a punto. En un levantamiento eso es casi gratis: los puntos que caen
   * en el círculo son pocos y los que además caen en la esfera, casi todos.
   */
  queryRadius3D(
    x: number,
    y: number,
    z: number,
    zs: Float64Array,
    radius: number,
    limit = Number.POSITIVE_INFINITY,
  ): number[] {
    geoAssert(
      zs.length === this.xs.length,
      "indice-incoherente",
      "El arreglo de cotas no corresponde a la nube indexada.",
      { detail: { zs: zs.length, points: this.xs.length } },
    );
    const squared = radius * radius;
    const found: number[] = [];
    this.forEachInBox(x - radius, y - radius, x + radius, y + radius, (index) => {
      const dx = this.xs[index] - x;
      const dy = this.ys[index] - y;
      const dz = zs[index] - z;
      if (dx * dx + dy * dy + dz * dz <= squared) found.push(index);
      return found.length < limit;
    });
    return found;
  }

  stats(): GeoPointIndexStats {
    let occupiedCells = 0;
    let maxPointsPerCell = 0;
    for (let cell = 0; cell + 1 < this.cellStart.length; cell += 1) {
      const size = this.cellStart[cell + 1] - this.cellStart[cell];
      if (size > 0) occupiedCells += 1;
      if (size > maxPointsPerCell) maxPointsPerCell = size;
    }
    return {
      pointCount: this.xs.length,
      cellCountX: this.cellCountX,
      cellCountY: this.cellCountY,
      cellSize: this.cellSize,
      occupiedCells,
      maxPointsPerCell,
      indexBytes: this.cellStart.byteLength + this.order.byteLength,
    };
  }

  /**
   * Columna de la rejilla, RECORTADA antes de truncar a entero.
   *
   * El orden importa y costó un fallo real. La versión anterior truncaba con
   * `| 0` y recortaba después, y `Infinity | 0` vale CERO: una consulta con la
   * ventana infinita —la de «designar todo»— acababa mirando sólo la primera
   * columna y devolviendo seis puntos de veinte mil. El mismo defecto silencioso
   * aparecía con cualquier coordenada por encima de 2³¹, donde `| 0` da la
   * vuelta y devuelve una columna del otro extremo de la nube.
   *
   * Recortando primero, lo que llega a `| 0` está siempre entre cero y el número
   * de columnas, que no pasa del tope de celdas y cabe holgado en 32 bits.
   */
  private columnOf(x: number): number {
    const raw = (x - this.minX) / this.cellSize;
    if (!(raw > 0)) return 0;
    return raw >= this.cellCountX - 1 ? this.cellCountX - 1 : raw | 0;
  }

  private rowOf(y: number): number {
    const raw = (y - this.minY) / this.cellSize;
    if (!(raw > 0)) return 0;
    return raw >= this.cellCountY - 1 ? this.cellCountY - 1 : raw | 0;
  }
}

/**
 * Las dos pasadas que construyen la rejilla, con TODO en variables locales.
 *
 * Que esto sea una función suelta y no un método no es estilo: es la diferencia
 * entre 1,8 µs y 0,06 µs por punto, medida en este equipo. Cuando las pasadas
 * vivían en el constructor, el bucle leía `this.minX`, `this.cellSize` y
 * `this.cellCountX` millones de veces sobre un objeto cuya forma todavía estaba
 * cambiando —`cellStart` y `order` se asignan al final—, y el motor no podía
 * fijar los accesos. Indexar cuatro millones de puntos costaba siete segundos y
 * medio, treinta y siete veces más que LEERLOS del archivo, que es una relación
 * que no tiene ningún sentido para dos pasadas lineales sobre arreglos tipados.
 *
 * Con los seis valores en locales, el bucle no toca ningún objeto salvo los
 * arreglos, y el trabajo por punto vuelve a ser el que la cuenta dice que es.
 */
function bucketize(
  xs: Float64Array,
  ys: Float64Array,
  minX: number,
  minY: number,
  cellSize: number,
  cellCountX: number,
  cellCountY: number,
): { cellStart: Int32Array; order: Int32Array } {
  const n = xs.length;
  const cells = cellCountX * cellCountY;
  const lastColumn = cellCountX - 1;
  const lastRow = cellCountY - 1;
  const inverse = 1 / cellSize;

  // Pasada 1: contar. Se escribe en `counts[cell + 1]` para que la suma
  // acumulada de la pasada siguiente deje ya los desplazamientos de arranque
  // sin necesitar un arreglo auxiliar.
  const counts = new Int32Array(cells + 1);
  for (let index = 0; index < n; index += 1) {
    const column = clampCell((xs[index] - minX) * inverse, lastColumn);
    const row = clampCell((ys[index] - minY) * inverse, lastRow);
    counts[row * cellCountX + column + 1] += 1;
  }
  for (let cell = 0; cell < cells; cell += 1) counts[cell + 1] += counts[cell];

  // Pasada 2: colocar. `cursor` avanza dentro de cada celda; se lleva aparte
  // para no destruir las sumas acumuladas, que son el índice definitivo.
  const cursor = new Int32Array(cells);
  const order = new Int32Array(n);
  for (let index = 0; index < n; index += 1) {
    const column = clampCell((xs[index] - minX) * inverse, lastColumn);
    const row = clampCell((ys[index] - minY) * inverse, lastRow);
    const cell = row * cellCountX + column;
    order[counts[cell] + cursor[cell]] = index;
    cursor[cell] += 1;
  }
  return { cellStart: counts, order };
}

/** Recorta ANTES de truncar. Ver el comentario de `columnOf`. */
function clampCell(raw: number, last: number): number {
  if (!(raw > 0)) return 0;
  return raw >= last ? last : raw | 0;
}

/**
 * Lado de celda para que caigan unos pocos puntos en cada una.
 *
 * Sale de repartir el área entre el número de celdas que se quieren, y después
 * se agranda si el resultado pasa del tope. Una nube degenerada —todos los
 * puntos en la misma coordenada— da área cero, y ahí el lado lo pone el mínimo
 * en vez de una división por cero.
 */
function chooseCellSize(
  count: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  targetPerCell = GEO_POINT_INDEX_TARGET_PER_CELL,
): number {
  const width = maxX - minX;
  const height = maxY - minY;
  const area = width * height;
  if (!(area > 0)) return Math.max(width, height, 1e-6);
  let size = Math.sqrt((area * targetPerCell) / count);
  if (!(size > 0)) return Math.max(width, height, 1e-6);
  // Si el lado elegido produce más celdas de las que caben en el tope, se
  // agranda por el factor exacto que hace falta: así el índice nunca cuesta más
  // memoria que la nube que indexa.
  const cells = (width / size + 1) * (height / size + 1);
  if (cells > GEO_POINT_INDEX_MAX_CELLS)
    size *= Math.sqrt(cells / GEO_POINT_INDEX_MAX_CELLS);
  return size;
}
