/**
 * REGION: contornos cerrados a partir de lo designado.
 *
 * El algoritmo vive en `lib/cad/regions.ts`; aquí sólo está la máquina de
 * estados. La separación no es estética: encadenar bordes por sus extremos es
 * lo que hay que probar con veinte casos, y probarlo a través de un comando
 * obligaría a montar un contexto por caso.
 *
 * REGION emite UN lote aunque convierta doce líneas en tres regiones. Con un
 * lote por región, Ctrl+Z devolvería una sola y el dibujo quedaría a medias
 * entre dos estados que el usuario nunca pidió.
 */
import { planCadRegions } from "../../regions";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import type { CadEntity } from "../../cad-document";

interface RegionState {
  targets: readonly string[];
}

function pendingSelection(state: RegionState): CadCommandStep<RegionState> {
  return {
    state,
    prompt: { message: "Designe objetos para la región", options: [] },
    accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  };
}

function done(state: RegionState, text: string): CadCommandStep<RegionState> {
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text },
  };
}

function regionResult(
  targets: readonly string[],
  context: CadCommandContext,
): CadCommandStep<RegionState> {
  const state = { targets };
  const entities = targets
    .map((entityId) => context.entity?.(entityId))
    .filter((entity): entity is CadEntity => entity !== undefined);
  if (entities.length === 0) return done(state, "REGION: no hay ningún objeto designado.");

  const plan = planCadRegions(entities, {
    newEntityId: context.newEntityId,
    layer: context.activeLayer,
  });

  if (plan.commands.length === 0)
    return done(
      state,
      plan.rejected.length > 0
        ? plan.rejected.join("\n")
        : "REGION: lo designado ya eran regiones; no hay nada que convertir.",
    );

  const summary = [
    `REGION: ${plan.created} región(es) creada(s), ${plan.tagged} contorno(s) ya cerrado(s) marcado(s).`,
    ...plan.rejected,
  ].join("\n");
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    // El resumen viaja como etiqueta de la transacción, y los rechazos salen
    // aparte: quien deshace ve «REGION» en la historia, no un párrafo.
    result: { kind: "document", commands: plan.commands, label: summary.split("\n")[0] },
  };
}

const regionCommand: CadCommandDescriptor<RegionState> = {
  name: "REGION",
  aliases: ["REG"],
  kind: "draw",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    context.selection.length > 0
      ? regionResult(context.selection, context)
      : pendingSelection({ targets: [] }),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "selection") return regionResult(input.entityIds, context);
    if (input.kind === "entityPick") return regionResult([input.entityId], context);
    if (input.kind === "enter") return regionResult(state.targets, context);
    return pendingSelection(state);
  },
};

export const CAD_REGION_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(regionCommand)];
