/**
 * RECOVER: pega el JSON de un documento canónico dañado y trae lo que se
 * pudo salvar al dibujo activo.
 *
 * ## Por qué "pegar texto" y no un selector de archivo
 *
 * `command-types.ts` es de otra sesión de esta misma campaña (los sólidos
 * 3D) y no se toca aquí: no hay forma de declarar un `CadUiTarget` nuevo
 * para un selector de archivo sin editar ese contrato compartido. `DXFIN`
 * resuelve esto con el target `"dxf-file"` que YA existe, pero es SUYO
 * —de la interoperabilidad DXF— y reutilizarlo para un JSON canónico
 * mezclaría dos formatos bajo el mismo selector. Aceptar el texto tal cual
 * —`CAD_ACCEPT_TEXT`, como cualquier otro campo largo de este motor— cabe
 * en el contrato de hoy sin tocar nada ajeno; el cuadro de "pegar/adjuntar"
 * concreto lo cablea quien tenga el selector de archivos en su territorio.
 *
 * ## Por qué "traer al activo" y no "sustituir el documento"
 *
 * El motor de comandos no tiene un resultado de tipo "reemplaza el
 * documento entero" —sólo lotes sobre el documento vivo (ver
 * `CadCommandResult` en `command-types.ts`)—, así que RECOVER trae lo
 * salvado como hace ADCENTER con un dibujo ajeno: entidades e ids NUEVOS,
 * insertadas en el activo. Abrir el archivo salvado como documento aparte
 * es una decisión del anfitrión (crear una pestaña/documento nuevo), no
 * un lote de entidades.
 *
 * Los INSERT recuperados NO se traen todavía: harían falta también sus
 * definiciones de bloque, y crear bloques por lote es otra ruta que esta
 * orden no abre en esta versión. Se cuentan aparte en el mensaje final —
 * «todavía no», nunca en silencio.
 */
import type { CadEntity } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import { recoverCadDocument } from "../../audit/recover";
import {
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const NO_PROMPT = { message: "", options: [] } as const;

function message<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "message", text } };
}

function nothing<S>(state: S): CadCommandStep<S> {
  return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "none" } };
}

const PROMPT = { message: "Pegue el JSON del documento dañado a recuperar", options: [] } as const;

const recoverCommand: CadCommandDescriptor<null> = {
  name: "RECOVER",
  aliases: [],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: () => ({ state: null, prompt: PROMPT, accepts: CAD_ACCEPT_TEXT }),
  step: (state, input, context: CadCommandContext) => {
    if (input.kind === "cancel" || input.kind === "enter") return nothing(state);
    if (input.kind !== "text")
      return message(state, "RECOVER espera el texto del documento; no se hizo nada.");

    let candidate: unknown;
    try {
      candidate = JSON.parse(input.value);
    } catch (error) {
      return message(
        state,
        `RECOVER no pudo interpretar el texto como JSON: ${error instanceof Error ? error.message : String(error)}. No se hizo nada.`,
      );
    }

    const outcome = recoverCadDocument(candidate);
    if (!outcome.document) {
      const reasons = outcome.manifest.lost.slice(0, 3).map((loss) => loss.reason).join(" ");
      return message(state, `RECOVER no pudo salvar nada: ${reasons || "el documento no era interpretable."}`);
    }

    const importable = outcome.document.entities.filter((entity) => entity.type !== "insert");
    const skippedInserts = outcome.document.entities.length - importable.length;

    if (importable.length === 0) {
      return message(
        state,
        outcome.manifest.totalEntities === 0
          ? "RECOVER no encontró ninguna entidad en el documento: no hay nada que traer."
          : `RECOVER no pudo traer ninguna entidad de ${outcome.manifest.totalEntities}: ${outcome.manifest.lost
              .slice(0, 3)
              .map((loss) => loss.reason)
              .join(" ")}`,
      );
    }

    const layerCommands: CadEntityCommand[] = outcome.document.layers
      .filter((layer) => layer.id !== "0")
      .map((layer) => ({ type: "layer", op: "upsert", layer }));
    const entityCommands: CadEntityCommand[] = importable.map((entity): CadEntityCommand => ({
      type: "insert",
      entity: { ...(entity as CadEntity), id: context.newEntityId() } as CadNativeEntity,
    }));

    const lostCount = outcome.manifest.lost.length;
    const parts = [`RECOVER trajo ${importable.length} de ${outcome.manifest.totalEntities} entidad(es)`];
    if (skippedInserts > 0) parts.push(`${skippedInserts} INSERT recuperado(s) sin sus bloques: todavía no se traen`);
    if (lostCount > 0) parts.push(`${lostCount} perdida(s) — vea el manifiesto`);
    if (outcome.manifest.layersSynthesized.length > 0)
      parts.push(`${outcome.manifest.layersSynthesized.length} capa(s) reconstruida(s) con apariencia por defecto`);

    return {
      state,
      prompt: NO_PROMPT,
      accepts: 0,
      result: { kind: "document", commands: [...layerCommands, ...entityCommands], label: parts.join("; ") },
    };
  },
};

export const CAD_RECOVER_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(recoverCommand)];
