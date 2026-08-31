/**
 * LAYTRANS: capa de origen → capa de destino, tecleado en pares.
 *
 * Cada par se valida al momento —la capa de origen tiene que existir YA en el
 * documento, o LAYTRANS se niega con esa capa en vez de aceptar un mapa que
 * no va a mover nada—. `Fin` cierra la captura y aplica todo lo acumulado de
 * una vez, como un solo paso de deshacer.
 *
 * El mapa resultante se puede copiar del historial de comandos —lo emite
 * `serializeCadLayerTranslationMap`— y volver a pegar en una sesión futura
 * con RECOVER o con un futuro `LAYTRANS -`; guardarlo donde el despacho
 * guarde sus otros archivos es responsabilidad de quien lo copia, no de este
 * comando (ver la cabecera de `../../standards/laytrans.ts`).
 */
import { planCadLayerTranslation, serializeCadLayerTranslationMap, type CadLayerTranslationEntry } from "../../standards/laytrans";
import {
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const NO_PROMPT = { message: "", options: [] } as const;
const FIN = { keyword: "Fin", shortcut: "F" } as const;

function message<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "message", text } };
}

interface LaytransState {
  pendingFrom: string | null;
  entries: CadLayerTranslationEntry[];
}

function askSource(state: LaytransState): CadCommandStep<LaytransState> {
  return {
    state,
    prompt: {
      message: state.entries.length
        ? "Capa de origen (o Fin para aplicar lo acumulado)"
        : "Capa de origen a traducir (o Fin para salir)",
      options: [FIN],
    },
    accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
  };
}

function askDestination(state: LaytransState): CadCommandStep<LaytransState> {
  return {
    state,
    prompt: { message: `Capa de destino para «${state.pendingFrom}»`, options: [] },
    accepts: CAD_ACCEPT_TEXT,
  };
}

const laytransCommand: CadCommandDescriptor<LaytransState> = {
  name: "LAYTRANS",
  aliases: [],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: () => askSource({ pendingFrom: null, entries: [] }),
  step: (state, input, context: CadCommandContext) => {
    if (input.kind === "cancel") return message(state, "LAYTRANS cancelado: no se movió ninguna entidad.");

    if (state.pendingFrom === null) {
      const finishing = input.kind === "keyword" && input.keyword === FIN.keyword;
      if (finishing || input.kind === "enter") {
        if (state.entries.length === 0)
          return message(state, "LAYTRANS no tiene ninguna correspondencia que aplicar: no se hizo nada.");
        const document = context.document?.();
        if (!document)
          return message(state, "El anfitrión no expone el documento: LAYTRANS no puede aplicar el mapa.");
        const plan = planCadLayerTranslation(document, { entries: state.entries });
        const parts = [`LAYTRANS aplicó ${state.entries.length - plan.missingSourceLayers.length - plan.invalidDestinations.length} correspondencia(s)`];
        if (plan.missingSourceLayers.length)
          parts.push(`origen inexistente: ${plan.missingSourceLayers.join(", ")}`);
        if (plan.invalidDestinations.length)
          parts.push(`destino inválido: ${plan.invalidDestinations.map((entry) => entry.to).join(", ")}`);
        if (plan.commands.length === 0)
          return message(state, `${parts.join("; ")}. No se movió ninguna entidad.`);
        return {
          state,
          prompt: NO_PROMPT,
          accepts: 0,
          result: {
            kind: "document",
            commands: plan.commands,
            label: `LAYTRANS (${serializeCadLayerTranslationMap({ entries: state.entries })})`,
          },
        };
      }
      if (input.kind !== "text") return askSource(state);
      const from = input.value.trim();
      const document = context.document?.();
      const layers = document?.layers ?? context.layers?.() ?? [];
      if (!layers.some((layer) => layer.id === from))
        return message(state, `La capa «${from}» no existe en el dibujo: LAYTRANS no puede traducir lo que no está.`);
      return askDestination({ ...state, pendingFrom: from });
    }

    if (input.kind !== "text") return askDestination(state);
    const to = input.value.trim();
    if (!to) return askDestination(state);
    return askSource({
      pendingFrom: null,
      entries: [...state.entries, { from: state.pendingFrom, to }],
    });
  },
};

export const CAD_LAYTRANS_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(laytransCommand)];
