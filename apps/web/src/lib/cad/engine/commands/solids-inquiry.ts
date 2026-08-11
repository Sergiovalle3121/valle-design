/**
 * SWEEP, LOFT e INTERFERE.
 *
 * Los dos primeros crean sólidos a partir de varias entidades a la vez; el
 * último no escribe nada y responde con un número. Van juntos porque comparten
 * la parte difícil: leer varias entidades designadas y decidir qué papel juega
 * cada una.
 *
 * ## SWEEP: qué es el perfil y qué es el camino
 *
 * El PRIMER objeto designado que encierra un área es la sección; el primero que
 * describe un recorrido es el camino. Decidirlo por su geometría y no por el
 * orden de designación evita el error más común de esta orden —designarlos al
 * revés— sin añadir un paso al diálogo.
 *
 * El perfil entra RECENTRADO en su centroide (ver `centeredProfile`): la sección
 * se coloca sobre el camino, así que un perfil dibujado lejos del origen pasado
 * tal cual produciría un barrido hueco y desplazado mil unidades.
 *
 * ## Dónde está MASSPROP
 *
 * En `inquiry-list.ts`, junto a LIST, y no aquí. Esa otra ola escribió la mitad
 * de las regiones 2D y dejó la de los sólidos apartándose con un mensaje; esta
 * rellena ese hueco en su propio archivo en vez de registrar un segundo comando
 * con el mismo nombre. El reparto es por TIPO DE OBJETO DESIGNADO, no por
 * comando: una sola orden, y quien designe las dos cosas recibe las dos
 * respuestas.
 */
import type { CadEntity } from "../../cad-document";
import type { CadSolidNode } from "../../cad-entities-v5";
import type { CadEntityCommand } from "../../entity-commands";
import { solid3dBody } from "../../solid3d-build";
import {
  centeredProfile,
  pathOfEntity,
  planeFrameAt,
  profileFromEntity,
  type CadExtractedProfile,
} from "../../solid3d-profiles";
import { booleanEpsilon, meshVolume, tessellateBody, tryBoolean } from "../../../brep";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import {
  finishedSolid,
  formatMagnitude,
  makeSolidEntity,
  selectedEntities,
  selectedSolids,
  solidCancelled,
  solidMessage,
} from "./solids-support";

interface SelectionState {
  selection: readonly string[];
}

