/**
 * PDFATTACH, PDFIMPORT y PDFLIST: las órdenes que ENCHUFAN el motor de PDF
 * (campaña «Superar a AutoCAD completo», F4, 2026-09-04).
 *
 * ## Por qué existe este archivo
 *
 * `lib/cad/pdf/` son ~250 KB de motor terminado y probado contra un corpus de
 * PDF escritos byte a byte: leer los objetos, recorrer el árbol de páginas,
 * interpretar el flujo de contenido, aplanar Béziers, adjuntar la lámina,
 * recortarla, desvanecerla, escalarla a medida conocida y declarar lo que se
 * perdió. **Y ningún comando del registro lo tocaba.** El único consumidor del
 * subsistema fuera de sí mismo era `cadPdfInflate`, que descomprime un `.ctb`.
 *
 * Por la regla 1 de la campaña de cimientos —«un subsistema sin importador
 * fuera de sí mismo no está implementado»—, PDF no estaba implementado por
 * mucho motor que hubiera. Esto es el importador: las diez órdenes que un
 * dibujante teclea, ni una línea de geometría nueva. Las siete que gestionan un
 * sustrato ya colocado están en `pdf-underlay-edit-commands.ts`, y lo que las
 * diez comparten, en `pdf-underlay-support.ts`.
 *
 * ## Las dos órdenes son distintas a propósito, y hay que saber cuál se usa
 *
 * **PDFIMPORT** convierte los VECTORES en entidades editables. Es lo que sale
 * de cualquier CAD moderno al exportar, y es la mitad del correo que recibe un
 * despacho. **PDFATTACH** pone la lámina DEBAJO para calcar encima, que es lo
 * único que se puede hacer con un escaneo: dentro de una fotografía no hay
 * geometría, y ningún lector del mundo puede sacar líneas de ella sin
 * inventárselas. Cuando PDFIMPORT se topa con un escaneo lo dice con esas
 * palabras y remite a PDFATTACH, en vez de devolver un dibujo vacío que dejaría
 * al arquitecto pensando que su archivo está roto.
 *
 * ## El reparto del archivo, y por qué es el de IMAGEATTACH
 *
 * El motor de órdenes es puro y síncrono: no sabe de `File` ni de `Blob`. Tiene
 * UNA puerta para archivos —`feedFile(name, text)`— y por ella entran ya el
 * DXF, el conjunto GIS y la imagen. El PDF entra por la misma, dentro del sobre
 * de `pdf/pdf-attach-payload.ts`, que sólo lleva el nombre y los bytes: **las
 * páginas las deduce el motor**, porque el lector de PDF vive aquí dentro y no
 * en el navegador. Ver ese módulo para el tope y el porqué del `data:`.
 *
 * ## Lo que en esta versión todavía no está
 *
 * La opción `Archivo` no abre el selector: el canal `pdf-file` del anfitrión
 * vive en `engine/command-types.ts` y en el estudio, fuera de este frente, y se
 * pidió por escrito (P-express-01). La orden lo DICE con esas palabras en vez
 * de abrir un cuadro que no existe o de callarse. Todo lo demás —adjuntar,
 * importar, recortar, ajustar, cambiar de página, escalar a medida conocida,
 * descargar, recargar, desadjuntar y listar— funciona entero con el archivo
 * entregado por la puerta de texto.
 */
import type { CadLayerDef, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_PDF_ATTACH_MAX_BYTES,
  cadPdfBytesFromDataUri,
  cadPdfUnderlayIdFor,
  type CadPdfPayload,
} from "../../pdf/pdf-attach-payload";
import {
  CadPdfImportError,
  importCadPdf,
  type CadPdfImportResult,
} from "../../pdf/pdf-import";
import {
  buildCadPdfFailureReport,
  buildCadPdfImportReport,
  type CadPdfImportReport,
} from "../../pdf/pdf-import-report";
import {
  cadPdfAttachCommands,
  cadPdfUnderlayEntityId,
  type CadPdfUnderlayPage,
} from "../../pdf/pdf-underlay";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandDocumentView,
  type CadCommandStep,
} from "../command-types";
import { CAD_PDF_UNDERLAY_EDIT_COMMANDS } from "./pdf-underlay-edit-commands";
import {
  FILE_KEYWORD,
  FILE_PICKER_PENDING,
  NO_DOCUMENT,
  NO_KEYWORD,
  YES_KEYWORD,
  attempt,
  formatNumber,
  pageMenu,
  pageSize,
  pagesOfPayload,
  payloadOf,
  point,
  say,
  underlayReport,
  written,
} from "./pdf-underlay-support";

// ---------------------------------------------------------------------------
// PDFATTACH
// ---------------------------------------------------------------------------

