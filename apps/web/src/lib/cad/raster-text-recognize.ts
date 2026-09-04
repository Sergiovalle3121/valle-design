/**
 * EL RÓTULO DEL ESCANEO VUELVE A SER UN TEXT — reconocimiento por PLANTILLA
 * contra las fuentes de trazos que el producto ya usa para dibujar (Ola I,
 * 2026-09-04).
 *
 * ## El límite, antes que nada
 *
 * Esto lee **texto CAD trazado con una fuente de trazos** —`txt`, `simplex`,
 * `romans`, `isocp`, `monotxt`, todas mapeadas a la colección Hershey en
 * `fonts/hershey-fonts.ts`—. **No lee manuscrito** y **no lee tipografías de
 * contorno relleno** (una Arial escaneada es un contorno macizo, no un
 * esqueleto de trazos, y su plantilla aquí no existe). Un plano de despacho
 * rotulado a mano seguirá saliendo como polilíneas, y el aviso lo dirá con su
 * número. Prometer otra cosa sería vender un OCR que este módulo no es.
 *
 * ## Por qué por plantilla, y no por rasgos
 *
 * El producto YA dibuja su texto con estos trazos: `cadHersheyTextStrokes`
 * pone una polilínea por trazo de cada glifo. Un plano trazado con `txt.shx`,
 * ploteado e impreso, y vuelto a escanear, es exactamente esa geometría con
 * ruido encima. Reconocerla es comparar contra el MISMO juego con el que se
 * trazó, no adivinar rasgos: la plantilla se rasteriza a la altura medida del
 * renglón y se compara por distancia de chanfle. Un clasificador de rasgos
 * necesitaría datos de entrenamiento que este repositorio no tiene y no puede
 * citar; una plantilla necesita la fuente, que sí está aquí y es de dominio
 * público.
 *
 * ## La tubería
 *
 *   1. **Tinta contra papel** con el MISMO `cadRasterInkMask` de la tubería de
 *      vectorización: si cada mitad umbralizara por su cuenta, las cajas de
 *      los glifos leídos y las polilíneas del calco no se corresponderían y
 *      una letra saldría dos veces.
 *   2. **Componentes conexas** de 8 vecinos, con las que no llegan al área
 *      mínima fuera (el polvo del escaneo), y **adelgazamiento de Zhang-Suen**
 *      de lo que queda: se compara ESQUELETO contra ESQUELETO. Un rótulo
 *      trazado con plumilla gorda mide tres píxeles de ancho y la plantilla
 *      uno; comparar así mide sobre todo el GROSOR, todas las letras
 *      parecidas empatan y ninguna gana el margen (medido: la `I` de PREDIO
 *      quedaba a 0,025 y la `1` a 0,026). La plantilla pasa por el mismo
 *      adelgazamiento, para que los dos lados sean de la misma naturaleza.
 *   3. **Renglones**: se agrupan las componentes que se solapan en vertical y
 *      no están separadas por un hueco enorme en horizontal. Un renglón con
 *      una sola componente no es un renglón: es una mancha. Los acentos
 *      sueltos —la virgulilla de la `Ñ`, la tilde de la `Ó`— se pegan después
 *      a la letra que tienen debajo: sin ese paso `AÑO` se lee `ANO`, que es
 *      otra palabra y no una errata.
 *   4. **Línea base y altura de mayúscula**: la base es la mediana de los
 *      cantos inferiores de las componentes altas (los descendentes de `g` y
 *      `p` son minoría y la mediana los ignora); la altura de mayúscula es la
 *      mediana de lo que suben las más altas. Sobre esa estimación se prueban
 *      unas pocas hipótesis de escala y gana la que MENOS distancia deja: eso
 *      absorbe el píxel que el trazo engrosado añade por arriba y por abajo, y
 *      la hipótesis ×1,5 recupera el renglón que sólo tiene minúsculas.
 *   5. **Un carácter = las componentes que se solapan en horizontal** (el
 *      punto de la `i` y su asta, los dos puntos de los `:`).
 *   6. **Distancia de chanfle normalizada** entre la mancha y cada plantilla
 *      candidata, alineadas por la LÍNEA BASE (que es lo que distingue una
 *      coma de un apóstrofo) y por el CENTRO DE MASA de la tinta —no por el
 *      canto izquierdo: un píxel de ruido asomando por la izquierda corría el
 *      glifo entero y con él todas las distancias—, probando además los tres
 *      corrimientos enteros vecinos, porque medio píxel de redondeo sube la
 *      distancia de un glifo exacto de 0,004 a 0,035. Simétrica: la media de
 *      mancha→plantilla y plantilla→mancha, dividida entre la altura de
 *      mayúscula, para que el número no dependa del tamaño.
 *   7. **El margen**: gana la mejor sólo si queda por debajo de
 *      `maxDistance` Y la segunda queda `margin` por encima en términos
 *      relativos. Si no, **no se inventa**: el carácter se declara ilegible,
 *      sus trazos salen como polilíneas y el recuento lo dice.
 *   8. **Los espacios se miden, no se adivinan**: con el glifo reconocido se
 *      sabe su avance, y el hueco entre el fin de una célula y el principio de
 *      la siguiente, dividido entre el avance del espacio, da cuántos van.
 *
 * ## Lo que no se puede distinguir, dicho
 *
 * En el juego Simplex la `I` mayúscula y la `l` minúscula son EL MISMO TRAZO
 * con EL MISMO avance (una vertical de 21 unidades). No hay pixel que las
 * separe. Las plantillas que salen idénticas a la escala del renglón se
 * colapsan en una clase y se lee la primera del orden declarado
 * (`CAD_RASTER_TEXT_ALPHABET`: mayúsculas, cifras, signos, minúsculas), y el
 * resultado publica en `ambiguousWith` con quién se colapsó. Es la conducta de
 * un lector honrado: elegir y decir que eligió.
 *
 * ## Dónde está cada cosa
 *
 * Aquí vive la TUBERÍA: qué manchas hay, cuáles forman un renglón, dónde cae
 * su línea base y a qué altura, y qué se da por leído. La mecánica de la
 * comparación —el alfabeto candidato, la ventana, las plantillas
 * rasterizadas, el chanfle— vive en `raster-text-templates.ts`.
 *
 * ## El sistema de coordenadas
 *
 * Entra la imagen con la fila 0 ARRIBA. La inserción del renglón sale en
 * PÍXELES CON LA Y HACIA ARRIBA medidos en el centro del píxel —el mismo
 * sistema que `cadRasterVectorize` y que come `cadImagePixelToWorld`—, y las
 * cajas de los glifos salen en los dos: `bbox` en filas de la imagen para
 * depurar, y `cadRasterTextReadBoxes` en el sistema de la tubería para que el
 * comando sepa qué trazos ya se leyeron y no los duplique.
 */
