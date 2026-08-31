/**
 * Anfitrión de `ETRANSMIT`: donde el ZIP que compuso el motor se entrega.
 *
 * Mismo reparto que `dxf-host.ts` y `data-extraction-host.ts`: el comando ya
 * hizo toda la aritmética de bytes, y lo único que falta es `Blob`, una URL y
 * un ancla que se pulse sola.
 */
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";

export interface CadEtransmitHostBridge {
  /** Entrega el archivo al usuario. Inyectado para poder probarlo en Node. */
  download(fileName: string, bytes: Uint8Array, mimeType: string): void;
}

export const CAD_ZIP_MIME_TYPE = "application/zip";

/** Cuántos nombres se enumeran en el renglón antes de resumir el resto. */
const LISTED = 3;

function summarize(label: string, names: readonly string[]): string {
  if (names.length === 0) return "";
  const head = names.slice(0, LISTED).join(", ");
  const hidden = names.length - Math.min(LISTED, names.length);
  return `${label}: ${head}${hidden > 0 ? ` y ${hidden} más` : ""}`;
}

/**
 * Atiende la petición de `ETRANSMIT`. Devuelve `null` si la petición no es
 * suya, para que quien enruta pueda encadenar anfitriones sin conocerlos.
 */
export function handleCadEtransmitHostRequest(
  request: CadHostRequest,
  bridge: CadEtransmitHostBridge,
): string | null {
  if (request.kind !== "etransmit") return null;
  bridge.download(request.fileName, request.bytes, CAD_ZIP_MIME_TYPE);
  const lines = [
    `${request.fileName}: ${request.included.length} activo(s) incluido(s), ${request.bytes.length} bytes.`,
  ];
  const missing = summarize("SIN incluir", request.missing);
  if (missing) lines.push(missing);
  return lines.join("\n");
}
