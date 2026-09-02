/**
 * El PAQUETE de archivos GIS que viaja por la puerta de texto del motor
 * (Ola G, 2026-09-02).
 *
 * ## Por qué existe
 *
 * Un shapefile no es un archivo: son cuatro (`.shp`, `.shx`, `.dbf`, `.prj`) y
 * dos de ellos binarios. El motor de órdenes tiene UNA puerta para archivos
 * —`feedFile(name, text)`, la que usa DXFIN— y es de texto, a propósito: el
 * motor es síncrono y puro y no sabe de `File` ni de `ArrayBuffer`. En vez de
 * abrir una segunda puerta binaria (otro tipo de entrada, otro `accepts`, otro
 * camino que probar), el anfitrión empaqueta los archivos elegidos en UN texto
 * JSON con los bytes en base64 y el motor lo desempaqueta. Un `.shp` de predio
 * pesa decenas de kilobytes; en base64, un tercio más. Es despreciable.
 *
 * ## Lo que NO es
 *
 * No es un formato persistido: no se guarda, no se exporta, no se versiona. Es
 * el sobre que cruza del selector de archivos al comando y se abre allí mismo.
 * Cambiarlo no toca ningún documento.
 */

export interface CadGeoBundleFile {
  name: string;
  bytes: Uint8Array;
}

/** Marca del sobre. Un texto que no empieza por ella no es un paquete. */
export const CAD_GEO_BUNDLE_KIND = "valle-geo-bundle";

interface Envelope {
  kind: typeof CAD_GEO_BUNDLE_KIND;
  files: Array<{ name: string; base64: string }>;
}

/** Empaqueta los archivos elegidos. */
export function encodeCadGeoBundle(files: readonly CadGeoBundleFile[]): string {
  const envelope: Envelope = {
    kind: CAD_GEO_BUNDLE_KIND,
    files: files.map((file) => ({ name: file.name, base64: toBase64(file.bytes) })),
  };
  return JSON.stringify(envelope);
}

/** `true` si el texto es un sobre (sin analizarlo entero). */
export function isCadGeoBundle(text: string): boolean {
  return text.startsWith(`{"kind":"${CAD_GEO_BUNDLE_KIND}"`);
}

/** Abre el sobre; `null` si el texto no es uno. Un sobre malformado lanza. */
export function decodeCadGeoBundle(text: string): CadGeoBundleFile[] | null {
  if (!isCadGeoBundle(text)) return null;
  const envelope = JSON.parse(text) as Partial<Envelope>;
  if (envelope.kind !== CAD_GEO_BUNDLE_KIND || !Array.isArray(envelope.files))
    throw new Error("El paquete de archivos GIS está malformado: no trae la lista de archivos.");
  return envelope.files.map((file) => {
    if (typeof file?.name !== "string" || typeof file.base64 !== "string")
      throw new Error("El paquete de archivos GIS está malformado: un archivo no trae nombre o bytes.");
    return { name: file.name, bytes: fromBase64(file.base64) };
  });
}

/** Nombre que el sobre enseña en el diálogo: el archivo principal y cuántos van con él. */
export function cadGeoBundleName(files: readonly CadGeoBundleFile[]): string {
  const main = files.find((file) => /\.shp$/i.test(file.name)) ?? files.find((file) => /\.(geojson|json)$/i.test(file.name)) ?? files[0];
  if (!main) return "(sin archivos)";
  return files.length > 1 ? `${main.name} (+${files.length - 1} archivo(s))` : main.name;
}

// `btoa`/`atob` existen en el navegador y en Node ≥ 16, que es donde corren
// las specs. Se trocea porque `String.fromCharCode(...bytes)` con un archivo
// grande revienta la pila de argumentos.
const CHUNK = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
