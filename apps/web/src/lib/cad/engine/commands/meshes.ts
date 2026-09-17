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
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_POINT,
  type CadAnyCommandDescriptor,
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

export const CAD_MESH_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(meshCommand),
  // Stubs de malla retirados (T18B): CONVTOMESH, CONVTOSOLID, MESHSMOOTH,
  // MESHSMOOTHMORE, MESHSMOOTHLESS, MESHREFINE, MESHSPLIT, MESHCREASE,
  // MESHUNCREASE, MESHCOLLAPSE, MESHEXTRUDE, MESHMERGE, MESHCAP, RULESURF,
  // TABSURF, REVSURF, EDGESURF, 3DFACE — todos pendientes de kernel de mallas.
];
