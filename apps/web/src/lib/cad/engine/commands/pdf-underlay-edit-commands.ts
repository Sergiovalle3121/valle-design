/**
 * PDFCLIP, PDFADJUST, PDFPAGE, PDFSCALE, PDFDETACH, PDFUNLOAD y PDFRELOAD: la
 * vida del sustrato una vez colocado.
 *
 * Adjuntar es la mitad fácil. Lo que convierte un PDF en una plantilla sobre la
 * que se calca de verdad es lo de aquí:
 *
 *   - **PDFSCALE** es la orden que hace útil todo lo demás. El PDF no dice a qué
 *     escala se dibujó, así que entra a tamaño de papel; el arquitecto designa
 *     los dos extremos de una cota que la lámina ya lleva escrita, dice cuánto
 *     miden de verdad, y el sustrato entero se reescala alrededor del primero.
 *     Sin esto, calcar produce un dibujo con la forma correcta y TODAS las
 *     medidas equivocadas, que es el peor resultado posible.
 *   - **PDFCLIP** deja ver sólo la parte que interesa, en el campo `clipBoundary`
 *     que la entidad ya tiene, en coordenadas de la lámina.
 *   - **PDFADJUST** desvanece y bloquea. El bloqueo es de la CAPA, que es lo que
 *     impide designar el fondo al arrastrar una ventana sobre el dibujo.
 *   - **PDFPAGE** cambia de página sin volver a adjuntar, leyendo la lista de
 *     páginas del propio dibujo: el PDF viaja dentro.
 *   - **PDFDETACH / PDFUNLOAD / PDFRELOAD** son la ceremonia del xref, que
 *     `xref-workflow.ts` ya resolvió y aquí se sigue al pie de la letra.
 *
 * Toda la geometría la pone `lib/cad/pdf/pdf-underlay.ts`. Aquí sólo están las
 * máquinas de estados que preguntan lo que hace falta y traducen la negativa del
 * motor a una frase con el nombre de la orden delante.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { cadPdfBytesFromDataUri } from "../../pdf/pdf-attach-payload";
import { readCadPdfPageList } from "../../pdf/pdf-import";
import {
  CAD_PDF_UNDERLAY_MM_PER_POINT,
  cadPdfClipCommands,
  cadPdfDeleteClipCommands,
  cadPdfDetachCommands,
  cadPdfReloadCommands,
  cadPdfScaleToDistanceCommands,
  cadPdfUnderlayFadeCommands,
  cadPdfUnderlayLockCommands,
  cadPdfUnderlayPageCommands,
  cadPdfUnloadCommands,
  type CadPdfUnderlay,
  type CadPdfUnderlayPage,
} from "../../pdf/pdf-underlay";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import {
  DELETE_KEYWORD,
  DONE_KEYWORD,
  FADE_KEYWORD,
  LOCK_KEYWORD,
  NEW_KEYWORD,
  POLYGON_KEYWORD,
  RECTANGLE_KEYWORD,
  attempt,
  formatNumber,
  keyOf,
  pageMenu,
  pageSize,
  preselected,
  resolveTarget,
  say,
  targetStep,
  underlayReport,
  written,
  type Target,
} from "./pdf-underlay-support";

// ---------------------------------------------------------------------------
// PDFCLIP
// ---------------------------------------------------------------------------

interface ClipState {
  phase: "target" | "mode" | "shape" | "polygon" | "rectangle";
  key: string | null;
  points: CadPoint2[];
}

const CLIP_EMPTY: ClipState = { phase: "target", key: null, points: [] };

function clipStep(state: ClipState, context: CadCommandContext): CadCommandStep<ClipState> {
  if (state.phase === "target") return targetStep(state, "recortar");
  if (state.phase === "mode")
    return {
      state,
      prompt: { message: "Indique la opción de recorte", options: [NEW_KEYWORD, DELETE_KEYWORD], defaultOption: NEW_KEYWORD.keyword },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.phase === "shape")
    return {
      state,
      prompt: { message: "Indique el tipo de contorno", options: [POLYGON_KEYWORD, RECTANGLE_KEYWORD], defaultOption: RECTANGLE_KEYWORD.keyword },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  const preview = state.points.length > 0 && context.cursor ? [{ points: [...state.points, context.cursor] }] : [];
  if (state.phase === "rectangle")
    return {
      state,
      prompt: { message: state.points.length === 0 ? "Precise la primera esquina del recorte" : "Precise la esquina opuesta", options: [] },
      accepts: CAD_ACCEPT_POINT,
      preview,
    };
  return {
    state,
    prompt: {
      message:
        state.points.length === 0
          ? "Precise el primer vértice del recorte"
          : `Precise el siguiente vértice o Intro para cerrar (${state.points.length} vértice(s))`,
      options: [],
    },
    accepts: CAD_ACCEPT_POINT,
    preview,
  };
}

function clipFinish(state: ClipState, boundary: readonly CadPoint2[], context: CadCommandContext): CadCommandStep<ClipState> {
  const target = resolveTarget(context, state.key!);
  if (typeof target === "string") return say(state, `PDFCLIP: ${target}`);
  const document = context.document!();
  return attempt(
    state,
    "PDFCLIP",
    () => cadPdfClipCommands(document, target.entityId, boundary),
    () => `PDFCLIP: «${target.fileName}» recortado por ${boundary.length} vértices.`,
  );
}

const pdfClipCommand: CadCommandDescriptor<ClipState> = {
  name: "PDFCLIP",
  aliases: ["RECORTARPDF"],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const chosen = preselected(context);
    return clipStep(chosen ? { ...CLIP_EMPTY, key: chosen.entityId, phase: "mode" } : CLIP_EMPTY, context);
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return say(state, "PDFCLIP cancelado. El dibujo no ha cambiado.");
    if (state.phase === "target") {
      if (input.kind === "keyword") return say(state, underlayReport(context.document?.()));
      const key = keyOf(input) ?? preselected(context)?.entityId ?? null;
      if (!key) return input.kind === "enter" ? say(state, "PDFCLIP necesita un sustrato designado.") : clipStep(state, context);
      const target = resolveTarget(context, key);
      if (typeof target === "string") return say(state, `PDFCLIP: ${target}`);
      return clipStep({ ...state, key: target.entityId, phase: "mode" }, context);
    }
    if (state.phase === "mode") {
      if (input.kind === "keyword" && input.keyword === DELETE_KEYWORD.keyword) {
        const target = resolveTarget(context, state.key!);
        if (typeof target === "string") return say(state, `PDFCLIP: ${target}`);
        const document = context.document!();
        return attempt(
          state,
          "PDFCLIP",
          () => cadPdfDeleteClipCommands(document, target.entityId),
          () => `PDFCLIP: recorte eliminado de «${target.fileName}».`,
        );
      }
      if (input.kind === "keyword" || input.kind === "enter") return clipStep({ ...state, phase: "shape" }, context);
      return clipStep(state, context);
    }
    if (state.phase === "shape") {
      if (input.kind === "keyword" && input.keyword === POLYGON_KEYWORD.keyword) return clipStep({ ...state, phase: "polygon" }, context);
      if (input.kind === "keyword" || input.kind === "enter") return clipStep({ ...state, phase: "rectangle" }, context);
      return clipStep(state, context);
    }
    if (state.phase === "rectangle") {
      if (input.kind !== "point") return clipStep(state, context);
      if (state.points.length === 0) return clipStep({ ...state, points: [input.point] }, context);
      const [a] = state.points;
      const b = input.point;
      return clipFinish(state, [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }], context);
    }
    if (input.kind === "point") return clipStep({ ...state, points: [...state.points, input.point] }, context);
    if (input.kind === "enter") return clipFinish(state, state.points, context);
    return clipStep(state, context);
  },
};

// ---------------------------------------------------------------------------
// PDFADJUST — desvanecido y bloqueo
// ---------------------------------------------------------------------------

interface AdjustState {
  phase: "target" | "options" | "fade";
  key: string | null;
  fade: number;
  locked: boolean;
}

const ADJUST_EMPTY: AdjustState = { phase: "target", key: null, fade: 0, locked: true };

function adjustFrom(target: Target, context: CadCommandContext): AdjustState {
  const entity = context.entity?.(target.entityId);
  return {
    phase: "options",
    key: target.entityId,
    fade: entity && entity.type === "image" ? (entity.fade ?? 0) : 0,
    locked: target.underlay.locked,
  };
}

function adjustStep(state: AdjustState): CadCommandStep<AdjustState> {
  if (state.phase === "target") return targetStep(state, "ajustar");
  if (state.phase === "fade")
    return {
      state,
      // 0 es opaco y 100 es invisible, como la atenuación de AutoCAD. Un
      // sustrato al 60 deja leer lo que se dibuja encima sin perderlo de vista.
      prompt: { message: "Precise el desvanecido (0 opaco a 100 invisible)", options: [], defaultValue: String(state.fade) },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  return {
    state,
    prompt: {
      message: `Desvanecido ${state.fade} · ${state.locked ? "bloqueado" : "editable"}. Indique el ajuste`,
      options: [FADE_KEYWORD, LOCK_KEYWORD, DONE_KEYWORD],
      defaultOption: DONE_KEYWORD.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

function adjustFinish(state: AdjustState, context: CadCommandContext): CadCommandStep<AdjustState> {
  const target = resolveTarget(context, state.key!);
  if (typeof target === "string") return say(state, `PDFADJUST: ${target}`);
  const document = context.document!();
  const entity = context.entity?.(target.entityId);
  const currentFade = entity && entity.type === "image" ? (entity.fade ?? 0) : 0;
  const fadeChanged = currentFade !== state.fade;
  const lockChanged = target.underlay.locked !== state.locked;
  if (!fadeChanged && !lockChanged)
    return say(state, `PDFADJUST: «${target.fileName}» queda como estaba (desvanecido ${state.fade}, ${state.locked ? "bloqueado" : "editable"}).`);
  return attempt(
    state,
    "PDFADJUST",
    () => {
      const commands: CadEntityCommand[] = [];
      if (fadeChanged) commands.push(...cadPdfUnderlayFadeCommands(document, target.entityId, state.fade));
      if (lockChanged) {
        // El bloqueo se calcula sobre el documento CON el desvanecido ya puesto:
        // ambas órdenes sustituyen la entidad entera, y construir la segunda a
        // partir del documento viejo devolvería el desvanecido a su valor
        // anterior sin que nada avisara.
        const patched = fadeChanged
          ? { ...document, entities: document.entities.map((item) => (item.id === target.entityId && item.type === "image" ? { ...item, fade: state.fade } : item)) }
          : document;
        commands.push(...cadPdfUnderlayLockCommands(patched, target.entityId, state.locked));
      }
      return commands;
    },
    () => `PDFADJUST: «${target.fileName}» desvanecido ${state.fade}, ${state.locked ? "bloqueado" : "editable"}.`,
  );
}

const pdfAdjustCommand: CadCommandDescriptor<AdjustState> = {
  name: "PDFADJUST",
  aliases: ["AJUSTARPDF"],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const chosen = preselected(context);
    return adjustStep(chosen ? adjustFrom(chosen, context) : ADJUST_EMPTY);
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return say(state, "PDFADJUST cancelado. El dibujo no ha cambiado.");
    if (state.phase === "target") {
      if (input.kind === "keyword") return say(state, underlayReport(context.document?.()));
      const key = keyOf(input) ?? preselected(context)?.entityId ?? null;
      if (!key) return input.kind === "enter" ? say(state, "PDFADJUST necesita un sustrato designado.") : adjustStep(state);
      const target = resolveTarget(context, key);
      if (typeof target === "string") return say(state, `PDFADJUST: ${target}`);
      return adjustStep(adjustFrom(target, context));
    }
    if (state.phase === "fade") {
      if (input.kind === "enter") return adjustStep({ ...state, phase: "options" });
      if (input.kind !== "distance") return adjustStep(state);
      return adjustStep({ ...state, fade: Math.round(Math.min(100, Math.max(0, input.value))), phase: "options" });
    }
    if (input.kind === "enter") return adjustFinish(state, context);
    if (input.kind !== "keyword") return adjustStep(state);
    if (input.keyword === FADE_KEYWORD.keyword) return adjustStep({ ...state, phase: "fade" });
    if (input.keyword === LOCK_KEYWORD.keyword) return adjustStep({ ...state, locked: !state.locked });
    return adjustFinish(state, context);
  },
};

// ---------------------------------------------------------------------------
// PDFPAGE — cambiar de página sin volver a adjuntar
// ---------------------------------------------------------------------------

interface PageState {
  phase: "target" | "page";
  key: string | null;
  pages: readonly CadPdfUnderlayPage[];
}

const PAGE_EMPTY: PageState = { phase: "target", key: null, pages: [] };

/**
 * Las páginas de un sustrato ya adjuntado.
 *
 * Salen del propio dibujo: el PDF viaja dentro como `data:`, así que cambiar de
 * página no vuelve a pedir el archivo. Un sustrato adjuntado desde otra ruta no
 * lo permite, y se dice — es un límite real, no un fallo.
 */
