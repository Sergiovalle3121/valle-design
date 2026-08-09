/**
 * LAYOUT, MVIEW, MSPACE y PSPACE — los comandos del espacio papel.
 *
 * ## Por qué el contexto trae el documento entero por una rendija
 *
 * `CadCommandContext` da entidades, capas activas y vista, pero no
 * presentaciones: hasta ahora ningún comando las necesitaba. En vez de
 * ensanchar el contexto para todos —y obligar a cada spec de cada comando a
 * montar hojas que no usa— estos cuatro leen `context.paperSpaces?.()`, que es
 * opcional y sigue exactamente el patrón de `blocks?.()` y `constraints`. Un
 * anfitrión que no las aporte recibe una negativa explícita en vez de una hoja
 * inventada.
 *
 * ## Qué emite cada uno
 *
 * LAYOUT y MVIEW escriben el documento: emiten `CadEntityCommand[]` de tipo
 * `paper-space`, por el mismo embudo que la geometría. MSPACE y PSPACE no
 * escriben nada —cambian el espacio ACTIVO del editor, que es estado de
 * interfaz— y emiten una petición al anfitrión.
 */
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
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
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_LAYOUT_TEMPLATES,
  cadLayoutId,
  canDeleteCadLayout,
  copyCadLayout,
  createCadLayout,
  deleteCadLayoutCommand,
  findCadLayout,
  renameCadLayout,
  upsertCadLayoutCommand,
} from "../../layout/layout-operations";
import { cadAnnotativeRescaleCommands } from "../../layout/annotative-scale";
import {
  cadBoundaryFromEntity,
  cadViewportId,
  createCadPolygonalViewport,
  createCadRectangularViewport,
  freezeCadLayerInViewport,
  setCadViewportOn,
  setCadViewportScale,
} from "../../layout/viewport-operations";

function documentResult(
  commands: readonly CadEntityCommand[],
  label: string,
): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands, label },
  };
}

function say(text: string): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text },
  };
}

function hostResult(
  request: Parameters<typeof hostStep>[0],
  label: string,
): CadCommandStep<never> {
  return hostStep(request, label);
}

function hostStep(
  request: { kind: "space"; space: "model" | "paper"; layoutId?: string },
  label: string,
): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "host", request, label },
  };
}

/**
 * Entidades que el comando puede ver.
 *
 * El contexto da los ids y un lector por id; no da el documento. Se
 * materializa aquí, una vez, en vez de en cada bucle: MVIEW ESCala lo pide una
 * sola vez por invocación y un `find` por entidad convertiría un dibujo de
 * cien mil objetos en cien mil recorridos.
 */
function entitiesOf(context: CadCommandContext) {
  if (!context.entity) return [];
  return context.entityIds
    .map((entityId) => context.entity!(entityId))
    .filter((entity): entity is NonNullable<typeof entity> => !!entity);
}

/** Presentaciones del documento, o `null` si el anfitrión no las aporta. */
function spacesOf(context: CadCommandContext): readonly CadPaperSpace[] | null {
  return context.paperSpaces?.() ?? null;
}

const NO_SPACES = "Este anfitrión no expone las presentaciones del dibujo.";

/**
 * Presentación sobre la que operan MVIEW, MSPACE y el LAYOUT sin nombre.
 *
 * `context.activeLayout` la nombra cuando el editor tiene una pestaña abierta;
 * si no, se coge la primera por orden. Nunca se adivina «la última tocada»:
 * eso haría que el mismo guion diera resultados distintos según lo que el
 * usuario hubiera pinchado antes.
 */
function activeSpace(context: CadCommandContext): CadPaperSpace | null {
  const spaces = spacesOf(context);
  if (!spaces || spaces.length === 0) return null;
  const named = context.activeLayout ? findCadLayout(spaces, context.activeLayout) : undefined;
  return (
    named ??
    [...spaces].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))[0]
  );
}

// ---------------------------------------------------------------------------
// LAYOUT
// ---------------------------------------------------------------------------