function designate<S extends SelectionState>(state: S, message: string): CadCommandStep<S> {
  return { state, prompt: { message, options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
}

/** Descriptor de designar-y-Enter, que es la forma de los cuatro comandos. */
function selectionDescriptor(
  name: string,
  aliases: readonly string[],
  kind: "draw" | "inquiry",
  prompt: string,
  run: (state: SelectionState, context: CadCommandContext) => CadCommandStep<SelectionState>,
): CadCommandDescriptor<SelectionState> {
  return {
    name,
    aliases,
    kind,
    transparent: false,
    selection: "optional",
    repeatable: true,
    mutates: kind !== "inquiry",
    cursor: "pick",
    // Semántica PICKFIRST: con una designación previa, la orden se ejecuta al
    // teclearla. Pedir un Intro sobre objetos que el usuario acaba de designar
    // es un paso que no decide nada.
    begin: (context) =>
      context.selection.length > 0
        ? run({ selection: context.selection }, context)
        : designate({ selection: context.selection }, prompt),
    step: (state, input, context) => {
      if (input.kind === "cancel") return solidCancelled(state);
      if (input.kind === "selection") return designate({ selection: input.entityIds }, prompt);
      if (input.kind === "entityPick")
        return designate({ selection: [...new Set([...state.selection, input.entityId])] }, prompt);
      if (input.kind !== "enter") return designate(state, prompt);
      return run(state, context);
    },
  };
}

// ---------------------------------------------------------------------------
// SWEEP
// ---------------------------------------------------------------------------

function sweepRun(state: SelectionState, context: CadCommandContext): CadCommandStep<SelectionState> {
  const entities = selectedEntities(context, state.selection);
  let profile: CadExtractedProfile | null = null;
  let path: CadEntity | null = null;
  for (const entity of entities) {
    const extracted = profileFromEntity(entity);
    if (extracted && !profile) {
      profile = extracted;
      continue;
    }
    if (!path && pathOfEntity(entity).length >= 2) path = entity;
  }
  if (!profile) return solidMessage(state, "SWEEP necesita un contorno CERRADO como sección.");
  if (!path) return solidMessage(state, "SWEEP necesita además un recorrido: una línea, una polilínea, un arco o una spline.");

  const points = pathOfEntity(path);
  const node: CadSolidNode = {
    id: "barrido",
    op: "sweep",
    profile: centeredProfile(profile.profile),
    path: points,
  };
  const solid = makeSolidEntity(context.newEntityId(), [node], "barrido", context.activeLayer);
  const finished = finishedSolid(solid, {
    state,
    label: "SWEEP",
    before: [
      { type: "delete", entityId: profile.sourceId },
      { type: "delete", entityId: path.id },
    ],
  });
  return finished;
}

// ---------------------------------------------------------------------------
// LOFT
// ---------------------------------------------------------------------------

function loftRun(state: SelectionState, context: CadCommandContext): CadCommandStep<SelectionState> {
  const profiles: CadExtractedProfile[] = [];
  for (const entity of selectedEntities(context, state.selection)) {
    const extracted = profileFromEntity(entity);
    if (extracted) profiles.push(extracted);
  }
  if (profiles.length < 2)
    return solidMessage(state, `LOFT necesita al menos DOS secciones cerradas designadas; hay ${profiles.length}.`);

  // Las secciones se ordenan por COTA. Solevar en el orden en que se designaron
  // produce una pieza retorcida en cuanto alguien pincha la de arriba primero, y
  // el resultado es válido —así que nadie lo detecta— y absurdo.
  const ordered = [...profiles].sort((a, b) => a.elevation - b.elevation);
  const elevations = new Set(ordered.map((profile) => profile.elevation));
  if (elevations.size !== ordered.length)
    return solidMessage(
      state,
      "Hay dos secciones a la MISMA cota. Un solevado entre ellas tendría altura cero: dales elevaciones distintas.",
    );

  const node: CadSolidNode = {
    id: "solevado",
    op: "loft",
    sections: ordered.map((profile) => ({ profile: profile.profile, frame: planeFrameAt(profile.elevation) })),
    steps: 4,
  };
  const solid = makeSolidEntity(context.newEntityId(), [node], "solevado", context.activeLayer);
  return finishedSolid(solid, {
    state,
    label: "LOFT",
    before: ordered.map((profile): CadEntityCommand => ({ type: "delete", entityId: profile.sourceId })),
  });
}

// ---------------------------------------------------------------------------
// INTERFERE
// ---------------------------------------------------------------------------

function interfereRun(state: SelectionState, context: CadCommandContext): CadCommandStep<SelectionState> {
  const solids = selectedSolids(context, state.selection);
  if (solids.length < 2)
    return solidMessage(state, `INTERFERE necesita al menos DOS sólidos designados; hay ${solids.length}.`);

  const findings: string[] = [];
  for (let i = 0; i < solids.length; i += 1) {
    for (let j = i + 1; j < solids.length; j += 1) {
      let overlap: number | null = null;
      try {
        const a = solid3dBody(solids[i]);
        const b = solid3dBody(solids[j]);
        // `tryBoolean` devuelve `null` cuando el resultado es VACÍO, que es el
        // caso normal —dos piezas que no chocan— y no un error. Distinguirlo de
        // un fallo real es exactamente lo que esta orden tiene que decir.
        const body = tryBoolean("intersection", a, b, { tolerance: { linear: booleanEpsilon(a, b) } });
        overlap = body ? Math.abs(meshVolume(tessellateBody(body))) : 0;
      } catch (error) {
        findings.push(
          `${solids[i].id} ∩ ${solids[j].id}: no se pudo calcular — ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
      if (overlap > 0)
        findings.push(`${solids[i].id} ∩ ${solids[j].id}: INTERFIEREN, volumen común ${formatMagnitude(overlap)}`);
    }
  }
  if (findings.length === 0)
    return solidMessage(state, `Ninguno de los ${solids.length} sólidos designados interfiere con otro.`);
  return solidMessage(state, findings.join("\n"));
}

export const CAD_SOLID_INQUIRY_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  selectionDescriptor("SWEEP", [], "draw", "Designe la sección cerrada y el recorrido del barrido", sweepRun),
  selectionDescriptor("LOFT", [], "draw", "Designe dos o más secciones cerradas a cotas distintas", loftRun),
  selectionDescriptor("INTERFERE", ["INF"], "inquiry", "Designe los sólidos entre los que buscar interferencias", interfereRun),
].map(asCadCommand);
