/**
 * UNION, SUBTRACT, INTERSECT, FILLETEDGE, CHAMFEREDGE, SLICE y SECTION.
 *
 * ## Las booleanas NO evalúan nada al ejecutarse: FUNDEN ÁRBOLES
 *
 * Restar dos sólidos podría resolverse evaluando los dos cuerpos, llamando al
 * kernel y guardando el resultado. Sería más corto y destruiría la propiedad que
 * justifica el esquema 5: el sólido dejaría de ser reeditable. Aquí se construye
 * un árbol NUEVO que contiene los dos árboles de entrada más un nodo `subtract`,
 * de modo que después se puede seguir cambiando la altura de la extrusión que
 * hay tres operaciones más abajo y toda la pieza se rehace.
 *
 * El precio son los NOMBRES: dos árboles independientes traen casi siempre un
 * nodo llamado `perfil`, porque es el que escribe EXTRUDE. Fundirlos sin
 * renombrar haría que uno pisara al otro y la resta tomase el operando
 * equivocado —sin ningún error, con una pieza plausible—. De ahí `prefixNodes`.
 *
 * ## FILLETEDGE y CHAMFEREDGE: qué aristas, y por qué no todas
 *
 * Designar una arista concreta exige poder pincharla, y el viewport 2D designa
 * entidades. Mientras tanto la lista vacía significa «el juego compatible», que
 * `preferredFeatureEdges` resuelve dando prioridad a las verticales: en un prisma
 * extruido eso son exactamente las esquinas que se ven en planta, que es lo que
 * un dibujante quiere redondear.
 *
 * No es «todas», y la razón no es pereza: el kernel no sabe fundir dos redondeos
 * que se encuentran en un vértice —haría falta una transición esférica que no
 * implementa— y se niega, correctamente, antes de producir astillas degeneradas.
 * Hay además una fragilidad conocida de las booleanas encadenadas: sin fusión de
 * caras coplanarias, cada corte fragmenta el cuerpo y el tercero o el cuarto
 * puede fallar sobre ciertas topologías con tamaños de chaflán pequeños. Cuando
 * pasa, la orden termina con el mensaje del kernel y NO escribe — que es la
 * diferencia entre «no se pudo» y «el documento quedó con un sólido roto».
 *
 * Cuando exista la designación de aristas, el nodo ya guarda sus índices: el
 * esquema no cambia.
 *
 * ## SLICE devuelve un sólido REEDITABLE y SECTION una región
 *
 * Son operaciones distintas y se distinguen en el resultado: SLICE deja el sólido
 * cortado (con su nodo `slice` en el árbol, así que se puede mover el plano
 * después) y SECTION deja la REGION de la huella del corte, que es un objeto 2D
 * acotable y sombreable.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadSolidNode } from "../../cad-entities-v5";
import type { CadEntityCommand } from "../../entity-commands";
import { solid3dBody } from "../../solid3d-build";
import { sectionLoopsOfSolid } from "../../solid3d-section";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import {
  finishedSolid,
  makeSolidEntity,
  prefixNodes,
  selectedSolids,
  solidBatch,
  solidCancelled,
  solidMessage,
} from "./solids-support";

interface SolidSelectionState {
  selection: readonly string[];
}

const NO_SOLIDS = "Esta orden necesita SOLID3D designados. Crea uno con EXTRUDE, REVOLVE, SWEEP o LOFT.";

function designate<S extends SolidSelectionState>(state: S, message: string): CadCommandStep<S> {
  return { state, prompt: { message, options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
}

// ---------------------------------------------------------------------------
// Booleanas
// ---------------------------------------------------------------------------

type BooleanOp = "union" | "subtract" | "intersect";

function booleanDescriptor(
  name: string,
  aliases: readonly string[],
  op: BooleanOp,
  prompt: string,
): CadCommandDescriptor<SolidSelectionState> {
  return {
    name,
    aliases,
    kind: "modify",
    transparent: false,
    selection: "optional",
    repeatable: true,
    mutates: true,
    cursor: "pick",
    // Con una designación PREVIA suficiente, la orden se ejecuta al teclearla.
    // Es la semántica PICKFIRST de AutoCAD y la que ya tienen ERASE y
    // AUTOCONSTRAIN: pedir un Intro de confirmación sobre objetos que el usuario
    // acaba de designar es un paso que no decide nada.
    begin: (context) =>
      selectedSolids(context, context.selection).length >= 2
        ? execute({ selection: context.selection }, context)
        : designate({ selection: context.selection }, prompt),
    step: (state, input, context) => {
      if (input.kind === "cancel") return solidCancelled(state);
      if (input.kind === "selection") return designate({ selection: input.entityIds }, prompt);
      if (input.kind === "entityPick")
        return designate({ selection: [...new Set([...state.selection, input.entityId])] }, prompt);
      if (input.kind !== "enter") return designate(state, prompt);
      return execute(state, context);
    },
  };

  function execute(
    state: SolidSelectionState,
    context: CadCommandContext,
  ): CadCommandStep<SolidSelectionState> {
    const solids = selectedSolids(context, state.selection);
    if (solids.length < 2)
      return solidMessage(state, `${name} necesita al menos DOS sólidos designados; hay ${solids.length}.`);

    const nodes: CadSolidNode[] = [];
    const roots: string[] = [];
    const removals: CadEntityCommand[] = [];
    for (const [index, solid] of solids.entries()) {
      const prefix = `op${index}:`;
      nodes.push(...prefixNodes(solid.nodes, prefix));
      roots.push(`${prefix}${solid.root}`);
      removals.push({ type: "delete", entityId: solid.id });
    }
    const rootId = "resultado";
    nodes.push({ id: rootId, op, operands: roots } as CadSolidNode);

    // La colocación del PRIMER operando manda. No es arbitrario: en una resta
    // el resultado «es» la primera pieza con un trozo menos, y conservar su
    // punto base hace que los grips y las cotas que la apuntaban sigan
    // significando lo mismo. Los demás operandos ya traen su colocación
    // horneada en sus nodos... salvo que la tuvieran, y por eso se aplica.
    const solid = makeSolidEntity(
      context.newEntityId(),
      nodes,
      rootId,
      solids[0].layer,
      solids[0].name,
    );
    const placed = solids[0].placement ? { ...solid, placement: solids[0].placement } : solid;
    return finishedSolid(placed, { state, label: name, before: removals });
  }
}

// ---------------------------------------------------------------------------
// FILLETEDGE / CHAMFEREDGE
// ---------------------------------------------------------------------------

type EdgeFeatureState = SolidSelectionState;

function edgeFeatureDescriptor(
  name: string,
  op: "fillet" | "chamfer",
  magnitude: string,
): CadCommandDescriptor<EdgeFeatureState> {
  const prompt = `Designe los sólidos cuyas aristas ${op === "fillet" ? "redondear" : "achaflanar"}`;
  const step = (state: EdgeFeatureState): CadCommandStep<EdgeFeatureState> => {
    if (state.selection.length === 0) return designate(state, prompt);
    return {
      state,
      prompt: { message: `Precise ${magnitude} (se aplica al juego de aristas compatibles)`, options: [] },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT,
    };
  };
  return {
    name,
    aliases: [],
    kind: "modify",
    transparent: false,
    selection: "optional",
    repeatable: true,
    mutates: true,
    cursor: "pick",
    begin: (context) => step({ selection: context.selection }),
    step: (state, input, context) => {
      if (input.kind === "cancel") return solidCancelled(state);
      if (input.kind === "selection") return step({ ...state, selection: input.entityIds });
      if (input.kind === "entityPick")
        return step({ ...state, selection: [...new Set([...state.selection, input.entityId])] });
      if (input.kind !== "distance") {
        if (input.kind === "enter" && state.selection.length === 0) return solidMessage(state, NO_SOLIDS);
        return step(state);
      }
      const size = Math.abs(input.value);
      if (!(size > 1e-9)) return solidMessage(state, `${name} necesita ${magnitude} mayor que cero.`);

      const solids = selectedSolids(context, state.selection);
      if (solids.length === 0) return solidMessage(state, NO_SOLIDS);
      const commands: CadEntityCommand[] = [];
      for (const source of solids) {
        const nodes: CadSolidNode[] = [...source.nodes];
        const rootId = `${op}:${nodes.length}`;
        nodes.push(
          op === "fillet"
            ? { id: rootId, op: "fillet", operand: source.root, edges: [], radius: size, segments: 8 }
            : { id: rootId, op: "chamfer", operand: source.root, edges: [], distance: size },
        );
        const next = {
          ...makeSolidEntity(source.id, nodes, rootId, source.layer, source.name),
          ...(source.placement ? { placement: source.placement } : {}),
        };
        const structural = finishedSolid(next, { state, label: name });
        if (structural.result?.kind !== "document") return structural;
        // `replace` y no borrar+crear: conserva el id, su sitio en el orden de
        // dibujo y las referencias que apunten al sólido.
        commands.push({ type: "replace", entityId: source.id, entity: next });
      }
      return solidBatch(state, commands, name);
    },
  };
}

// ---------------------------------------------------------------------------
// SLICE / SECTION
// ---------------------------------------------------------------------------

interface PlaneState extends SolidSelectionState {
  first: CadPoint2 | null;
  second: CadPoint2 | null;
}

const KEEP_LEFT = { keyword: "Izquierda", shortcut: "I" } as const;
const KEEP_RIGHT = { keyword: "Derecha", shortcut: "D" } as const;
const KEEP_BOTH = { keyword: "Ambos", shortcut: "A" } as const;

/**
 * Plano VERTICAL que pasa por dos puntos del dibujo.
 *
 * Es el único plano de corte que un viewport 2D puede precisar sin inventar una
 * tercera coordenada: la recta que se traza en planta, extruida en Z. La normal
 * apunta a la IZQUIERDA del recorrido, de modo que «Izquierda» y «Derecha» en el
 * prompt significan lo que se ve.
 */
