/**
 * SOLVIEW y SOLDRAW: las dos órdenes que convierten un modelo en láminas.
 *
 * SOLVIEW abre la ventana de una vista derivada —planta, alzado, corte o
 * detalle— con sus cuatro capas; SOLDRAW dibuja dentro. Están separadas porque
 * componer la lámina se hace una vez y redibujarla pasa cada vez que el modelo
 * cambia, que es exactamente la misma razón por la que el original las separó.
 *
 * ## Por qué leen el documento por la misma rendija que LAYOUT y MVIEW
 *
 * `context.paperSpaces?.()` y `context.entity?.()`, opcionales, como
 * `blocks?.()`. Un anfitrión que no los aporte recibe una negativa explícita en
 * vez de una lámina inventada. La alternativa —ensanchar el contexto de TODOS
 * los comandos— obligaría a cada spec de cada orden a montar hojas que no usa.
 *
 * ## Qué NO hacen
 *
 * SOLDRAW no acota. `<base>-DIM` se crea vacía y nadie la toca: las cotas son
 * del usuario, y una orden que las regenerase las borraría cada vez que se
 * mueve un muro. Y SOLVIEW no dibuja: una ventana recién creada se declara sin
 * dibujar, que es distinto de estar al día y se ve en el aviso.
 */
import type { CadDocument, CadPaperSpace, CadPaperViewport, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { findCadLayout } from "../../layout/layout-operations";
import {
  cadSoldrawCommands,
  describeCadSoldraw,
} from "../../layout/soldraw";
import { createCadSolView } from "../../layout/solview";
import { describeCadSolviewFreshness } from "../../layout/solview-associativity";
import {
  cadViewportOrthoView,
  cadViewportSectionView,
  type CadViewportOrthoName,
} from "../../layout/viewport-view";
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

function documentResult(
  commands: readonly CadEntityCommand[],
  label: string,
  notice?: string,
): CadCommandStep<never> {
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    // `label` va al historial de deshacer y NO se imprime. Sin `notice`, una
    // orden que escribe es MUDA: mismo defecto que cerró FLATSHOT en esta ola.
    result: { kind: "document", commands, label, ...(notice ? { notice } : {}) },
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

/** Vista mínima del documento que estas dos órdenes necesitan. */
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

/** Presentación sobre la que operan. Mismo criterio que LAYOUT y MVIEW. */
function activeSpace(context: CadCommandContext): CadPaperSpace | null {
  const spaces = context.paperSpaces?.();
  if (!spaces || spaces.length === 0) return null;
  const named = context.activeLayout ? findCadLayout(spaces, context.activeLayout) : undefined;
  return (
    named ??
    [...spaces].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))[0]
  );
}

const NO_SPACES = "Este anfitrión no expone las presentaciones del dibujo.";
const NO_LAYOUT = "No hay ninguna presentación abierta: crea una con LAYOUT.";

// ---------------------------------------------------------------------------
// SOLVIEW
// ---------------------------------------------------------------------------

const SOLVIEW_OPTIONS = [
  { keyword: "PLanta", shortcut: "PL" },
  { keyword: "ALzado", shortcut: "AL" },
  { keyword: "COrte", shortcut: "CO" },
  { keyword: "DEtalle", shortcut: "DE" },
] as const;

const ALZADO_OPTIONS = [
  { keyword: "Frontal", shortcut: "F" },
  { keyword: "Posterior", shortcut: "P" },
  { keyword: "Izquierda", shortcut: "I" },
  { keyword: "Derecha", shortcut: "D" },
] as const;

/**
 * Cuánto se acerca un DEtalle cuando no se pide otra cosa.
 *
 * Era un ×2 FIJO y sin forma de cambiarlo —defecto (d) del informe de
 * distancia—: un detalle constructivo se dibuja a 1:5 o a 1:10 sobre una planta
 * a 1:100, o sea ×10 y ×20, y con ×2 el «detalle» era la misma planta un poco
 * más grande. Ahora se pregunta, y esto es sólo la respuesta por defecto.
 */
const DETAIL_ZOOM = 2;

