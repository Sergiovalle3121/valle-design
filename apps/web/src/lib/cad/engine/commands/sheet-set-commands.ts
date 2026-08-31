/**
 * PUBLISH y SHEETSET: el juego de planos como orden tecleable.
 *
 * `lib/cad/sheet-set/` llevaba 1.632 líneas escritas y probadas —numeración
 * automática, campos que se resuelven solos, publicación por lotes a un único
 * PDF paginado con su portada— desde antes de esta campaña. `plot-host.ts` ya
 * sabía atender `{kind:"publish"}` y `plot-host.spec.ts` ya lo probaba contra
 * bytes de PDF reales. Lo único que faltaba, y es justo lo que la regla 6 de
 * este repositorio no deja contar como implementado, era el COMANDO: ningún
 * nombre en el registro llegaba hasta ahí. Un usuario no podía teclear
 * `PUBLISH` pasara lo que pasara.
 *
 * ## El límite que este archivo declara, no esconde
 *
 * Los dos comandos alcanzan de verdad `CAD_COMMAND_REGISTRY_V2` — el registro
 * real del producto, el mismo que usan los otros ~192 comandos— y su
 * anfitrión (`plot-host.ts`) ya está probado contra un conjunto cargado a
 * mano. Lo que SIGUE sin estar enchufado es la carga del conjunto DESDE la
 * API en el estudio real: `Layout3DEditor.tsx` está en su techo exacto
 * (19.002/19.002 líneas, 135/135 `useState`) y `check:cad` prohíbe tocarlo —
 * una línea más es un rojo. Sin ese último cable, PUBLISH y SHEETSET
 * responden hoy «el conjunto … no está cargado en este estudio», que es la
 * respuesta HONESTA y no una promesa vacía: ver el PR para el detalle.
 */
import {
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import type { CadHostRequest } from "../host-requests";
import { cadCommandCancelled } from "./annotate-support";

function host(request: CadHostRequest, label: string): CadCommandStep<never> {
  return { state: undefined as never, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "host", request, label } };
}

// ---------------------------------------------------------------------------
// PUBLISH
// ---------------------------------------------------------------------------

interface PublishState {
  sheetSetId?: string;
}

function publishStep(state: PublishState): CadCommandStep<PublishState> {
  if (!state.sheetSetId)
    return {
      state,
      prompt: { message: "Indique el identificador del conjunto de planos a publicar", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: {
      message: "Hojas a publicar, separadas por coma — Intro para publicar todas",
      options: [],
      defaultValue: "todas",
    },
    accepts: CAD_ACCEPT_TEXT,
  };
}

const publishCommand: CadCommandDescriptor<PublishState> = {
  name: "PUBLISH",
  aliases: ["PUBLICAR"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  // No muta EL DOCUMENTO abierto: publica un conjunto aparte, como PLOT traza
  // sin mutar el dibujo que traza.
  mutates: false,
  cursor: "none",
  begin: () => publishStep({}),
  step: (state, input) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (!state.sheetSetId) {
      if (input.kind !== "text" || !input.value.trim())
        return publishStep(state);
      return publishStep({ sheetSetId: input.value.trim() });
    }
    if (input.kind === "enter")
      return host({ kind: "publish", sheetSetId: state.sheetSetId }, "PUBLISH");
    if (input.kind !== "text") return publishStep(state);
    const token = input.value.trim();
    const sheetIds = token
      .split(",")
      .map((piece) => piece.trim())
      .filter((piece) => piece.length > 0);
    return host(
      {
        kind: "publish",
        sheetSetId: state.sheetSetId,
        ...(sheetIds.length > 0 ? { sheetIds } : {}),
      },
      "PUBLISH",
    );
  },
};

// ---------------------------------------------------------------------------
// SHEETSET
// ---------------------------------------------------------------------------

const SHEETSET_OPTIONS = [
  { keyword: "Añadir", shortcut: "A" },
  { keyword: "Renumerar", shortcut: "R" },
  { keyword: "Índice", shortcut: "I" },
] as const;

type SheetSetStep = "id" | "action" | "documentId" | "layoutId" | "title";

interface SheetSetState {
  step: SheetSetStep;
  sheetSetId?: string;
  documentId?: string;
  layoutId?: string;
}

const SHEETSET_PROMPTS: Record<SheetSetStep, string> = {
  id: "Indique el identificador del conjunto de planos",
  action: "Indique qué hacer con el conjunto",
  documentId: "Indique el identificador del dibujo de la hoja nueva",
  layoutId: "Indique el identificador de la presentación de esa hoja",
  title: "Indique el título de la hoja",
};

function sheetSetStep(state: SheetSetState): CadCommandStep<SheetSetState> {
  return {
    state,
    prompt: {
      message: SHEETSET_PROMPTS[state.step],
      options: state.step === "action" ? SHEETSET_OPTIONS : [],
    },
    accepts: state.step === "action" ? CAD_ACCEPT_KEYWORD : CAD_ACCEPT_TEXT,
  };
}

const sheetSetCommand: CadCommandDescriptor<SheetSetState> = {
  name: "SHEETSET",
  aliases: ["SSM"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  // El conjunto NO vive en el documento abierto — es su propia tabla, como el
  // `.dst` de AutoCAD — así que esta orden no muta el dibujo. La escritura de
  // verdad (renumerar, añadir una hoja) la hace el anfitrión sobre SU tabla.
  mutates: false,
  cursor: "none",
  begin: () => sheetSetStep({ step: "id" }),
  step: (state, input) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (input.kind === "keyword" && state.step === "action") {
      if (input.keyword === "Renumerar")
        return host(
          { kind: "sheet-set-command", action: "renumber", sheetSetId: state.sheetSetId! },
          "SHEETSET",
        );
      if (input.keyword === "Índice")
        return host(
          { kind: "sheet-set-command", action: "list", sheetSetId: state.sheetSetId! },
          "SHEETSET",
        );
      if (input.keyword === "Añadir") return sheetSetStep({ ...state, step: "documentId" });
      return sheetSetStep(state);
    }
    if (input.kind !== "text" || !input.value.trim()) return sheetSetStep(state);
    const value = input.value.trim();
    switch (state.step) {
      case "id":
        return sheetSetStep({ ...state, sheetSetId: value, step: "action" });
      case "documentId":
        return sheetSetStep({ ...state, documentId: value, step: "layoutId" });
      case "layoutId":
        return sheetSetStep({ ...state, layoutId: value, step: "title" });
      case "title":
        return host(
          {
            kind: "sheet-set-command",
            action: "add",
            sheetSetId: state.sheetSetId!,
            sheet: { documentId: state.documentId!, layoutId: state.layoutId!, title: value },
          },
          "SHEETSET",
        );
      default:
        return sheetSetStep(state);
    }
  },
};

export const CAD_SHEET_SET_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(publishCommand),
  asCadCommand(sheetSetCommand),
];
