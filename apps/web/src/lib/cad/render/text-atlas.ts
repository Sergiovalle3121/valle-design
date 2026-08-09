/**
 * Atlas de glifos y quads instanciados para el texto del CAD.
 *
 * ## De dónde salen los 225 MB
 *
 * `buildCadMTextSprite` crea un elemento `<canvas>` POR MTEXT, lo rasteriza y lo
 * sube a la GPU como una `CanvasTexture` propia. Un canvas de 1.024×512 son
 * 2 MB de RGBA; cien rótulos son 200 MB y ni siquiera comparten programa de
 * dibujo. Aquí hay UN atlas para todo el documento y un quad instanciado por
 * GLIFO: una textura, una llamada de dibujo, y la memoria deja de escalar con el
 * número de rótulos para escalar con el número de CARACTERES DISTINTOS.
 *
 * ## Qué NO es esto, dicho en claro
 *
 * **No hay campo de distancia (SDF ni MSDF).** Los glifos se rasterizan a un
 * tamaño de em fijo y se magnifican con filtrado bilineal, así que por encima de
 * ~3× ese tamaño el borde se ablanda en vez de mantenerse afilado. Se deja
 * escrito porque la alternativa —decir «atlas MSDF» y entregar cobertura alfa—
 * es peor que el hueco: quien mire el módulo tiene que saber que ampliar mucho
 * un rótulo lo desenfoca. El hueco es sustituible sin tocar nada de fuera: la
 * geometría, el empaquetado y el shader no cambian, sólo cambia qué se escribe
 * en el atlas y cómo lo lee el fragment shader.
 *
 * ## Empaquetado por estanterías
 *
 * El asignador es un *shelf packer*: filas de altura fija que crecen hacia
 * abajo. Desperdicia algo de área frente a un empaquetado óptimo, pero es O(1)
 * por glifo y no necesita reorganizar nada. Con un alfabeto latino los glifos
 * tienen alturas parecidas, que es justo el caso en el que las estanterías casi
 * no desperdician.
 *
 * Puro: sin THREE y sin DOM. El rasterizado real se inyecta (`CadGlyphSource`)
 * para que este módulo se pueda probar entero en Node.
 */
import { packCadColor } from "./line-batch";

export interface CadAtlasSlot {
  /** Píxeles dentro del atlas. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Coordenadas de textura normalizadas, ya con el padding descontado. */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export const CAD_TEXT_ATLAS_DEFAULT_SIZE = 1_024;
export const CAD_TEXT_ATLAS_DEFAULT_PADDING = 1;

/**
 * Asignador de huecos del atlas. Devuelve `null` cuando ya no cabe: quien lo usa
 * decide si crece la textura o si deja de dibujar más glifos, y ninguna de esas
 * dos decisiones pertenece al asignador.
 */
export class CadGlyphAtlas {
  private readonly slots = new Map<string, CadAtlasSlot>();
  private shelfY = 0;
  private shelfHeight = 0;
  private cursorX = 0;
  private usedPixels = 0;

  constructor(
    readonly size: number = CAD_TEXT_ATLAS_DEFAULT_SIZE,
    readonly padding: number = CAD_TEXT_ATLAS_DEFAULT_PADDING,
  ) {
    if (!(size > 0)) throw new Error("atlas size must be positive.");
    if (padding < 0) throw new Error("atlas padding cannot be negative.");
  }

  get glyphCount(): number {
    return this.slots.size;
  }

  /** Fracción del área del atlas ya comprometida, padding incluido. */
  get usedRatio(): number {
    return this.usedPixels / (this.size * this.size);
  }

  get(key: string): CadAtlasSlot | null {
    return this.slots.get(key) ?? null;
  }

  /** Huecos asignados, para que el rasterizador sepa qué queda por pintar. */
  entries(): IterableIterator<[string, CadAtlasSlot]> {
    return this.slots.entries();
  }