interface AttachState {
  phase: "file" | "page" | "insertion" | "scale" | "lock";
  payload: CadPdfPayload | null;
  pages: readonly CadPdfUnderlayPage[];
  page: number;
  insertion: CadPoint2 | null;
  scale: number;
}

const ATTACH_EMPTY: AttachState = { phase: "file", payload: null, pages: [], page: 1, insertion: null, scale: 1 };

const attachAsk: CadCommandStep<AttachState> = {
  state: ATTACH_EMPTY,
  prompt: {
    message: `Elige el PDF que adjuntar como sustrato (hasta ${CAD_PDF_ATTACH_MAX_BYTES / 1_000_000} MB; viaja dentro del dibujo)`,
    options: [FILE_KEYWORD],
    defaultOption: FILE_KEYWORD.keyword,
  },
  accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
};

function attachStep(state: AttachState, context: CadCommandContext): CadCommandStep<AttachState> {
  const payload = state.payload!;
  if (state.phase === "page")
    return {
      state,
      prompt: {
        message: `«${payload.name}» tiene ${state.pages.length} páginas (${pageMenu(state.pages)}). Precise la página`,
        options: [],
        defaultValue: "1",
      },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  const chosen = state.pages.find((page) => page.number === state.page)!;
  if (state.phase === "insertion")
    return {
      state,
      prompt: {
        message: `«${payload.name}» p.${state.page} (${pageSize(chosen)}). Precise el punto de inserción (esquina inferior izquierda)`,
        options: [],
      },
      accepts: CAD_ACCEPT_POINT,
    };
  if (state.phase === "scale")
    return {
      state,
      // 1 deja la lámina a TAMAÑO DE PAPEL, que es lo honesto: el PDF no dice a
      // qué escala se dibujó. La medida real se consigue después con PDFSCALE.
      prompt: {
        message: `Precise la escala del sustrato: 1 lo deja a tamaño de papel (${pageSize(chosen)})`,
        options: [],
        defaultValue: "1",
      },
      accepts: CAD_ACCEPT_DISTANCE,
      preview: state.insertion && context.cursor ? [{ points: [state.insertion, context.cursor] }] : [],
    };
  return {
    state,
    prompt: {
      message: "¿Bloquear el sustrato? Bloqueado se dibuja encima sin designarlo por error",
      options: [YES_KEYWORD, NO_KEYWORD],
      defaultOption: YES_KEYWORD.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

/**
 * Un id libre para este archivo.
 *
 * El id sale del nombre y de la huella del contenido, así que adjuntar DOS
 * VECES el mismo PDF chocaría. Adjuntar dos páginas del mismo archivo lado a
 * lado es una petición legítima —la planta y el alzado de la misma lámina—, así
 * que se numera en vez de negarse.
 */
function freeId(document: CadCommandDocumentView, base: string): string {
  if (!document.entities.some((entity) => entity.id === cadPdfUnderlayEntityId(base))) return base;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}-${index}`;
    if (!document.entities.some((entity) => entity.id === cadPdfUnderlayEntityId(candidate))) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function attachFinish(state: AttachState, locked: boolean, context: CadCommandContext): CadCommandStep<AttachState> {
  const document = context.document?.();
  if (!document) return say(state, `PDFATTACH: ${NO_DOCUMENT}`);
  const payload = state.payload!;
  const insertion = state.insertion!;
  const chosen = state.pages.find((page) => page.number === state.page)!;
  const id = freeId(document, cadPdfUnderlayIdFor(payload));
  const width = chosen.widthMm * state.scale;
  const height = chosen.heightMm * state.scale;
  return attempt(
    state,
    "PDFATTACH",
    () =>
      cadPdfAttachCommands(document, {
        id,
        source: { uri: payload.dataUri, fileName: payload.name, pages: state.pages },
        page: state.page,
        insertion,
        scale: state.scale,
        locked,
      }),
    () =>
      `PDFATTACH: «${payload.name}» p.${state.page} de ${state.pages.length} (${pageSize(chosen)} de papel) en ` +
      `${point(insertion)}; escala ${formatNumber(state.scale)}, ocupa ${formatNumber(width)} × ${formatNumber(height)} ` +
      `unidades. ${locked ? "Bloqueado" : "Editable"}. Escálalo a medida real con PDFSCALE.`,
  );
}

const pdfAttachCommand: CadCommandDescriptor<AttachState> = {
  name: "PDFATTACH",
  aliases: ["ADJUNTARPDF"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => attachAsk,
  step: (state, input, context) => {
    if (input.kind === "cancel") return say(state, "PDFATTACH cancelado. El dibujo no ha cambiado.");
    if (state.phase === "file") {
      if (input.kind === "keyword" || input.kind === "enter") return say(state, `PDFATTACH: ${FILE_PICKER_PENDING}`);
      if (input.kind !== "text") return attachAsk;
      const payload = payloadOf("PDFATTACH", input.value);
      if (typeof payload === "string") return say(state, payload);
      const pages = pagesOfPayload("PDFATTACH", payload);
      if (typeof pages === "string") return say(state, pages);
      const next = { ...state, payload, pages };
      // Con UNA página no se pregunta cuál: preguntar por algo que no tiene
      // alternativa es un paso que el usuario aprende a pulsar sin leer.
      return attachStep({ ...next, phase: pages.length > 1 ? "page" : "insertion" }, context);
    }
    if (state.phase === "page") {
      if (input.kind === "enter") return attachStep({ ...state, page: 1, phase: "insertion" }, context);
      if (input.kind !== "distance") return attachStep(state, context);
      const page = Math.round(input.value);
      if (!state.pages.some((candidate) => candidate.number === page))
        return say(state, `PDFATTACH: el PDF tiene ${state.pages.length} página(s) y se pidió la ${page}.`);
      return attachStep({ ...state, page, phase: "insertion" }, context);
    }
    if (state.phase === "insertion") {
      if (input.kind !== "point")
        return input.kind === "enter" ? say(state, "PDFATTACH necesita el punto de inserción.") : attachStep(state, context);
      return attachStep({ ...state, insertion: input.point, phase: "scale" }, context);
    }
    if (state.phase === "scale") {
      if (input.kind === "enter") return attachStep({ ...state, scale: 1, phase: "lock" }, context);
      if (input.kind !== "distance") return attachStep(state, context);
      if (!(input.value > 1e-9)) return say(state, "PDFATTACH: la escala del sustrato tiene que ser mayor que cero.");
      return attachStep({ ...state, scale: input.value, phase: "lock" }, context);
    }
    if (input.kind === "keyword" && input.keyword === NO_KEYWORD.keyword) return attachFinish(state, false, context);
    if (input.kind === "keyword" || input.kind === "enter") return attachFinish(state, true, context);
    return attachStep(state, context);
  },
};

// ---------------------------------------------------------------------------
// PDFIMPORT
// ---------------------------------------------------------------------------

interface ImportPlan {
  commands: CadEntityCommand[];
  report: CadPdfImportReport;
  result: CadPdfImportResult;
  fileName: string;
}

interface ImportState {
  phase: "file" | "page" | "insertion" | "confirm";
  payload: CadPdfPayload | null;
  pages: readonly CadPdfUnderlayPage[];
  page: number;
  plan: ImportPlan | null;
}

const IMPORT_EMPTY: ImportState = { phase: "file", payload: null, pages: [], page: 1, plan: null };

const importAsk: CadCommandStep<ImportState> = {
  state: IMPORT_EMPTY,
  prompt: {
    message: "Elige el PDF VECTORIAL que importar como geometría (un escaneo no trae trazos: ése se adjunta con PDFATTACH)",
    options: [FILE_KEYWORD],
    defaultOption: FILE_KEYWORD.keyword,
  },
  accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
};

/** Las pérdidas, en renglones, para que se lean ANTES de tocar el dibujo. */
const lossLines = (report: CadPdfImportReport) =>
  report.rows.filter((row) => row.fidelity !== "kept").map((row) => `  · ${row.detail}`);

function importPlan(
  payload: CadPdfPayload,
  page: number,
  insertion: CadPoint2,
  context: CadCommandContext,
): ImportPlan | string {
  const bytes = cadPdfBytesFromDataUri(payload.dataUri);
  if (!bytes) return "PDFIMPORT: el sobre no trae bytes legibles.";
  let result: CadPdfImportResult;
  try {
    result = importCadPdf(bytes, { page, insertion, idPrefix: context.newEntityId(), layerPrefix: "PDF" });
  } catch (error) {
    if (!(error instanceof CadPdfImportError)) throw error;
    // El fallo también es informe, y el del escaneo es el que más falta hace:
    // ahí el usuario no necesita saber qué se perdió, necesita saber que la
    // orden correcta es PDFATTACH.
    const failure = buildCadPdfFailureReport(error, error.code);
    return [`PDFIMPORT: «${payload.name}» no entró.`, ...lossLines(failure)].join("\n");
  }
  const known = new Set((context.document?.().layers ?? []).map((layer) => layer.id));
  const commands: CadEntityCommand[] = [];
  for (const layer of result.layers)
    if (!known.has(layer.id)) commands.push({ type: "layer", op: "upsert", layer: layer as CadLayerDef });
  for (const entity of result.entities) commands.push({ type: "insert", entity: entity as CadNativeEntity });
  return { commands, report: buildCadPdfImportReport(result), result, fileName: payload.name };
}

function importConfirm(state: ImportState, plan: ImportPlan): CadCommandStep<ImportState> {
  return {
    state: { ...state, phase: "confirm", plan },
    prompt: {
      message: [`«${plan.fileName}» · ${plan.report.headline}`, ...lossLines(plan.report), "¿Insertar en el dibujo?"].join("\n"),
      options: [YES_KEYWORD, NO_KEYWORD],
      defaultOption: YES_KEYWORD.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

function importStep(state: ImportState): CadCommandStep<ImportState> {
  const payload = state.payload!;
  if (state.phase === "page")
    return {
      state,
      prompt: {
        message: `«${payload.name}» tiene ${state.pages.length} páginas (${pageMenu(state.pages)}). Precise la página`,
        options: [],
        defaultValue: "1",
      },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  return {
    state,
    prompt: {
      message: `«${payload.name}» p.${state.page}. Precise dónde cae la esquina inferior izquierda de la página`,
      options: [],
    },
    accepts: CAD_ACCEPT_POINT,
  };
}

const pdfImportCommand: CadCommandDescriptor<ImportState> = {
  name: "PDFIMPORT",
  aliases: ["IMPORTARPDF"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => importAsk,
  step: (state, input, context) => {
    if (input.kind === "cancel") return say(state, "PDFIMPORT cancelado. El dibujo no ha cambiado.");
    if (state.phase === "confirm") {
      const plan = state.plan!;
      if (input.kind === "keyword" && input.keyword === NO_KEYWORD.keyword)
        return say(state, "PDFIMPORT cancelado. El dibujo no ha cambiado.");
      if (input.kind !== "keyword" && input.kind !== "enter") return importConfirm(state, plan);
      return written(
        state,
        plan.commands,
        `PDFIMPORT (${plan.result.entities.length} entidades)`,
        // El informe de pérdidas VIAJA en el aviso, no sólo en el paso que se
        // acaba de pulsar: quien mira la línea de órdenes mañana sigue viendo
        // qué no entró de esa lámina.
        [
          `PDFIMPORT: «${plan.fileName}» p.${plan.result.page} de ${plan.result.pageCount} · ${plan.report.headline}`,
          ...lossLines(plan.report),
          `Entró a tamaño de papel (${formatNumber(plan.result.pageSize.width)} × ${formatNumber(plan.result.pageSize.height)} unidades): ` +
            "un PDF no dice a qué escala se dibujó. Llévalo a medida real con SCALE.",
        ].join("\n"),
      );
    }
    if (state.phase === "file") {
      if (input.kind === "keyword" || input.kind === "enter") return say(state, `PDFIMPORT: ${FILE_PICKER_PENDING}`);
      if (input.kind !== "text") return importAsk;
      const payload = payloadOf("PDFIMPORT", input.value);
      if (typeof payload === "string") return say(state, payload);
      const pages = pagesOfPayload("PDFIMPORT", payload);
      if (typeof pages === "string") return say(state, pages);
      return importStep({ ...state, payload, pages, phase: pages.length > 1 ? "page" : "insertion" });
    }
    if (state.phase === "page") {
      if (input.kind === "enter") return importStep({ ...state, page: 1, phase: "insertion" });
      if (input.kind !== "distance") return importStep(state);
      const page = Math.round(input.value);
      if (!state.pages.some((candidate) => candidate.number === page))
        return say(state, `PDFIMPORT: el PDF tiene ${state.pages.length} página(s) y se pidió la ${page}.`);
      return importStep({ ...state, page, phase: "insertion" });
    }
    if (input.kind !== "point")
      return input.kind === "enter" ? say(state, "PDFIMPORT necesita el punto de inserción.") : importStep(state);
    const plan = importPlan(state.payload!, state.page, input.point, context);
    return typeof plan === "string" ? say(state, plan) : importConfirm(state, plan);
  },
};

// ---------------------------------------------------------------------------
// PDFLIST — el gestor
// ---------------------------------------------------------------------------

const pdfListCommand: CadCommandDescriptor<null> = {
  name: "PDFLIST",
  aliases: ["LISTARPDF"],
  kind: "inquiry",
  transparent: true,
  selection: "none",
  repeatable: false,
  // No muta: es la consulta que dice a qué escala está cada lámina ANTES de
  // haber calcado media planta encima de una que estaba al doble.
  mutates: false,
  cursor: "none",
  begin: (context) => say(null, underlayReport(context.document?.())),
  step: (state) => say(state, "PDFLIST no espera nada más."),
};


/**
 * Las diez órdenes de PDF, en el orden en que se usan: primero las que meten el
 * archivo, luego las que lo gobiernan, y el gestor al final.
 */
export const CAD_PDF_UNDERLAY_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(pdfAttachCommand),
  asCadCommand(pdfImportCommand),
  ...CAD_PDF_UNDERLAY_EDIT_COMMANDS,
  asCadCommand(pdfListCommand),
];