const LAYOUT_OPTIONS = [
  { keyword: "Nueva", shortcut: "N" },
  { keyword: "COpiar", shortcut: "CO" },
  { keyword: "Renombrar", shortcut: "R" },
  { keyword: "Suprimir", shortcut: "S" },
  { keyword: "PLantilla", shortcut: "PL" },
  { keyword: "Definir", shortcut: "D" },
  { keyword: "LIstar", shortcut: "LI" },
] as const;

type LayoutOp = "new" | "copy" | "rename" | "delete" | "template" | "set";

interface LayoutState {
  op: LayoutOp | null;
  /** Origen de COpiar y Renombrar, ya resuelto. */
  sourceId?: string;
  templateId?: string;
}

/** Modelo por defecto de una presentación nueva: la envolvente del dibujo. */
const FALLBACK_MODEL_BOUNDS = { x: 0, y: 0, width: 10_000, height: 10_000 };

function modelBounds(context: CadCommandContext) {
  const bounds = context.drawingExtents?.();
  if (!bounds) return FALLBACK_MODEL_BOUNDS;
  return {
    x: bounds.minX,
    y: bounds.minY,
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY),
  };
}

const SHEET_METADATA = {
  project: "-",
  drawingNumber: "-",
  title: "",
  sheetNumber: "",
  revision: "-",
  discipline: "General",
};

function layoutStep(state: LayoutState): CadCommandStep<LayoutState> {
  if (!state.op)
    return {
      state,
      prompt: { message: "Indique una opción de presentación", options: LAYOUT_OPTIONS },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.op === "template" && !state.templateId)
    return {
      state,
      prompt: {
        message: `Indique la plantilla [${CAD_LAYOUT_TEMPLATES.map((template) => template.id).join("/")}]`,
        options: [],
        defaultValue: CAD_LAYOUT_TEMPLATES[3].id,
      },
      accepts: CAD_ACCEPT_TEXT,
    };
  if ((state.op === "copy" || state.op === "rename") && !state.sourceId)
    return {
      state,
      prompt: {
        message:
          state.op === "copy"
            ? "Indique la presentación que quiere copiar"
            : "Indique la presentación que quiere renombrar",
        options: [],
      },
      accepts: CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: {
      message:
        state.op === "delete"
          ? "Indique la presentación que quiere suprimir"
          : state.op === "set"
            ? "Indique la presentación que quiere activar"
            : state.op === "rename"
              ? "Indique el nombre nuevo"
              : "Indique el nombre de la presentación",
      options: [],
    },
    accepts: CAD_ACCEPT_TEXT,
  };
}

function layoutFinish(
  state: LayoutState,
  name: string,
  context: CadCommandContext,
): CadCommandStep<LayoutState> {
  const spaces = spacesOf(context);
  if (!spaces) return say(NO_SPACES);
  const trimmed = name.trim();
  if (!trimmed) return say("LAYOUT: hace falta un nombre.");

  if (state.op === "delete") {
    const target = findCadLayout(spaces, trimmed);
    if (!target) return say(`No existe la presentación «${trimmed}».`);
    const issue = canDeleteCadLayout(spaces, target.id);
    if (issue) return say(issue.detail);
    return documentResult([deleteCadLayoutCommand(target.id)], "LAYOUT");
  }

  if (state.op === "rename") {
    const renamed = renameCadLayout(spaces, state.sourceId!, trimmed);
    if (!renamed) return say(`No se pudo renombrar la presentación.`);
    return documentResult([upsertCadLayoutCommand(renamed)], "LAYOUT");
  }

  if (state.op === "copy") {
    const copy = copyCadLayout(spaces, state.sourceId!, cadLayoutId(spaces, trimmed), trimmed);
    if (!copy) return say(`No existe la presentación de origen.`);
    return documentResult([upsertCadLayoutCommand(copy)], "LAYOUT");
  }

  if (state.op === "set") {
    const target = findCadLayout(spaces, trimmed);
    if (!target) return say(`No existe la presentación «${trimmed}».`);
    return hostResult({ kind: "space", space: "paper", layoutId: target.id }, "LAYOUT");
  }

  const created = createCadLayout(spaces, {
    id: cadLayoutId(spaces, trimmed),
    name: trimmed,
    ...(state.templateId ? { templateId: state.templateId } : {}),
    modelBounds: modelBounds(context),
    unit: context.unit,
    metadata: { ...SHEET_METADATA, title: trimmed, sheetNumber: String(spaces.length + 1) },
  });
  return documentResult([upsertCadLayoutCommand(created)], "LAYOUT");
}

