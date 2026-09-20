/**
 * SECTIONPLANE — el plano de corte como OBJETO, para reutilizarlo.
 *
 * ## SECTIONPLANE frente a SECTION
 *
 * `SECTION` (en `solids-modify.ts`) es el gesto de una vez: se definen dos
 * puntos, se corta y el plano se olvida. `SECTIONPLANE` es lo que AutoCAD
 * añadió después precisamente porque el gesto de una vez no basta cuando el
 * corte hay que volver a mirarlo tras cambiar el modelo: aquí el plano se
 * PERSISTE como entidad `sectionplane` (ver `cad-entities-section-plane.ts`),
 * así que sigue en el documento, se puede designar, mover con sus grips y
 * volver a usar.
 *
 * Y para que «volver a usar» no sea sólo una promesa, SECTIONPLANE hace
 * TAMBIÉN lo que hace SECTION si hay sólidos designados: corta de verdad con
 * el mismo núcleo (`sectionLoopsOfSolid`) y dibuja la sección como `region`.
 * Es la misma razón por la que SOLPROF comparte solucionador con FLATSHOT en
 * vez de tener el suyo — dos implementaciones de la misma proyección acaban
 * discrepando.
 *
 * ## La UX de definir el plano, DUPLICADA a propósito
 *
 * El flujo de «dos puntos, o XY/YZ/ZX con su cota» es el MISMO que ya tiene
 * SLICE/SECTION en `solids-modify.ts`, copiado aquí en vez de importado — la
 * misma decisión que ya toma `viewbase-commands.ts` frente a
 * `solview-commands.ts`, y por la misma razón: acoplar dos módulos de
 * comandos porque comparten una pantalla de diálogo es un acoplamiento que no
 * vale lo que cuesta el día que uno de los dos cambia el suyo.
 *
 * ## El tamaño del rectángulo: por qué se DEDUCE
 *
 * AutoCAD pregunta el tamaño con un rectángulo arrastrado a mano. Aquí no hay
 * arrastre de mouse en el motor de comandos tecleado, así que se ofrece un
 * valor por defecto razonable —cubrir los sólidos designados, con margen— y
 * se puede teclear otro. Nunca se inventa en silencio: el mensaje final dice
 * qué semilado se usó.
 */
