/**
 * EL SOBRE DE PDFATTACH: lo que el anfitrión entrega al motor cuando el usuario
 * eligió un PDF (campaña «Superar a AutoCAD completo», F4, 2026-09-04).
 *
 * Es el mismo reparto que `image-attach-payload.ts`, calcado a propósito: el
 * motor de órdenes es puro y síncrono y tiene UNA puerta para archivos
 * —`feedFile(name, text)`, la que usan DXFIN, MAPIMPORT e IMAGEATTACH—, así que
 * el anfitrión lee el archivo, lo empaqueta como `data:` dentro de un sobre JSON
 * y lo mete por ahí. Abrir una segunda puerta binaria sería otro tipo de
 * entrada, otro `accepts` y otro camino que probar, para el mismo resultado.
 *
 * ## La única diferencia con el sobre de la imagen, y es la que importa
 *
 * El sobre de IMAGEATTACH lleva `width` y `height` porque el motor no sabe
 * decodificar un PNG: eso lo hace el navegador con `createImageBitmap`. **Aquí
 * no hay nada equivalente.** El lector de PDF vive dentro del motor
 * (`pdf-objects.ts` → `pdf-pages.ts`), es TypeScript puro y ya sabe contar las
 * páginas y medirlas: `readCadPdfPageList` lo hace sin importar nada. Así que el
 * anfitrión entrega BYTES y punto, y el sobre no declara ni páginas ni tamaños.
 *
 * No es un ahorro de campos: es evitar dos verdades. Un sobre que declarase «3
 * páginas» y un lector que encontrase 2 dejarían al usuario eligiendo una página
 * que no existe, y el fallo aparecería después de haber colocado la lámina.
 *
 * ## Por qué el PDF viaja DENTRO del dibujo
 *
 * Por lo mismo que la imagen, y con la misma cicatriz detrás: no hay almacén de
 * activos que resuelva un `asset://`, y un sustrato que no se ve no sirve para
 * calcar. Un `data:application/pdf;…` en el `uri` de la definición hace que la
 * lámina llegue al servidor, al compañero y a la hoja sin un sistema de archivos
 * aparte. El coste es el peso del documento, y por eso hay TOPE: los mismos 8 MB
 * del sobre de la imagen —10,7 MB de JSON en base64, que siguen cabiendo en la
 * subida comprimida—. Un plano de obra exportado desde un CAD pesa entre 200 kB
 * y 2 MB; un escaneo de un A1 a 200 dpi, de 2 a 4 MB.
 *
 * Y hay un segundo motivo que la imagen no tiene: con los bytes dentro del
 * documento, `PDFPAGE` puede cambiar de página SIN volver a pedir el archivo.
 * Un sustrato cuya ruta apunta fuera del dibujo se queda clavado en la página
 * con la que se adjuntó en cuanto el archivo original no está a mano.
 */
import { cadBase64ToBytes, cadBytesToBase64 } from "../geo-import-bundle";

export const CAD_PDF_PAYLOAD_KIND = "valle-pdf";
export const CAD_PDF_PAYLOAD_ERROR_KIND = "valle-pdf-error";
/** Tope del archivo, en bytes. El mismo que el sobre de la imagen. */
export const CAD_PDF_ATTACH_MAX_BYTES = 8_000_000;
/** Lo que el selector de archivos ofrece. */
export const CAD_PDF_ATTACH_ACCEPT = ".pdf,application/pdf";
export const CAD_PDF_MIME = "application/pdf";

const DATA_URI_PREFIX = `data:${CAD_PDF_MIME};base64,`;

export interface CadPdfPayload {
  kind: typeof CAD_PDF_PAYLOAD_KIND;
  name: string;
  /** `data:application/pdf;base64,…`. Los bytes enteros del archivo. */
  dataUri: string;
}

export interface CadPdfPayloadError {
  kind: typeof CAD_PDF_PAYLOAD_ERROR_KIND;
  name: string;
  reason: string;
}

/** `true` si el nombre declara un PDF. La comprobación barata, la primera. */
export function cadPdfLooksLikePdfName(name: string): boolean {
  return name.trim().toLowerCase().endsWith(".pdf");
}

export function cadPdfDataUri(bytes: Uint8Array): string {
  return `${DATA_URI_PREFIX}${cadBytesToBase64(bytes)}`;
}

/**
 * Los bytes de vuelta, o `null` si la ruta NO es un `data:` de PDF.
 *
 * `null` y no una excepción porque un sustrato adjuntado desde otra ruta
 * —`tenant-asset://`, el día que haya almacén— es un caso legítimo, no un error:
 * quien lo pida decide si puede seguir sin los bytes (`PDFPAGE` no puede y lo
 * dice) o le da igual (`PDFDETACH` no los necesita).
 */