import { CAD_HERSHEY_CAP_HEIGHT, cadHersheyGlyph, type CadHersheyFamily } from "./fonts/hershey-fonts";
import type { CadRasterImage } from "./raster-decode";
import {
  cadRasterTextPlausible,
  cadRasterTextRender,
  cadRasterTextShift,
  cadRasterTextTemplates,
  cadRasterTextWindow,
  type CadRasterBox,
  type CadRasterInkBlob,
} from "./raster-text-templates";
import { cadRasterInkMask, cadRasterThin } from "./raster-vectorize";

// El alfabeto y la caja viven con las plantillas, que es donde se usan; se
// vuelven a publicar aquí para que quien lee un resultado no tenga que saber
// en cuál de los dos módulos está cada pieza.
export { CAD_RASTER_TEXT_ALPHABET } from "./raster-text-templates";
export type { CadRasterBox } from "./raster-text-templates";

/** Lo que este reconocedor NO hace. Se enseña antes de escribir nada. */
export const CAD_RASTER_TEXT_LIMITS: readonly string[] = [
  "lee texto trazado con una fuente de TRAZOS (txt, simplex, romans, isocp, monotxt): ni manuscrito ni tipografías de contorno relleno",
  "los caracteres que se tocan entre sí se leen como una sola mancha, no ganan el margen y salen como polilíneas",
  "un renglón inclinado más de lo declarado respecto de la horizontal de la imagen no se agrupa: sus trazos salen como polilíneas",
  "en el juego Simplex la I mayúscula y la l minúscula son el mismo trazo: se lee I y se declara con quién se colapsó",
];

/**
 * Distancia de chanfle normalizada por encima de la cual la plantilla y la
 * mancha ya no son la misma letra. Medida sobre este mismo motor: un glifo
 * trazado limpio queda entre 0,000 y 0,013; el mismo con el trazo engrosado y
 * un 2 % de ruido, hasta 0,024; una estrella de cinco puntas dibujada a mano
 * en el hueco de un rótulo da 0,046 y un garabato, 0,070. El corte va en el
 * valle: 0,04, que a altura de mayúscula 24 px son unos 2 px de desviación
 * media entre las dos formas.
 */
