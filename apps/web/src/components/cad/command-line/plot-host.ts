/**
 * Anfitrión de trazado: donde `PLOT` deja de ser una petición y sale un PDF.
 *
 * El motor de comandos es puro y no puede fabricar un archivo — necesita
 * `Blob`, una URL y un enlace que se pulse solo. Eso es esta clase: recibe la
 * `CadHostRequest` que emitió PLOT, PAGESETUP o PUBLISH y hace el trabajo del
 * navegador. Todo lo que se puede decidir sin navegador —el área, la escala,
 * la colocación, los grosores— ya venía decidido desde `lib/cad/plot`.
 *
 * ## Por qué devuelve un renglón y no una promesa
 *
 * La línea de comandos es síncrona: se teclea `PLOT`, se pulsa Enter y aparece
 * una respuesta. Trazar tarda. Así que se responde de inmediato con lo que se
 * sabe —«Trazando A-101 a PDF…»— y el resultado llega después por
 * `onResult`. Devolver una promesa obligaría a la línea de comandos a saber de
 * asincronía, que es exactamente lo que no debe saber.
 */
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";
import type { CadVisualStyleId } from "@/lib/cad/view/visual-styles";
import { cadDocumentExtents } from "@/lib/cad/view/document-extents";
import { buildCadPlotJob, buildCadPlotPreview } from "@/lib/cad/plot/plot-job";
import type { CadPlotStyleTable } from "@/lib/cad/plot/plot-style-table";
import {
  renderCadPlotPdf,
  type CadPlotFontProgram,
  type CadPlotPdfResult,
} from "@/lib/cad/plot/plot-pdf";
import type { CadPlotPreview } from "@/lib/cad/plot/plot-job";
import { publishCadSheetSet } from "@/lib/cad/sheet-set/sheet-set-publish";
import type { CadSheetSet } from "@/lib/cad/sheet-set/sheet-set";

export interface CadPlotHostBridge {
  /** Documento vivo. `null` mientras no hay dibujo abierto. */
  document(): CadDocument | null;
  /** Tablas de plumas cargadas, por nombre. */
  plotStyleTables?(): ReadonlyMap<string, CadPlotStyleTable>;
  /** Programas de fuente para incrustar. Sin ellos se usan las estándar. */
  fonts?(): readonly CadPlotFontProgram[];
  /** Entrega el archivo al usuario. Inyectado para poder probarlo en Node. */
  download(fileName: string, bytes: Uint8Array, mimeType: string): void;
  /** Muestra la vista previa. */
  preview?(preview: CadPlotPreview): void;
  /** Abre el cuadro de configuración de página. */
  openPageSetup?(layoutId: string): void;
  /** Cambia el espacio activo del editor. */
  setSpace?(space: "model" | "paper", layoutId?: string): void;
  /** Cambia el estilo visual del visor (VSCURRENT). Devuelve el aplicado. */
  setVisualStyle?(styleId: CadVisualStyleId): string | null;
  /**
   * Conjunto de planos ya cargado, con los dibujos que necesitan sus hojas.
   *
   * Los documentos ENTRAN, no se buscan: traerlos es una operación de red que
   * puede fallar, y un PDF con diecinueve de veinte hojas presentado como
   * completo es peor que un error. Quien los reúne decide qué hacer si falta
   * alguno.
   */
  sheetSet?(sheetSetId: string): {
    set: CadSheetSet;
    documents: ReadonlyMap<string, CadDocument>;
  } | null;
  /** Fecha de publicación. Inyectada: hace el PDF reproducible. */
  now?(): string;
  /** Resultado del trazado, para el diálogo de la línea de comandos. */
  onResult?(message: string, level: "info" | "error"): void;
}

