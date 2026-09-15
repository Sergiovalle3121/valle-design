/**
 * Funciones auxiliares extraídas de `command-engine-host.ts`.
 *
 * Extraídas para respetar el presupuesto de 800 líneas.
 */
import { downloadCadFile } from "./plot-host";
import { cadClipboardContent, type CadClipboard } from "@/lib/cad/clipboard";
import type { CadEntityCommand } from "@/lib/cad/entity-commands";
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";
import type { CadCommandContext } from "@/lib/cad/engine/command-types";

export function handleDownloadRequest(
  request: { kind: "download"; filename: string; mime: string; content: string },
  label: string,
  log: (message: string, level: "error" | "info") => void,
): void {
  try {
    downloadCadFile(request.filename, new TextEncoder().encode(request.content), request.mime);
    log(`${label}: ${request.filename} descargado.`, "info");
  } catch {
    log(`${label}: no se pudo descargar ${request.filename}.`, "error");
  }
}

export function handleClipboardRequest(
  request: Extract<CadHostRequest, { kind: "clipboard" }>,
  context: CadCommandContext,
  clipboard: CadClipboard,
  apply: (commands: readonly CadEntityCommand[], label: string) => void,
): string {
  const entities = request.entityIds.flatMap((id) => {
    const entity = context.entity?.(id);
    return entity ? [entity] : [];
  });
  const content = cadClipboardContent(
    entities,
    context.blocks?.() ?? [],
    request.basePoint,
    request.op,
    context.document?.(),
  );
  if (typeof content === "string") return `${request.op === "cut" ? "CUTCLIP" : "COPYCLIP"}: ${content}`;
  clipboard.write(content);
  if (request.op === "cut")
    apply(
      content.entities.map((entity): CadEntityCommand => ({ type: "delete", entityId: entity.id })),
      "CUTCLIP",
    );
  const base = `${content.basePoint.x}, ${content.basePoint.y}`;
  return request.op === "cut"
    ? `${content.entities.length} objeto(s) cortado(s) al portapapeles; punto base ${base}.`
    : `${content.entities.length} objeto(s) copiado(s) al portapapeles; punto base ${base}.`;
}
