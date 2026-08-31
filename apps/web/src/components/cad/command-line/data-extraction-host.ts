/**
 * Anfitrión de `DATAEXTRACTION` en su variante CSV: donde el texto que compuso
 * el comando deja de ser una petición y se convierte en un archivo.
 *
 * Mismo reparto que `dxf-host.ts` y por la misma razón: el comando ya hizo
 * toda la aritmética —leyó el documento, construyó las tres tablas— y lo
 * único que falta es `Blob`, una URL y un ancla que se pulse sola.
 */
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";

export interface CadDataExtractionHostBridge {
  /** Entrega el archivo al usuario. Inyectado para poder probarlo en Node. */
  download(fileName: string, bytes: Uint8Array, mimeType: string): void;
}

/** CSV con salto de línea CRLF, como lo abre Excel sin preguntar codificación. */
export const CAD_DATA_EXTRACTION_CSV_MIME_TYPE = "text/csv;charset=utf-8";

/**
 * Atiende la petición de `DATAEXTRACTION`. Devuelve `null` si la petición no
 * es suya, para que quien enruta pueda encadenar anfitriones sin conocerlos.
 */
export function handleCadDataExtractionHostRequest(
  request: CadHostRequest,
  bridge: CadDataExtractionHostBridge,
): string | null {
  if (request.kind !== "data-extraction-csv") return null;
  // BOM UTF-8: sin él, Excel en Windows interpreta acentos y `Nº` como Latin-1
  // y el cuadro de cantidades sale con caracteres rotos en la primera apertura.
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const body = new TextEncoder().encode(request.content);
  const bytes = new Uint8Array(bom.length + body.length);
  bytes.set(bom, 0);
  bytes.set(body, bom.length);
  bridge.download(request.fileName, bytes, CAD_DATA_EXTRACTION_CSV_MIME_TYPE);
  return `${request.fileName}: cuadro de cantidades exportado.`;
}
