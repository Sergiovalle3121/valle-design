/**
 * LA GEOMETRÍA DE UNA IMAGEN ADJUNTA, en papel (Ola H, 2026-09-02).
 *
 * Un plano escaneado se calca encima: se inserta, se escala a una medida
 * conocida, se recorta lo que sobra y se atenúa para que el trazo nuevo se
 * distinga del viejo. Todo eso son cuentas sobre la entidad `image` que el
 * formato YA tiene —`insertion`, `uVector`, `vVector`, `size`,
 * `clipBoundary`, `brightness`, `contrast`, `fade`, `showImage`— y este
 * módulo las hace en un solo sitio para que el visor, la lámina, el DXF y
 * las órdenes no discrepen.
 *
 * ## La convención, dicha una vez
 *
 * `insertion` es la esquina INFERIOR IZQUIERDA. `uVector` y `vVector` son lo
 * que mide UN píxel en unidades de dibujo a lo largo de cada eje (la
 * rotación vive dentro de los vectores); `size` es el tamaño en píxeles de la
 * porción mostrada. Un punto de la imagen en píxeles `(px, py)` —con `py`
 * creciendo hacia ARRIBA, como en el DXF— cae en el plano en
 * `insertion + u·px + v·py`. El recorte se guarda en esos mismos píxeles, así
 * que gira y se refleja con la imagen (`fill-entity-adapters.ts` lo dibuja
 * por la misma regla).
 *
 * ## El ajuste, con los números de AutoCAD
 *
 * Brillo y contraste van de 0 a 100 con 50 neutro; la atenuación de 0 (nada)
 * a 100 (invisible). El píxel ajustado es
 * `clamp((v − ½)·(contraste/50) + ½ + (brillo − 50)/50)`: a contraste 100
 * la pendiente se dobla, a 0 todo queda gris medio, y el brillo desplaza.
 * La atenuación es opacidad: `1 − fade/100`. El visor lo hace en el shader
 * y la lámina en el mismo `Uint8Array` de 256 entradas; los dos salen de
 * `cadImageAdjust`, que se prueba con sus tres extremos.
 */
import type { CadPoint2, CadPoint3 } from "./cad-document";
import type { CadImageDefinition, CadImageEntity } from "./cad-entities-v4";

export const CAD_IMAGE_BRIGHTNESS_NEUTRAL = 50;
export const CAD_IMAGE_CONTRAST_NEUTRAL = 50;
export const CAD_IMAGE_FADE_NONE = 0;

/** Las cuatro esquinas en el plano: inserción, +U, +U+V, +V. */
export function cadImageCorners(entity: CadImageEntity): CadPoint2[] {
  const { insertion: o, uVector: u, vVector: v, size } = entity;
  const ux = u.x * size.width;
  const uy = u.y * size.width;
  const vx = v.x * size.height;
  const vy = v.y * size.height;
  return [
    { x: o.x, y: o.y },
    { x: o.x + ux, y: o.y + uy },
    { x: o.x + ux + vx, y: o.y + uy + vy },
    { x: o.x + vx, y: o.y + vy },
  ];
}

/** Un píxel de la imagen al plano. */
export function cadImagePixelToWorld(entity: CadImageEntity, px: number, py: number): CadPoint2 {
  const { insertion: o, uVector: u, vVector: v } = entity;
  return { x: o.x + u.x * px + v.x * py, y: o.y + u.y * px + v.y * py };
}

/**
 * Un punto del plano a píxeles de la imagen: resuelve `o + u·px + v·py = p`.
 * `null` si U y V son paralelos (la imagen no tiene área): ahí no hay píxel.
 */
export function cadImageWorldToPixel(entity: CadImageEntity, point: CadPoint2): CadPoint2 | null {
  const { insertion: o, uVector: u, vVector: v } = entity;
  const det = u.x * v.y - u.y * v.x;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const dx = point.x - o.x;
  const dy = point.y - o.y;
  return { x: (dx * v.y - dy * v.x) / det, y: (u.x * dy - u.y * dx) / det };
}

/** El recorte en el plano, o `null` si no lo hay (menos de 3 vértices). */
export function cadImageClipWorld(entity: CadImageEntity): CadPoint2[] | null {
  const clip = entity.clipBoundary;
  if (!clip || clip.length < 3) return null;
  return clip.map((pixel) => cadImagePixelToWorld(entity, pixel.x, pixel.y));
}

/** Lo que se ve: el recorte si lo hay, si no el rectángulo entero. */
export function cadImageVisiblePolygon(entity: CadImageEntity): CadPoint2[] {
  return cadImageClipWorld(entity) ?? cadImageCorners(entity);
}

