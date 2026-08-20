/**
 * FLATSHOT y SOLPROF: las dos órdenes que borran la segunda vez.
 *
 * ## Qué segunda vez
 *
 * Un arquitecto dibuja la planta, y después vuelve a dibujar A MANO el alzado y
 * el corte de lo mismo. Modelar en 3D sólo compensa si esa segunda vez
 * desaparece, y desaparece aquí: se gira el SCU hasta el plano que se quiere
 * ver, se teclea FLATSHOT, y sale el alzado como LÍNEAS del dibujo —vistas y
 * ocultas en capas distintas— listas para acotar, sombrear e imprimir.
 *
 * ## De dónde sale la dirección de proyección
 *
 * Del SCU activo, y de ningún otro sitio. Un aplanado sin SCU es una proyección
 * que no sabe desde dónde proyecta, y ésa es la razón por la que estas dos
 * órdenes no existían hasta que el SCU 3D estuvo integrado. `cadUcsPlanView`
 * devuelve la mirada y la vertical; las X e Y de ese SCU son las X e Y del
 * dibujo que sale.
 *
 * Y por eso los dos se declaran `spatial`: el caso de uso NORMAL es un SCU
 * inclinado —un alzado se saca poniendo el SCU de pie—, y un comando que no se
 * declara espacial ni siquiera puede aceptar un punto con el SCU así. La cota
 * viaja de punta a punta: el bloque se escribe a la cota del punto que se
 * señaló, no a cero.
 *
 * ## En qué se diferencian
 *
 * FLATSHOT aplana TODO lo que se le da y produce UN bloque con las dos clases
 * de línea dentro, en dos capas que elige quien lo teclea. SOLPROF hace el
 * perfil de unos sólidos concretos vistos desde una VENTANA GRÁFICA, y sus capas
 * se llaman `PV-…` y `PH-…` como en AutoCAD, con el identificador de la ventana
 * detrás. El aplanado es del dibujo; el perfil es de una vista.
 *
 * Comparten solucionador y emisor a propósito: dos implementaciones de la misma
 * proyección acabarían discrepando, y el día que discrepen habrá dos alzados
 * distintos del mismo sólido sin forma de saber cuál creer.
 *
 * ## Lo que cuesta, y dónde se paga
 *
 * Aplanar no es un gesto por cuadro: es una orden que se teclea, produce
 * geometría y termina. Sobre una escena de planta —400 sólidos, 4.800 aristas—
 * cuesta del orden de 130 ms en la máquina de desarrollo, con presupuesto
 * declarado en `view/hidden-line-solver.spec.ts`. La mitad cara es la OCULTA, y
 * sale a su propia capa: se apaga desde el gestor de capas y no hay que volver a
 * calcular nada.
 */
import type { CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadSolid3dEntity } from "../../cad-entities-v5";
import { solid3dBody } from "../../solid3d-build";
import { cadFlatshot, cadSolprof, type CadFlatshotLayer } from "../../flatshot";
import { cadActiveUcs, createCadVariableAccess } from "../../system-variables";
import { cadUcsPlanView } from "../../ucs-view";
import type { CadHiddenLineView } from "../../view/hidden-lines";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { solidBatch, solidCancelled, solidMessage } from "./solids-support";

/** Capas por defecto. Nombres en español porque el dibujante los va a leer. */
export const CAD_FLATSHOT_VISIBLE_LAYER = "APLANADO-VISTAS";
export const CAD_FLATSHOT_HIDDEN_LAYER = "APLANADO-OCULTAS";
export const CAD_FLATSHOT_BLOCK = "APLANADO";

const HIDDEN = { keyword: "Ocultas", shortcut: "O" } as const;
const BLOCK = { keyword: "Bloque", shortcut: "B" } as const;
const LAYERS = { keyword: "Capas", shortcut: "C" } as const;

const NO_SOLIDS =
  "No hay ningún sólido que aplanar. Designe uno o más SOLID3D, o pulse Intro para tomar todos los del dibujo.";

