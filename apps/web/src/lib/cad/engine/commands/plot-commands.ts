/**
 * PAGESETUP y PLOT.
 *
 * ## El reparto de trabajo
 *
 * PAGESETUP **escribe la presentación**: papel, orientación, márgenes, modo de
 * color, escala de grosores y tabla de plumas. Todo eso persiste, y persiste
 * por la ruta canónica — una orden `paper-space` en un lote.
 *
 * PLOT **no escribe nada**. Traza. Compone una `CadPlotRequest` con el área,
 * la escala y el centrado, y se la pasa al anfitrión, que es quien puede
 * fabricar un PDF y descargarlo. Un comando puro no puede hacer eso, y fingir
 * que puede ataría el motor al navegador.
 *
 * ## La variante de línea, sin diálogo
 *
 * `-PLOT` y `-PAGESETUP` existen porque un guion `.scr` tiene que poder trazar
 * cincuenta hojas sin que nadie pulse nada. El registro ya resuelve el prefijo
 * `-` al mismo descriptor; lo que hace falta es que las opciones se puedan
 * teclear, y por eso cada paso pide una cosa y admite un valor.
 */
import {
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import type { CadPaperSpace, CadPoint2 } from "../../cad-document";
import type { CadHostRequest } from "../host-requests";
import { findCadLayout } from "../../layout/layout-operations";
import { upsertCadLayoutCommand } from "../../layout/layout-operations";
import {
  applyCadPageSetupToLayout,
  cadPageSetupFromLayout,
  type CadPageSetup,
  type CadPlotArea,
  type CadPlotScale,
} from "../../plot/page-setup";
import { CAD_SHEET_PAPERS, type CadSheetPaper } from "../../paper-space";

function say(text: string): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text },
  };
}

function host(request: CadHostRequest, label: string): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "host", request, label },
  };
}

function write(space: CadPaperSpace, label: string): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands: [upsertCadLayoutCommand(space)], label },
  };
}

const PAPERS = Object.keys(CAD_SHEET_PAPERS) as CadSheetPaper[];

function activeSpace(context: CadCommandContext): CadPaperSpace | null {
  const spaces = context.paperSpaces?.();
  if (!spaces || spaces.length === 0) return null;
  const named = context.activeLayout ? findCadLayout(spaces, context.activeLayout) : undefined;
  return (
    named ??
    [...spaces].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))[0]
  );
}

const NO_LAYOUT = "No hay ninguna presentación abierta: crea una con LAYOUT.";

// ---------------------------------------------------------------------------
// PAGESETUP
// ---------------------------------------------------------------------------

const PAGESETUP_OPTIONS = [
  { keyword: "Papel", shortcut: "P" },
  { keyword: "Orientación", shortcut: "O" },
  { keyword: "Estilos", shortcut: "E" },
  { keyword: "COlor", shortcut: "CO" },
  { keyword: "Grosores", shortcut: "G" },
  { keyword: "MÁrgenes", shortcut: "MA" },
  { keyword: "Diálogo", shortcut: "D" },
] as const;

type PageSetupField = "paper" | "orientation" | "styles" | "color" | "lineweights" | "margins";

interface PageSetupState {
  field: PageSetupField | null;
}