/** Lo mismo, en píxeles de la imagen (para las UV del visor). */
export function cadImagePixelPolygon(entity: CadImageEntity): CadPoint2[] {
  const clip = entity.clipBoundary;
  if (clip && clip.length >= 3) return clip.map((pixel) => ({ x: pixel.x, y: pixel.y }));
  const { width, height } = entity.size;
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

/**
 * Un contorno tecleado en el plano, como recorte en píxeles (z = 0). `null`
 * si la imagen no tiene área. No se recorta al rectángulo de la imagen: un
 * vértice fuera sólo deja ver hasta el borde, como en AutoCAD.
 */
export function cadImageClipFromWorld(entity: CadImageEntity, points: readonly CadPoint2[]): CadPoint3[] | null {
  const pixels: CadPoint3[] = [];
  for (const point of points) {
    const pixel = cadImageWorldToPixel(entity, point);
    if (!pixel) return null;
    pixels.push({ x: pixel.x, y: pixel.y, z: 0 });
  }
  return pixels;
}

/** Área con signo de un polígono; positiva en sentido antihorario. */
export function cadImagePolygonArea(points: readonly CadPoint2[]): number {
  let twice = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return twice / 2;
}

/** Unidades de dibujo que mide un píxel a lo largo de U. */
export function cadImageUnitsPerPixel(entity: CadImageEntity): number {
  return Math.hypot(entity.uVector.x, entity.uVector.y);
}

/** Giro de la imagen en el plano, en grados antihorarios. */
export function cadImageRotationDeg(entity: CadImageEntity): number {
  return (Math.atan2(entity.uVector.y, entity.uVector.x) * 180) / Math.PI;
}

/** `true` si U y V no son perpendiculares: la imagen está sesgada. */
export function cadImageIsSkewed(entity: CadImageEntity): boolean {
  const { uVector: u, vVector: v } = entity;
  const dot = u.x * v.x + u.y * v.y;
  return Math.abs(dot) > 1e-6 * Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
}

/** `true` si V queda a la derecha de U: la imagen está reflejada (MIRROR). */
export function cadImageIsMirrored(entity: CadImageEntity): boolean {
  const { uVector: u, vVector: v } = entity;
  return u.x * v.y - u.y * v.x < 0;
}

// ---------------------------------------------------------------------------
// La definición: qué se puede pintar
// ---------------------------------------------------------------------------

const RASTER_EXTENSION = /\.(png|jpe?g|gif|webp|bmp)(?:[?#]|$)/i;
const RASTER_DATA_URI = /^data:image\/(png|jpeg|jpg|gif|webp|bmp)[;,]/i;

/**
 * `true` si el URI apunta a píxeles que un navegador sabe decodificar: un
 * `data:image/…` (la imagen viaja dentro del dibujo) o un `http(s)` a un
 * archivo de imagen. Un `asset://` sin resolver o un sustrato PDF no lo son:
 * se dibuja su marco y nada más, que es lo que había.
 */
export function cadImageIsRaster(definition: Pick<CadImageDefinition, "uri">): boolean {
  const uri = definition.uri;
  if (RASTER_DATA_URI.test(uri)) return true;
  return /^https?:\/\//i.test(uri) && RASTER_EXTENSION.test(uri);
}

/** `true` si la imagen viaja dentro del documento (URI `data:`). */
export function cadImageIsEmbedded(definition: Pick<CadImageDefinition, "uri">): boolean {
  return /^data:/i.test(definition.uri);
}

/** El nombre de archivo que se enseña y que va al DXF en lugar de un `data:`. */
export function cadImageFileName(definition: Pick<CadImageDefinition, "uri" | "name">): string {
  if (definition.name && !/^data:/i.test(definition.name)) return definition.name;
  if (cadImageIsEmbedded(definition)) {
    const type = /^data:image\/(\w+)/i.exec(definition.uri)?.[1]?.toLowerCase() ?? "png";
    return `imagen.${type === "jpeg" ? "jpg" : type}`;
  }
  return definition.uri.split(/[\\/]/).pop() || definition.uri;
}

/** Bytes que pesa un `data:` en base64 (aproximado: 3/4 del texto). */
export function cadImageEmbeddedBytes(definition: Pick<CadImageDefinition, "uri">): number {
  const comma = definition.uri.indexOf(",");
  if (!cadImageIsEmbedded(definition) || comma < 0) return 0;
  return Math.floor(((definition.uri.length - comma - 1) * 3) / 4);
}

// ---------------------------------------------------------------------------
// El ajuste
// ---------------------------------------------------------------------------

/** Un canal (0–1) ajustado con brillo y contraste de 0 a 100 (50 neutro). */
export function cadImageAdjust(value: number, brightness = CAD_IMAGE_BRIGHTNESS_NEUTRAL, contrast = CAD_IMAGE_CONTRAST_NEUTRAL): number {
  const slope = clamp(contrast, 0, 100) / 50;
  const shift = (clamp(brightness, 0, 100) - 50) / 50;
  return clamp((value - 0.5) * slope + 0.5 + shift, 0, 1);
}

/** Opacidad que deja la atenuación (0 = intacta, 100 = invisible). */
export function cadImageOpacity(fade = CAD_IMAGE_FADE_NONE): number {
  return 1 - clamp(fade, 0, 100) / 100;
}

/** Tabla de 256 entradas para aplicar el ajuste a un búfer de píxeles. */
export function cadImageAdjustLut(brightness?: number, contrast?: number): Uint8Array {
  const lut = new Uint8Array(256);
  for (let index = 0; index < 256; index += 1) lut[index] = Math.round(cadImageAdjust(index / 255, brightness, contrast) * 255);
  return lut;
}

/** `true` si la imagen se ve tal cual: sin brillo, contraste ni atenuación. */
export function cadImageIsNeutral(entity: Pick<CadImageEntity, "brightness" | "contrast" | "fade">): boolean {
  return (
    (entity.brightness ?? CAD_IMAGE_BRIGHTNESS_NEUTRAL) === CAD_IMAGE_BRIGHTNESS_NEUTRAL &&
    (entity.contrast ?? CAD_IMAGE_CONTRAST_NEUTRAL) === CAD_IMAGE_CONTRAST_NEUTRAL &&
    (entity.fade ?? CAD_IMAGE_FADE_NONE) === CAD_IMAGE_FADE_NONE
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));
}