export const CAD_RASTER_TEXT_MAX_DISTANCE = 0.04;

/**
 * Cuánto tiene que ganar la mejor plantilla a la segunda para que la lectura
 * cuente. Con menos de esto hay dos letras que explican igual de bien la
 * mancha, y elegir una sería inventarla.
 */
export const CAD_RASTER_TEXT_MARGIN = 0.12;

/**
 * Inclinación máxima del renglón. Medido sobre este motor con el mismo rótulo
 * inclinado a propósito: a 1°, 1,5°, 2° y 3° se leen los 19 glifos y el giro
 * sale a menos de una décima del real; a 5° la franja del renglón ya no se
 * solapa consigo misma de un extremo al otro, el renglón se parte y sólo se
 * leen 5. Por encima de esto no se intenta: sale como geometría y se dice.
 */
export const CAD_RASTER_TEXT_MAX_SKEW_DEG = 3;

export interface CadRasterTextOptions {
  /** Umbral 0–255; sin él, el de Otsu. El MISMO que usó la vectorización. */
  threshold?: number;
  /** Área mínima de una componente, en píxeles. Por debajo es polvo. */
  minBlobPixels?: number;
  /** El juego de trazos contra el que se compara. */
  family?: CadHersheyFamily;
  /** Distancia de chanfle normalizada máxima para dar por leído un glifo. */
  maxDistance?: number;
  /** Cuánto ha de ganar la mejor a la segunda, en términos relativos. */
  margin?: number;
  /** Altura de mayúscula mínima, en píxeles: por debajo no hay forma que leer. */
  minCapHeightPx?: number;
  /** Inclinación máxima del renglón, en grados. Más allá se deja como geometría. */
  maxSkewDeg?: number;
}

export interface CadRasterTextGlyph {
  /** El carácter leído, o `null` cuando no ganó el margen: NO se inventa. */
  character: string | null;
  /** Distancia de chanfle normalizada de la mejor plantilla. */
  distance: number;
  /** La segunda, y la suya: sin ellas el margen no se puede comprobar. */
  runnerUp: string | null;
  runnerUpDistance: number;
  /** Plantillas idénticas a ésta a esta escala; se leyó la primera declarada. */
  ambiguousWith: readonly string[];
  /** Caja de la tinta en FILAS DE LA IMAGEN (y hacia abajo). */
  bbox: CadRasterBox;
  pixels: number;
}

export interface CadRasterTextRow {
  /** Lo leído, con los espacios medidos por avance. */
  text: string;
  /** Altura de mayúscula del renglón, en píxeles. */
  capHeightPx: number;
  /** Giro medido del renglón, en grados antihorarios (y hacia arriba). */
  rotationDeg: number;
  /** Origen de la línea base, en píxeles con la Y hacia ARRIBA. */
  insertion: { x: number; y: number };
  /** La fila de la imagen donde cae la línea base, para depurar. */
  baselineRow: number;
  glyphs: CadRasterTextGlyph[];
  readGlyphs: number;
  leftAsGeometry: number;
  bbox: CadRasterBox;
}

export interface CadRasterTextResult {
  width: number;
  height: number;
  threshold: number;
  thresholdAuto: boolean;
  family: CadHersheyFamily;
  maxDistance: number;
  margin: number;
  minBlobPixels: number;
  /** Renglones con al menos un glifo leído. */
  rows: CadRasterTextRow[];
  /** Glifos leídos y manchas dejadas como geometría, en todo el escaneo. */
  readGlyphs: number;
  leftAsGeometry: number;
  /** Renglones que se descartaron enteros (inclinados, minúsculos, sueltos). */
  discardedRows: number;
  limits: readonly string[];
}

const DX8 = [1, 1, 0, -1, -1, -1, 0, 1];
const DY8 = [0, -1, -1, -1, 0, 1, 1, 1];

/** Hipótesis de escala sobre la altura medida, en el orden en que se prueban. */
const SCALE_HYPOTHESES: readonly number[] = [1, 1.04, 0.96, 1.08, 0.92, 1.12, CAD_HERSHEY_CAP_HEIGHT / 14];

/** Una componente conexa del escaneo; una mancha, en el vocabulario del plan. */
type Component = CadRasterInkBlob;

/** Un carácter candidato: las manchas que se solapan en horizontal, juntas. */
type Candidate = CadRasterInkBlob;

/**
 * El escaneo entero, de píxeles a renglones de texto. Puro: ni red, ni
 * navegador, ni azar — el mismo PNG da siempre la misma lectura.
 */
