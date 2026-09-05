/**
 * Lo que las diez órdenes de PDF comparten: designar el sustrato, contar lo que
 * hay, abrir el sobre del archivo y hablar con una sola voz.
 *
 * Existe por una razón de tamaño y otra de fondo. La de tamaño: nueve máquinas
 * de estados en un archivo pasan del presupuesto de 800 líneas que
 * `check:monolith-budget` impone a todo archivo nuevo. La de fondo: la
 * designación del sustrato —«designe uno, o teclee su nombre, o `?` para
 * listarlos»— es idéntica en siete órdenes, y escrita siete veces sería el
 * sitio donde el séptimo se olvida de aceptar el nombre tecleado.
 *
 * Ninguna de estas funciones muta nada: devuelven pasos, listas de órdenes o el
 * motivo por el que no se puede seguir. Escribir sigue yendo por el lote.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_PDF_PAYLOAD_ERROR_KIND,
  cadPdfBytesFromDataUri,
  decodeCadPdfPayload,
  type CadPdfPayload,
} from "../../pdf/pdf-attach-payload";
import { readCadPdfPageList } from "../../pdf/pdf-import";
import {
  cadFindPdfUnderlay,
  cadPdfUnderlayList,
  type CadPdfUnderlay,
  type CadPdfUnderlayPage,
} from "../../pdf/pdf-underlay";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  type CadCommandContext,
  type CadCommandDocumentView,
  type CadCommandInput,
  type CadCommandStep,
} from "../command-types";


export const FILE_KEYWORD = { keyword: "Archivo", shortcut: "A" } as const;
export const LIST_KEYWORD = { keyword: "?", shortcut: "?" } as const;
export const YES_KEYWORD = { keyword: "Sí", shortcut: "S" } as const;
export const NO_KEYWORD = { keyword: "No", shortcut: "N" } as const;
export const NEW_KEYWORD = { keyword: "Nuevo", shortcut: "N" } as const;
export const DELETE_KEYWORD = { keyword: "Eliminar", shortcut: "E" } as const;
export const POLYGON_KEYWORD = { keyword: "Poligonal", shortcut: "P" } as const;
export const RECTANGLE_KEYWORD = { keyword: "Rectangular", shortcut: "R" } as const;
export const FADE_KEYWORD = { keyword: "Desvanecido", shortcut: "D" } as const;
export const LOCK_KEYWORD = { keyword: "Bloqueo", shortcut: "B" } as const;
export const DONE_KEYWORD = { keyword: "Listo", shortcut: "L" } as const;

/**
 * Lo que la orden contesta cuando le piden abrir el selector.
 *
 * Se declara el límite en vez de tragárselo: la regla 2 de cimientos —ningún
 * comando responde éxito sin efecto— admite exactamente esta salida, «no está
 * disponible en esta versión», y prohíbe la otra, que es no decir nada.
 */
export const FILE_PICKER_PENDING =
  "el selector de archivos para PDF todavía no está conectado en este espacio de trabajo. " +
  "El archivo entra por la misma puerta que el DXF: cuando el anfitrión lo entregue, la orden " +
  "sigue sola desde la página.";

export const NO_DOCUMENT =
  "el anfitrión no expone el documento, así que no se puede saber qué sustratos hay ni comprobar " +
  "si este PDF ya estaba adjuntado.";

export function say<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

export function written<S>(state: S, commands: CadEntityCommand[], label: string, notice: string): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "document", commands, label, notice } };
}

/**
 * Ejecuta lo del motor de PDF y convierte su excepción en mensaje.
 *
 * El motor falla CERRADO y con frase: «el contorno de recorte no toca la
 * lámina», «los dos puntos designados son el mismo». Repetir esas frases aquí
 * sería tener dos versiones del mismo diagnóstico; se dejan pasar tal cual, con
 * el nombre de la orden delante para que se sepa quién habla.
 */
