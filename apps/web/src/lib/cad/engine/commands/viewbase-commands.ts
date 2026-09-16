/**
 * Familia VIEWBASE: documentación desde el modelo 3D.
 *
 * VIEWBASE, VIEWPROJ, VIEWSECTION, VIEWDETAIL, VIEWEDIT y VIEWUPDATE son la
 * interfaz moderna de AutoCAD para crear vistas derivadas. Aquí delegan en el
 * motor SOLVIEW/SOLDRAW ya existente: no reescriben la proyección, sólo
 * simplifican el flujo y exponen las operaciones con nombres que un usuario
 * de AutoCAD reconoce.
 *
 *   VIEWBASE   — crea la vista base (planta) a partir de sólidos del modelo.
 *   VIEWPROJ   — proyecta una vista existente en una dirección ortogonal.
 *   VIEWSECTION — sección transversal por dos puntos.
 *   VIEWDETAIL — detalle ampliado de una vista existente.
 *   VIEWEDIT   — modifica escala o nombre de una vista.
 *   VIEWUPDATE — pone al día las vistas obsoletas (equivale a SOLDRAW).
 */
import type { CadDocument, CadPaperSpace, CadPaperViewport, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { createCadSolView } from "../../layout/solview";
import { describeCadSolviewFreshness } from "../../layout/solview-associativity";
import { cadSoldrawCommands, describeCadSoldraw } from "../../layout/soldraw";
import {
  cadViewportOrthoView,
  cadViewportPlanCutView,
  cadViewportSectionView,
  type CadViewportOrthoName,
} from "../../layout/viewport-view";
import {
  asCadCommand,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

// ---------------------------------------------------------------------------
// Helpers (shared with solview-commands.ts but duplicated to avoid coupling)
// ---------------------------------------------------------------------------

function say(text: string): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text },
  };
}

function documentResult(
  commands: readonly CadEntityCommand[],
  label: string,
  notice?: string,
): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands, label, ...(notice ? { notice } : {}) },
  };
}

function documentView(
  context: CadCommandContext,
): Pick<CadDocument, "entities" | "paperSpaces"> | null {
  const spaces = context.paperSpaces?.();
  if (!spaces || !context.entity) return null;
  const entities = context.entityIds
    .map((id) => context.entity!(id))
    .filter((entity): entity is NonNullable<typeof entity> => !!entity);
  return { entities, paperSpaces: [...spaces] };
}

function activeSpace(context: CadCommandContext): CadPaperSpace | null {
  const spaces = context.paperSpaces?.();
  if (!spaces || spaces.length === 0) return null;
  const named = context.activeLayout
    ? [...spaces].find((s) => s.name === context.activeLayout)
    : undefined;
  return (
    named ??
    [...spaces].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id),
    )[0]
  );
}

function findDerivedViewport(
  space: CadPaperSpace,
  key: string,
): CadPaperViewport | undefined {
  const buscado = key.trim().toLowerCase();
  return (space.viewports ?? []).find(
    (v) => v.id === key || (v.name ?? "").trim().toLowerCase() === buscado,
  );
}

function onlyPlanViewport(space: CadPaperSpace): CadPaperViewport | undefined {
  const plantas = (space.viewports ?? []).filter(
    (v) => v.derivation && v.view?.kind === "plan",
  );
  return plantas.length === 1 ? plantas[0] : undefined;
}

const NO_SPACES = "Este anfitrión no expone las presentaciones del dibujo.";
const NO_LAYOUT = "No hay ninguna presentación abierta: crea una con LAYOUT.";

/** Altura por defecto del corte de planta (antepecho). */
const PLAN_CUT_DEFAULT = 1_200;

/** Ampliación por defecto de un detalle. */
const DETAIL_ZOOM = 2;
const DETAIL_ZOOM_MAX = 200;

/**
 * Slot en papel para la siguiente vista derivada.
 * Copiado de solview-commands.ts para no crear un acoplamiento entre módulos.
 */