  allocate(key: string, width: number, height: number): CadAtlasSlot | null {
    const existing = this.slots.get(key);
    if (existing) return existing;
    const boxWidth = Math.max(1, Math.ceil(width)) + this.padding * 2;
    const boxHeight = Math.max(1, Math.ceil(height)) + this.padding * 2;
    if (boxWidth > this.size || boxHeight > this.size) return null;
    if (this.cursorX + boxWidth > this.size) {
      // Estantería nueva: se baja por la altura de la anterior.
      this.shelfY += this.shelfHeight;
      this.shelfHeight = 0;
      this.cursorX = 0;
    }
    if (this.shelfY + boxHeight > this.size) return null;
    const x = this.cursorX + this.padding;
    const y = this.shelfY + this.padding;
    const slot: CadAtlasSlot = {
      x,
      y,
      width: boxWidth - this.padding * 2,
      height: boxHeight - this.padding * 2,
      u0: x / this.size,
      v0: y / this.size,
      u1: (x + boxWidth - this.padding * 2) / this.size,
      v1: (y + boxHeight - this.padding * 2) / this.size,
    };
    this.cursorX += boxWidth;
    this.shelfHeight = Math.max(this.shelfHeight, boxHeight);
    this.usedPixels += boxWidth * boxHeight;
    this.slots.set(key, slot);
    return slot;
  }

