/**
 * Anfitrión de intercambio: donde `DXFOUT` deja de ser una petición y sale un
 * archivo que el estructurista puede abrir.
 *
 * El motor fabrica el DXF entero —escribir DXF es aritmética sobre cadenas— y
 * lo que no puede hacer es entregarlo: eso necesita `Blob`, una URL y un ancla
 * que se pulse sola. Ese reparto es el mismo que el de PLOT y por la misma
 * razón, así que este archivo es deliberadamente diminuto: recibe la petición,
 * convierte el texto a bytes y devuelve el renglón que se lee en la línea de
 * comandos.
 *
 * ## Por qué el renglón cuenta las pérdidas
 *
 * Un DXF exportado se manda por correo en el minuto siguiente. Si algo no
 * viajó, el único momento útil para decirlo es ANTES de mandarlo, y el único
 * sitio donde el usuario está mirando es la línea de comandos. Un manifiesto
 * que hay que ir a buscar a un panel es un manifiesto que nadie lee.
 */
import type { CadLossManifestEntry } from "@/lib/cad/cad-document";
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";

export interface CadDxfHostBridge {
  /** Entrega el archivo al usuario. Inyectado para poder probarlo en Node. */
  download(fileName: string, bytes: Uint8Array, mimeType: string): void;
}

/**
 * Tipo MIME de un DXF de texto.
 *
 * No hay uno registrado en IANA; `image/vnd.dxf` es el que usan AutoCAD y los
 * visores web, y es el que hace que el navegador ofrezca «guardar» en vez de
 * abrir el archivo como texto plano en una pestaña.
 */
export const CAD_DXF_MIME_TYPE = "image/vnd.dxf";

/** Cuántas pérdidas se enumeran en el renglón antes de resumir el resto. */
const LISTED_LOSSES = 3;

/**
 * Resume el manifiesto en una frase. Las de severidad `error` van primero
 * porque son las que dicen «esto NO está en el archivo»; una degradación se
 * puede vivir, una ausencia no.
 */
export function describeCadDxfExportLosses(
  losses: readonly CadLossManifestEntry[],
): string {
  if (losses.length === 0) return "Sin pérdidas declaradas.";
  const dropped = losses.filter((loss) => loss.severity === "error");
  const rest = losses.filter((loss) => loss.severity !== "error");
  const ordered = [...dropped, ...rest];
  const head = ordered.slice(0, LISTED_LOSSES).map((loss) => `· ${loss.detail}`);
  const hidden = ordered.length - head.length;
  return [
    `${dropped.length} cosa(s) NO viajan en el archivo y ${rest.length} viajan con menos información:`,
    ...head,
    ...(hidden > 0 ? [`· … y ${hidden} más.`] : []),
  ].join("\n");
}

/**
 * Atiende la petición de `DXFOUT`. Devuelve `null` si la petición no es suya,
 * para que quien enruta pueda encadenar anfitriones sin conocerlos.
 */
export function handleCadDxfHostRequest(
  request: CadHostRequest,
  bridge: CadDxfHostBridge,
): string | null {
  if (request.kind !== "dxf-export") return null;
  bridge.download(
    request.fileName,
    new TextEncoder().encode(request.content),
    CAD_DXF_MIME_TYPE,
  );
  return [
    `${request.fileName}: ${request.entityCount} entidad(es) en ${request.layers.length} capa(s).`,
    describeCadDxfExportLosses(request.losses),
  ].join("\n");
}