/** Descarga en el navegador. Aparte para que las pruebas no necesiten DOM. */
export function downloadCadFile(
  fileName: string,
  bytes: Uint8Array,
  mimeType: string,
): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  // El ancla se INSERTA antes de pulsarla. Un ancla suelta funciona en algunos
  // navegadores y en otros no descarga nada, sin error: es la diferencia entre
  // «traza» y «parece que traza».
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revocar en el mismo turno cancelaría la descarga en Firefox: se deja al
  // siguiente tick, que es cuando el navegador ya ha tomado el blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export class CadPlotHost {
  constructor(private readonly bridge: CadPlotHostBridge) {}

  /** Punto de entrada del puente del motor. Devuelve el renglón a mostrar. */
  handle = (request: CadHostRequest): string => {
    if (request.kind === "visual-style") {
      const applied = this.bridge.setVisualStyle?.(request.styleId) ?? null;
      return applied
        ? `Estilo visual: ${applied}.`
        : "Este espacio de trabajo no tiene visor de estilos visuales.";
    }

    if (request.kind === "space") {
      this.bridge.setSpace?.(request.space, request.layoutId);
      return request.space === "paper"
        ? `Espacio papel${request.layoutId ? `: ${request.layoutId}` : ""}.`
        : "Espacio modelo.";
    }

    if (request.kind === "page-setup") {
      if (!this.bridge.openPageSetup)
        return "La configuración de página por cuadro no está disponible aquí; usa las opciones de PAGESETUP.";
      this.bridge.openPageSetup(request.layoutId);
      return "Configuración de página abierta.";
    }

    if (request.kind === "publish") {
      const loaded = this.bridge.sheetSet?.(request.sheetSetId) ?? null;
      if (!loaded)
        return `El conjunto de planos ${request.sheetSetId} no está cargado en este estudio.`;
      void this.publish(loaded.set, loaded.documents, request.sheetIds);
      return `Publicando «${loaded.set.name}» a un único PDF paginado…`;
    }

    const document = this.bridge.document();
    if (!document) return "No hay ningún dibujo abierto que trazar.";

    const table = request.request.pageSetup.plotStyleTable
      ? (this.bridge.plotStyleTables?.().get(request.request.pageSetup.plotStyleTable) ?? null)
      : null;
    if (request.request.pageSetup.plotStyleTable && !table)
      return `La tabla de plumas «${request.request.pageSetup.plotStyleTable}» no está cargada: el plano saldría con los grosores equivocados.`;

    const input = {
      document,
      layoutIds: [request.request.layoutId],
      pageSetup: request.request.pageSetup,
      plotStyleTable: table,
    };

    if (request.mode === "preview") {
      const preview = buildCadPlotPreview(input);
      this.bridge.preview?.(preview);
      const errors = preview.issues.filter((issue) => issue.severity === "error");
      return errors.length > 0
        ? `Vista previa con ${errors.length} problema(s): ${errors[0].detail}`
        : `Vista previa de ${preview.sheets.length} hoja(s).`;
    }

    const job = buildCadPlotJob(input);
    const blocking = job.issues.filter((issue) => issue.severity === "error");
    if (blocking.length > 0) return `No se puede trazar: ${blocking[0].detail}`;
    if (job.sheets.length === 0)
      return `La presentación ${request.request.layoutId} no está marcada para publicar.`;

    void this.emit(job.sheets, request.request.fileName);
    return `Trazando ${request.request.fileName} a PDF…`;
  };

  private async publish(
    set: CadSheetSet,
    documents: ReadonlyMap<string, CadDocument>,
    sheetIds?: readonly string[],
  ): Promise<void> {
    try {
      const result = await publishCadSheetSet({
        set,
        documents,
        date: this.bridge.now?.() ?? new Date().toISOString().slice(0, 10),
        ...(sheetIds && sheetIds.length > 0 ? { sheetIds } : {}),
      });
      if (result.pageCount === 0) {
        this.bridge.onResult?.(
          `El conjunto «${set.name}» no produjo ninguna página.`,
          "error",
        );
        return;
      }
      this.bridge.download(result.fileName, result.bytes, "application/pdf");
      // Las hojas omitidas se dicen SIEMPRE. Un conjunto publicado al que le
      // falta un plano y no lo cuenta es la peor forma de fallar: parece que
      // salió bien.
      this.bridge.onResult?.(
        `Publicado ${result.fileName}: ${result.pageCount} página(s)` +
          (result.plan.skipped.length > 0
            ? `, ${result.plan.skipped.length} hoja(s) omitida(s): ${result.plan.skipped
                .map((entry) => entry.reason)
                .join(" ")}`
            : "."),
        result.plan.skipped.length > 0 ? "error" : "info",
      );
    } catch (error) {
      this.bridge.onResult?.(
        `La publicación falló: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  }

  private async emit(
    sheets: Parameters<typeof renderCadPlotPdf>[0],
    fileName: string,
  ): Promise<void> {
    try {
      const result: CadPlotPdfResult = await renderCadPlotPdf(sheets, {
        ...(this.bridge.fonts ? { fonts: this.bridge.fonts() } : {}),
        metadata: { title: fileName },
      });
      if (result.pageCount === 0) {
        this.bridge.onResult?.("El trazado no produjo ninguna página.", "error");
        return;
      }
      this.bridge.download(`${fileName}.pdf`, result.bytes, "application/pdf");
      // Las fuentes se dicen SIEMPRE: quien traza tiene que saber si el plano
      // depende de que el visor tenga la fuente o si viaja dentro del archivo.
      const embedded = result.fonts.filter((font) => font.embedded).length;
      this.bridge.onResult?.(
        `Trazado ${fileName}.pdf: ${result.pageCount} página(s), ${result.fonts.length} fuente(s) (${embedded} incrustada(s)).`,
        "info",
      );
    } catch (error) {
      this.bridge.onResult?.(
        `El trazado falló: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  }
}

/** Envolvente del dibujo, para el área «Extensión» del trazado. */
export function cadPlotExtents(document: CadDocument | null) {
  return document ? cadDocumentExtents(document) : null;
}