export function cadRasterRecognizeText(image: CadRasterImage, options: CadRasterTextOptions = {}): CadRasterTextResult {
  const family = options.family ?? "Hershey Simplex";
  const minBlobPixels = Math.max(1, Math.round(options.minBlobPixels ?? 4));
  const maxDistance = options.maxDistance ?? CAD_RASTER_TEXT_MAX_DISTANCE;
  const margin = options.margin ?? CAD_RASTER_TEXT_MARGIN;
  const minCapHeightPx = options.minCapHeightPx ?? 6;
  const maxSkewDeg = options.maxSkewDeg ?? CAD_RASTER_TEXT_MAX_SKEW_DEG;

  const mask = cadRasterInkMask(image, options.threshold);
  const components = connectedComponents(mask.ink, mask.width, mask.height, minBlobPixels);
  // Y ahora el esqueleto, sobre la tinta ya limpia de polvo: se compara línea
  // media contra línea media, que es lo que una fuente de trazos es. Sin esto
  // un rótulo de plumilla gorda mide sobre todo su GROSOR y todas las
  // plantillas parecidas empatan, así que ninguna gana el margen.
  const skeleton = new Uint8Array(mask.ink.length);
  for (const component of components) for (const index of component.indices) skeleton[index] = 1;
  cadRasterThin(skeleton, mask.width, mask.height);
  const thinned = components.map((component) => thin(component, skeleton, mask.width)).filter((component): component is Component => component !== null);
  const bands = groupRows(thinned);

  const rows: CadRasterTextRow[] = [];
  let readGlyphs = 0;
  let leftAsGeometry = 0;
  let discardedRows = 0;
  for (const band of bands) {
    const row = readRow(band, mask.width, mask.height, family, {
      maxDistance,
      margin,
      minCapHeightPx,
      maxSkewDeg,
    });
    if (!row) {
      discardedRows += 1;
      continue;
    }
    rows.push(row);
    readGlyphs += row.readGlyphs;
    leftAsGeometry += row.leftAsGeometry;
  }

  return {
    width: mask.width,
    height: mask.height,
    threshold: mask.threshold,
    thresholdAuto: mask.thresholdAuto,
    family,
    maxDistance,
    margin,
    minBlobPixels,
    rows,
    readGlyphs,
    leftAsGeometry,
    discardedRows,
    limits: CAD_RASTER_TEXT_LIMITS,
  };
}

/**
 * Las cajas de los glifos LEÍDOS, en píxeles con la Y hacia ARRIBA: el sistema
 * en el que `cadRasterVectorize` devuelve sus trazos. Con ellas el comando
 * sabe qué polilíneas ya son texto y no las escribe dos veces.
 */
export function cadRasterTextReadBoxes(result: CadRasterTextResult): CadRasterBox[] {
  const boxes: CadRasterBox[] = [];
  for (const row of result.rows)
    for (const glyph of row.glyphs) {
      if (glyph.character === null) continue;
      boxes.push({
        minX: glyph.bbox.minX,
        maxX: glyph.bbox.maxX,
        // La fila `r` de la imagen es el píxel `height − 1 − r` con la Y arriba.
        minY: result.height - 1 - glyph.bbox.maxY,
        maxY: result.height - 1 - glyph.bbox.minY,
      });
    }
  return boxes;
}

/** ¿Cae este trazo entero dentro de alguna caja ya leída como texto? */
export function cadRasterTextCovers(boxes: readonly CadRasterBox[], points: readonly { x: number; y: number }[], slackPx = 1.5): boolean {
  if (boxes.length === 0 || points.length === 0) return false;
  return boxes.some((box) =>
    points.every(
      (point) =>
        point.x >= box.minX - slackPx &&
        point.x <= box.maxX + 1 + slackPx &&
        point.y >= box.minY - slackPx &&
        point.y <= box.maxY + 1 + slackPx,
    ),
  );
}

// ---------------------------------------------------------------------------
// 1. Componentes conexas
// ---------------------------------------------------------------------------