  reset(): void {
    this.slots.clear();
    this.shelfY = 0;
    this.shelfHeight = 0;
    this.cursorX = 0;
    this.usedPixels = 0;
  }
}

/**
 * Métricas de un glifo, en unidades de EM (1 = altura de la em) salvo el tamaño
 * del recuadro rasterizado, que va en píxeles del atlas.
 */
export interface CadGlyphMetrics {
  /** Avance horizontal hasta el glifo siguiente. */
  advance: number;
  /** Recuadro visible respecto a la línea base. */
  bearingX: number;
  bearingY: number;
  emWidth: number;
  emHeight: number;
  /** Tamaño del recuadro dentro del atlas. */
  pixelWidth: number;
  pixelHeight: number;
}

/**
 * Fuente de glifos. Se inyecta para que el módulo no dependa del DOM: en el
 * navegador la implementa un canvas; en las pruebas, una métrica sintética.
 */
export interface CadGlyphSource {
  key(character: string, fontKey: string): string;
  metrics(character: string, fontKey: string): CadGlyphMetrics | null;
}

export interface CadTextQuadRequest {
  text: string;
  fontKey: string;
  /** Altura de la em en unidades de DIBUJO. */
  fontSize: number;
  /** Origen de la línea base, en unidades de dibujo. */
  x: number;
  y: number;
  rotationDeg?: number;
  color: number;
  /** Profundidad NDC del orden de dibujo, de `cadDrawOrderDepth`. */
  depth: number;
}

/**
 * Signo de la Y de PANTALLA por unidad de Y de DIBUJO, tal y como lo define
 * `CadView.yScreenSign`. `1` —el comportamiento actual del producto— significa
 * que la +Y del dibujo se ve hacia ABAJO.
 *
 * Importa aquí y no importaba en el camino anterior: `buildCadMTextSprite` usaba
 * `THREE.Sprite`, que mira siempre a la cámara y por eso se saltaba la
 * orientación del mundo por completo. Estos quads viven en el plano del dibujo,
 * así que si el eje vertical de la pantalla va al revés que el del mundo, el
 * texto sale reflejado. El marco local del glifo se refleja en Y antes de rotar.
 *
 * PENDIENTE DE MIRAR: la orientación en pantalla del texto ROTADO bajo esta
 * convención no está verificada visualmente, porque el pipeline aún no está
 * enchufado y en Node no hay nada que mirar. Los casos de 0° y 90° sí tienen
 * anclas numéricas en el spec.
 */
export type CadScreenYSign = 1 | -1;

export interface CadTextQuadOptions {
  /** Por defecto `1`: la convención que el editor usa hoy. */
  yScreenSign?: CadScreenYSign;
}

export interface CadTextQuadArrays {
  /** 2 flotantes: esquina inferior izquierda del glifo en unidades de dibujo. */
  instanceOrigin: Float32Array;
  /** 2 flotantes: vector de anchura del glifo, ya rotado. */
  instanceRight: Float32Array;
  /** 2 flotantes: vector de altura del glifo, ya rotado. */
  instanceUp: Float32Array;
  /** 4 flotantes: u0, v0, u1, v1 dentro del atlas. */
  instanceUv: Float32Array;
  /** 2 flotantes: color empaquetado y profundidad. */
  instanceStyle: Float32Array;
  instanceCount: number;
  /** Glifos que no cupieron en el atlas. Cero es la única cifra aceptable. */
  droppedGlyphs: number;
}

/**
 * Construye los quads instanciados de un conjunto de rótulos.
 *
 * La rotación se resuelve AQUÍ y viaja como dos vectores (`right`, `up`) en vez
 * de como un ángulo: el shader se ahorra un seno y un coseno por vértice, y el
 * texto vertical, el inclinado y el de una cota salen del mismo camino sin
 * casos especiales.
 */
export function buildCadTextQuads(
  requests: readonly CadTextQuadRequest[],
  atlas: CadGlyphAtlas,
  source: CadGlyphSource,
  options: CadTextQuadOptions = {},
): CadTextQuadArrays {
  // Con la +Y del dibujo hacia abajo en pantalla, «arriba» para el glifo es la
  // −Y del mundo. Se refleja el eje vertical del marco local ANTES de rotar,
  // para que el giro del texto acompañe al de la geometría que lo rodea.
  const flipY = (options.yScreenSign ?? 1) === 1 ? -1 : 1;
  let capacity = 0;
  for (const request of requests) capacity += request.text.length;
  const origin = new Float32Array(capacity * 2);
  const right = new Float32Array(capacity * 2);
  const up = new Float32Array(capacity * 2);
  const uv = new Float32Array(capacity * 4);
  const style = new Float32Array(capacity * 2);
  let count = 0;
  let dropped = 0;

  for (const request of requests) {
    const radians = ((request.rotationDeg ?? 0) * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const packedColor = packCadColor(request.color);
    let pen = 0;
    for (const character of request.text) {
      const metrics = source.metrics(character, request.fontKey);
      if (!metrics) continue;
      // Un espacio avanza sin ocupar hueco: rasterizarlo sería tirar atlas.
      if (metrics.emWidth <= 0 || metrics.emHeight <= 0) {
        pen += metrics.advance;
        continue;
      }
      const key = source.key(character, request.fontKey);
      const slot = atlas.allocate(key, metrics.pixelWidth, metrics.pixelHeight);
      if (!slot) {
        dropped += 1;
        pen += metrics.advance;
        continue;
      }
      // Esquina inferior izquierda del glifo en el espacio local del rótulo.
      const localX = (pen + metrics.bearingX) * request.fontSize;
      const localY = metrics.bearingY * request.fontSize * flipY;
      const width = metrics.emWidth * request.fontSize;
      const height = metrics.emHeight * request.fontSize * flipY;
      origin[count * 2] = request.x + localX * cos - localY * sin;
      origin[count * 2 + 1] = request.y + localX * sin + localY * cos;
      right[count * 2] = width * cos;
      right[count * 2 + 1] = width * sin;
      up[count * 2] = -height * sin;
      up[count * 2 + 1] = height * cos;
      uv[count * 4] = slot.u0;
      uv[count * 4 + 1] = slot.v0;
      uv[count * 4 + 2] = slot.u1;
      uv[count * 4 + 3] = slot.v1;
      style[count * 2] = packedColor;
      style[count * 2 + 1] = request.depth;
      count += 1;
      pen += metrics.advance;
    }
  }

  return {
    instanceOrigin: origin.subarray(0, count * 2),
    instanceRight: right.subarray(0, count * 2),
    instanceUp: up.subarray(0, count * 2),
    instanceUv: uv.subarray(0, count * 4),
    instanceStyle: style.subarray(0, count * 2),
    instanceCount: count,
    droppedGlyphs: dropped,
  };
}

export interface CadTextAtlasStats {
  glyphs: number;
  quads: number;
  atlasUsedRatio: number;
  /** Bytes de la textura del atlas, en RGBA. */
  atlasBytes: number;
  /** Bytes de atributo por instancia. */
  attributeBytes: number;
  droppedGlyphs: number;
}

export function cadTextAtlasStats(
  atlas: CadGlyphAtlas,
  quads: CadTextQuadArrays,
): CadTextAtlasStats {
  return {
    glyphs: atlas.glyphCount,
    quads: quads.instanceCount,
    atlasUsedRatio: atlas.usedRatio,
    atlasBytes: atlas.size * atlas.size * 4,
    // 2 + 2 + 2 + 4 + 2 flotantes de 4 bytes.
    attributeBytes: quads.instanceCount * 12 * 4,
    droppedGlyphs: quads.droppedGlyphs,
  };
}

/**
 * Memoria del pipeline ANTERIOR para el mismo texto: un canvas RGBA por rótulo.
 * Se calcula para que la comparación del benchmark no sea una estimación de
 * pasillo sino la misma aritmética que usaba `buildCadMTextSprite`.
 */
export function cadLegacySpriteBytes(
  labels: ReadonlyArray<{ widthPx: number; heightPx: number }>,
): number {
  let bytes = 0;
  for (const label of labels)
    bytes += Math.max(2, Math.ceil(label.widthPx)) * Math.max(2, Math.ceil(label.heightPx)) * 4;
  return bytes;
}