function pageSetupStep(state: PageSetupState): CadCommandStep<PageSetupState> {
  if (!state.field)
    return {
      state,
      prompt: { message: "Indique qué quiere configurar de la página", options: PAGESETUP_OPTIONS },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  const message: Record<PageSetupField, string> = {
    paper: `Indique el tamaño de papel [${PAPERS.join("/")}]`,
    orientation: "Indique la orientación [Vertical/Apaisado]",
    styles: "Indique la tabla de plumas (nombre del .ctb o .stb), o «ninguna»",
    color: "Indique el modo de color [Color/Monocromo]",
    lineweights: "Indique el factor de escala de los grosores",
    margins: "Indique los márgenes en mm: superior,derecho,inferior,izquierdo",
  };
  return {
    state,
    prompt: { message: message[state.field], options: [] },
    accepts: CAD_ACCEPT_TEXT,
  };
}

function applyPageSetupField(
  space: CadPaperSpace,
  field: PageSetupField,
  value: string,
): CadCommandStep<PageSetupState> {
  const setup = cadPageSetupFromLayout(space);
  const token = value.trim();

  if (field === "paper") {
    const paper = PAPERS.find((candidate) => candidate.toLowerCase() === token.toLowerCase());
    if (!paper) return say(`«${token}» no es un tamaño conocido. Prueba con ${PAPERS.join(", ")}.`);
    return write(
      applyCadPageSetupToLayout(space, { ...setup, paper, customSize: undefined }),
      "PAGESETUP",
    );
  }

  if (field === "orientation") {
    const lower = token.toLowerCase();
    const orientation =
      lower.startsWith("v") || lower.startsWith("p")
        ? "portrait"
        : lower.startsWith("a") || lower.startsWith("l")
          ? "landscape"
          : null;
    if (!orientation) return say(`«${token}» no es una orientación. Escribe Vertical o Apaisado.`);
    return write(applyCadPageSetupToLayout(space, { ...setup, orientation }), "PAGESETUP");
  }

  if (field === "styles") {
    const none = /^(ninguna|none|ninguno|-)$/i.test(token);
    return write(
      applyCadPageSetupToLayout(space, { ...setup, plotStyleTable: none ? null : token }),
      "PAGESETUP",
    );
  }

  if (field === "color") {
    const lower = token.toLowerCase();
    const colorMode = lower.startsWith("m") ? "monochrome" : lower.startsWith("c") ? "color" : null;
    if (!colorMode) return say(`«${token}» no es un modo de color. Escribe Color o Monocromo.`);
    return write(applyCadPageSetupToLayout(space, { ...setup, colorMode }), "PAGESETUP");
  }

  if (field === "lineweights") {
    const scale = Number(token.replace(",", "."));
    if (!Number.isFinite(scale) || scale <= 0)
      return say(`«${token}» no es un factor de grosores válido.`);
    return write(
      applyCadPageSetupToLayout(space, { ...setup, lineweightScale: scale }),
      "PAGESETUP",
    );
  }

  const parts = token.split(/[,;\s]+/).map((part) => Number(part.replace(",", ".")));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0))
    return say("Los márgenes son cuatro números no negativos: superior,derecho,inferior,izquierdo.");
  return write(
    applyCadPageSetupToLayout(space, {
      ...setup,
      margins: { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] },
    }),
    "PAGESETUP",
  );
}

