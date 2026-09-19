/**
 * ABOUT y STATUS — comandos informativos de AutoCAD.
 *
 * ABOUT muestra versión del producto. STATUS muestra estadísticas del dibujo
 * (entidades, capas, espacio activo). Ninguno muta el documento.
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
  step: (_state) => messageResult(
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

export const CAD_UTILITY_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(aboutCommand),
  asCadCommand(statusCommand),
];