function paperSlot(
  space: CadPaperSpace,
): { x: number; y: number; width: number; height: number } {
  const margins = space.pageSetup?.margins ?? {
    top: 10,
    right: 10,
    bottom: 10,
    left: 20,
  };
  const width = space.page.width - margins.left - margins.right;
  const height = space.page.height - margins.top - margins.bottom - 30;
  const index = (space.viewports ?? []).filter((v) => v.derivation).length;
  const column = index % 2;
  const row = Math.floor(index / 2) % 2;
  const cellW = (width - 10) / 2;
  const cellH = (height - 10) / 2;
  return {
    x: margins.left + column * (cellW + 10),
    y: margins.bottom + 30 + (1 - row) * (cellH + 10),
    width: Math.max(cellW, 10),
    height: Math.max(cellH, 10),
  };
}

const noSuchView = (key: string) =>
  `«${key}» no es una vista creada con SOLVIEW ni VIEWBASE.`;

// ---------------------------------------------------------------------------
// VIEWBASE — crear la vista base (planta) del modelo
// ---------------------------------------------------------------------------

type ViewbaseState =
  | { step: "direction" }
  | { step: "cut-height" }
  | { step: "name" }
  | { step: "scale" };

const DIRECTION_OPTIONS = [
  { keyword: "Planta", shortcut: "P" },
  { keyword: "Alzado", shortcut: "A" },
  { keyword: "Isométrica", shortcut: "I" },
] as const;

