/**
 * EL SOBRE DE IMAGEATTACH: lo que el anfitrión entrega al motor cuando el
 * usuario eligió un archivo de imagen (Ola H, 2026-09-02).
 *
 * El motor es puro y no decodifica PNG; el navegador sí. Así que el
 * anfitrión lee el archivo, lo decodifica UNA vez para saber su tamaño en
 * píxeles, lo empaqueta como `data:` y lo entrega por la puerta de texto
 * (`feedFile`), igual que el sobre GIS de MAPIMPORT. El motor sólo lee el
 * JSON y escribe la definición y la entidad.
 *
 * ## Por qué la imagen viaja DENTRO del dibujo
 *
 * Medido antes: no existe ningún almacén de imágenes en el producto (los
 * `asset://` que pedía IMAGE no los resolvía nadie) y un plano escaneado
 * sirve para calcar sólo si se ve. Un `data:image/…` en `uri` —que el
 * formato ya admite: es una cadena— hace que la imagen llegue al servidor,
 * al compañero y a la lámina sin un sistema de archivos aparte. El coste es
 * el peso del documento, y por eso hay TOPE: 8 MB de archivo, que en base64
 * son 10,7 MB de JSON y siguen cabiendo en la subida comprimida. Un
 * escaneo de un A1 a 200 dpi en JPEG pesa 2 a 4 MB. Un almacén de activos
 * con su API es la evolución natural y no es de esta ola.
 */
import { cadBytesToBase64 } from "./geo-import-bundle";

export const CAD_IMAGE_PAYLOAD_KIND = "valle-image";
export const CAD_IMAGE_PAYLOAD_ERROR_KIND = "valle-image-error";
/** Tope del archivo, en bytes. */
export const CAD_IMAGE_ATTACH_MAX_BYTES = 8_000_000;
/** Lo que el selector ofrece. */
export const CAD_IMAGE_ATTACH_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.bmp,image/png,image/jpeg,image/gif,image/webp,image/bmp";

export interface CadImagePayload {
  kind: typeof CAD_IMAGE_PAYLOAD_KIND;
  name: string;
  dataUri: string;
  width: number;
  height: number;
}

export interface CadImagePayloadError {
  kind: typeof CAD_IMAGE_PAYLOAD_ERROR_KIND;
  name: string;
  reason: string;
}

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

/** El MIME por la extensión, o `null` si no es una imagen que se sepa pintar. */
export function cadImageMimeFor(name: string): string | null {
  const extension = name.trim().toLowerCase().split(".").pop() ?? "";
  return MIME_BY_EXTENSION[extension] ?? null;
}

export function cadImageDataUri(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${cadBytesToBase64(bytes)}`;
}

export function encodeCadImagePayload(payload: CadImagePayload | CadImagePayloadError): string {
  return JSON.stringify(payload);
}

/** `null` si el texto no es un sobre de imagen; lanza si es uno malformado. */
export function decodeCadImagePayload(text: string): CadImagePayload | CadImagePayloadError | null {
  if (!text.startsWith(`{"kind":"${CAD_IMAGE_PAYLOAD_KIND}"`) && !text.startsWith(`{"kind":"${CAD_IMAGE_PAYLOAD_ERROR_KIND}"`)) return null;
  const parsed = JSON.parse(text) as { kind?: unknown; name?: unknown; dataUri?: unknown; width?: unknown; height?: unknown; reason?: unknown };
  if (parsed.kind === CAD_IMAGE_PAYLOAD_ERROR_KIND) {
    if (typeof parsed.name !== "string" || typeof parsed.reason !== "string") throw new Error("El sobre de error de imagen está malformado.");
    return { kind: CAD_IMAGE_PAYLOAD_ERROR_KIND, name: parsed.name, reason: parsed.reason };
  }
  const width = typeof parsed.width === "number" ? parsed.width : Number.NaN;
  const height = typeof parsed.height === "number" ? parsed.height : Number.NaN;
  if (
    typeof parsed.name !== "string" ||
    typeof parsed.dataUri !== "string" ||
    !parsed.dataUri.startsWith("data:image/") ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("El sobre de imagen está malformado: falta el nombre, el data: o el tamaño en píxeles.");
  return { kind: CAD_IMAGE_PAYLOAD_KIND, name: parsed.name, dataUri: parsed.dataUri, width, height };
}

/** Un identificador estable para el archivo: nombre saneado y huella del contenido. */
export function cadImageDefinitionIdFor(payload: Pick<CadImagePayload, "name" | "dataUri">): string {
  let hash = 5381;
  const text = payload.dataUri;
  // djb2 sobre una muestra: la huella no es criptográfica, sólo distingue dos
  // archivos con el mismo nombre; recorrer 10 MB para eso sería tirar tiempo.
  const step = Math.max(1, Math.floor(text.length / 4096));
  for (let index = 0; index < text.length; index += step) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  const name = payload.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64);
  return `image:${name}:${(hash >>> 0).toString(16)}:${text.length}`;
}
