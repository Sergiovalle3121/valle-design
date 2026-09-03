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
import { buildCadPlotJob, buildCadPlotPreview, type CadPlotJob } from "@/lib/cad/plot/plot-job";
import type { CadPlotStyleTable } from "@/lib/cad/plot/plot-style-table";
import {
  renderCadPlotPdf,
  type CadPlotFontProgram,
  type CadPlotPdfResult,
} from "@/lib/cad/plot/plot-pdf";
import type { CadPlotPreview } from "@/lib/cad/plot/plot-job";
import { publishCadSheetSet } from "@/lib/cad/sheet-set/sheet-set-publish";
import {
  addCadSheet,
  ordered,
  renumberCadSheetSet,
  type CadSheetSet,
} from "@/lib/cad/sheet-set/sheet-set";

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
  /**
   * Cambia el espacio activo del editor. Devuelve si DE VERDAD cambió: pedir
   * espacio papel en un dibujo sin presentaciones no puede cambiar nada, y el
   * renglón de respuesta tiene que contarlo en vez de afirmar el cambio.
   */
  setSpace?(space: "model" | "paper", layoutId?: string): boolean;
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
  /**
   * Persiste el conjunto ya modificado (renumerado, con una hoja añadida).
   *
   * Sin ella, `SHEETSET` puede leer y calcular pero no puede guardar: se dice
   * en vez de fingir que el cambio sobrevive a un refresco de página. Es la
   * misma frontera que `sheetSet`: quien la aporta decide CÓMO se persiste
   * —PUT con `expectedVersion`, como hace `sheetSetsRepository`— y este
   * anfitrión no sabe de red.
   */
  saveSheetSet?(set: CadSheetSet): void;
  /** Id nuevo para una hoja de `SHEETSET Añadir`. Sin él, se genera uno. */
  newSheetId?(): string;
  /** Resultado del trazado, para el diálogo de la línea de comandos. */
  onResult?(message: string, level: "info" | "error"): void;
}