export function cadPdfBytesFromDataUri(uri: string): Uint8Array | null {
  if (!uri.startsWith(DATA_URI_PREFIX)) return null;
  try {
    return cadBase64ToBytes(uri.slice(DATA_URI_PREFIX.length));
  } catch {
    return null;
  }
}

export function encodeCadPdfPayload(payload: CadPdfPayload | CadPdfPayloadError): string {
  return JSON.stringify(payload);
}

/** `null` si el texto no es un sobre de PDF; lanza si es uno malformado. */
export function decodeCadPdfPayload(text: string): CadPdfPayload | CadPdfPayloadError | null {
  if (
    !text.startsWith(`{"kind":"${CAD_PDF_PAYLOAD_KIND}"`) &&
    !text.startsWith(`{"kind":"${CAD_PDF_PAYLOAD_ERROR_KIND}"`)
  )
    return null;
  const parsed = JSON.parse(text) as {
    kind?: unknown;
    name?: unknown;
    dataUri?: unknown;
    reason?: unknown;
  };
  if (parsed.kind === CAD_PDF_PAYLOAD_ERROR_KIND) {
    if (typeof parsed.name !== "string" || typeof parsed.reason !== "string")
      throw new Error("El sobre de error de PDF está malformado.");
    return { kind: CAD_PDF_PAYLOAD_ERROR_KIND, name: parsed.name, reason: parsed.reason };
  }
  if (
    typeof parsed.name !== "string" ||
    typeof parsed.dataUri !== "string" ||
    !parsed.dataUri.startsWith(DATA_URI_PREFIX)
  )
    throw new Error("El sobre de PDF está malformado: falta el nombre o los bytes en data:.");
  return { kind: CAD_PDF_PAYLOAD_KIND, name: parsed.name, dataUri: parsed.dataUri };
}

/**
 * Un identificador estable para el archivo: nombre saneado y huella del
 * contenido.
 *
 * La huella no es criptográfica y no pretende serlo: sólo distingue dos archivos
 * que se llaman igual —`plano.pdf` de dos obras distintas— para que adjuntar el
 * segundo no choque con el primero. Recorrer 8 MB de base64 para eso sería tirar
 * tiempo, así que se muestrea, exactamente como en el sobre de la imagen.
 */
export function cadPdfUnderlayIdFor(payload: Pick<CadPdfPayload, "name" | "dataUri">): string {
  let hash = 5381;
  const text = payload.dataUri;
  const step = Math.max(1, Math.floor(text.length / 4096));
  for (let index = 0; index < text.length; index += step)
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  // El mismo juego de caracteres que acepta `safe()` en `pdf-underlay.ts`: si
  // aquí se colara un carácter que allí se sustituye, el id que este módulo
  // calcula y el que la entidad acaba llevando dejarían de coincidir y
  // `cadFindPdfUnderlay` no encontraría el sustrato por su id.
  const name = payload.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 64);
  return `${name}:${(hash >>> 0).toString(16)}:${text.length}`;
}

/**
 * El sobre a partir del archivo elegido, o el motivo por el que no se adjunta.
 *
 * Vive aquí y no en el anfitrión —donde vive el de la imagen— porque aquí es
 * comprobable en Node: no necesita `createImageBitmap` ni un `Blob`, sólo bytes.
 * Lo que queda al otro lado son diez líneas de selector de archivos.
 *
 * Las dos comprobaciones son las baratas y las que el usuario entiende: la
 * extensión y el peso. **La verdad sobre si esto es un PDF la dicta el lector**
 * —`readCadPdfObjects` busca `%PDF-` y lo dice con esas palabras—, y por eso
 * aquí no se husmea la cabecera: dos sitios decidiendo lo mismo acaban
 * discrepando, y el que manda es el que abre el archivo.
 */
export function cadPdfAttachPayloadFor(file: { name: string; bytes: Uint8Array }): string {
  const reject = (reason: string) =>
    encodeCadPdfPayload({ kind: CAD_PDF_PAYLOAD_ERROR_KIND, name: file.name, reason });
  if (!cadPdfLooksLikePdfName(file.name)) return reject("no es un archivo .pdf.");
  if (file.bytes.byteLength === 0) return reject("el archivo está vacío.");
  if (file.bytes.byteLength > CAD_PDF_ATTACH_MAX_BYTES)
    return reject(
      `pesa ${(file.bytes.byteLength / 1_000_000).toFixed(1)} MB y el tope es ` +
        `${CAD_PDF_ATTACH_MAX_BYTES / 1_000_000} MB; el PDF viaja dentro del dibujo.`,
    );
  return encodeCadPdfPayload({
    kind: CAD_PDF_PAYLOAD_KIND,
    name: file.name,
    dataUri: cadPdfDataUri(file.bytes),
  });
}
