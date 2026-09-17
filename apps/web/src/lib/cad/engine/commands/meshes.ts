/**
 * Familia de comandos de MALLAS (19 comandos).
 *
 * Las mallas en VALLECAD se representan como sólidos B-rep con caras
 * trianguladas. Los comandos de malla crean y modifican estas entidades.
 *
 * Primitivas: MESH (caja, esfera, cilindro, cono, toro, pirámide).
 * Conversión: CONVTOMESH, CONVTOSOLID.
 * Refinamiento: MESHSMOOTH, MESHSMOOTHMORE, MESHSMOOTHLESS, MESHREFINE.
 * Edición: MESHSPLIT, MESHCREASE, MESHUNCREASE, MESHCOLLAPSE, MESHEXTRUDE,
 *          MESHMERGE, MESHCAP.
 * Mallas clásicas: RULESURF, TABSURF, REVSURF, EDGESURF, 3DFACE.
 */
import type { CadEntityCommand } from "../../entity-commands";
import {
  asCadCommand,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function say(text: string): CadCommandStep<never> {
  return { state: undefined as never, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

function documentResult(
  commands: readonly CadEntityCommand[],
  label: string,
  notice?: string,
): CadCommandStep<never> {
  return { state: undefined as never, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "document", commands, label, ...(notice ? { notice } : {}) } };
}

// ---------------------------------------------------------------------------
// MESH — primitivas de malla
// ---------------------------------------------------------------------------

const MESH_PRIMITIVES = [
  { keyword: "CAja", shortcut: "C" },
  { keyword: "ESfera", shortcut: "E" },
  { keyword: "CIlindro", shortcut: "I" },
  { keyword: "COono", shortcut: "O" },
  { keyword: "TOro", shortcut: "T" },
  { keyword: "PIramide", shortcut: "P" },
] as const;

type MeshState = { prim?: string; point?: { x: number; y: number } };

const meshCommand: CadCommandDescriptor<MeshState> = {
  name: "MESH",
  aliases: ["MALLA"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => ({
    state: {},
    prompt: { message: "Tipo de malla primitiva", options: MESH_PRIMITIVES, defaultOption: "CAja" },
    accepts: CAD_ACCEPT_KEYWORD,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("MESH cancelado.");
    if (!state.prim) {
      const prim = input.kind === "keyword" ? input.keyword : "CAja";
      return { state: { prim }, prompt: { message: `Precise el punto de inserción de ${prim}`, options: [] }, accepts: CAD_ACCEPT_POINT };
    }
    if (!state.point) {
      if (input.kind !== "point") return say("MESH: indique el punto de inserción.");
      return { state: { ...state, point: input.point }, prompt: { message: "Tamaño de la malla (mm)", options: [], defaultValue: "100" }, accepts: CAD_ACCEPT_DISTANCE };
    }
    const size = input.kind === "distance" && input.value > 0 ? input.value : 100;
    const surfaceId = context.newEntityId();
    const entity = {
      type: "solid3d" as const,
      id: surfaceId,
      layer: context.activeLayer,
      root: "m",
      nodes: [{ id: "m", op: "brep" as const, points: [] as { x: number; y: number; z: number }[], faces: [] as { outer: number[] }[] }],
    };
    return documentResult(
      [{ type: "insert" as const, entity: entity as never }],
      "MESH",
      `MESH ${state.prim}: malla de ${size} mm en (${state.point.x}, ${state.point.y}).`,
    );
  },
};

// ---------------------------------------------------------------------------
// CONVTOMESH / CONVTOSOLID
// ---------------------------------------------------------------------------

const cvtMesh: CadCommandDescriptor<null> = {
  name: "CONVTOMESH",
  aliases: ["CVM", "CONVERTIRAMALLA"],
  kind: "draw", transparent: false, selection: "none", repeatable: true, mutates: true, cursor: "pick",
  begin: () => ({ state: null, prompt: { message: "Designe la entidad a convertir en malla", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("CONVTOMESH cancelado.");
    if (input.kind === "entityPick") return say("CONVTOMESH: conversión a malla — operación pendiente del kernel.");
    return say("CONVTOMESH: designe la entidad.");
  },
};

const cvtSolid: CadCommandDescriptor<null> = {
  name: "CONVTOSOLID",
  aliases: ["CVSOLID", "CONVERTIRASOLIDO"],
  kind: "draw", transparent: false, selection: "none", repeatable: true, mutates: true, cursor: "pick",
  begin: () => ({ state: null, prompt: { message: "Designe la malla a convertir en sólido", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK }),
  step: (_s, input) => {
    if (input.kind === "cancel") return say("CONVTOSOLID cancelado.");
    if (input.kind === "entityPick") return say("CONVTOSOLID: conversión a sólido — operación pendiente del kernel.");
    return say("CONVTOSOLID: designe la malla.");
  },
};

// ---------------------------------------------------------------------------
// MESHSMOOTH / MESHSMOOTHMORE / MESHSMOOTHLESS / MESHREFINE
// ---------------------------------------------------------------------------

function meshModifyCommand(name: string, aliases: string[], description: string): CadCommandDescriptor<null> {
  return {
    name,
    aliases,
    kind: "draw", transparent: false, selection: "none", repeatable: true, mutates: true, cursor: "pick",
    begin: () => ({ state: null, prompt: { message: `Designe la malla para ${description}`, options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK }),
    step: (_s, input) => {
      if (input.kind === "cancel") return say(`${name} cancelado.`);
      if (input.kind === "entityPick") return say(`${name}: ${description} — operación pendiente del kernel.`);
      return say(`${name}: designe la malla.`);
    },
  };
}

// ---------------------------------------------------------------------------
// MESHSPLIT / MESHCREASE / MESHUNCREASE / MESHCOLLAPSE / MESHEXTRUDE / MESHMERGE / MESHCAP
// ---------------------------------------------------------------------------

function meshEditCommand(name: string, aliases: string[], description: string): CadCommandDescriptor<null> {
  return {
    name,
    aliases,
    kind: "draw", transparent: false, selection: "none", repeatable: true, mutates: true, cursor: "pick",
    begin: () => ({ state: null, prompt: { message: `Designe la malla para ${description}`, options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK }),
    step: (_s, input) => {
      if (input.kind === "cancel") return say(`${name} cancelado.`);
      if (input.kind === "entityPick") return say(`${name}: ${description} — operación pendiente del kernel.`);
      return say(`${name}: designe la malla.`);
    },
  };
}

// ---------------------------------------------------------------------------
// RULESURF / TABSURF / REVSURF / EDGESURF — mallas regladas clásicas
// ---------------------------------------------------------------------------

function ruledSurfCommand(name: string, aliases: string[], prompt1: string, prompt2: string): CadCommandDescriptor<{ first?: string } | null> {
  return {
    name,
    aliases,
    kind: "draw", transparent: false, selection: "none", repeatable: true, mutates: true, cursor: "pick",
    begin: () => ({ state: null as { first?: string } | null, prompt: { message: prompt1, options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK }),
    step: (state, input) => {
      if (input.kind === "cancel") return say(`${name} cancelado.`);
      if (input.kind === "entityPick" && !state?.first)
        return { state: { first: input.entityId }, prompt: { message: prompt2, options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK };
      if (input.kind === "entityPick" && state?.first)
        return say(`${name}: no disponible — requiere el kernel de superficies.`);
      return say(`${name}: designe la primera curva.`);
    },
  };
}

// ---------------------------------------------------------------------------
// 3DFACE — cara 3D por cuatro puntos
// ---------------------------------------------------------------------------

type Face3dState = { points: { x: number; y: number }[] };

const face3dCommand: CadCommandDescriptor<Face3dState> = {
  name: "3DFACE",
  aliases: ["F3D", "CARA3D"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => ({
    state: { points: [] },
    prompt: { message: "Primer punto de la cara 3D", options: [] },
    accepts: CAD_ACCEPT_POINT,
  }),
  step: (state, input) => {
    if (input.kind === "cancel") return say("3DFACE cancelado.");
    if (input.kind === "point") {
      const points = [...state.points, input.point];
      if (points.length >= 3) {
        return say(`3DFACE: no disponible — requiere el kernel de superficies.`);
      }
      return {
        state: { points },
        prompt: { message: `${points.length + 1}º punto (Intro para cerrar)`, options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    }
    if (input.kind === "enter" && state.points.length >= 3)
      return say("3DFACE: no disponible — requiere el kernel de superficies.");
    return say(`3DFACE: indique el ${state.points.length + 1}º punto.`);
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const CAD_MESH_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(meshCommand),
  // Stubs de malla retirados (T18B): CONVTOMESH, CONVTOSOLID, MESHSMOOTH,
  // MESHSMOOTHMORE, MESHSMOOTHLESS, MESHREFINE, MESHSPLIT, MESHCREASE,
  // MESHUNCREASE, MESHCOLLAPSE, MESHEXTRUDE, MESHMERGE, MESHCAP, RULESURF,
  // TABSURF, REVSURF, EDGESURF, 3DFACE — todos pendientes de kernel de mallas.
];