/** Id razonablemente único cuando el anfitrión no aporta un generador propio. */
function fallbackSheetId(): string {
  return `sheet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Quién quiere enterarse de que salió un PDF.
 *
 * Existe porque **trazar no cambia el dibujo** —y es correcto que no lo cambie:
 * el golden de trazado afirma justamente que la versión del documento no sube—.
 * Así que no hay forma de saber por el documento que alguien exportó un plano, y
 * el recorrido guiado necesita saberlo para cerrar su último paso.
 *
 * Es un registro tonto a propósito: este módulo no sabe qué es un recorrido
 * guiado ni le importa. Se avisa cuando el archivo YA está entregado, nunca
 * antes: un aviso al empezar contaría como plano exportado un trazado que
 * después falló.
 */
type CadPlotDeliveryListener = (delivery: { fileName: string; pageCount: number }) => void;

const plotDeliveryListeners = new Set<CadPlotDeliveryListener>();

export function onCadPlotDelivered(listener: CadPlotDeliveryListener): () => void {
  plotDeliveryListeners.add(listener);
  return () => plotDeliveryListeners.delete(listener);
}

function notifyCadPlotDelivered(fileName: string, pageCount: number): void {
  for (const listener of plotDeliveryListeners) {
    try {
      listener({ fileName, pageCount });
    } catch {
      // Un oyente que revienta no puede tirar el trazado: el PDF ya se entregó.
    }
  }
}

/** Sólo para las specs: deja el registro como recién cargado. */
export function resetCadPlotDeliveryListeners(): void {
  plotDeliveryListeners.clear();
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
      // Sin puente no hubo cambio, y con puente sólo lo hubo si él lo dice.
      // El renglón anterior afirmaba «Espacio papel.» incondicionalmente: un
      // éxito falso que la auditoría de integridad señaló con razón.
      if (!this.bridge.setSpace)
        return "El cambio de espacio modelo/papel no está disponible en esta versión de este espacio de trabajo.";
      const switched = this.bridge.setSpace(request.space, request.layoutId);
      if (!switched)
        return request.space === "paper"
          ? "No hay ninguna presentación que activar: el dibujo no tiene espacio papel."
          : "No se pudo volver al espacio modelo.";
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

    if (request.kind === "sheet-set-command") return this.sheetSetCommand(request);

    // DXFOUT no es trazado y no se sirve aquí: su anfitrión se enchufa ANTES
    // que éste en `use-command-engine.ts`. La rama existe para que la unión de
    // peticiones quede exhaustiva —si mañana alguien añade otra clase, el
    // compilador la reclama aquí— y para que un montaje sin anfitrión de DXF
    // diga qué falta en vez de caer en la rama de PLOT y pedir una hoja.
    if (request.kind === "dxf-export")
      return "Este espacio de trabajo no sabe entregar archivos DXF: falta el anfitrión de intercambio.";

    // PLAN tampoco es trazado: lo sirve el anfitrión del SCU, enchufado antes
    // que éste. Misma razón que la rama de arriba — la exhaustividad de la
    // unión es la que avisa cuando llega una petición sin dueño.
    if (request.kind === "ucs-plan")
      return "Este espacio de trabajo no tiene vista que encuadrar: falta el anfitrión del SCU.";

    // ETRANSMIT y DATAEXTRACTION tampoco son trazado: se sirven ANTES que
    // éste, por la misma razón exacta que DXFOUT de arriba.
    if (request.kind === "etransmit")
      return "Este espacio de trabajo no sabe empaquetar ETRANSMIT: falta el anfitrión de empaquetado.";
    if (request.kind === "data-extraction-csv")
      return "Este espacio de trabajo no sabe entregar el CSV de DATAEXTRACTION: falta el anfitrión de extracción.";
    // El portapapeles lo atiende el propio anfitrión del motor ANTES de
    // reenviar nada (command-engine-host.ts): si llegara aquí sería un fallo
    // de cableado, y se dice en vez de tratarlo como un trazado.
    if (request.kind === "clipboard")
      return "El portapapeles de geometría lo atiende el anfitrión del motor, no el de trazado.";
    if (request.kind === "chain-command")
      return "ADDSELECTED lo encadena el anfitrión del motor, no el de trazado.";
    // `U`, `UNDO` y `REDO` viajan por la pila del EDITOR: su anfitrión se
    // enchufa antes que éste. Misma razón que las ramas de arriba.
    if (request.kind === "history")
      return "Este espacio de trabajo no tiene pila de deshacer: falta el anfitrión del historial.";
    // XATTACH tampoco es trazado: lo sirve el anfitrión de referencias, que se
    // enchufa antes que éste. Misma razón que las ramas de arriba.
    if (request.kind === "xref-attach")
      return "Este espacio de trabajo no sabe traer dibujos del inquilino: falta el anfitrión de referencias externas.";

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
      const errors = preview.issues.filter((issue) => issue.severity === "error");
      // Sin superficie donde pintarla, la vista previa NO se mostró. El cálculo
      // sí corrió y sus problemas son información real, así que se cuentan; lo
      // que no se puede es afirmar «Vista previa de N hojas» que nadie vio.
      if (!this.bridge.preview)
        return (
          "La vista previa de trazado no está disponible en esta versión; PLOT sí produce el PDF." +
          (errors.length > 0
            ? ` La comprobación encontró ${errors.length} problema(s): ${errors[0].detail}`
            : "")
        );
      this.bridge.preview(preview);
      return errors.length > 0
        ? `Vista previa con ${errors.length} problema(s): ${errors[0].detail}`
        : `Vista previa de ${preview.sheets.length} hoja(s).`;
    }

    const job = buildCadPlotJob(input);
    const blocking = job.issues.filter((issue) => issue.severity === "error");
    if (blocking.length > 0) return `No se puede trazar: ${blocking[0].detail}`;
    if (job.sheets.length === 0)
      return `La presentación ${request.request.layoutId} no está marcada para publicar.`;

    void this.emit(job, request.request.fileName);
    return `Trazando ${request.request.fileName} a PDF…`;
  };

  /**
   * `SHEETSET`: añadir, renumerar o leer el índice de un conjunto YA cargado.
   *
   * Síncrono, como el resto de `handle`: renumerar es aritmética sobre la
   * lista de hojas, no I/O. Guardar el resultado sí puede serlo — por eso
   * `saveSheetSet` es la única pieza que puede ser una promesa, y no bloquea
   * el renglón que ya se sabe.
   */
  private sheetSetCommand(
    request: Extract<CadHostRequest, { kind: "sheet-set-command" }>,
  ): string {
    const loaded = this.bridge.sheetSet?.(request.sheetSetId) ?? null;
    if (!loaded)
      return `El conjunto de planos ${request.sheetSetId} no está cargado en este estudio.`;

    if (request.action === "list") {
      const sheets = ordered(loaded.set);
      if (sheets.length === 0) return `«${loaded.set.name}» no tiene ninguna hoja todavía.`;
      return [
        `«${loaded.set.name}» — ${sheets.length} hoja(s):`,
        ...sheets.map((sheet) => `${sheet.number || "(sin número)"} — ${sheet.title} (rev. ${sheet.revision})`),
      ].join("\n");
    }

    if (!this.bridge.saveSheetSet)
      return "Este espacio de trabajo puede leer el conjunto pero no guardarlo: falta el anfitrión de escritura.";

    if (request.action === "renumber") {
      const renumbered = renumberCadSheetSet(loaded.set);
      this.bridge.saveSheetSet(renumbered);
      return `Renumerado «${renumbered.name}»: ${ordered(renumbered)
        .map((sheet) => sheet.number)
        .join(", ")}.`;
    }

    // action === "add"
    const sheet = request.sheet!;
    const id = this.bridge.newSheetId?.() ?? fallbackSheetId();
    const added = addCadSheet(loaded.set, {
      id,
      documentId: sheet.documentId,
      layoutId: sheet.layoutId,
      title: sheet.title,
    });
    this.bridge.saveSheetSet(added);
    const inserted = added.sheets.find((candidate) => candidate.id === id)!;
    return `Añadida «${inserted.title}» a «${added.name}» como ${inserted.number} (${added.sheets.length} hoja(s) en total).`;
  }

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
      notifyCadPlotDelivered(result.fileName, result.pageCount);
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

  private async emit(job: CadPlotJob, fileName: string): Promise<void> {
    try {
      const result: CadPlotPdfResult = await renderCadPlotPdf(job.sheets, {
        ...(this.bridge.fonts ? { fonts: this.bridge.fonts() } : {}),
        // El cajetín y las familias de fuente vienen del trabajo de trazado,
        // que es quien leyó el documento. El anfitrión no los recompone: si lo
        // hiciera, el PDF descargado y la vista previa podrían discrepar.
        titleBlocks: job.titleBlocks,
        fontUsage: job.fontUsage,
        fontByEntity: job.fontByEntity,
        strokedFamilies: job.strokedFamilies,
        metadata: { title: fileName },
      });
      if (result.pageCount === 0) {
        this.bridge.onResult?.("El trazado no produjo ninguna página.", "error");
        return;
      }
      this.bridge.download(`${fileName}.pdf`, result.bytes, "application/pdf");
      notifyCadPlotDelivered(`${fileName}.pdf`, result.pageCount);
      // Las fuentes se dicen SIEMPRE: quien traza tiene que saber si el plano
      // depende de que el visor tenga la fuente o si viaja dentro del archivo.
      const embedded = result.fonts.filter((font) => font.embedded).length;
      const substituted = result.fonts.filter((font) => font.disposition === "substituted");
      this.bridge.onResult?.(
        `Trazado ${fileName}.pdf: ${result.pageCount} página(s), ${result.fonts.length} fuente(s) (${embedded} incrustada(s))` +
          (substituted.length > 0
            ? `; SUSTITUIDAS: ${substituted
                .map((font) => `${font.family}→${font.substitutedBy}`)
                .join(", ")}.`
            : "."),
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
