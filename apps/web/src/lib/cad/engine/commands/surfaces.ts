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
import type { CadEntity } from "../../cad-document";
import {
  asCadCommand,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  type CadAnyCommandDescriptor,
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

    // PLANESURF requiere teselación del contorno cerrado para generar la malla
    // de superficie. Hasta que el kernel lo soporte, rechaza la orden.
    return say(`PLANESURF: ${entities.length} entidad(es) detectadas — teselación de superficie plana pendiente del kernel.`);
  },
};

export const CAD_SURFACE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  // PLANESURF retirado (T18): dice «pendiente del kernel» sin mutar, la sonda lo marca ROJO
  // Stubs de superficie retirados (T18B): CONVTOSURFACE, SURFOFFSET, SURFTRIM,
  // SURFUNTRIM, SURFEXTEND, SURFFILLET, SURFBLEND, SURFPATCH, SURFNETWORK,
  // SURFSCULPT — todos pendientes del kernel de superficies.
];