export function attempt<S>(state: S, name: string, build: () => CadEntityCommand[], notice: () => string): CadCommandStep<S> {
  try {
    const commands = build();
    if (commands.length === 0) return say(state, `${name}: no había nada que cambiar.`);
    return written(state, commands, name, notice());
  } catch (error) {
    return say(state, `${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}

export const point = (value: CadPoint2) => `(${formatNumber(value.x)}, ${formatNumber(value.y)})`;

/** Tamaño de una página, en milímetros de PAPEL. */
export const pageSize = (page: CadPdfUnderlayPage) =>
  `${formatNumber(page.widthMm)} × ${formatNumber(page.heightMm)} mm`;

export const pageMenu = (pages: readonly CadPdfUnderlayPage[]) =>
  pages.map((page) => `${page.number}: ${pageSize(page)}${page.rotate ? ` girada ${page.rotate}°` : ""}`).join(" · ");

export interface Target {
  entityId: string;
  underlay: CadPdfUnderlay;
  fileName: string;
}

/** El sustrato designado o tecleado, o el motivo por el que no vale. */
export function resolveTarget(context: CadCommandContext, key: string): Target | string {
  const document = context.document?.();
  if (!document) return NO_DOCUMENT;
  const found = cadFindPdfUnderlay(document, key);
  if (!found) {
    const rows = cadPdfUnderlayList(document);
    if (rows.length === 0) return "no hay ningún PDF adjuntado en este dibujo. Adjunta uno con PDFATTACH.";
    return `no hay ningún sustrato de PDF que se llame «${key}». Hay ${rows.map((row) => `«${row.fileName}»`).join(", ")}.`;
  }
  return { entityId: found.entity.id, underlay: found.underlay, fileName: found.underlay.fileName };
}

/** La clave que trae una entrada: la entidad designada o lo tecleado. */
export function keyOf(input: CadCommandInput): string | null {
  if (input.kind === "entityPick") return input.entityId;
  if (input.kind === "selection") return input.entityIds[0] ?? null;
  if (input.kind === "text") return input.value.trim() || null;
  return null;
}

/** El único sustrato designado ANTES de teclear la orden, si lo hay. */
export function preselected(context: CadCommandContext): Target | null {
  if (context.selection.length !== 1) return null;
  const resolved = resolveTarget(context, context.selection[0]);
  return typeof resolved === "string" ? null : resolved;
}

export function targetStep<S>(state: S, verb: string): CadCommandStep<S> {
  return {
    state,
    prompt: { message: `Designe el sustrato de PDF que ${verb}, o teclee su nombre`, options: [LIST_KEYWORD] },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION | CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
  };
}

/** El listado del gestor. Lo comparten PDFLIST y el `?` de cada orden. */
export function underlayReport(document: CadCommandDocumentView | undefined): string {
  if (!document) return `PDFLIST: ${NO_DOCUMENT}`;
  const rows = cadPdfUnderlayList(document);
  if (rows.length === 0) return "PDFLIST: no hay ningún PDF adjuntado en este dibujo.";
  const lines = rows.map(
    (row) =>
      `  · «${row.fileName}» p.${row.page} de ${row.pageCount} · ${formatNumber(row.width)} × ${formatNumber(row.height)} ` +
      `unidades · escala ${formatNumber(row.scale)} · ${row.status === "loaded" ? "cargado" : row.status === "unloaded" ? "descargado" : "no encontrado"}` +
      ` · ${row.locked ? "bloqueado" : "editable"} · desvanecido ${row.fade}${row.clipped ? " · recortado" : ""} · ${row.id}`,
  );
  return [`PDFLIST: ${rows.length} sustrato(s) de PDF.`, ...lines].join("\n");
}

/** El sobre entregado, o el motivo por el que no se puede seguir. */
export function payloadOf(name: string, text: string): CadPdfPayload | string {
  let decoded;
  try {
    decoded = decodeCadPdfPayload(text);
  } catch (error) {
    return `${name}: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (!decoded)
    return (
      `${name} necesita el archivo entregado por el anfitrión. Un PDF son bytes: no se puede pegar ` +
      `en la línea de comandos como se pega un DXF.`
    );
  if (decoded.kind === CAD_PDF_PAYLOAD_ERROR_KIND) return `${name}: «${decoded.name}» no se adjunta: ${decoded.reason}`;
  return decoded;
}

/** Las páginas de un sobre; el lector falla cerrado y su frase se propaga. */
export function pagesOfPayload(name: string, payload: CadPdfPayload): readonly CadPdfUnderlayPage[] | string {
  const bytes = cadPdfBytesFromDataUri(payload.dataUri);
  if (!bytes) return `${name}: el sobre no trae bytes legibles.`;
  try {
    return readCadPdfPageList(bytes);
  } catch (error) {
    return `${name}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