const layoutCommand: CadCommandDescriptor<LayoutState> = {
  name: "LAYOUT",
  aliases: ["LO"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: () => layoutStep({ op: null }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("LAYOUT cancelado.");

    if (input.kind === "keyword") {
      switch (input.keyword) {
        case "Nueva":
          return layoutStep({ op: "new" });
        case "COpiar":
          return layoutStep({ op: "copy" });
        case "Renombrar":
          return layoutStep({ op: "rename" });
        case "Suprimir":
          return layoutStep({ op: "delete" });
        case "PLantilla":
          return layoutStep({ op: "template" });
        case "Definir":
          return layoutStep({ op: "set" });
        case "LIstar": {
          const spaces = spacesOf(context);
          if (!spaces) return say(NO_SPACES);
          return say(
            spaces.length === 0
              ? "El dibujo no tiene ninguna presentación."
              : `Presentaciones: ${[...spaces]
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map((space) => space.name)
                  .join(", ")}.`,
          );
        }
        default:
          return layoutStep(state);
      }
    }

    if (input.kind !== "text") return layoutStep(state);

    if (state.op === "template" && !state.templateId) {
      const templateId = input.value.trim().toLowerCase();
      if (!CAD_LAYOUT_TEMPLATES.some((template) => template.id === templateId))
        return say(
          `«${input.value}» no es una plantilla. Disponibles: ${CAD_LAYOUT_TEMPLATES.map((template) => template.id).join(", ")}.`,
        );
      return layoutStep({ op: "template", templateId });
    }

    if ((state.op === "copy" || state.op === "rename") && !state.sourceId) {
      const spaces = spacesOf(context);
      if (!spaces) return say(NO_SPACES);
      const source = findCadLayout(spaces, input.value);
      if (!source) return say(`No existe la presentación «${input.value}».`);
      return layoutStep({ ...state, sourceId: source.id });
    }

    // La plantilla ya elegida cae en la misma rama que «Nueva»: lo único que
    // cambia es de qué papel parte la hoja.
    return layoutFinish(
      state.op === "template" ? { ...state, op: "new" } : state,
      input.value,
      context,
    );
  },
};

// ---------------------------------------------------------------------------
// MVIEW
// ---------------------------------------------------------------------------

const MVIEW_OPTIONS = [
  { keyword: "ACtivar", shortcut: "AC" },
  { keyword: "DEsactivar", shortcut: "DE" },
  { keyword: "Poligonal", shortcut: "P" },
  { keyword: "Objeto", shortcut: "O" },
  { keyword: "ESCala", shortcut: "ESC" },
  { keyword: "Inutilizar", shortcut: "I" },
] as const;

type MviewOp =
  | { kind: "rect"; corner1?: CadPoint2 }
  | { kind: "polygon"; points: CadPoint2[] }
  | { kind: "object" }
  | { kind: "toggle"; on: boolean }
  | { kind: "scale"; viewportId?: string }
  | { kind: "freeze"; viewportId?: string };

interface MviewState {
  op: MviewOp;
}

function mviewStep(state: MviewState): CadCommandStep<MviewState> {
  const { op } = state;
  if (op.kind === "rect")
    return {
      state,
      prompt: {
        message: op.corner1
          ? "Precise la esquina opuesta de la ventana"
          : "Precise la primera esquina de la ventana, en papel",
        options: op.corner1 ? [] : MVIEW_OPTIONS,
      },
      accepts: op.corner1 ? CAD_ACCEPT_POINT : CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
      ...(op.corner1 ? { preview: [{ points: [op.corner1] }] } : {}),
    };
  if (op.kind === "polygon")
    return {
      state,
      prompt: {
        message:
          op.points.length >= 3
            ? "Precise el vértice siguiente, o pulse Intro para cerrar el contorno"
            : "Precise el vértice del contorno",
        options: [],
      },
      accepts: CAD_ACCEPT_POINT,
      preview: op.points.length > 1 ? [{ points: op.points, closed: false }] : [],
    };
  if (op.kind === "object")
    return {
      state,
      prompt: { message: "Designe la polilínea cerrada o el círculo que hará de contorno", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK,
    };
  if (op.kind === "toggle")
    return {
      state,
      prompt: {
        message: op.on ? "Indique la ventana que quiere activar" : "Indique la ventana que quiere desactivar",
        options: [],
      },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (op.kind === "scale")
    return {
      state,
      prompt: {
        message: op.viewportId
          ? "Indique el denominador de la escala (50 para 1:50)"
          : "Indique la ventana cuya escala quiere fijar",
        options: [],
      },
      accepts: op.viewportId ? CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT : CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: {
      message: op.viewportId
        ? "Indique las capas que quiere inutilizar en esta ventana, separadas por comas"
        : "Indique la ventana en la que quiere inutilizar capas",
      options: [],
    },
    accepts: CAD_ACCEPT_TEXT,
  };
}

/** Busca una ventana por id o por nombre dentro de la presentación activa. */
function findViewport(space: CadPaperSpace, token: string) {
  const needle = token.trim().toLowerCase();
  return (space.viewports ?? []).find(
    (viewport) =>
      viewport.id.toLowerCase() === needle ||
      (viewport.name ?? "").trim().toLowerCase() === needle,
  );
}

const mviewCommand: CadCommandDescriptor<MviewState> = {
  name: "MVIEW",
  aliases: ["MV"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => mviewStep({ op: { kind: "rect" } }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("MVIEW cancelado.");
    const space = activeSpace(context);

    if (input.kind === "keyword") {
      switch (input.keyword) {
        case "Poligonal":
          return mviewStep({ op: { kind: "polygon", points: [] } });
        case "Objeto":
          return mviewStep({ op: { kind: "object" } });
        case "ACtivar":
          return mviewStep({ op: { kind: "toggle", on: true } });
        case "DEsactivar":
          return mviewStep({ op: { kind: "toggle", on: false } });
        case "ESCala":
          return mviewStep({ op: { kind: "scale" } });
        case "Inutilizar":
          return mviewStep({ op: { kind: "freeze" } });
        default:
          return mviewStep(state);
      }
    }

    if (!space) return say("No hay ninguna presentación abierta: crea una con LAYOUT.");

    if (state.op.kind === "rect" && input.kind === "point") {
      if (!state.op.corner1) return mviewStep({ op: { kind: "rect", corner1: input.point } });
      const corner1 = state.op.corner1;
      const viewport = createCadRectangularViewport({
        space,
        id: cadViewportId(space),
        paperBounds: {
          x: Math.min(corner1.x, input.point.x),
          y: Math.min(corner1.y, input.point.y),
          width: Math.abs(input.point.x - corner1.x),
          height: Math.abs(input.point.y - corner1.y),
        },
        modelBounds: modelBounds(context),
      });
      return documentResult(
        [
          upsertCadLayoutCommand({
            ...space,
            viewports: [...(space.viewports ?? []), viewport],
          }),
        ],
        "MVIEW",
      );
    }

    if (state.op.kind === "polygon") {
      if (input.kind === "point")
        return mviewStep({ op: { kind: "polygon", points: [...state.op.points, input.point] } });
      if (input.kind === "enter") {
        const created = createCadPolygonalViewport({
          space,
          id: cadViewportId(space),
          clipEntityId: context.newEntityId(),
          boundary: state.op.points,
          modelBounds: modelBounds(context),
          layer: context.activeLayer,
        });
        return created
          ? documentResult(created.commands, "MVIEW")
          : say("Un contorno poligonal necesita al menos tres vértices.");
      }
      return mviewStep(state);
    }

    if (state.op.kind === "object" && input.kind === "entityPick") {
      const entity = context.entity?.(input.entityId);
      if (!entity) return say("No se pudo leer el objeto designado.");
      const boundary = cadBoundaryFromEntity(entity);
      if (!boundary)
        return say("MVIEW Objeto necesita una polilínea cerrada o un círculo.");
      const created = createCadPolygonalViewport({
        space,
        id: cadViewportId(space),
        clipEntityId: context.newEntityId(),
        boundary,
        modelBounds: modelBounds(context),
        layer: entity.layer,
      });
      return created
        ? documentResult(created.commands, "MVIEW")
        : say("El objeto designado no define un contorno válido.");
    }

    if (input.kind !== "text" && input.kind !== "distance") return mviewStep(state);
    const token = input.kind === "text" ? input.value : String(input.value);

    if (state.op.kind === "toggle") {
      const viewport = findViewport(space, token);
      if (!viewport) return say(`No existe la ventana «${token}» en esta presentación.`);
      return documentResult(
        [upsertCadLayoutCommand(setCadViewportOn(space, viewport.id, state.op.on))],
        "MVIEW",
      );
    }

    if (state.op.kind === "scale") {
      if (!state.op.viewportId) {
        const viewport = findViewport(space, token);
        if (!viewport) return say(`No existe la ventana «${token}» en esta presentación.`);
        return mviewStep({ op: { kind: "scale", viewportId: viewport.id } });
      }
      const denominator = Number(token.replace(/^1\s*:\s*/, ""));
      if (!Number.isFinite(denominator) || denominator <= 0)
        return say(`«${token}» no es una escala válida. Escribe 50 o 1:50.`);
      // Fijar la escala BLOQUEA la ventana: si no, el siguiente zoom dentro de
      // ella la desharía y el plano saldría a una escala que nadie pidió.
      const rescaled = setCadViewportScale(space, state.op.viewportId, {
        denominator,
        lock: true,
      });
      // Y el reescalado anotativo va en el MISMO lote. Es el punto entero de la
      // anotatividad: cambiar la escala de la ventana sin reescalar los rótulos
      // deja el plano con dos tamaños de letra, y hacerlo en otro lote lo
      // convertiría en dos pasos de deshacer que se pueden separar.
      const annotative = cadAnnotativeRescaleCommands(
        { entities: entitiesOf(context), unit: context.unit },
        rescaled,
      );
      return documentResult(
        [upsertCadLayoutCommand(rescaled), ...annotative.commands],
        "MVIEW",
      );
    }

    // Sólo queda Inutilizar. Un texto en cualquier otro estado —una ventana
    // rectangular a medias, por ejemplo— no significa nada y se ignora.
    if (state.op.kind !== "freeze") return mviewStep(state);

    if (!state.op.viewportId) {
      const viewport = findViewport(space, token);
      if (!viewport) return say(`No existe la ventana «${token}» en esta presentación.`);
      return mviewStep({ op: { kind: "freeze", viewportId: viewport.id } });
    }
    const layerIds = token
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (layerIds.length === 0) return say("MVIEW Inutilizar: no se indicó ninguna capa.");
    return documentResult(
      [
        upsertCadLayoutCommand(
          freezeCadLayerInViewport(space, state.op.viewportId, layerIds, true),
        ),
      ],
      "MVIEW",
    );
  },
};

// ---------------------------------------------------------------------------
// MSPACE / PSPACE
// ---------------------------------------------------------------------------

function spaceCommand(name: string, space: "model" | "paper"): CadCommandDescriptor<never> {
  return {
    name,
    aliases: space === "model" ? ["MS"] : ["PS"],
    kind: "view",
    transparent: false,
    selection: "none",
    repeatable: false,
    mutates: false,
    cursor: "none",
    begin: (context) => {
      const active = activeSpace(context);
      // MSPACE entra al modelo DENTRO de la presentación activa; sin ninguna,
      // no hay nada en lo que entrar y se dice en vez de cambiar a un espacio
      // que el usuario no está viendo.
      if (!active && space === "model")
        return say("MSPACE necesita una presentación abierta.");
      return hostStep(
        { kind: "space", space, ...(active ? { layoutId: active.id } : {}) },
        name,
      );
    },
    step: () => say(`${name} terminado.`),
  };
}

export const CAD_LAYOUT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(layoutCommand),
  asCadCommand(mviewCommand),
  asCadCommand(spaceCommand("MSPACE", "model")),
  asCadCommand(spaceCommand("PSPACE", "paper")),
];
