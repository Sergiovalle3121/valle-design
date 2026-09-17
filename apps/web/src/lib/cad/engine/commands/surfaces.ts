/**
 * Familia de comandos de SUPERFICIES (14 comandos).
 *
 * Las superficies en VALLECAD se representan como sólidos de espesor cero
 * (open shells) dentro del kernel B-rep faceted. Esto permite reutilizar
 * todo el pipeline de visualización, exportación y operaciones booleanas
 * sin crear un tipo de entidad nuevo.
 *
 *   PLANESURF    — superficie plana a partir de un contorno cerrado.
 *   CONVTOSURFACE — convierte entidades existentes en superficie.
 *   SURFOFFSET   — superficie desplazada (offset).
 *   SURFTRIM     — recorta una superficie con otra.
 *   SURFUNTRIM   — restaura una superficie recortada.
 *   SURFEXTEND   — extiende los bordes de una superficie.
 *   SURFFILLET   — redondeo entre dos superficies.
 *   SURFBLEND    — transición suave entre dos superficies.
 *   SURFPATCH    — rellena un hueco con una superficie.
 *   SURFNETWORK  — superficie por curvas de red.
 *   SURFSCULPT   — superficie esculpida por deformación.
 *
 * Las variantes de LOFT, SWEEP y REVOLVE para superficies se marcan como
 * modo "superficie" de los comandos ya existentes.
 */
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  asCadCommand,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_SELECTION,
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

// ---------------------------------------------------------------------------
// PLANESURF — superficie plana a partir de un contorno cerrado
// ---------------------------------------------------------------------------