/** Ampliación máxima admitida. Más allá, la ventana es un punto. */
const DETAIL_ZOOM_MAX = 200;

type SolviewOp =
  | { kind: "menu" }
  | { kind: "plan"; name?: string }
  | { kind: "elevation"; ortho?: CadViewportOrthoName; name?: string }
  | { kind: "section"; from?: CadPoint2; to?: CadPoint2; name?: string }
  | { kind: "detail"; parentId?: string; zoom?: number; name?: string };

interface SolviewState {
  op: SolviewOp;
}

function solviewStep(state: SolviewState): CadCommandStep<SolviewState> {
  const { op } = state;
  if (op.kind === "menu")
    return {
      state,
      prompt: {
        message: "Qué vista quiere derivar del modelo",
        options: SOLVIEW_OPTIONS,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (op.kind === "elevation" && !op.ortho)
    return {
      state,
      prompt: { message: "Desde qué lado se mira el alzado", options: ALZADO_OPTIONS },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (op.kind === "section" && !op.to)
    return {
      state,
      prompt: {
        message: op.from
          ? "Precise el segundo punto de la línea de corte"
          : "Precise el primer punto de la línea de corte, en planta",
        options: [],
      },
      accepts: CAD_ACCEPT_POINT,
      ...(op.from ? { preview: [{ points: [op.from] }] } : {}),
    };
  if (op.kind === "detail" && !op.parentId)
    return {
      state,
      prompt: { message: "Indique la vista de la que se amplía el detalle", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (op.kind === "detail" && op.zoom === undefined)
    return {
      state,
      prompt: {
        message: `Cuántas veces se amplía respecto de esa vista <${DETAIL_ZOOM}>`,
        options: [],
      },
      accepts: CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: {
      message: "Nombre de la vista (dará nombre a sus capas -VIS, -HID, -HAT y -DIM)",
      options: [],
    },
    accepts: CAD_ACCEPT_TEXT,
  };
}

/**
 * Dónde se coloca la ventana sobre el papel.
 *
 * En rejilla de dos columnas dentro de la zona imprimible, por orden de
 * creación. Colocarlas apiladas en la misma esquina obligaría a mover las
 * cuatro a mano nada más crearlas, que es peor que una rejilla discutible.
 */
function paperSlot(space: CadPaperSpace): { x: number; y: number; width: number; height: number } {
  const margins = space.pageSetup?.margins ?? { top: 10, right: 10, bottom: 10, left: 20 };
  const width = space.page.width - margins.left - margins.right;
  // La franja del cajetín se reserva abajo: una ventana encima del cajetín es
  // una ventana que el trazado tapa.
  const height = space.page.height - margins.top - margins.bottom - 30;
  const index = (space.viewports ?? []).filter((viewport) => viewport.derivation).length;
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

function finishSolview(
  context: CadCommandContext,
  op: SolviewOp,
  name: string,
): CadCommandStep<never> {
  const view = documentView(context);
  if (!view) return say(NO_SPACES);
  const space = activeSpace(context);
  if (!space) return say(NO_LAYOUT);
  if (!name.trim()) return say("SOLVIEW necesita un nombre para la vista.");

  let camera;
  let window;
  let parentViewportId: string | undefined;
  if (op.kind === "plan") camera = cadViewportOrthoView("planta", { x: 0, y: 0, z: 0 });
  else if (op.kind === "elevation")
    camera = cadViewportOrthoView(op.ortho ?? "frontal", { x: 0, y: 0, z: 0 });
  else if (op.kind === "section") {
    if (!op.from || !op.to) return say("SOLVIEW Corte necesita los dos puntos de la línea.");
    const built = cadViewportSectionView({ from: op.from, to: op.to });
    if ("ok" in built) return say(built.message);
    camera = built;
    // La MARCA de corte va sobre la planta, que es donde dice algo: es la única
    // información que un corte no puede llevar dentro de sí mismo. Se ata aquí
    // a la planta de la lámina; si no hay ninguna, o hay varias y no se sabe
    // cuál, el corte se crea igual y el aviso lo dice — un corte sin marca es
    // incompleto, pero un corte que no se crea es peor.
    parentViewportId = onlyPlanViewport(space)?.id;
  } else if (op.kind === "detail") {
    const parent = findDerivedViewport(space, op.parentId ?? "");
    if (!parent?.view || !parent.derivation?.window)
      return say(noSuchView(op.parentId ?? ""));
    // Un detalle NO es otra proyección: es la misma cámara mirando más de cerca.
    camera = { ...parent.view, kind: "detail" as const };
    const zoom = op.zoom ?? DETAIL_ZOOM;
    const source = parent.derivation.window;
    window = {
      x: source.x + (source.width * (1 - 1 / zoom)) / 2,
      y: source.y + (source.height * (1 - 1 / zoom)) / 2,
      width: source.width / zoom,
      height: source.height / zoom,
    };
    parentViewportId = parent.id;
  } else {
    // `menu` no llega aquí: no hay forma de teclear un nombre sin haber elegido
    // antes qué vista se quiere. Se dice en vez de construir una vista al azar.
    return say("SOLVIEW: elige primero PLanta, ALzado, COrte o DEtalle.");
  }

  const created = createCadSolView({
    document: view,
    space,
    viewportId: context.newEntityId(),
    name,
    view: camera,
    paperBounds: paperSlot(space),
    ...(window ? { window } : {}),
    ...(parentViewportId ? { parentViewportId } : {}),
  });
  if (!created.ok) return say(`SOLVIEW: ${created.message}`);
  const aviso =
    op.kind === "section" && !parentViewportId
      ? " · sin marca de corte: esta lámina no tiene una única PLANTA sobre la que ponerla"
      : "";
  const dicho = `SOLVIEW creó «${name}»${aviso}`;
  return documentResult(created.commands, dicho, dicho);
}

/**
 * La ÚNICA planta derivada de la lámina, o nada.
 *
 * Con dos plantas no se elige la primera: no se sabe cuál se está cortando, y
 * poner la marca en la que no es manda a leer el corte por donde no pasa. Se
 * devuelve nada, y quien pregunta lo dice.
 */
/** Una vista derivada por su id o por su nombre, sin distinguir mayúsculas. */
function findDerivedViewport(space: CadPaperSpace, key: string): CadPaperViewport | undefined {
  const buscado = key.trim().toLowerCase();
  return (space.viewports ?? []).find(
    (viewport) =>
      viewport.id === key || (viewport.name ?? "").trim().toLowerCase() === buscado,
  );
}

const noSuchView = (key: string) => `«${key}» no es una vista creada con SOLVIEW.`;

function onlyPlanViewport(space: CadPaperSpace): CadPaperViewport | undefined {
  const plantas = (space.viewports ?? []).filter(
    (viewport) => viewport.derivation && viewport.view?.kind === "plan",
  );
  return plantas.length === 1 ? plantas[0] : undefined;
}

const solviewCommand: CadCommandDescriptor<SolviewState> = {
  name: "SOLVIEW",
  aliases: ["SOLV", "VISTASOL"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  // Sabe componer vistas fuera del plano XY: es justamente lo que estrena.
  spatial: true,
  cursor: "crosshair",
  begin: () => solviewStep({ op: { kind: "menu" } }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("SOLVIEW cancelado.");

    if (input.kind === "keyword") {
      switch (input.keyword) {
        case "PLanta":
          return solviewStep({ op: { kind: "plan" } });
        case "ALzado":
          return solviewStep({ op: { kind: "elevation" } });
        case "COrte":
          return solviewStep({ op: { kind: "section" } });
        case "DEtalle":
          return solviewStep({ op: { kind: "detail" } });
        case "Frontal":
          return solviewStep({ op: { kind: "elevation", ortho: "frontal" } });
        case "Posterior":
          return solviewStep({ op: { kind: "elevation", ortho: "posterior" } });
        case "Izquierda":
          return solviewStep({ op: { kind: "elevation", ortho: "izquierda" } });
        case "Derecha":
          return solviewStep({ op: { kind: "elevation", ortho: "derecha" } });
        default:
          return solviewStep(state);
      }
    }

    if (state.op.kind === "section" && input.kind === "point") {
      if (!state.op.from)
        return solviewStep({ op: { kind: "section", from: input.point } });
      return solviewStep({ op: { kind: "section", from: state.op.from, to: input.point } });
    }

    // Intro sobre la ampliación acepta el valor por defecto, como cualquier
    // orden con un valor entre paréntesis angulares. Llega como `enter`, no
    // como texto vacío, así que se atiende antes del filtro de texto.
    if (input.kind === "enter" && state.op.kind === "detail" && state.op.parentId && state.op.zoom === undefined)
      return solviewStep({ op: { ...state.op, zoom: DETAIL_ZOOM } });

    if (input.kind !== "text") return solviewStep(state);
    if (state.op.kind === "detail" && !state.op.parentId) {
      // El padre se comprueba AQUÍ y no al final: preguntar «cuántas veces se
      // amplía» sobre una vista que no existe es hacer teclear un número para
      // tirarlo. El error llega en la pregunta que lo causó.
      const space = activeSpace(context);
      if (!space) return say(NO_LAYOUT);
      const parent = findDerivedViewport(space, input.value);
      if (!parent?.view || !parent.derivation?.window) return say(noSuchView(input.value));
      return solviewStep({ op: { kind: "detail", parentId: input.value } });
    }
    if (state.op.kind === "detail" && state.op.zoom === undefined) {
      // Intro acepta el valor por defecto, como en cualquier orden con un
      // valor entre paréntesis angulares.
      const escrito = input.value.trim().replace(",", ".");
      if (escrito === "")
        return solviewStep({ op: { ...state.op, zoom: DETAIL_ZOOM } });
      const zoom = Number(escrito);
      // Fallo cerrado: una ampliación que no es un número no se redondea a
      // ninguna parte. Se dice y se vuelve a preguntar, porque una ventana de
      // detalle con la ampliación equivocada es un plano a escala equivocada.
      if (!Number.isFinite(zoom) || zoom <= 0 || zoom > DETAIL_ZOOM_MAX)
        return say(
          `«${input.value}» no es una ampliación: escriba un número mayor que 0 y hasta ${DETAIL_ZOOM_MAX}.`,
        );
      return solviewStep({ op: { ...state.op, zoom } });
    }
    return finishSolview(context, state.op, input.value);
  },
};

// ---------------------------------------------------------------------------
// SOLDRAW
// ---------------------------------------------------------------------------

const SOLDRAW_OPTIONS = [
  { keyword: "Todas", shortcut: "T" },
  { keyword: "Estado", shortcut: "E" },
] as const;

const soldrawCommand: CadCommandDescriptor<never> = {
  name: "SOLDRAW",
  aliases: ["SOLD", "DIBUJOSOL"],
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
    return {
      state: undefined as never,
      prompt: {
        message: `Pulse Intro para poner al día «${space.name}», o elija una opción`,
        options: SOLDRAW_OPTIONS,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  },
  step: (_state, input, context) => {
    if (input.kind === "cancel") return say("SOLDRAW cancelado.");
    const view = documentView(context);
    if (!view) return say(NO_SPACES);
    const space = activeSpace(context);
    if (!space) return say(NO_LAYOUT);

    // `Estado` no escribe nada: dice qué vistas están obsoletas. Existe porque
    // antes de trazar un juego de planos hay que poder preguntarlo sin tocar el
    // documento, y porque es la forma de ver el aviso sin provocarlo.
    if (input.kind === "keyword" && input.keyword === "Estado")
      return say(describeCadSolviewFreshness(view));

    const todas = input.kind === "keyword" && input.keyword === "Todas";
    const result = cadSoldrawCommands({
      document: view,
      newEntityId: context.newEntityId,
      ...(todas ? {} : { spaceId: space.id }),
    });
    if (result.commands.length === 0) return say(describeCadSoldraw(result));
    return documentResult(result.commands, "SOLDRAW");
  },
};

export const CAD_SOLVIEW_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(solviewCommand),
  asCadCommand(soldrawCommand),
];