function verticalPlane(first: CadPoint2, second: CadPoint2) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const length = Math.hypot(dx, dy);
  return {
    origin: { x: first.x, y: first.y, z: 0 },
    normal: { x: -dy / length, y: dx / length, z: 0 },
  };
}

function planeStep<S extends PlaneState>(state: S, prompt: string, final: string): CadCommandStep<S> {
  if (state.selection.length === 0) return designate(state, prompt);
  if (!state.first)
    return { state, prompt: { message: "Precise el primer punto del plano de corte", options: [] }, accepts: CAD_ACCEPT_POINT };
  if (!state.second)
    return {
      state,
      prompt: { message: "Precise el segundo punto del plano de corte", options: [] },
      accepts: CAD_ACCEPT_POINT,
      preview: [{ points: [state.first, state.first] }],
    };
  return {
    state,
    prompt: { message: final, options: [KEEP_LEFT, KEEP_RIGHT, KEEP_BOTH], defaultOption: KEEP_LEFT.keyword },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

const slicePrompt = "Designe los sólidos que cortar";

const sliceCommand: CadCommandDescriptor<PlaneState> = {
  name: "SLICE",
  aliases: ["SL"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => planeStep({ selection: context.selection, first: null, second: null }, slicePrompt, "¿Qué lado se conserva?"),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);
    if (input.kind === "selection")
      return planeStep({ ...state, selection: input.entityIds }, slicePrompt, "¿Qué lado se conserva?");
    if (input.kind === "entityPick")
      return planeStep({ ...state, selection: [...new Set([...state.selection, input.entityId])] }, slicePrompt, "¿Qué lado se conserva?");
    if (input.kind === "point") {
      if (!state.first) return planeStep({ ...state, first: input.point }, slicePrompt, "¿Qué lado se conserva?");
      if (!state.second) {
        if (Math.hypot(input.point.x - state.first.x, input.point.y - state.first.y) < 1e-9)
          return solidMessage(state, "Los dos puntos del corte son el mismo: no definen ningún plano.");
        return planeStep({ ...state, second: input.point }, slicePrompt, "¿Qué lado se conserva?");
      }
      return planeStep(state, slicePrompt, "¿Qué lado se conserva?");
    }
    if (!state.first || !state.second) {
      if (input.kind === "enter" && state.selection.length === 0) return solidMessage(state, NO_SOLIDS);
      return planeStep(state, slicePrompt, "¿Qué lado se conserva?");
    }
    if (input.kind !== "keyword" && input.kind !== "enter") return planeStep(state, slicePrompt, "¿Qué lado se conserva?");

    const keyword = input.kind === "keyword" ? input.keyword : KEEP_LEFT.keyword;
    const solids = selectedSolids(context, state.selection);
    if (solids.length === 0) return solidMessage(state, NO_SOLIDS);
    const plane = verticalPlane(state.first, state.second);
    const sides: ("positive" | "negative")[] =
      keyword === KEEP_BOTH.keyword
        ? ["positive", "negative"]
        : [keyword === KEEP_RIGHT.keyword ? "negative" : "positive"];

    const commands: CadEntityCommand[] = [];
    for (const source of solids) {
      const halves = sides.map((keep, index) => {
        const nodes: CadSolidNode[] = [...source.nodes];
        const rootId = `slice:${index}`;
        nodes.push({ id: rootId, op: "slice", operand: source.root, plane, keep });
        return {
          ...makeSolidEntity(index === 0 ? source.id : context.newEntityId(), nodes, rootId, source.layer, source.name),
          ...(source.placement ? { placement: source.placement } : {}),
        };
      });
      for (const [index, half] of halves.entries()) {
        const checked = finishedSolid(half, { state, label: "SLICE" });
        if (checked.result?.kind !== "document") return checked;
        commands.push(
          index === 0
            ? { type: "replace", entityId: source.id, entity: half }
            : { type: "insert", entity: half },
        );
      }
    }
    return solidBatch(state, commands, "SLICE");
  },
};

const sectionPrompt = "Designe los sólidos de los que extraer la sección";

const sectionCommand: CadCommandDescriptor<PlaneState> = {
  name: "SECTION",
  aliases: ["SEC"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => planeStep({ selection: context.selection, first: null, second: null }, sectionPrompt, "Pulse Intro para crear la región de sección"),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);
    if (input.kind === "selection")
      return planeStep({ ...state, selection: input.entityIds }, sectionPrompt, "Pulse Intro para crear la región de sección");
    if (input.kind === "entityPick")
      return planeStep({ ...state, selection: [...new Set([...state.selection, input.entityId])] }, sectionPrompt, "Pulse Intro para crear la región de sección");
    if (input.kind === "point") {
      if (!state.first) return planeStep({ ...state, first: input.point }, sectionPrompt, "Pulse Intro para crear la región de sección");
      if (!state.second) {
        if (Math.hypot(input.point.x - state.first.x, input.point.y - state.first.y) < 1e-9)
          return solidMessage(state, "Los dos puntos de la sección son el mismo: no definen ningún plano.");
        return planeStep({ ...state, second: input.point }, sectionPrompt, "Pulse Intro para crear la región de sección");
      }
      return planeStep(state, sectionPrompt, "Pulse Intro para crear la región de sección");
    }
    if (!state.first || !state.second) {
      if (input.kind === "enter" && state.selection.length === 0) return solidMessage(state, NO_SOLIDS);
      return planeStep(state, sectionPrompt, "Pulse Intro para crear la región de sección");
    }
    if (input.kind !== "enter" && input.kind !== "keyword")
      return planeStep(state, sectionPrompt, "Pulse Intro para crear la región de sección");

    const solids = selectedSolids(context, state.selection);
    if (solids.length === 0) return solidMessage(state, NO_SOLIDS);
    const plane = verticalPlane(state.first, state.second);
    const commands: CadEntityCommand[] = [];
    for (const source of solids) {
      let loops;
      try {
        loops = sectionLoopsOfSolid(solid3dBody(source), plane);
      } catch (error) {
        return solidMessage(state, `SECTION no pudo cortar ${source.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
      for (const loop of loops) {
        commands.push({
          type: "insert",
          entity: { id: context.newEntityId(), type: "region", outer: loop, layer: source.layer },
        });
      }
    }
    if (commands.length === 0)
      return solidMessage(state, "El plano de corte no atraviesa ninguno de los sólidos designados.");
    return solidBatch(state, commands, "SECTION");
  },
};

export const CAD_SOLID_MODIFY_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  booleanDescriptor("UNION", ["UNI"], "union", "Designe los sólidos que unir"),
  booleanDescriptor("SUBTRACT", ["SU"], "subtract", "Designe los sólidos: el PRIMERO es el que conserva, los demás se restan"),
  booleanDescriptor("INTERSECT", ["IN"], "intersect", "Designe los sólidos que intersecar"),
  edgeFeatureDescriptor("FILLETEDGE", "fillet", "el radio del redondeo"),
  edgeFeatureDescriptor("CHAMFEREDGE", "chamfer", "la distancia del chaflán"),
  sliceCommand,
  sectionCommand,
].map(asCadCommand);