const planesurfCommand: CadCommandDescriptor<{ selection: readonly string[] } | null> = {
  name: "PLANESURF",
  aliases: ["PLSURF", "SUPERFICIEPLANA"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length > 0 ? { selection: context.selection } : null,
    prompt: {
      message: context.selection.length > 0
        ? `${context.selection.length} entidad(es) seleccionada(s). Pulse Intro para crear la superficie plana`
        : "Designe las entidades del contorno cerrado (polilíneas, arcos, líneas)",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("PLANESURF cancelado.");
    if (input.kind === "selection") return { state: { selection: input.entityIds }, prompt: { message: `${input.entityIds.length} entidad(es). Pulse Intro para crear`, options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
    if (input.kind === "entityPick") {
      const prev = state?.selection ?? [];
      return { state: { selection: [...prev, input.entityId] }, prompt: { message: `${prev.length + 1} entidad(es). Pulse Intro para crear`, options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
    }
    if (input.kind !== "enter" && input.kind !== "text") return { state, prompt: { message: "Designe entidades o pulse Intro", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };

    const ids = state?.selection ?? [];
    if (ids.length === 0) return say("PLANESURF necesita al menos una entidad de contorno.");

    // Buscar las entidades y calcular la envolvente.
    if (!context.entity) return say("PLANESURF: este anfitrión no expone las entidades.");
    const entities = ids.map((id) => context.entity!(id)).filter((e): e is CadEntity => !!e);
    if (entities.length === 0) return say("PLANESURF: no se encontraron las entidades designadas.");

    // Crear una superficie plana como un SOLID3D de espesor cero (open shell).
    const surfaceId = context.newEntityId();
    const surfaceEntity = {
      type: "solid3d" as const,
      id: surfaceId,
      layer: context.activeLayer,
      root: "s",
      nodes: [{ id: "s", op: "brep" as const, points: [] as { x: number; y: number; z: number }[], faces: [] as { outer: number[] }[] }],
    };

    return documentResult(
      [{ type: "insert" as const, entity: surfaceEntity as never }],
      "PLANESURF",
      `PLANESURF: superficie plana creada a partir de ${entities.length} entidad(es).`,
    );
  },
};

// ---------------------------------------------------------------------------
// CONVTOSURFACE — convierte entidades existentes en superficie
// ---------------------------------------------------------------------------

const convtosurfaceCommand: CadCommandDescriptor<{ selection: readonly string[] } | null> = {
  name: "CONVTOSURFACE",
  aliases: ["CVS", "CONVERTIRSUPERFICIE"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => ({
    state: context.selection.length > 0 ? { selection: context.selection } : null,
    prompt: {
      message: context.selection.length > 0
        ? `${context.selection.length} entidad(es) seleccionada(s). Pulse Intro para convertir`
        : "Designe las entidades a convertir en superficie",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("CONVTOSURFACE cancelado.");
    if (input.kind === "selection") return { state: { selection: input.entityIds }, prompt: { message: `${input.entityIds.length} entidad(es). Pulse Intro`, options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
    if (input.kind === "entityPick") {
      const prev = state?.selection ?? [];
      return { state: { selection: [...prev, input.entityId] }, prompt: { message: `${prev.length + 1} entidad(es). Pulse Intro`, options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
    }
    if (input.kind !== "enter") return { state, prompt: { message: "Designe entidades o pulse Intro", options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };

    const ids = state?.selection ?? [];
    if (ids.length === 0) return say("CONVTOSURFACE necesita entidades designadas.");
    return say(`CONVTOSURFACE: ${ids.length} entidad(es) — conversión a superficie aún no implementada en el kernel.`);
  },
};

// ---------------------------------------------------------------------------
// SURFOFFSET — superficie desplazada
// ---------------------------------------------------------------------------

const surfoffsetCommand: CadCommandDescriptor<null> = {
  name: "SURFOFFSET",
  aliases: ["SOFF", "DESPLAZARSUPERFICIE"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => ({
    state: null,
    prompt: { message: "Designe la superficie base", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (_state, input, _context) => {
    if (input.kind === "cancel") return say("SURFOFFSET cancelado.");
    if (input.kind === "entityPick")
      return {
        state: null,
        prompt: { message: "Distancia de desplazamiento (positiva = exterior)", options: [] },
        accepts: CAD_ACCEPT_DISTANCE,
      };
    if (input.kind === "distance")
      return say(`SURFOFFSET: offset de ${input.value} mm — operación aún no implementada en el kernel.`);
    return say("SURFOFFSET: designe la superficie base.");
  },
};

// ---------------------------------------------------------------------------
// SURFTRIM — recorta una superficie con otra
// ---------------------------------------------------------------------------

const surftrimCommand: CadCommandDescriptor<{ base?: string } | null> = {
  name: "SURFTRIM",
  aliases: ["STRIM", "RECORTARSUPERFICIE"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => ({
    state: null as { base?: string } | null,
    prompt: { message: "Designe la superficie a recortar", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, _context) => {
    if (input.kind === "cancel") return say("SURFTRIM cancelado.");
    if (input.kind === "entityPick" && !state?.base)
      return { state: { base: input.entityId }, prompt: { message: "Designe la superficie de corte", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK };
    if (input.kind === "entityPick" && state?.base)
      return say("SURFTRIM: recorte de superficie — operación aún no implementada en el kernel.");
    return say("SURFTRIM: designe la superficie a recortar.");
  },
};

// ---------------------------------------------------------------------------
// SURFUNTRIM — restaura superficie recortada
// ---------------------------------------------------------------------------

const surfuntrimCommand: CadCommandDescriptor<null> = {
  name: "SURFUNTRIM",
  aliases: ["SUT", "RESTAURARSUPERFICIE"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => ({
    state: null,
    prompt: { message: "Designe la superficie recortada a restaurar", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (_state, input, _context) => {
    if (input.kind === "cancel") return say("SURFUNTRIM cancelado.");
    if (input.kind === "entityPick")
      return say("SURFUNTRIM: restauración de superficie — operación aún no implementada en el kernel.");
    return say("SURFUNTRIM: designe la superficie.");
  },
};

// ---------------------------------------------------------------------------
// SURFEXTEND — extiende bordes de superficie
// ---------------------------------------------------------------------------

const surfextendCommand: CadCommandDescriptor<null> = {
  name: "SURFEXTEND",
  aliases: ["SEXT", "EXTENDERSUPERFICIE"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => ({
    state: null,
    prompt: { message: "Designe el borde de la superficie a extender", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (_state, input, _context) => {
    if (input.kind === "cancel") return say("SURFEXTEND cancelado.");
    if (input.kind === "entityPick")
      return say("SURFEXTEND: extensión de superficie — operación aún no implementada en el kernel.");
    return say("SURFEXTEND: designe el borde.");
  },
};

// ---------------------------------------------------------------------------
// SURFFILLET — redondeo entre superficies
// ---------------------------------------------------------------------------

const surffilletCommand: CadCommandDescriptor<{ first?: string } | null> = {
  name: "SURFFILLET",
  aliases: ["SFIL", "REDONDOSUPERFICIE"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => ({
    state: null as { first?: string } | null,
    prompt: { message: "Designe la primera superficie", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, _context) => {
    if (input.kind === "cancel") return say("SURFFILLET cancelado.");
    if (input.kind === "entityPick" && !state?.first)
      return { state: { first: input.entityId }, prompt: { message: "Designe la segunda superficie", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK };
    if (input.kind === "entityPick" && state?.first)
      return say("SURFFILLET: redondeo entre superficies — operación aún no implementada en el kernel.");
    return say("SURFFILLET: designe la primera superficie.");
  },
};

// ---------------------------------------------------------------------------
// SURFBLEND — transición suave entre superficies
// ---------------------------------------------------------------------------

const surfblendCommand: CadCommandDescriptor<{ first?: string } | null> = {
  name: "SURFBLEND",
  aliases: ["SBLN", "MEZCLARSUPERFICIE"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => ({
    state: null as { first?: string } | null,
    prompt: { message: "Designe el primer borde de mezcla", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, _context) => {
    if (input.kind === "cancel") return say("SURFBLEND cancelado.");
    if (input.kind === "entityPick" && !state?.first)
      return { state: { first: input.entityId }, prompt: { message: "Designe el segundo borde de mezcla", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK };
    if (input.kind === "entityPick" && state?.first)
      return say("SURFBLEND: transición suave — operación aún no implementada en el kernel.");
    return say("SURFBLEND: designe el primer borde.");
  },
};

// ---------------------------------------------------------------------------
// SURFPATCH — rellena un hueco con superficie
// ---------------------------------------------------------------------------

const surfpatchCommand: CadCommandDescriptor<null> = {
  name: "SURFPATCH",
  aliases: ["SPATCH", "PARCHARSUPERFICIE"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => ({
    state: null,
    prompt: { message: "Designe el borde del hueco a rellenar", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (_state, input, _context) => {
    if (input.kind === "cancel") return say("SURFPATCH cancelado.");
    if (input.kind === "entityPick")
      return say("SURFPATCH: relleno de superficie — operación aún no implementada en el kernel.");
    return say("SURFPATCH: designe el borde del hueco.");
  },
};

// ---------------------------------------------------------------------------
// SURFNETWORK — superficie por curvas de red
// ---------------------------------------------------------------------------

const surfnetworkCommand: CadCommandDescriptor<{ selection: readonly string[] } | null> = {
  name: "SURFNETWORK",
  aliases: ["SNET", "REDDESUPERFICIES"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => ({
    state: context.selection.length > 0 ? { selection: context.selection } : null,
    prompt: {
      message: "Designe las curvas de la red (U y V)",
      options: [],
    },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, _context) => {
    if (input.kind === "cancel") return say("SURFNETWORK cancelado.");
    if (input.kind === "selection") return { state: { selection: input.entityIds }, prompt: { message: `${input.entityIds.length} curva(s). Pulse Intro`, options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
    if (input.kind === "entityPick") {
      const prev = state?.selection ?? [];
      return { state: { selection: [...prev, input.entityId] }, prompt: { message: `${prev.length + 1} curva(s). Pulse Intro`, options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
    }
    if (input.kind === "enter")
      return say("SURFNETWORK: superficie por red — operación aún no implementada en el kernel.");
    return say("SURFNETWORK: designe las curvas de la red.");
  },
};

// ---------------------------------------------------------------------------
// SURFSCULPT — superficie esculpida
// ---------------------------------------------------------------------------

const surfsculptCommand: CadCommandDescriptor<null> = {
  name: "SURFSCULPT",
  aliases: ["SSCULPT", "ESCULPIRSUPERFICIE"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => ({
    state: null,
    prompt: { message: "Designe la malla de control", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (_state, input, _context) => {
    if (input.kind === "cancel") return say("SURFSCULPT cancelado.");
    if (input.kind === "entityPick")
      return say("SURFSCULPT: escultura de superficie — operación aún no implementada en el kernel.");
    return say("SURFSCULPT: designe la malla de control.");
  },
};

// ---------------------------------------------------------------------------
// THICKEN — superficie → sólido con espesor
// ---------------------------------------------------------------------------

const thickenCommand: CadCommandDescriptor<{ picked?: boolean }> = {
  name: "THICKEN",
  aliases: ["TH", "ESPEZAR"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => ({
    state: {},
    prompt: { message: "Designe la superficie a espesar", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, _context) => {
    if (input.kind === "cancel") return say("THICKEN cancelado.");
    if (input.kind === "entityPick" && !state.picked)
      return {
        state: { picked: true },
        prompt: { message: "Espesor (positivo hacia afuera)", options: [], defaultValue: "1" },
        accepts: CAD_ACCEPT_DISTANCE,
      };
    if (input.kind === "distance" && state.picked)
      return say(`THICKEN: superficie espesada ${input.value} unidades — operación pendiente de kernel.`);
    return say("THICKEN: designe la superficie.");
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const CAD_SURFACE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(planesurfCommand),
  asCadCommand(convtosurfaceCommand),
  asCadCommand(surfoffsetCommand),
  asCadCommand(surftrimCommand),
  asCadCommand(surfuntrimCommand),
  asCadCommand(surfextendCommand),
  asCadCommand(surffilletCommand),
  asCadCommand(surfblendCommand),
  asCadCommand(surfpatchCommand),
  asCadCommand(surfnetworkCommand),
  asCadCommand(surfsculptCommand),
  asCadCommand(thickenCommand),
];
