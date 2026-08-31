/**
 * ETRANSMIT: empaqueta el dibujo abierto para entregarlo en otra máquina.
 *
 * El comando compone el ZIP ENTERO en el motor —es aritmética sobre bytes,
 * igual que `DXFOUT` compone su texto entero— y el anfitrión sólo entrega el
 * archivo. Así se prueba en Node comparando bytes reales, y el paquete no
 * depende de qué tan cargado esté el anfitrión que lo sirva.
 */
import { buildCadTransmittalPackage, describeCadTransmittalManifest } from "../../etransmit/etransmit";
import {
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused } from "./annotate-support";

const NO_DOCUMENT_VIEW =
  "Este espacio de trabajo no expone el documento entero: ETRANSMIT no puede empaquetarlo aquí.";

interface EtransmitState {
  askingName: boolean;
}

function ask(): CadCommandStep<EtransmitState> {
  return {
    state: { askingName: true },
    prompt: {
      message: "Indique el nombre del paquete, sin extensión",
      options: [],
      defaultValue: "el nombre del documento",
    },
    accepts: CAD_ACCEPT_TEXT,
  };
}

/**
 * `context.document()` sólo expone `CadCommandDocumentView` — las secciones
 * que un comando puede LEER (ni historial ni registro de publicaciones están
 * ahí, a propósito: no son asunto de un comando de dibujo). Para empaquetar
 * un documento que se abra igual en otra máquina hacen falta además las
 * presentaciones, las restricciones y los parámetros — capacidades PROPIAS
 * del contexto (`paperSpaces`, `constraints`, `parameters`), no de la vista
 * de documento. Lo que ninguna de las dos trae —historial, manifiesto de
 * pérdidas, publicaciones— se declara vacío y se NOMBRA en el manifiesto:
 * `omittedSections` es justamente para no fingir que viajó.
 */
const OMITTED_SECTIONS = ["el historial de cambios", "el registro de publicaciones"] as const;

function pack(name: string, context: CadCommandContext): CadCommandStep<EtransmitState> {
  const view = context.document?.();
  if (!view) return cadCommandRefused({ askingName: false }, NO_DOCUMENT_VIEW);
  const fullDocument: Parameters<typeof buildCadTransmittalPackage>[0]["document"] = {
    ...view,
    paperSpaces: context.paperSpaces?.() ? [...context.paperSpaces()] : [],
    constraints: context.constraints ? [...context.constraints] : [],
    ...(context.parameters ? { parameters: [...context.parameters] } : {}),
    history: [],
    lossManifest: [],
    publications: [],
  };
  const built = buildCadTransmittalPackage({
    document: fullDocument,
    documentName: name,
    generatedAt: new Date().toISOString().slice(0, 10),
    omittedSections: OMITTED_SECTIONS,
  });
  return {
    state: { askingName: false },
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "host",
      request: {
        kind: "etransmit",
        fileName: `${name}.zip`,
        bytes: built.zip,
        included: built.manifest.entries.filter((entry) => entry.included).map((entry) => entry.name),
        missing: built.manifest.entries.filter((entry) => !entry.included).map((entry) => entry.name),
      },
      label: describeCadTransmittalManifest(built.manifest),
    },
  };
}

const etransmitCommand: CadCommandDescriptor<EtransmitState> = {
  name: "ETRANSMIT",
  aliases: ["ETRANS"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  // No muta el documento: empaqueta una copia. Como PLOT.
  mutates: false,
  cursor: "none",
  begin: () => ask(),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (input.kind === "enter") return pack("dibujo", context);
    if (input.kind !== "text") return ask();
    const name = input.value.trim();
    return pack(name || "dibujo", context);
  },
};

export const CAD_ETRANSMIT_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(etransmitCommand)];