function variablesOf(context: CadCommandContext) {
  return context.variables ?? createCadVariableAccess();
}

/**
 * Mirada y vertical del SCU activo.
 *
 * `cadUcsPlanView` ya resuelve las dos, y usarla en vez de rehacer la cuenta
 * garantiza que FLATSHOT proyecta EXACTAMENTE en la misma dirección en la que
 * PLAN pone la vista. Si divergieran, lo que se ve en pantalla y lo que sale
 * aplanado serían dos cosas distintas.
 */
function ucsProjection(context: CadCommandContext): {
  view: CadHiddenLineView;
  up: CadPoint3;
} {
  const plan = cadUcsPlanView(cadActiveUcs(variablesOf(context)));
  return { view: { kind: "parallel", direction: plan.forward }, up: plan.up };
}

/** Los sólidos designados, o TODOS los del dibujo si no se designó nada. */
function solidsOf(context: CadCommandContext, selection: readonly string[]): CadSolid3dEntity[] {
  const ids = selection.length > 0 ? selection : context.entityIds;
  const solids: CadSolid3dEntity[] = [];
  for (const id of ids) {
    const entity = context.entity?.(id);
    if (entity && entity.type === "solid3d") solids.push(entity);
  }
  return solids;
}

/** Cota del punto señalado. Con SCU inclinado llega resuelta; en planta es 0. */
const elevationOf = (point: CadPoint2 | CadPoint3): number => ("z" in point ? point.z : 0);

// ---------------------------------------------------------------------------
// FLATSHOT
// ---------------------------------------------------------------------------

interface FlatshotState {
  selection: readonly string[];
  /** `false` es la respuesta «no quiero las ocultas»: no se emiten ni se cobran. */
  withHidden: boolean;
  blockName: string;
  visibleLayer: string;
  hiddenLayer: string;
  /** Qué está preguntando ahora: nada, el nombre del bloque, o las dos capas. */
  asking: "none" | "block" | "visible-layer" | "hidden-layer";
}

const EMPTY_FLATSHOT: FlatshotState = {
  selection: [],
  withHidden: true,
  blockName: CAD_FLATSHOT_BLOCK,
  visibleLayer: CAD_FLATSHOT_VISIBLE_LAYER,
  hiddenLayer: CAD_FLATSHOT_HIDDEN_LAYER,
  asking: "none",
};