function pagesOfUnderlay(underlay: CadPdfUnderlay): readonly CadPdfUnderlayPage[] | string {
  const bytes = cadPdfBytesFromDataUri(underlay.uri);
  if (!bytes)
    return `el archivo no viaja dentro del dibujo (${underlay.uri.slice(0, 40)}…), así que no se puede leer su lista de páginas. Vuelve a adjuntarlo con PDFATTACH.`;
  try {
    return readCadPdfPageList(bytes);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function pageStep(state: PageState, underlay: CadPdfUnderlay): CadCommandStep<PageState> {
  return {
    state,
    prompt: {
      message: `«${underlay.fileName}» está en la página ${underlay.page} de ${state.pages.length} (${pageMenu(state.pages)}). Precise la página`,
      options: [],
      defaultValue: String(underlay.page),
    },
    accepts: CAD_ACCEPT_DISTANCE,
  };
}

const pdfPageCommand: CadCommandDescriptor<PageState> = {
  name: "PDFPAGE",
  aliases: ["PAGINAPDF"],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const chosen = preselected(context);
    if (!chosen) return targetStep(PAGE_EMPTY, "cambiar de página");
    const pages = pagesOfUnderlay(chosen.underlay);
    if (typeof pages === "string") return say(PAGE_EMPTY, `PDFPAGE: ${pages}`);
    return pageStep({ phase: "page", key: chosen.entityId, pages }, chosen.underlay);
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return say(state, "PDFPAGE cancelado. El dibujo no ha cambiado.");
    if (state.phase === "target") {
      if (input.kind === "keyword") return say(state, underlayReport(context.document?.()));
      const key = keyOf(input) ?? preselected(context)?.entityId ?? null;
      if (!key) return input.kind === "enter" ? say(state, "PDFPAGE necesita un sustrato designado.") : targetStep(state, "cambiar de página");
      const target = resolveTarget(context, key);
      if (typeof target === "string") return say(state, `PDFPAGE: ${target}`);
      const pages = pagesOfUnderlay(target.underlay);
      if (typeof pages === "string") return say(state, `PDFPAGE: ${pages}`);
      if (pages.length < 2) return say(state, `PDFPAGE: «${target.fileName}» tiene una sola página.`);
      return pageStep({ phase: "page", key: target.entityId, pages }, target.underlay);
    }
    const target = resolveTarget(context, state.key!);
    if (typeof target === "string") return say(state, `PDFPAGE: ${target}`);
    if (input.kind !== "distance") return input.kind === "enter" ? say(state, "PDFPAGE: la página no ha cambiado.") : pageStep(state, target.underlay);
    const page = Math.round(input.value);
    const document = context.document!();
    const info = state.pages.find((candidate) => candidate.number === page);
    return attempt(
      state,
      "PDFPAGE",
      () => cadPdfUnderlayPageCommands(document, target.entityId, page, state.pages),
      () =>
        `PDFPAGE: «${target.fileName}» pasa de la página ${target.underlay.page} a la ${page} de ${state.pages.length}` +
        `${info ? ` (${pageSize(info)} de papel)` : ""}.`,
    );
  },
};

// ---------------------------------------------------------------------------
// PDFSCALE — escalar a distancia conocida por dos puntos
// ---------------------------------------------------------------------------

interface ScaleState {
  phase: "target" | "first" | "second" | "distance";
  key: string | null;
  from: CadPoint2 | null;
  to: CadPoint2 | null;
}

const SCALE_EMPTY: ScaleState = { phase: "target", key: null, from: null, to: null };

function scaleStep(state: ScaleState, context: CadCommandContext): CadCommandStep<ScaleState> {
  if (state.phase === "target") return targetStep(state, "escalar a medida conocida");
  if (state.phase === "first")
    return {
      state,
      prompt: { message: "Precise el primer punto de una medida que el plano ya lleve escrita", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  if (state.phase === "second")
    return {
      state,
      prompt: { message: "Precise el segundo punto de esa medida", options: [] },
      accepts: CAD_ACCEPT_POINT,
      preview: state.from && context.cursor ? [{ points: [state.from, context.cursor] }] : [],
    };
  const measured = Math.hypot(state.to!.x - state.from!.x, state.to!.y - state.from!.y);
  return {
    state,
    prompt: {
      message: `Entre esos dos puntos hay ${formatNumber(measured)} unidades. Precise cuánto miden DE VERDAD`,
      options: [],
    },
    accepts: CAD_ACCEPT_DISTANCE,
  };
}

const pdfScaleCommand: CadCommandDescriptor<ScaleState> = {
  name: "PDFSCALE",
  aliases: ["ESCALARPDF"],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => {
    const chosen = preselected(context);
    return scaleStep(chosen ? { ...SCALE_EMPTY, key: chosen.entityId, phase: "first" } : SCALE_EMPTY, context);
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return say(state, "PDFSCALE cancelado. El dibujo no ha cambiado.");
    if (state.phase === "target") {
      if (input.kind === "keyword") return say(state, underlayReport(context.document?.()));
      const key = keyOf(input) ?? preselected(context)?.entityId ?? null;
      if (!key) return input.kind === "enter" ? say(state, "PDFSCALE necesita un sustrato designado.") : scaleStep(state, context);
      const target = resolveTarget(context, key);
      if (typeof target === "string") return say(state, `PDFSCALE: ${target}`);
      return scaleStep({ ...state, key: target.entityId, phase: "first" }, context);
    }
    if (state.phase === "first")
      return input.kind === "point" ? scaleStep({ ...state, from: input.point, phase: "second" }, context) : scaleStep(state, context);
    if (state.phase === "second")
      return input.kind === "point" ? scaleStep({ ...state, to: input.point, phase: "distance" }, context) : scaleStep(state, context);
    if (input.kind !== "distance") return scaleStep(state, context);
    const target = resolveTarget(context, state.key!);
    if (typeof target === "string") return say(state, `PDFSCALE: ${target}`);
    const document = context.document!();
    try {
      const scaled = cadPdfScaleToDistanceCommands(document, target.entityId, state.from!, state.to!, input.value);
      return written(
        state,
        scaled.commands,
        "PDFSCALE",
        `PDFSCALE: «${target.fileName}» medía ${formatNumber(scaled.measured)} unidades entre los dos puntos y ahora mide ` +
          `${formatNumber(input.value)}: factor ${formatNumber(scaled.factor)}. La lámina queda a escala ` +
          `${formatNumber(scaled.unitsPerPoint / CAD_PDF_UNDERLAY_MM_PER_POINT)} frente al tamaño de papel.`,
      );
    } catch (error) {
      return say(state, `PDFSCALE: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// PDFDETACH, PDFUNLOAD, PDFRELOAD — la ceremonia del xref
// ---------------------------------------------------------------------------

interface KeyState {
  key: string | null;
}

type UnderlayAction = "detach" | "unload" | "reload";

const ACTION_VERB: Readonly<Record<UnderlayAction, string>> = {
  detach: "desadjuntar",
  unload: "descargar",
  reload: "volver a cargar",
};

/**
 * Las tres órdenes de estado son la misma máquina con distinto verbo.
 *
 * Escribirlas tres veces habría dado tres sitios donde arreglar el mismo fallo
 * de designación. Lo que cambia entre ellas —qué lote pide al motor y qué dice
 * al terminar— cabe en dos líneas.
 */
function stateCommand(name: string, alias: string, action: UnderlayAction): CadCommandDescriptor<KeyState> {
  const finish = (state: KeyState, target: Target, context: CadCommandContext): CadCommandStep<KeyState> => {
    const document = context.document!();
    if (action === "unload" && target.underlay.status === "unloaded")
      return say(state, `${name}: «${target.fileName}» ya estaba descargado.`);
    return attempt(
      state,
      name,
      () =>
        action === "detach"
          ? cadPdfDetachCommands(document, target.entityId)
          : action === "unload"
            ? cadPdfUnloadCommands(document, target.entityId)
            : cadPdfReloadCommands(document, target.entityId),
      () =>
        action === "detach"
          ? `${name}: «${target.fileName}» desadjuntado; su capa se retira con él.`
          : action === "unload"
            ? `${name}: «${target.fileName}» descargado. Conserva su sitio, su escala y su ruta: PDFRELOAD lo devuelve.`
            : `${name}: «${target.fileName}» vuelve a verse en la página ${target.underlay.page}.`,
    );
  };
  return {
    name,
    aliases: [alias],
    kind: "manage",
    transparent: false,
    selection: "command-first",
    repeatable: true,
    mutates: true,
    cursor: "pick",
    begin: (context) => {
      const chosen = preselected(context);
      return chosen ? finish({ key: chosen.entityId }, chosen, context) : targetStep({ key: null }, ACTION_VERB[action]);
    },
    step: (state, input, context) => {
      if (input.kind === "cancel") return say(state, `${name} cancelado. El dibujo no ha cambiado.`);
      if (input.kind === "keyword") return say(state, underlayReport(context.document?.()));
      const key = keyOf(input) ?? preselected(context)?.entityId ?? null;
      if (!key)
        return input.kind === "enter" ? say(state, `${name} necesita un sustrato designado.`) : targetStep(state, ACTION_VERB[action]);
      const target = resolveTarget(context, key);
      if (typeof target === "string") return say(state, `${name}: ${target}`);
      return finish({ key: target.entityId }, target, context);
    },
  };
}


export const CAD_PDF_UNDERLAY_EDIT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(pdfClipCommand),
  asCadCommand(pdfAdjustCommand),
  asCadCommand(pdfPageCommand),
  asCadCommand(pdfScaleCommand),
  asCadCommand(stateCommand("PDFDETACH", "DESADJUNTARPDF", "detach")),
  asCadCommand(stateCommand("PDFUNLOAD", "DESCARGARPDF", "unload")),
  asCadCommand(stateCommand("PDFRELOAD", "RECARGARPDF", "reload")),
];