import type { CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadSectionPlaneEntity } from "../../cad-entities-section-plane";
import type { CadSolidPlane } from "../../cad-entities-v5";
import { sectionLoopsOfSolid } from "../../solid3d-section";
import { selectedFlattenableBodies, type CadFlattenableBody } from "./solids-support";
import { v3Add, v3Basis, v3Scale } from "../../../brep";
import {
  CAD_ACCEPT_DISTANCE,
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

// ---------------------------------------------------------------------------
// Definir el plano — copiado de `solids-modify.ts` (ver el porqué arriba)
// ---------------------------------------------------------------------------

interface SolidsInputState {
  step: "solids";
  selection: readonly string[];
}

interface PlaneInputState {
  step: "plane";
  selection: readonly string[];
  first: CadPoint2 | null;
  second: CadPoint2 | null;
  planeMode: "XY" | "YZ" | "ZX" | null;
  planeElevation: number | null;
}

const SOLIDS_PROMPT = (count: number) =>
  count === 0
    ? "Designe los sólidos a cortar, o pulse Intro para definir sólo el plano"
    : `Designe más sólidos, o pulse Intro para continuar (${count} designado(s))`;

function solidsStep(state: SolidsInputState): CadCommandStep<CommandState> {
  return {
    state,
    prompt: { message: SOLIDS_PROMPT(state.selection.length), options: [] },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  };
}

const PLANE_XY = { keyword: "XY", shortcut: "XY" } as const;
const PLANE_YZ = { keyword: "YZ", shortcut: "YZ" } as const;
const PLANE_ZX = { keyword: "ZX", shortcut: "ZX" } as const;
const PLANE_OPTIONS = [PLANE_XY, PLANE_YZ, PLANE_ZX] as const;

function verticalPlane(first: CadPoint2, second: CadPoint2): CadSolidPlane {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const length = Math.hypot(dx, dy);
  return {
    origin: { x: first.x, y: first.y, z: 0 },
    normal: { x: -dy / length, y: dx / length, z: 0 },
  };
}

function coordinatePlane(mode: "XY" | "YZ" | "ZX", elevation: number): CadSolidPlane {
  if (mode === "XY") return { origin: { x: 0, y: 0, z: elevation }, normal: { x: 0, y: 0, z: 1 } };
  if (mode === "YZ") return { origin: { x: elevation, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } };
  return { origin: { x: 0, y: elevation, z: 0 }, normal: { x: 0, y: 1, z: 0 } };
}

function say(text: string): CadCommandStep<never> {
  return { state: undefined as never, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

const PLANE_PROMPT = "Precise el primer punto del plano de corte, o elija un plano coordenado";

function planeStep(state: PlaneInputState): CadCommandStep<CommandState> {
  if (state.planeMode && state.planeElevation === null)
    return {
      state,
      prompt: { message: `Precise la cota del plano ${state.planeMode}`, options: [] },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT,
    };
  if (!state.first && !state.planeMode)
    return {
      state,
      prompt: { message: PLANE_PROMPT, options: [...PLANE_OPTIONS] },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  if (!state.planeMode && !state.second)
    return {
      state,
      prompt: { message: "Precise el segundo punto del plano de corte", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  return sizeStep({
    step: "size",
    selection: state.selection,
    plane: state.planeMode
      ? coordinatePlane(state.planeMode, state.planeElevation ?? 0)
      : verticalPlane(state.first!, state.second!),
  });
}

// ---------------------------------------------------------------------------
// Tamaño del rectángulo
// ---------------------------------------------------------------------------

const DEFAULT_HALF_SIZE = 1_000;

/** Semilado que cubre los sólidos designados con margen, o el default fijo. */
function suggestedHalfSize(bodies: readonly CadFlattenableBody[]): number {
  if (bodies.length === 0) return DEFAULT_HALF_SIZE;
  let extent = 0;
  for (const { body } of bodies)
    for (const vertex of body.vertices)
      extent = Math.max(extent, Math.abs(vertex.point.x), Math.abs(vertex.point.y), Math.abs(vertex.point.z));
  return Math.max(DEFAULT_HALF_SIZE, extent * 1.5);
}

interface SizeState {
  step: "size";
  selection: readonly string[];
  plane: CadSolidPlane;
}

/**
 * El prompt NO enseña el número del default: calcularlo exige los cuerpos
 * designados, y sólo `step()` recibe el contexto que los resuelve — no
 * `sizeStep`, que también arma el prompt nada más definirse el plano, antes
 * de que el motor vuelva a llamar con un contexto. Enseñar aquí una cifra
 * fija que no fuese la que realmente se va a usar sería peor que no enseñar
 * ninguna: el aviso final, tras ejecutar, SÍ dice el semilado real usado.
 */
function sizeStep(state: SizeState): CadCommandStep<CommandState> {
  return {
    state,
    prompt: {
      message:
        `Semilado del rectángulo del plano (mm; Intro = ajustar a los sólidos ` +
        `designados, o ${DEFAULT_HALF_SIZE} mm si no hay ninguno)`,
      options: [],
    },
    accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
  };
}

// ---------------------------------------------------------------------------
// Ejecutar: insertar el plano y, si hay sólidos, cortarlos de verdad
// ---------------------------------------------------------------------------

type CommandState = SolidsInputState | PlaneInputState | SizeState;

function corners(plane: CadSolidPlane, halfSize: number): CadSectionPlaneEntity["corners"] {
  const { u, v } = v3Basis(plane.normal);
  const at = (su: number, sv: number): CadPoint3 =>
    v3Add(plane.origin, v3Add(v3Scale(u, su * halfSize), v3Scale(v, sv * halfSize)));
  return [at(1, 1), at(-1, 1), at(-1, -1), at(1, -1)];
}

function execute(state: SizeState, halfSize: number, context: CadCommandContext): CadCommandStep<CommandState> {
  const layer = context.activeLayer;
  const planeEntity: CadSectionPlaneEntity = {
    id: context.newEntityId(),
    type: "sectionplane",
    corners: corners(state.plane, halfSize),
    layer,
  };
  const commands: CadEntityCommand[] = [{ type: "insert", entity: planeEntity }];

  const bodies = selectedFlattenableBodies(context, state.selection);
  let regions = 0;
  const sinCorte: string[] = [];
  for (const source of bodies) {
    let loops: CadPoint3[][];
    try {
      loops = sectionLoopsOfSolid(source.body, state.plane);
    } catch (error) {
      return say(`SECTIONPLANE definió el plano, pero no pudo cortar ${source.entityId}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (loops.length === 0) {
      sinCorte.push(source.entityId);
      continue;
    }
    for (const loop of loops) {
      commands.push({ type: "insert", entity: { id: context.newEntityId(), type: "region", outer: loop, layer: source.layer } });
      regions += 1;
    }
  }

  const partes = [`el plano queda a ${Math.round(halfSize)} mm de semilado`];
  if (bodies.length > 0) {
    partes.push(regions > 0 ? `${regions} región(es) de sección` : "el plano no atraviesa ningún sólido designado");
    if (sinCorte.length > 0) partes.push(`sin cortar: ${sinCorte.join(", ")}`);
  }
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands, label: "SECTIONPLANE", notice: `SECTIONPLANE: ${partes.join("; ")}` },
  };
}

// ---------------------------------------------------------------------------
// El comando
// ---------------------------------------------------------------------------

export const sectionPlaneCommand: CadCommandDescriptor<CommandState> = {
  name: "SECTIONPLANE",
  aliases: ["SPLANE", "PLANOCORTE"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  // NO `spatial`: los puntos del plano se interpretan como X/Y del MUNDO —la
  // misma convención de `verticalPlane`/`coordinatePlane`, calcada de
  // SLICE/SECTION—, así que un SCU inclinado no se honra aquí tampoco. Está
  // documentado y no marcado como espacial a propósito: marcarlo sería
  // prometer algo que esta geometría no hace.
  cursor: "pick",
  begin: (context) => solidsStep({ step: "solids", selection: context.selection }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("SECTIONPLANE cancelado.");

    if (state.step === "solids") {
      if (input.kind === "selection") return solidsStep({ ...state, selection: input.entityIds });
      if (input.kind === "entityPick")
        return solidsStep({ ...state, selection: [...new Set([...state.selection, input.entityId])] });
      if (input.kind === "enter")
        return planeStep({
          step: "plane",
          selection: state.selection,
          first: null,
          second: null,
          planeMode: null,
          planeElevation: null,
        });
      return solidsStep(state);
    }

    if (state.step === "plane") {
      if (input.kind === "keyword" && !state.first && !state.planeMode) {
        const mode = input.keyword === PLANE_XY.keyword ? "XY" : input.keyword === PLANE_YZ.keyword ? "YZ" : input.keyword === PLANE_ZX.keyword ? "ZX" : null;
        if (mode) return planeStep({ ...state, planeMode: mode });
      }

      if (state.planeMode && state.planeElevation === null) {
        if (input.kind === "distance") return planeStep({ ...state, planeElevation: input.value });
        if (input.kind === "point") {
          const elevation = state.planeMode === "YZ" ? input.point.x : state.planeMode === "ZX" ? input.point.y : ((input.point as { z?: number }).z ?? 0);
          return planeStep({ ...state, planeElevation: elevation });
        }
        return planeStep(state);
      }

      if (input.kind === "point") {
        if (!state.first) return planeStep({ ...state, first: input.point });
        if (!state.second) {
          if (Math.hypot(input.point.x - state.first.x, input.point.y - state.first.y) < 1e-9)
            return say("Los dos puntos del plano son el mismo: no definen ninguno.");
          return planeStep({ ...state, second: input.point });
        }
      }
      return planeStep(state);
    }

    // state.step === "size"
    if (input.kind === "enter") return execute(state, suggestedHalfSize(selectedFlattenableBodies(context, state.selection)), context);
    if (input.kind === "distance") {
      if (!(input.value > 0)) return say("SECTIONPLANE necesita un semilado mayor que cero.");
      return execute(state, input.value, context);
    }
    if (input.kind === "text") {
      const written = input.value.trim().replace(",", ".");
      if (written === "") return execute(state, suggestedHalfSize(selectedFlattenableBodies(context, state.selection)), context);
      const value = Number(written);
      if (!Number.isFinite(value) || !(value > 0)) return say(`«${input.value}» no es un semilado válido.`);
      return execute(state, value, context);
    }
    return sizeStep(state);
  },
};

export const CAD_SECTION_PLANE_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(sectionPlaneCommand)];