/** Componentes de 8 vecinos, sin las que no llegan al área mínima. */
function connectedComponents(ink: Uint8Array, width: number, height: number, minBlobPixels: number): Component[] {
  const seen = new Uint8Array(ink.length);
  const stack: number[] = [];
  const out: Component[] = [];
  for (let start = 0; start < ink.length; start += 1) {
    if (!ink[start] || seen[start]) continue;
    const indices: number[] = [];
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    while (stack.length > 0) {
      const index = stack.pop()!;
      indices.push(index);
      const x = index % width;
      const y = (index - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let direction = 0; direction < 8; direction += 1) {
        const nx = x + DX8[direction];
        const ny = y + DY8[direction];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const neighbour = ny * width + nx;
        if (!ink[neighbour] || seen[neighbour]) continue;
        seen[neighbour] = 1;
        stack.push(neighbour);
      }
    }
    if (indices.length < minBlobPixels) continue;
    out.push({ bbox: { minX, minY, maxX, maxY }, indices });
  }
  return out;
}

/** La componente reducida a su esqueleto, con la caja que le queda. */
function thin(component: Component, skeleton: Uint8Array, width: number): Component | null {
  const indices = component.indices.filter((index) => skeleton[index]);
  if (indices.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const index of indices) {
    const x = index % width;
    const y = (index - x) / width;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { bbox: { minX, minY, maxX, maxY }, indices };
}

// ---------------------------------------------------------------------------
// 2. Renglones
// ---------------------------------------------------------------------------

/**
 * Agrupa las componentes en renglones. Dos van juntas si sus franjas
 * verticales se solapan en más de la mitad de la más baja —así el punto de una
 * `i` y el punto de un `.` se quedan con su letra— y si el hueco horizontal
 * que las separa no pasa de dos alturas y media: más allá ya no es un espacio,
 * es otro rótulo del plano que da la casualidad de estar a la misma altura.
 */
function groupRows(components: readonly Component[]): Component[][] {
  const sorted = [...components].sort((a, b) => a.bbox.minY - b.bbox.minY || a.bbox.minX - b.bbox.minX);
  const bands: Component[][] = [];
  const bandBoxes: CadRasterBox[] = [];
  for (const component of sorted) {
    let joined = -1;
    for (let index = 0; index < bands.length; index += 1) {
      const box = bandBoxes[index];
      const overlap = Math.min(box.maxY, component.bbox.maxY) - Math.max(box.minY, component.bbox.minY) + 1;
      const shortest = Math.min(box.maxY - box.minY + 1, component.bbox.maxY - component.bbox.minY + 1);
      if (overlap <= 0.5 * shortest) continue;
      joined = index;
      break;
    }
    if (joined < 0) {
      bands.push([component]);
      bandBoxes.push({ ...component.bbox });
      continue;
    }
    bands[joined].push(component);
    const box = bandBoxes[joined];
    box.minX = Math.min(box.minX, component.bbox.minX);
    box.maxX = Math.max(box.maxX, component.bbox.maxX);
    box.minY = Math.min(box.minY, component.bbox.minY);
    box.maxY = Math.max(box.maxY, component.bbox.maxY);
  }

  // Y ahora se parte cada franja por los huecos horizontales grandes.
  const rows: Component[][] = [];
  for (const band of bands) {
    const ordered = [...band].sort((a, b) => a.bbox.minX - b.bbox.minX);
    const tallest = Math.max(...ordered.map((component) => component.bbox.maxY - component.bbox.minY + 1));
    const maxGap = 2.5 * tallest;
    let current: Component[] = [];
    let reach = -Infinity;
    for (const component of ordered) {
      if (current.length > 0 && component.bbox.minX - reach > maxGap) {
        rows.push(current);
        current = [];
      }
      current.push(component);
      reach = Math.max(reach, component.bbox.maxX);
    }
    if (current.length > 0) rows.push(current);
  }
  return attachDiacritics(rows);
}

/**
 * Pega los acentos a su renglón. La virgulilla de la `Ñ` y la tilde de la `Ó`
 * son componentes SUELTAS que flotan por encima de la altura de mayúscula: no
 * se solapan en vertical con la franja del renglón y sin este paso se quedan
 * fuera, con lo que `AÑO` se lee `ANO` —una palabra distinta, no una errata—.
 * Se admite una componente suelta cuando cae encima de una letra del renglón,
 * la toca en horizontal y no se aleja más de media altura del renglón.
 */
function attachDiacritics(rows: readonly Component[][]): Component[][] {
  const solid = rows.filter((row) => row.length >= 2);
  const loose = rows.filter((row) => row.length < 2).flat();
  if (solid.length === 0 || loose.length === 0) return [...rows];
  const boxes = solid.map((row) => ({
    minX: Math.min(...row.map((component) => component.bbox.minX)),
    maxX: Math.max(...row.map((component) => component.bbox.maxX)),
    minY: Math.min(...row.map((component) => component.bbox.minY)),
    maxY: Math.max(...row.map((component) => component.bbox.maxY)),
  }));
  const orphans: Component[] = [];
  for (const mark of loose) {
    let home = -1;
    for (let index = 0; index < solid.length && home < 0; index += 1) {
      const box = boxes[index];
      const rowHeight = box.maxY - box.minY + 1;
      if (mark.bbox.minX > box.maxX || mark.bbox.maxX < box.minX) continue;
      const gap = box.minY - mark.bbox.maxY;
      if (gap < 0 || gap > 0.5 * rowHeight) continue;
      if (!solid[index].some((letter) => letter.bbox.minX <= mark.bbox.maxX && mark.bbox.minX <= letter.bbox.maxX)) continue;
      home = index;
    }
    if (home < 0) orphans.push(mark);
    else {
      solid[home].push(mark);
      boxes[home].minY = Math.min(boxes[home].minY, mark.bbox.minY);
    }
  }
  return [...solid, ...orphans.map((component) => [component])];
}

// ---------------------------------------------------------------------------
// 3. Un renglón: base, altura, caracteres y lectura
// ---------------------------------------------------------------------------

interface RowLimits {
  maxDistance: number;
  margin: number;
  minCapHeightPx: number;
  maxSkewDeg: number;
}

function readRow(band: readonly Component[], width: number, height: number, family: CadHersheyFamily, limits: RowLimits): CadRasterTextRow | null {
  // Una componente sola no es un renglón: es una mancha, y una mancha no se
  // lee como letra por mucho que se le parezca.
  if (band.length < 2) return null;

  const heights = band.map((component) => component.bbox.maxY - component.bbox.minY + 1);
  const tallest = Math.max(...heights);
  // Los «altos» son los que llegan al menos a tres cuartos del más alto: las
  // mayúsculas y las cifras. De ellos salen la base y la altura.
  const tall = band.filter((component, index) => heights[index] >= 0.75 * tallest);
  // La mediana de un número PAR de componentes cae a medio píxel, y medio
  // píxel de línea base convierte todos los índices de la ventana en
  // fraccionarios: un `Uint8Array` ignora en silencio esos índices, la máscara
  // sale vacía y el renglón entero se lee como basura. Se redondea aquí, una
  // vez, y todo lo que cuelga de la base queda entero.
  const baselineRow = Math.round(median(tall.map((component) => component.bbox.maxY)));
  const capTopRow = Math.round(median(tall.map((component) => component.bbox.minY)));
  const measuredCap = baselineRow - capTopRow;
  if (measuredCap < limits.minCapHeightPx) return null;

  // La inclinación: recta de mínimos cuadrados por los cantos inferiores de
  // los altos que de verdad pisan la base (un guion flota y no cuenta). La
  // línea base de un renglón torcido NO es una fila: es una recta, y cada
  // glifo se alinea con ELLA en su propia x. Sin eso, a un grado de
  // inclinación —lo que deja una hoja mal puesta en el escáner— las letras de
  // la derecha caen medio cuerpo por debajo de la plantilla y el renglón se
  // lee a trozos (medido: de 19 glifos a 7).
  const feet = tall
    .filter((component) => Math.abs(component.bbox.maxY - baselineRow) <= 0.2 * measuredCap)
    .map((component) => ({ x: (component.bbox.minX + component.bbox.maxX) / 2, y: component.bbox.maxY }));
  const fitted = feet.length >= 2 ? leastSquaresLine(feet) : { slope: 0, intercept: baselineRow };
  // Por debajo de un cuarto de grado el ajuste es RUIDO, no inclinación: los
  // pies de las letras se mueven un píxel al adelgazar y esa recta casi plana
  // desplaza la base de unas letras sí y otras no. Ahí manda la mediana, que
  // no tiene ese temblor (medido: con la recta siempre puesta se perdía el
  // guion de «4-A» en el rótulo engrosado).
  const fit = Math.abs(fitted.slope) < Math.tan((0.25 * Math.PI) / 180) ? { slope: 0, intercept: baselineRow } : fitted;
  const baselineAt = (x: number) => fit.intercept + fit.slope * x;
  // La fila crece HACIA ABAJO: una pendiente positiva en filas es un giro
  // horario, y el giro que se publica es antihorario con la Y hacia arriba.
  // `fit.slope === 0` se compara a propósito: sin ello el giro de un renglón
  // derecho sale como −0, que se imprime «-0» y parece una medida.
  const rotationDeg = fit.slope === 0 ? 0 : (-Math.atan(fit.slope) * 180) / Math.PI;
  if (Math.abs(rotationDeg) > limits.maxSkewDeg) return null;

  const candidates = splitCharacters(band);
  if (candidates.length === 0) return null;

  let best: RowReading | null = null;
  for (const hypothesis of SCALE_HYPOTHESES) {
    const capHeightPx = measuredCap * hypothesis;
    if (capHeightPx < limits.minCapHeightPx) continue;
    const reading = readWithCap(candidates, width, height, family, capHeightPx, baselineAt, limits);
    if (!best || better(reading, best)) best = reading;
  }
  if (!best || best.readGlyphs === 0) return null;

  const rowBox: CadRasterBox = {
    minX: Math.min(...band.map((component) => component.bbox.minX)),
    maxX: Math.max(...band.map((component) => component.bbox.maxX)),
    minY: Math.min(...band.map((component) => component.bbox.minY)),
    maxY: Math.max(...band.map((component) => component.bbox.maxY)),
  };
  return {
    text: best.text,
    capHeightPx: best.capHeightPx,
    rotationDeg,
    // El centro del píxel, como la tubería: columna + ½, y `height − 1 − fila + ½`.
    // La fila es la de la RECTA en la x de la pluma, no la mediana: en un
    // renglón torcido son cosas distintas.
    insertion: { x: best.penX + 0.5, y: height - 1 - baselineAt(best.penX) + 0.5 },
    baselineRow,
    glyphs: best.glyphs,
    readGlyphs: best.readGlyphs,
    leftAsGeometry: best.glyphs.length - best.readGlyphs,
    bbox: rowBox,
  };
}

interface RowReading {
  text: string;
  glyphs: CadRasterTextGlyph[];
  readGlyphs: number;
  capHeightPx: number;
  penX: number;
  meanDistance: number;
}

/** Gana la hipótesis que lee MÁS glifos; a igualdad, la que deja menos distancia. */
function better(candidate: RowReading, incumbent: RowReading): boolean {
  if (candidate.readGlyphs !== incumbent.readGlyphs) return candidate.readGlyphs > incumbent.readGlyphs;
  return candidate.meanDistance < incumbent.meanDistance;
}

/** Un carácter son las componentes que se solapan (o se tocan) en horizontal. */
function splitCharacters(band: readonly Component[]): Candidate[] {
  const ordered = [...band].sort((a, b) => a.bbox.minX - b.bbox.minX);
  const out: Candidate[] = [];
  for (const component of ordered) {
    const last = out[out.length - 1];
    if (last && component.bbox.minX <= last.bbox.maxX) {
      last.bbox.maxX = Math.max(last.bbox.maxX, component.bbox.maxX);
      last.bbox.minY = Math.min(last.bbox.minY, component.bbox.minY);
      last.bbox.maxY = Math.max(last.bbox.maxY, component.bbox.maxY);
      last.indices.push(...component.indices);
      continue;
    }
    out.push({ bbox: { ...component.bbox }, indices: [...component.indices] });
  }
  return out;
}

function readWithCap(
  candidates: readonly Candidate[],
  width: number,
  height: number,
  family: CadHersheyFamily,
  capHeightPx: number,
  baselineAt: (x: number) => number,
  limits: RowLimits,
): RowReading {
  // Una ventana común a todo el renglón: como la plantilla cae siempre en el
  // mismo sitio de ella, se rasteriza una vez y sirve para los 24 caracteres
  // del rótulo en vez de 24 veces.
  const widest = Math.max(...candidates.map((candidate) => candidate.bbox.maxX - candidate.bbox.minX + 1));
  const window = cadRasterTextWindow(capHeightPx, widest);
  const scale = window.scale;
  const templates = cadRasterTextTemplates(family, window);

  const glyphs: CadRasterTextGlyph[] = [];
  let text = "";
  let readGlyphs = 0;
  let distanceSum = 0;
  let penX = 0;
  let cursor: number | null = null;
  let firstPen: number | null = null;
  const spaceAdvance = cadHersheyGlyph(family, " ").advance * scale;

  for (const candidate of candidates) {
    const shift = cadRasterTextShift(candidate, width, window);
    // Centrar por el centro de masa deja todavía medio píxel de redondeo, y
    // medio píxel de corrimiento sube la distancia de un glifo EXACTO de 0,004
    // a 0,035 (medido sobre este mismo rótulo). Por eso se prueban tres
    // corrimientos y gana el mejor: es la diferencia entre comparar formas y
    // comparar redondeos.
    const baselineRow = Math.round(baselineAt((candidate.bbox.minX + candidate.bbox.maxX) / 2));
    const variants = [shift - 1, shift, shift + 1].map((column) => cadRasterTextRender(candidate, column, width, window, baselineRow));
    const centre = variants[1];
    const pixels = centre.pixels.length;
    const candidateBox = centre.box;

    let bestCharacter: string | null = null;
    let bestDistance = Infinity;
    let bestSignature = "";
    let bestAdvance = 0;
    let bestPen = 0;
    let bestShift = shift;
    let runnerUp: string | null = null;
    let runnerUpDistance = Infinity;
    if (pixels > 0) {
      for (const template of templates) {
        if (!cadRasterTextPlausible(template.box, candidateBox, capHeightPx)) continue;
        let score = Infinity;
        let scoreShift = shift;
        for (const variant of variants) {
          if (variant.pixels.length === 0) continue;
          let toTemplate = 0;
          for (const at of template.pixels) toTemplate += variant.distance[at];
          let toCandidate = 0;
          for (const at of variant.pixels) toCandidate += template.distance[at];
          const attempt = (toTemplate / template.pixels.length + toCandidate / variant.pixels.length) / (2 * capHeightPx);
          if (attempt < score) {
            score = attempt;
            scoreShift = variant.shift;
          }
        }
        if (score < bestDistance) {
          // La anterior mejor baja a segunda, salvo que dibuje EXACTAMENTE lo
          // mismo: dos plantillas idénticas son una sola clase, y hacer que
          // una fuera «la segunda» de la otra dejaría sin leer toda I y toda l.
          if (template.signature !== bestSignature) {
            runnerUp = bestCharacter;
            runnerUpDistance = bestDistance;
          }
          bestDistance = score;
          bestCharacter = template.character;
          bestSignature = template.signature;
          bestAdvance = template.advance;
          bestPen = template.penOffset;
          bestShift = scoreShift;
        } else if (score < runnerUpDistance && template.signature !== bestSignature) {
          runnerUp = template.character;
          runnerUpDistance = score;
        }
      }
    }

    // El margen: la mejor tiene que ganar de verdad. Si no, NO se inventa.
    const clear = bestCharacter !== null && bestDistance <= limits.maxDistance && (runnerUpDistance === Infinity || bestDistance <= runnerUpDistance * (1 - limits.margin));
    const ambiguousWith = clear ? templates.filter((template) => template.signature === bestSignature && template.character !== bestCharacter).map((template) => template.character) : [];

    glyphs.push({
      character: clear ? bestCharacter : null,
      distance: Number.isFinite(bestDistance) ? bestDistance : Infinity,
      runnerUp: Number.isFinite(runnerUpDistance) ? runnerUp : null,
      runnerUpDistance,
      ambiguousWith,
      bbox: { ...candidate.bbox },
      pixels,
    });

    if (clear) {
      penX = bestPen - bestShift;
      if (cursor !== null) text += " ".repeat(Math.max(0, Math.round((penX - cursor) / spaceAdvance)));
      text += bestCharacter;
      cursor = penX + bestAdvance * scale;
      if (firstPen === null) firstPen = penX;
      readGlyphs += 1;
      distanceSum += bestDistance;
    } else {
      // De una mancha ilegible no se sabe el avance: se toma su propia caja,
      // que es lo único medido, y el hueco se rellena con los espacios que
      // toque. Nunca con una letra parecida.
      const glyphSized = Math.max(candidate.bbox.maxX - candidate.bbox.minX, candidate.bbox.maxY - candidate.bbox.minY) >= 0.3 * capHeightPx;
      if (!glyphSized) continue; // una mota no mueve la pluma: no es un glifo
      if (cursor !== null) text += " ".repeat(Math.max(0, Math.round((candidate.bbox.minX - cursor) / spaceAdvance)));
      cursor = candidate.bbox.maxX + 1;
    }
  }

  return {
    text,
    glyphs,
    readGlyphs,
    capHeightPx,
    penX: firstPen ?? candidates[0].bbox.minX,
    meanDistance: readGlyphs > 0 ? distanceSum / readGlyphs : Infinity,
  };
}

// ---------------------------------------------------------------------------
// 4. Herramientas: la mediana y la recta de mínimos cuadrados
// ---------------------------------------------------------------------------

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function leastSquaresLine(points: readonly { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = points.length;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.x - meanX) * (point.y - meanY);
    denominator += (point.x - meanX) ** 2;
  }
  const slope = denominator < 1e-9 ? 0 : numerator / denominator;
  return { slope, intercept: meanY - slope * meanX };
}