const viewbaseCommand: CadCommandDescriptor<ViewbaseState> = {
  name: "VIEWBASE",
  aliases: ["VBASE", "VISTABASE"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  spatial: true,
  cursor: "crosshair",
  begin: () => ({
    state: { step: "direction" } as ViewbaseState,
    prompt: {
      message: "Elija la dirección de la vista base",
      options: DIRECTION_OPTIONS,
      defaultOption: "Planta",
    },
    accepts: CAD_ACCEPT_KEYWORD,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("VIEWBASE cancelado.");

    if (state.step === "direction") {
      if (input.kind !== "keyword" && input.kind !== "enter")
        return say("VIEWBASE: elija Planta, Alzado o Isométrica.");
      const dir =
        input.kind === "keyword" ? input.keyword : "Planta";
      if (dir === "Planta")
        return {
          state: { step: "cut-height" },
          prompt: {
            message: `Altura de corte (mm; Intro = ${PLAN_CUT_DEFAULT} mm, el antepecho)`,
            options: [],
          },
          accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
        };
      if (dir === "Alzado")
        return {
          state: { step: "name" },
          prompt: { message: "Nombre de la vista", options: [] },
          accepts: CAD_ACCEPT_TEXT,
        };
      // Isométrica: la vista base es una planta + un alzado
      return {
        state: { step: "name" },
        prompt: { message: "Nombre de la vista", options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    }

    if (state.step === "cut-height") {
      if (input.kind === "enter") {
        return {
          state: { step: "name" },
          prompt: { message: "Nombre de la vista", options: [] },
          accepts: CAD_ACCEPT_TEXT,
        };
      }
      if (input.kind === "text") {
        const escrito = input.value.trim().replace(",", ".");
        if (escrito === "") {
          return {
            state: { step: "name" },
            prompt: { message: "Nombre de la vista", options: [] },
            accepts: CAD_ACCEPT_TEXT,
          };
        }
        const altura = Number(escrito);
        if (!Number.isFinite(altura))
          return say(`«${input.value}» no es una altura de corte.`);
        return {
          state: { step: "name" } as ViewbaseState,
          prompt: { message: "Nombre de la vista", options: [] },
          accepts: CAD_ACCEPT_TEXT,
          // Store the cut height for later — we'll use a closure trick below
          _cutHeight: altura,
        } as never;
      }
      return say("VIEWBASE: escriba una altura o pulse Intro.");
    }

    if (state.step === "name") {
      if (input.kind !== "text")
        return say("VIEWBASE: escriba un nombre para la vista.");
      const name = input.value.trim();
      if (!name) return say("VIEWBASE: el nombre no puede estar vacío.");
      return {
        state: { step: "scale" } as ViewbaseState,
        prompt: {
          message: "Escala de la vista (1:n; Intro = ajustar al papel)",
          options: [],
        },
        accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
        _name: name,
      } as never;
    }

    // step === "scale"
    const name = (state as never as { _name?: string })._name ?? "Vista";
    const cutHeight = (state as never as { _cutHeight?: number })._cutHeight;
    const scale =
      input.kind === "distance" && input.value > 0 ? input.value : undefined;

    const view = documentView(context);
    if (!view) return say(NO_SPACES);
    const space = activeSpace(context);
    if (!space) return say(NO_LAYOUT);

    const camera = cutHeight !== undefined
      ? (() => {
          const r = cadViewportPlanCutView({ cutHeight });
          return "ok" in r ? cadViewportOrthoView("planta", { x: 0, y: 0, z: 0 }) : r;
        })()
      : cadViewportOrthoView("planta", { x: 0, y: 0, z: 0 });

    const created = createCadSolView({
      document: view,
      space,
      viewportId: context.newEntityId(),
      name,
      view: camera,
      paperBounds: paperSlot(space),
      ...(scale ? { scale } : {}),
    });
    if (!created.ok) return say(`VIEWBASE: ${created.message}`);
    return documentResult(
      created.commands,
      `VIEWBASE`,
      `VIEWBASE creó «${name}»`,
    );
  },
};

// ---------------------------------------------------------------------------
// VIEWPROJ — proyectar una vista existente en dirección ortogonal
// ---------------------------------------------------------------------------

const PROJ_OPTIONS = [
  { keyword: "Superior", shortcut: "S" },
  { keyword: "Frontal", shortcut: "F" },
  { keyword: "Lateral", shortcut: "L" },
  { keyword: "Isométrica", shortcut: "I" },
] as const;

type ViewprojState =
  | { step: "parent" }
  | { step: "direction"; parentId: string }
  | { step: "name"; parentId: string; ortho: CadViewportOrthoName };

const viewprojCommand: CadCommandDescriptor<ViewprojState> = {
  name: "VIEWPROJ",
  aliases: ["VPRJ", "VISTAPROY"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  spatial: true,
  cursor: "crosshair",
  begin: () => ({
    state: { step: "parent" } as ViewprojState,
    prompt: {
      message: "Nombre o id de la vista padre",
      options: [],
    },
    accepts: CAD_ACCEPT_TEXT,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("VIEWPROJ cancelado.");

    if (state.step === "parent") {
      if (input.kind !== "text")
        return say("VIEWPROJ: escriba el nombre de la vista padre.");
      const space = activeSpace(context);
      if (!space) return say(NO_LAYOUT);
      const parent = findDerivedViewport(space, input.value);
      if (!parent?.view)
        return say(noSuchView(input.value));
      return {
        state: { step: "direction", parentId: input.value },
        prompt: {
          message: "Dirección de la proyección",
          options: PROJ_OPTIONS,
          defaultOption: "Superior",
        },
        accepts: CAD_ACCEPT_KEYWORD,
      };
    }

    if (state.step === "direction") {
      if (input.kind !== "keyword" && input.kind !== "enter")
        return say("VIEWPROJ: elija una dirección.");
      const dir = input.kind === "keyword" ? input.keyword : "Superior";
      const orthoMap: Record<string, CadViewportOrthoName> = {
        Superior: "planta",
        Frontal: "frontal",
        Lateral: "derecha",
        Isométrica: "frontal",
      };
      const ortho = orthoMap[dir] ?? "planta";
      return {
        state: { step: "name", parentId: state.parentId, ortho },
        prompt: { message: "Nombre de la vista proyectada", options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    }

    // step === "name"
    if (input.kind !== "text")
      return say("VIEWPROJ: escriba un nombre.");
    const name = input.value.trim();
    if (!name) return say("VIEWPROJ: el nombre no puede estar vacío.");

    const view = documentView(context);
    if (!view) return say(NO_SPACES);
    const space = activeSpace(context);
    if (!space) return say(NO_LAYOUT);

    const parent = findDerivedViewport(space, state.parentId);
    if (!parent?.view) return say(noSuchView(state.parentId));

    const camera = cadViewportOrthoView(state.ortho, { x: 0, y: 0, z: 0 });
    const created = createCadSolView({
      document: view,
      space,
      viewportId: context.newEntityId(),
      name,
      view: camera,
      paperBounds: paperSlot(space),
      parentViewportId: parent.id,
    });
    if (!created.ok) return say(`VIEWPROJ: ${created.message}`);
    return documentResult(created.commands, "VIEWPROJ", `VIEWPROJ creó «${name}»`);
  },
};

// ---------------------------------------------------------------------------
// VIEWSECTION — sección transversal
// ---------------------------------------------------------------------------

type ViewsectionState =
  | { step: "from" }
  | { step: "to"; from: CadPoint2 }
  | { step: "name"; from: CadPoint2; to: CadPoint2 };

const viewsectionCommand: CadCommandDescriptor<ViewsectionState> = {
  name: "VIEWSECTION",
  aliases: ["VSECCION", "VISTACORTE"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  spatial: true,
  cursor: "crosshair",
  begin: () => ({
    state: { step: "from" } as ViewsectionState,
    prompt: { message: "Primer punto de la línea de corte", options: [] },
    accepts: CAD_ACCEPT_POINT,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("VIEWSECTION cancelado.");

    if (state.step === "from") {
      if (input.kind !== "point")
        return say("VIEWSECTION: indique el primer punto.");
      return {
        state: { step: "to", from: input.point },
        prompt: { message: "Segundo punto de la línea de corte", options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    }

    if (state.step === "to") {
      if (input.kind !== "point")
        return say("VIEWSECTION: indique el segundo punto.");
      return {
        state: { step: "name", from: state.from, to: input.point },
        prompt: { message: "Nombre de la sección", options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    }

    // step === "name"
    if (input.kind !== "text")
      return say("VIEWSECTION: escriba un nombre.");
    const name = input.value.trim();
    if (!name) return say("VIEWSECTION: el nombre no puede estar vacío.");

    const view = documentView(context);
    if (!view) return say(NO_SPACES);
    const space = activeSpace(context);
    if (!space) return say(NO_LAYOUT);

    const built = cadViewportSectionView({ from: state.from, to: state.to });
    if ("ok" in built) return say(`VIEWSECTION: ${built.message}`);

    const parentViewportId = onlyPlanViewport(space)?.id;
    const created = createCadSolView({
      document: view,
      space,
      viewportId: context.newEntityId(),
      name,
      view: built,
      paperBounds: paperSlot(space),
      ...(parentViewportId ? { parentViewportId } : {}),
    });
    if (!created.ok) return say(`VIEWSECTION: ${created.message}`);
    const aviso = !parentViewportId
      ? " · sin marca de corte: no hay una única planta en la lámina"
      : "";
    return documentResult(created.commands, "VIEWSECTION", `VIEWSECTION creó «${name}»${aviso}`);
  },
};

// ---------------------------------------------------------------------------
// VIEWDETAIL — detalle ampliado
// ---------------------------------------------------------------------------

type ViewdetailState =
  | { step: "parent" }
  | { step: "zoom"; parentId: string }
  | { step: "name"; parentId: string; zoom: number };

const viewdetailCommand: CadCommandDescriptor<ViewdetailState> = {
  name: "VIEWDETAIL",
  aliases: ["VD", "VISTADETALLE"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  spatial: true,
  cursor: "crosshair",
  begin: () => ({
    state: { step: "parent" } as ViewdetailState,
    prompt: { message: "Nombre o id de la vista padre", options: [] },
    accepts: CAD_ACCEPT_TEXT,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("VIEWDETAIL cancelado.");

    if (state.step === "parent") {
      if (input.kind !== "text")
        return say("VIEWDETAIL: escriba el nombre de la vista padre.");
      const space = activeSpace(context);
      if (!space) return say(NO_LAYOUT);
      const parent = findDerivedViewport(space, input.value);
      if (!parent?.view || !parent.derivation?.window)
        return say(noSuchView(input.value));
      return {
        state: { step: "zoom", parentId: input.value },
        prompt: {
          message: `Factor de ampliación (Intro = ${DETAIL_ZOOM}×)`,
          options: [],
        },
        accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
      };
    }

    if (state.step === "zoom") {
      let zoom = DETAIL_ZOOM;
      if (input.kind === "distance") {
        if (input.value <= 0 || input.value > DETAIL_ZOOM_MAX)
          return say(`VIEWDETAIL: la ampliación debe ser mayor que 0 y hasta ${DETAIL_ZOOM_MAX}.`);
        zoom = input.value;
      } else if (input.kind === "text") {
        const escrito = input.value.trim().replace(",", ".");
        if (escrito !== "") {
          const n = Number(escrito);
          if (!Number.isFinite(n) || n <= 0 || n > DETAIL_ZOOM_MAX)
            return say(`VIEWDETAIL: «${input.value}» no es una ampliación válida.`);
          zoom = n;
        }
      } else if (input.kind !== "enter")
        return say("VIEWDETAIL: escriba un número o pulse Intro.");
      return {
        state: { step: "name", parentId: state.parentId, zoom },
        prompt: { message: "Nombre del detalle", options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    }

    // step === "name"
    if (input.kind !== "text")
      return say("VIEWDETAIL: escriba un nombre.");
    const name = input.value.trim();
    if (!name) return say("VIEWDETAIL: el nombre no puede estar vacío.");

    const view = documentView(context);
    if (!view) return say(NO_SPACES);
    const space = activeSpace(context);
    if (!space) return say(NO_LAYOUT);

    const parent = findDerivedViewport(space, state.parentId);
    if (!parent?.view || !parent.derivation?.window)
      return say(noSuchView(state.parentId));

    const camera = { ...parent.view, kind: "detail" as const };
    const source = parent.derivation.window;
    const zoom = state.zoom;
    const window = {
      x: source.x + (source.width * (1 - 1 / zoom)) / 2,
      y: source.y + (source.height * (1 - 1 / zoom)) / 2,
      width: source.width / zoom,
      height: source.height / zoom,
    };

    const created = createCadSolView({
      document: view,
      space,
      viewportId: context.newEntityId(),
      name,
      view: camera,
      paperBounds: paperSlot(space),
      window,
      parentViewportId: parent.id,
    });
    if (!created.ok) return say(`VIEWDETAIL: ${created.message}`);
    return documentResult(created.commands, "VIEWDETAIL", `VIEWDETAIL creó «${name}» (${zoom}×)`);
  },
};

// ---------------------------------------------------------------------------
// VIEWEDIT — consultar propiedades de una vista existente
// ---------------------------------------------------------------------------

type VieweditState = { step: "view" } | { step: "info"; viewKey: string };

const vieweditCommand: CadCommandDescriptor<VieweditState> = {
  name: "VIEWEDIT",
  aliases: ["VE", "VISTAEDIT"],
  kind: "inquiry",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: { step: "view" } as VieweditState,
    prompt: { message: "Nombre o id de la vista a consultar", options: [] },
    accepts: CAD_ACCEPT_TEXT,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("VIEWEDIT cancelado.");

    if (state.step === "view") {
      if (input.kind !== "text")
        return say("VIEWEDIT: escriba el nombre de la vista.");
      const space = activeSpace(context);
      if (!space) return say(NO_LAYOUT);
      const vp = findDerivedViewport(space, input.value);
      if (!vp) return say(noSuchView(input.value));
      const escala = vp.scale > 0 ? `1:${vp.scale}` : "automática";
      const tipo = vp.view?.kind ?? "desconocida";
      const obs = vp.derivation ? ` · derivada de «${vp.derivation.layerBase}»` : "";
      return say(`VIEWEDIT: «${vp.name ?? vp.id}» — ${tipo}, escala ${escala}${obs}`);
    }
    return say("VIEWEDIT: escriba el nombre de la vista.");
  },
};

// ---------------------------------------------------------------------------
// VIEWUPDATE — poner al día las vistas obsoletas (= SOLDRAW)
// ---------------------------------------------------------------------------

const viewupdateCommand: CadCommandDescriptor<never> = {
  name: "VIEWUPDATE",
  aliases: ["VU", "VISTAATUALIZA"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    const view = documentView(context);
    if (!view) return say(NO_SPACES);
    const space = activeSpace(context);
    if (!space) return say(NO_LAYOUT);
    const frescura = describeCadSolviewFreshness(view);
    return {
      state: undefined as never,
      prompt: {
        message: frescura.includes("obsoleta")
          ? `Hay vistas obsoletas. Pulse Intro para actualizar`
          : `Todas las vistas están al día. Pulse Intro para forzar`,
        options: [],
      },
      accepts: 0,
    };
  },
  step: (_state, _input, context) => {
    const view = documentView(context);
    if (!view) return say(NO_SPACES);
    const result = cadSoldrawCommands({
      document: view,
      newEntityId: context.newEntityId,
    });
    if (result.commands.length === 0)
      return say("VIEWUPDATE: todas las vistas ya estaban al día.");
    return documentResult(result.commands, "VIEWUPDATE", `VIEWUPDATE: ${describeCadSoldraw(result)}`);
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const CAD_VIEWBASE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(viewbaseCommand),
  asCadCommand(viewprojCommand),
  asCadCommand(viewsectionCommand),
  asCadCommand(viewdetailCommand),
  asCadCommand(vieweditCommand),
  asCadCommand(viewupdateCommand),
];