function flatshotStep(state: FlatshotState, context: CadCommandContext): CadCommandStep<FlatshotState> {
  if (state.asking === "block")
    return {
      state,
      prompt: {
        message: "Nombre del bloque del aplanado (si ya existe, se reemplaza y sus inserciones se actualizan)",
        options: [],
        defaultValue: state.blockName,
      },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (state.asking === "visible-layer")
    return {
      state,
      prompt: { message: "Capa de las líneas vistas", options: [], defaultValue: state.visibleLayer },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (state.asking === "hidden-layer")
    return {
      state,
      prompt: { message: "Capa de las líneas ocultas", options: [], defaultValue: state.hiddenLayer },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (state.selection.length === 0 && context.selection.length === 0 && context.entityIds.length === 0)
    return solidMessage(state, NO_SOLIDS);
  return {
    state,
    prompt: {
      message: "Precise el punto de inserción del aplanado",
      options: [HIDDEN, BLOCK, LAYERS],
      defaultValue: `${state.blockName}, ocultas ${state.withHidden ? "sí" : "no"}`,
    },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD | CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  };
}

function runFlatshot(
  state: FlatshotState,
  insertion: CadPoint3,
  context: CadCommandContext,
): CadCommandStep<FlatshotState> {
  const solids = solidsOf(context, state.selection);
  if (solids.length === 0) return solidMessage(state, NO_SOLIDS);

  const visibleLayer: CadFlatshotLayer = { name: state.visibleLayer, color: "#ffffff", linetype: "CONTINUOUS" };
  // El trazo discontinuo va en la CAPA, no en cada línea: así se cambia el
  // aspecto de las mil ocultas desde el gestor de capas y no una a una.
  const hiddenLayer: CadFlatshotLayer | null = state.withHidden
    ? { name: state.hiddenLayer, color: "#9aa0a6", linetype: "HIDDEN" }
    : null;

  const projection = ucsProjection(context);
  const result = cadFlatshot(solids.map(solid3dBody), {
    view: projection.view,
    up: projection.up,
    insertion,
    visibleLayer,
    hiddenLayer,
    blockName: state.blockName,
    blocks: context.blocks?.(),
    insertLayer: context.activeLayer,
    newId: context.newEntityId,
  });
  if (!result.ok) return solidMessage(state, `FLATSHOT no pudo aplanar: ${result.message}`);

  const verb = result.replaced ? "reemplazó" : "creó";
  return solidBatch(
    state,
    result.commands,
    `FLATSHOT ${verb} ${state.blockName}: ${result.visibleLines} línea(s) vista(s), ${result.hiddenLines} oculta(s)`,
  );
}

const flatshotCommand: CadCommandDescriptor<FlatshotState> = {
  name: "FLATSHOT",
  aliases: ["APLANAR"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  // Conserva la cota del punto de inserción, así que puede trabajar con el SCU
  // inclinado — que es justamente cómo se saca un alzado.
  spatial: true,
  cursor: "crosshair",
  begin: (context) => flatshotStep({ ...EMPTY_FLATSHOT, selection: context.selection }, context),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);

    if (input.kind === "text") {
      const value = input.value.trim();
      if (state.asking === "block")
        return flatshotStep({ ...state, blockName: value || state.blockName, asking: "none" }, context);
      if (state.asking === "visible-layer")
        return flatshotStep(
          { ...state, visibleLayer: value || state.visibleLayer, asking: "hidden-layer" },
          context,
        );
      if (state.asking === "hidden-layer")
        return flatshotStep({ ...state, hiddenLayer: value || state.hiddenLayer, asking: "none" }, context);
      return flatshotStep(state, context);
    }

    if (input.kind === "enter") {
      // Intro dentro de una pregunta de texto acepta el valor que se enseña.
      if (state.asking === "visible-layer") return flatshotStep({ ...state, asking: "hidden-layer" }, context);
      if (state.asking !== "none") return flatshotStep({ ...state, asking: "none" }, context);
      return flatshotStep(state, context);
    }

    if (input.kind === "selection")
      return flatshotStep({ ...state, selection: input.entityIds }, context);
    if (input.kind === "entityPick")
      return flatshotStep(
        { ...state, selection: [...new Set([...state.selection, input.entityId])] },
        context,
      );

    if (input.kind === "keyword") {
      if (input.keyword === HIDDEN.keyword)
        return flatshotStep({ ...state, withHidden: !state.withHidden }, context);
      if (input.keyword === BLOCK.keyword) return flatshotStep({ ...state, asking: "block" }, context);
      if (input.keyword === LAYERS.keyword)
        return flatshotStep({ ...state, asking: "visible-layer" }, context);
      return flatshotStep(state, context);
    }

    if (input.kind === "point")
      return runFlatshot(
        state,
        { x: input.point.x, y: input.point.y, z: elevationOf(input.point) },
        context,
      );

    return flatshotStep(state, context);
  },
};

// ---------------------------------------------------------------------------
// SOLPROF
// ---------------------------------------------------------------------------

const SEPARATE = { keyword: "Separar", shortcut: "S" } as const;
const VIEWPORT = { keyword: "Ventana", shortcut: "V" } as const;

interface SolprofState {
  selection: readonly string[];
  /** Sufijo de las capas `PV-`/`PH-`. En AutoCAD es el handle de la ventana. */
  viewportTag: string;
  separateHiddenLayer: boolean;
  asking: boolean;
}

/**
 * Ventana por defecto.
 *
 * En AutoCAD el sufijo es el HANDLE de la ventana gráfica activa, y aquí las
 * ventanas gráficas son de otro módulo: pedirlas desde esta orden ataría el
 * perfil a un esquema que todavía se está escribiendo. Se toma la presentación
 * abierta si el anfitrión la aporta, y si no, `MODELO`. Quien tenga una ventana
 * de verdad la pasa con la opción Ventana, o llama a `cadSolprof` directamente,
 * que es la puerta pensada para el visor.
 */
function defaultViewportTag(context: CadCommandContext): string {
  const layout = context.activeLayout?.trim();
  return (layout && layout.toUpperCase().replaceAll(/[^A-Z0-9]+/g, "-")) || "MODELO";
}

function solprofStep(state: SolprofState): CadCommandStep<SolprofState> {
  if (state.asking)
    return {
      state,
      prompt: {
        message: "Identificador de la ventana gráfica (va detrás de PV- y PH-)",
        options: [],
        defaultValue: state.viewportTag,
      },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (state.selection.length === 0)
    return {
      state,
      prompt: { message: "Designe los sólidos de los que sacar el perfil", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  return {
    state,
    prompt: {
      message: "Precise el punto de inserción del perfil",
      options: [SEPARATE, VIEWPORT],
      defaultValue: `${state.separateHiddenLayer ? "ocultas en PH-" : "todo junto en PV-"}${state.viewportTag}`,
    },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD | CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  };
}

function runSolprof(
  state: SolprofState,
  insertion: CadPoint3,
  context: CadCommandContext,
): CadCommandStep<SolprofState> {
  const solids = solidsOf(context, state.selection);
  if (solids.length === 0)
    return solidMessage(state, "SOLPROF necesita al menos un SOLID3D designado.");
  const projection = ucsProjection(context);
  const result = cadSolprof(solids.map(solid3dBody), {
    view: projection.view,
    up: projection.up,
    insertion,
    viewportTag: state.viewportTag,
    separateHiddenLayer: state.separateHiddenLayer,
    blocks: context.blocks?.(),
    newId: context.newEntityId,
  });
  if (!result.ok) return solidMessage(state, `SOLPROF no pudo perfilar: ${result.message}`);
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands: result.commands,
      label: `SOLPROF en ${result.layers.join(" y ")}: ${result.visibleLines} vista(s), ${result.hiddenLines} oculta(s)`,
    },
  };
}

const solprofCommand: CadCommandDescriptor<SolprofState> = {
  name: "SOLPROF",
  aliases: ["PERFILSOL"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  spatial: true,
  cursor: "pick",
  begin: (context) =>
    solprofStep(
      {
        selection: context.selection,
        viewportTag: defaultViewportTag(context),
        separateHiddenLayer: true,
        asking: false,
      }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);
    if (input.kind === "text")
      return solprofStep(
        { ...state, viewportTag: input.value.trim() || state.viewportTag, asking: false },
      );
    if (input.kind === "selection") return solprofStep({ ...state, selection: input.entityIds });
    if (input.kind === "entityPick")
      return solprofStep(
        { ...state, selection: [...new Set([...state.selection, input.entityId])] },
      );
    if (input.kind === "keyword") {
      if (input.keyword === SEPARATE.keyword)
        return solprofStep({ ...state, separateHiddenLayer: !state.separateHiddenLayer });
      if (input.keyword === VIEWPORT.keyword) return solprofStep({ ...state, asking: true });
      return solprofStep(state);
    }
    if (input.kind === "point")
      return runSolprof(
        state,
        { x: input.point.x, y: input.point.y, z: elevationOf(input.point) },
        context,
      );
    if (input.kind === "enter" && state.asking) return solprofStep({ ...state, asking: false });
    return solprofStep(state);
  },
};

export const CAD_SOLID_FLATSHOT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(flatshotCommand),
  asCadCommand(solprofCommand),
];
