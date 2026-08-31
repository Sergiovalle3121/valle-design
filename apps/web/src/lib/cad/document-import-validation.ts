/**
 * Validación de importación: lo que se puede saber de un archivo SIN leerlo.
 *
 * ## Por qué está separado de `document-import.ts`
 *
 * `document-import.ts` es el importador entero: DXF, shapefile, puentes DWG,
 * lectores geográficos, migración canónica. Su árbol de dependencias pesa 539 KB
 * de fuente. Pero el panel de importación del tablero sólo necesita, ANTES de
 * que el usuario elija nada, cuatro cosas: la extensión, el tope de tamaño, si
 * el formato entra por bytes o por texto, y si se admite. Nada de eso mira
 * dentro del archivo.
 *
 * Con las dos cosas en el mismo módulo, abrir el tablero descargaba el
 * importador completo para poder decir «formato no soportado». Este módulo
 * existe para que la respuesta rápida viaje sola y el importador llegue cuando
 * de verdad haya un archivo que importar.
 *
 * `document-import.ts` reexporta todo lo de aquí, así que ningún consumidor
 * existente cambia de import.
 */
import { dwgBetaImportIsEnabled, dwgImportIsEnabled } from "./dwg-interop-flag";
import { DWG_MAX_IMPORT_BYTES } from "./dwg-import-limits";
import { MESH_IMPORT_MAX_BYTES } from "./interop/mesh-import-limits";
import { meshImportFormatOf } from "./interop/mesh-format-detect";
import { looksLikeSkp, rejectSkp } from "./interop/skp-reject";

export const MAX_DXF_IMPORT_BYTES = 12_000_000;
export const MAX_JSON_IMPORT_BYTES = 20_000_000;
/**
 * Tope del `.shp`.
 *
 * Un shapefile es binario y denso: 16 bytes por vértice, sin cabeceras por
 * medio. Ocho megas son medio millón de vértices, que ya es un municipio
 * entero y muy por encima de un predio con su manzana. El lector tiene además
 * su propio tope en vértices; éste corta antes, cuando todavía no se ha leído
 * nada.
 */
export const MAX_SHP_IMPORT_BYTES = 8_000_000;

/**
 * Límite del binario — igual al tope real del códec
 * (`DEFAULT_DWG_LIMITS.maxFileBytes`), no un número independiente. Antes de
 * esta corrección era 24.000.000: un archivo entre 16.777.216 y 24.000.000
 * bytes pasaba esta validación y el códec lo rechazaba después de todos
 * modos, con un mensaje que encima decía "firma inválida" en vez de
 * "demasiado grande". Ver `dwg-import-limits.ts` para la fuente del número y
 * dónde vive la comprobación cruzada contra el códec.
 */
export const MAX_DWG_IMPORT_BYTES = DWG_MAX_IMPORT_BYTES;

export type DocumentImportFormat = "dxf" | "json" | "shp" | "dwg" | "obj" | "stl" | "gltf" | "collada";

/** La extensión en minúsculas, sin punto. `""` si el nombre no tiene ninguna. */
export function importFileExtension(fileName: string): string {
  return fileName.trim().toLowerCase().split(".").pop() ?? "";
}

export function importLimitForFileName(fileName: string): number {
  const kind = importFileExtension(fileName);
  if (kind === "dxf") return MAX_DXF_IMPORT_BYTES;
  if (kind === "shp") return MAX_SHP_IMPORT_BYTES;
  if (kind === "dwg") return MAX_DWG_IMPORT_BYTES;
  const meshFormat = meshImportFormatOf(fileName);
  if (meshFormat) return MESH_IMPORT_MAX_BYTES[meshFormat];
  return MAX_JSON_IMPORT_BYTES;
}

/**
 * ¿Este archivo entra por bytes o por texto?
 *
 * El `.shp` es binario y los otros dos no. La pregunta la hace el worker antes
 * de leer el fichero, porque `File.text()` sobre un binario lo destroza:
 * decodifica como UTF-8 y sustituye cada byte inválido, y lo que llega al
 * lector ya no son los bytes del archivo.
 */
export function isBinaryImportFormat(fileName: string): boolean {
  const kind = importFileExtension(fileName);
  // Los cuatro formatos de malla viajan como bytes SIEMPRE, aunque dos de
  // ellos (OBJ, COLLADA) sean texto: decodificarlos ya es responsabilidad de
  // su propio lector (`lib/cad/interop/`), con un `TextDecoder` que rechaza
  // bytes inválidos en vez de sustituirlos en silencio — la misma garantía
  // que ya tenía el shapefile, ahora también para OBJ y COLLADA.
  return kind === "shp" || kind === "dwg" || kind === "skp" || meshImportFormatOf(fileName) !== null;
}

export function validateImportFile(
  fileName: string,
  size: number,
  dwgBetaEnabled = false,
): void {
  const kind = importFileExtension(fileName);
  // `.skp` se detecta por EXTENSIÓN y se RECHAZA con su motivo — antes de
  // leer ni un byte del archivo (este módulo no los tiene todavía) y antes
  // del `admitted` genérico de abajo: mezclarlo con "formato no soportado"
  // perdería la diferencia entre "no lo reconocemos" y "lo reconocemos y
  // sabemos exactamente por qué no lo leemos". La detección por CONTENIDO
  // (un `.skp` renombrado) vive en `looksLikeSkp` y se comprueba de nuevo, ya
  // con los bytes en la mano, dentro de `importMeshDocument`.
  if (looksLikeSkp(new Uint8Array(0), fileName)) rejectSkp(fileName);
  /**
   * `.dwg` entra por CUALQUIERA de dos gates, y hoy ninguno está abierto por
   * defecto:
   *
   * - `dwgImportIsEnabled()`: la promoción general de ADR-0007/0009 (7
   *   gates, incluida revisión jurídica externa). Sigue apagada.
   * - `dwgBetaImportIsEnabled(dwgBetaEnabled)`: la beta acotada
   *   `AC1015_MODELSPACE_2D_V3` que el dueño firmó 2026-08-24 (ADR-0009
   *   §6-bis, ampliada §6-ter y §6-quater), con el dictamen jurídico en
   *   paralelo. `dwgBetaEnabled` lo decide quien llama —el worker, a partir
   *   de una variable de build no pública por defecto— nunca este módulo,
   *   que no lee entorno.
   *
   * El mensaje SÍ cambió al integrar, y a propósito: el shapefile ya se admite,
   * así que callarlo dejaría al usuario sin saber que su `.shp` entra. Un
   * mensaje de error que enumera menos formatos de los que acepta el producto
   * es una mentira pequeña que cuesta una importación.
   */
  const admitted =
    kind === "dxf" ||
    kind === "json" ||
    kind === "shp" ||
    meshImportFormatOf(fileName) !== null ||
    (kind === "dwg" && (dwgImportIsEnabled() || dwgBetaImportIsEnabled(dwgBetaEnabled)));
  if (!admitted) {
    throw new Error(
      "Formato no soportado. Usa DXF de texto, JSON canónico, shapefile (.shp) o un modelo 3D " +
        "(OBJ, STL, glTF/GLB o COLLADA/DAE).",
    );
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error("El archivo está vacío o su tamaño no es válido.");
  }
  if (size > importLimitForFileName(fileName)) {
    throw new Error(
      `El archivo supera el límite de ${Math.floor(importLimitForFileName(fileName) / 1_000_000)} MB.`,
    );
  }
}
