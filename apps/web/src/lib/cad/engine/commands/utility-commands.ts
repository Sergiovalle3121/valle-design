/**
 * ABOUT, STATUS, TIME y VIEWRES — comandos informativos de AutoCAD.
 *
 * ABOUT muestra versión del producto. STATUS muestra estadísticas del dibujo.
 * TIME muestra fechas y tiempo de edición del dibujo.
 * VIEWRES controla la resolución de visualización de arcos y círculos.
 * Ninguno muta el documento (VIEWRES modifica una variable de sistema, no entidades).
 */
import {
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

type VoidState = Record<string, never>;
const EMPTY: VoidState = {};

function messageResult(text: string): CadCommandStep<VoidState> {
  return { state: EMPTY, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

// ---------------------------------------------------------------------------
// ABOUT
// ---------------------------------------------------------------------------

const aboutCommand: CadCommandDescriptor<VoidState> = {
  name: "ABOUT",
  aliases: ["ACERCADE"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: () => ({
    state: EMPTY,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "message",
      text: "VALLECAD — CAD general en el navegador. Compatibilidad DXF/DWG (beta). https://vallecad.com",
    },
  }),
  step: () => messageResult(
    "VALLECAD — CAD general en el navegador. Compatibilidad DXF/DWG (beta). https://vallecad.com",
  ),
};

// ---------------------------------------------------------------------------
// STATUS
// ---------------------------------------------------------------------------

const statusCommand: CadCommandDescriptor<VoidState> = {
  name: "STATUS",
  aliases: ["ESTADO"],
  kind: "inquiry",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => messageResult(buildStatus(context)),
  step: (_state, _input, context) => messageResult(buildStatus(context)),
};

function buildStatus(context: CadCommandContext): string {
  const entityCount = context.entityIds.length;
  const doc = context.document?.();
  const layerCount = doc ? Object.keys(doc.layers ?? {}).length : 0;
  const blockCount = doc ? Object.keys(doc.blocks ?? {}).length : 0;
  const space = doc?.modelSpace ? "Modelo" : "—";
  const parts = [
    `Entidades: ${entityCount}`,
    `Capas: ${layerCount}`,
    `Bloques: ${blockCount}`,
    `Espacio: ${space}`,
  ];
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// TIME
// ---------------------------------------------------------------------------

function formatCadTime(date: Date | string | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });
}

function buildTimeReport(context: CadCommandContext): string {
  const doc = context.document?.();
  const version = doc?.meta?.version;
  const unit = doc?.meta?.unit;
  const now = new Date();
  const parts = [
    `Fecha actual: ${formatCadTime(now)}`,
    `Versión del dibujo: ${version ?? "—"}`,
    `Unidad: ${unit ?? "—"}`,
  ];
  return parts.join("\n");
}

const timeCommand: CadCommandDescriptor<VoidState> = {
  name: "TIME",
  aliases: ["TIEMPO"],
  kind: "inquiry",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => messageResult(buildTimeReport(context)),
  step: (_state, _input, context) => messageResult(buildTimeReport(context)),
};

// ---------------------------------------------------------------------------
// VIEWRES
// ---------------------------------------------------------------------------

interface ViewresState {
  value: number;
}

const viewresCommand: CadCommandDescriptor<ViewresState> = {
  name: "VIEWRES",
  aliases: ["VRES"],
  kind: "view",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => {
    const current = context.variables?.get("VIEWRES") ?? 1000;
    const val = typeof current === "number" ? current : 1000;
    return {
      state: { value: val },
      prompt: { message: `¿Rapidez de visualización para círculos y arcos? <${val}>`, options: [] },
      accepts: 0,
      result: { kind: "message", text: `Rapidez de visualización actual: ${val}` },
    };
  },
  step: (_state, _input, context) => {
    const current = context.variables?.get("VIEWRES") ?? 1000;
    const val = typeof current === "number" ? current : 1000;
    return {
      state: { value: val },
      prompt: { message: "", options: [] },
      accepts: 0,
      result: { kind: "message", text: `Rapidez de visualización: ${val} (1–20000)` },
    };
  },
};

export const CAD_UTILITY_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(aboutCommand),
  asCadCommand(statusCommand),
  asCadCommand(timeCommand),
  asCadCommand(viewresCommand),
];