const pageSetupCommand: CadCommandDescriptor<PageSetupState> = {
  name: "PAGESETUP",
  aliases: ["PSET"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: () => pageSetupStep({ field: null }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("PAGESETUP cancelado.");
    const space = activeSpace(context);

    if (input.kind === "keyword") {
      if (input.keyword === "Diálogo") {
        if (!space) return say(NO_LAYOUT);
        return host({ kind: "page-setup", layoutId: space.id }, "PAGESETUP");
      }
      const field: Record<string, PageSetupField> = {
        Papel: "paper",
        "Orientación": "orientation",
        Estilos: "styles",
        COlor: "color",
        Grosores: "lineweights",
        "MÁrgenes": "margins",
      };
      const chosen = field[input.keyword];
      return chosen ? pageSetupStep({ field: chosen }) : pageSetupStep(state);
    }

    if (input.kind !== "text" || !state.field) return pageSetupStep(state);
    if (!space) return say(NO_LAYOUT);
    return applyPageSetupField(space, state.field, input.value);
  },
};

// ---------------------------------------------------------------------------
// PLOT
// ---------------------------------------------------------------------------

const PLOT_OPTIONS = [
  { keyword: "Presentación", shortcut: "P" },
  { keyword: "EXtensión", shortcut: "EX" },
  { keyword: "Ventana", shortcut: "V" },
  { keyword: "LÍmites", shortcut: "LI" },
  { keyword: "ESCala", shortcut: "ESC" },
  { keyword: "Previa", shortcut: "PR" },
  { keyword: "Trazar", shortcut: "T" },
] as const;

interface PlotState {
  area: CadPlotArea;
  scale: CadPlotScale;
  /** Primera esquina de `Ventana`, mientras se pide la segunda. */
  corner1?: CadPoint2;
  /** `true` mientras se espera el denominador de la escala. */
  askingScale?: boolean;
  /** `true` mientras se espera el nombre del archivo. */
  askingFile?: boolean;
  mode?: "preview" | "plot";
}

function plotStep(state: PlotState): CadCommandStep<PlotState> {
  if (state.corner1)
    return {
      state,
      prompt: { message: "Precise la esquina opuesta de la ventana de trazado", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  if (state.askingScale)
    return {
      state,
      prompt: {
        message: "Indique la escala: 50 para 1:50, o «ajustar» para encajar en la hoja",
        options: [],
      },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (state.askingFile)
    return {
      state,
      prompt: {
        message: "Indique el nombre del archivo, sin extensión",
        options: [],
        // Enter acepta el nombre de la presentación, que es lo que se quiere en
        // nueve de cada diez trazados.
        defaultValue: "el nombre de la presentación",
      },
      accepts: CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: {
      message: `Área ${areaLabel(state.area)}, escala ${scaleLabel(state.scale)}`,
      options: PLOT_OPTIONS,
      defaultOption: "Trazar",
    },
    accepts: CAD_ACCEPT_KEYWORD | CAD_ACCEPT_POINT,
  };
}

function areaLabel(area: CadPlotArea): string {
  return area.kind === "layout"
    ? "Presentación"
    : area.kind === "extents"
      ? "Extensión"
      : area.kind === "limits"
        ? "Límites"
        : area.kind === "display"
          ? "Pantalla"
          : "Ventana";
}

function scaleLabel(scale: CadPlotScale): string {
  return scale.kind === "fit" ? "ajustada a la hoja" : `1:${scale.drawingUnits / scale.paperMm}`;
}

function plotRequest(
  space: CadPaperSpace,
  state: PlotState,
  fileName: string,
  mode: "preview" | "plot",
): CadCommandStep<PlotState> {
  const setup: CadPageSetup = {
    ...cadPageSetupFromLayout(space),
    area: state.area,
    scale: state.scale,
  };
  return host(
    {
      kind: "plot",
      mode,
      request: { layoutId: space.id, pageSetup: setup, fileName, copies: 1 },
    },
    "PLOT",
  );
}

const plotCommand: CadCommandDescriptor<PlotState> = {
  name: "PLOT",
  aliases: ["PRINT", "PLO"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  // Trazar no cambia el dibujo. Declararlo mutante haría que un dibujo abierto
  // en sólo lectura no se pudiera imprimir, que es justo cuando más se imprime.
  mutates: false,
  cursor: "crosshair",
  begin: () =>
    plotStep({ area: { kind: "layout" }, scale: { kind: "ratio", paperMm: 1, drawingUnits: 1 } }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("PLOT cancelado.");
    const space = activeSpace(context);

    if (input.kind === "keyword") {
      switch (input.keyword) {
        case "Presentación":
          return plotStep({ ...state, area: { kind: "layout" } });
        case "EXtensión":
          return plotStep({ ...state, area: { kind: "extents" } });
        case "LÍmites":
          return plotStep({ ...state, area: { kind: "limits" } });
        case "Ventana":
          return plotStep({ ...state, corner1: undefined, area: { kind: "display" } });
        case "ESCala":
          return plotStep({ ...state, askingScale: true });
        case "Previa":
        case "Trazar": {
          if (!space) return say(NO_LAYOUT);
          const mode = input.keyword === "Previa" ? "preview" : "plot";
          // La vista previa no pide nombre: no produce archivo.
          return mode === "preview"
            ? plotRequest(space, state, space.name, "preview")
            : plotStep({ ...state, askingFile: true, mode });
        }
        default:
          return plotStep(state);
      }
    }

    if (input.kind === "point") {
      if (!state.corner1) return plotStep({ ...state, corner1: input.point });
      return plotStep({
        ...state,
        corner1: undefined,
        area: { kind: "window", corner1: state.corner1, corner2: input.point },
      });
    }

    if (input.kind === "enter") {
      if (!space) return say(NO_LAYOUT);
      if (state.askingFile) return plotRequest(space, state, space.name, "plot");
      return plotStep({ ...state, askingFile: true, mode: "plot" });
    }

    if (input.kind !== "text") return plotStep(state);

    if (state.askingScale) {
      const token = input.value.trim();
      if (/^(ajustar|fit|ajuste)$/i.test(token))
        return plotStep({ ...state, askingScale: false, scale: { kind: "fit" } });
      const denominator = Number(token.replace(/^1\s*:\s*/, "").replace(",", "."));
      if (!Number.isFinite(denominator) || denominator <= 0)
        return say(`«${token}» no es una escala válida. Escribe 50, 1:50 o «ajustar».`);
      return plotStep({
        ...state,
        askingScale: false,
        scale: { kind: "ratio", paperMm: 1, drawingUnits: denominator },
      });
    }

    if (state.askingFile) {
      if (!space) return say(NO_LAYOUT);
      return plotRequest(space, state, input.value.trim() || space.name, state.mode ?? "plot");
    }

    return plotStep(state);
  },
};

export const CAD_PLOT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(pageSetupCommand),
  asCadCommand(plotCommand),
];
