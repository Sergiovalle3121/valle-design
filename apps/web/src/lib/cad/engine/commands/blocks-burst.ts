/**
 * BURST: el diálogo tecleado sobre `../../blocks/cad-burst.ts`.
 *
 * Mismo gesto que EXPLODE (`modify-join.ts`, de otra sesión): designar,
 * Enter, aplicar. Lo que no se pudo estallar se cuenta aunque otras piezas
 * de la misma designación sí se resolvieran — tratar tres bloques de cinco y
 * callarse los otros dos deja creyendo que se trataron los cinco.
 */
import type { CadEntity } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { cadBurstCommands } from "../../blocks/cad-burst";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const NO_PROMPT = { message: "", options: [] } as const;
const ASK = { message: "Designe los bloques a estallar conservando los atributos", options: [] } as const;

function message<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "message", text } };
}

function nothing<S>(state: S): CadCommandStep<S> {
  return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "none" } };
}

interface BurstState {
  targets: string[];
}

function asking(state: BurstState): CadCommandStep<BurstState> {
  return { state, prompt: ASK, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
}

const burstCommand: CadCommandDescriptor<BurstState> = {
  name: "BURST",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => asking({ targets: [...context.selection] }),
  step: (state, input, context: CadCommandContext) => {
    if (input.kind === "cancel") return nothing(state);
    if (input.kind === "entityPick") return asking({ targets: [...new Set([...state.targets, input.entityId])] });
    if (input.kind === "selection") return asking({ targets: [...new Set([...state.targets, ...input.entityIds])] });
    if (input.kind !== "enter") return asking(state);

    if (state.targets.length === 0) return message(state, "BURST no tiene ningún objeto designado; no se hizo nada.");
    if (!context.blocks)
      return message(state, "El anfitrión no ha expuesto las definiciones de bloque: BURST no puede resolver el INSERT.");

    const blocks = context.blocks;
    const commands: CadEntityCommand[] = [];
    const refusals: string[] = [];
    let attributesRescued = 0;
    let degraded = 0;
    for (const id of state.targets) {
      const entity: CadEntity | undefined = context.entity?.(id);
      if (!entity) {
        refusals.push(`${id}: ya no existe; no se hizo nada con este objeto.`);
        continue;
      }
      if (entity.type !== "insert") {
        refusals.push(`${id}: BURST sólo aplica a bloques (INSERT); no se hizo nada con este objeto.`);
        continue;
      }
      const outcome = cadBurstCommands(entity, { blocks, newEntityId: context.newEntityId });
      if (typeof outcome === "string") {
        refusals.push(outcome);
        continue;
      }
      commands.push(...outcome.commands);
      attributesRescued += outcome.attributeTexts;
      if (outcome.degradedAttributePlacement) degraded += 1;
    }

    if (commands.length === 0)
      return message(state, refusals.length > 0 ? `BURST: ${refusals.join(" ")}` : "BURST no hizo nada.");

    const parts = [`BURST estalló ${state.targets.length - refusals.length} bloque(s)`];
    if (attributesRescued > 0) parts.push(`${attributesRescued} atributo(s) conservado(s) como texto`);
    if (degraded > 0) parts.push(`${degraded} sin geometría posicionada: apilados bajo su punto de inserción`);
    if (refusals.length > 0) parts.push(`sin resolver: ${refusals.join(" ")}`);

    return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "document", commands, label: parts.join("; ") } };
  },
};

export const CAD_BURST_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(burstCommand)];
