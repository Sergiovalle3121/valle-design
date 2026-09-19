/**
 * FIND — búsqueda y reemplazo de texto en el dibujo.
 *
 * Busca la cadena tecleada en todas las entidades TEXT y MTEXT del espacio
 * activo y reporta cuántas coincidencias encontró. La palabra clave «Reemplazar»
 * permite sustituirlas todas de una vez.
 *
 * Es una de las órdenes más usadas en AutoCAD para corregir rótulos masivos
 * (números de local, nombres de calle, textos de cotas) sin tener que abrir
 * cada entidad a mano.
 */
import {
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandInput,
  CAD_ACCEPT_KEYWORD,
} from "../command-types";
import type { CadEntityCommand } from "../../entity-commands";

interface FindState {
  phase: "pattern" | "replace-prompt" | "replacement-text" | "done";
  pattern: string;
  replaceWith: string;
  matches: Array<{ entityId: string; originalText: string }>;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTextEntities(
  context: CadCommandContext,
  pattern: string,
): Array<{ entityId: string; originalText: string }> {
  const results: Array<{ entityId: string; originalText: string }> = [];
  const re = new RegExp(escapeRegex(pattern), "gi");
  for (const id of context.entityIds) {
    const entity = context.entity?.(id);
    if (!entity) continue;
    if (entity.type === "text" || entity.type === "mtext") {
      if (re.test(entity.text)) {
        results.push({ entityId: id, originalText: entity.text });
      }
    }
  }
  return results;
}

function extractText(input: CadCommandInput): string | undefined {
  return input.kind === "text" ? input.value : undefined;
}

function extractKeyword(input: CadCommandInput): string | undefined {
  return input.kind === "keyword" ? input.keyword : undefined;
}

const findCommand: CadCommandDescriptor<FindState> = {
  name: "FIND",
  aliases: ["BUSCAR", "HALLAR"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: () => ({
    state: { phase: "pattern", pattern: "", replaceWith: "", matches: [] },
    prompt: { message: "Texto a buscar:", options: [] },
    accepts: 0,
  }),
  step: (state, input, context) => {
    if (state.phase === "pattern") {
      const pattern = extractText(input)?.trim();
      if (!pattern) {
        return {
          state: { ...state, phase: "done" },
          prompt: { message: "", options: [] },
          accepts: 0,
          result: { kind: "message", text: "Búsqueda cancelada." },
        };
      }
      const matches = findTextEntities(context, pattern);
      if (matches.length === 0) {
        return {
          state: { ...state, phase: "done", pattern },
          prompt: { message: "", options: [] },
          accepts: 0,
          result: { kind: "message", text: `«${pattern}» no se encontró en ninguna entidad de texto.` },
        };
      }
      return {
        state: { ...state, phase: "replace-prompt", pattern, matches },
        prompt: {
          message: `${matches.length} coincidencia(s) encontrada(s). [R]eemplazar / Intro para terminar`,
          options: [{ keyword: "Reemplazar", shortcut: "R", label: "Reemplazar" }],
        },
        accepts: CAD_ACCEPT_KEYWORD,
        result: { kind: "message", text: `${matches.length} coincidencia(s) de «${pattern}».` },
      };
    }

    if (state.phase === "replace-prompt") {
      const keyword = extractKeyword(input);
      if (keyword === "R") {
        return {
          state: { ...state, phase: "replacement-text" },
          prompt: { message: `Reemplazar «${state.pattern}» por:`, options: [] },
          accepts: 0,
        };
      }
      return {
        state: { ...state, phase: "done" },
        prompt: { message: "", options: [] },
        accepts: 0,
        result: { kind: "message", text: `${state.matches.length} coincidencia(s) encontrada(s), sin cambios.` },
      };
    }

    if (state.phase === "replacement-text") {
      const replaceWith = extractText(input) ?? "";
      const re = new RegExp(escapeRegex(state.pattern), "gi");
      const commands: CadEntityCommand[] = state.matches.map((m) => ({
        type: "properties" as const,
        entityId: m.entityId,
        patch: {
          text: m.originalText.replace(re, replaceWith),
        },
      }));
      return {
        state: { ...state, phase: "done", replaceWith },
        prompt: { message: "", options: [] },
        accepts: 0,
        result: {
          kind: "document",
          commands,
          label: "FIND",
          notice: `${state.matches.length} coincidencia(s) reemplazadas.`,
        },
      };
    }

    return {
      state: { ...state, phase: "done" },
      prompt: { message: "", options: [] },
      accepts: 0,
      result: { kind: "message", text: "Búsqueda terminada." },
    };
  },
};

export const CAD_FIND_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(findCommand),
];
