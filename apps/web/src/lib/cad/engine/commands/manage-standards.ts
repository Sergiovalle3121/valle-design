/**
 * CHECKSTANDARDS: comprobar el dibujo activo contra el estándar de la oficina.
 *
 * Sólo INFORMA. AutoCAD real deja que CHECKSTANDARDS corrija un problema a la
 * vez; aquí no —corregir en el sitio exigiría reabrir el mismo diálogo de
 * confirmación que AUDIT y LAYTRANS ya resuelven, y esta orden se queda en su
 * mitad más simple y más segura: decir qué difiere, sin tocar nada. Corregir
 * una capa mal declarada ya es LAYTRANS o LAYER; esta orden es la lista, no
 * el arreglo.
 */
import { checkCadDocumentAgainstMexicanStandard } from "../../standards/office-standard";
import {
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

function summarize(context: CadCommandContext): string {
  const document = context.document?.();
  if (!document) return "El anfitrión no expone el documento: CHECKSTANDARDS no puede revisarlo.";
  const scaleDenominator = 50;
  let deviations;
  try {
    deviations = checkCadDocumentAgainstMexicanStandard(document, {
      scaleDenominator,
      unit: context.unit ?? "mm",
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  if (deviations.length === 0)
    return `CHECKSTANDARDS (1:${scaleDenominator}): el dibujo sigue el estándar de capas y anotación de la oficina.`;
  const lines = deviations.map((deviation) => `${deviation.title}: ${deviation.message}`);
  return `CHECKSTANDARDS (1:${scaleDenominator}) encontró ${deviations.length} desviación(es) — ${lines.join(" · ")}`;
}

const checkStandardsCommand: CadCommandDescriptor<null> = {
  name: "CHECKSTANDARDS",
  aliases: ["STANDARDS", "CHK"],
  kind: "inquiry",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: false,
  cursor: "none",
  begin: (context) => message(null, summarize(context)),
  // Nunca se alcanza: `begin` siempre resuelve con `result`. Existe sólo
  // porque el contrato del descriptor lo exige.
  step: (state) => nothing(state),
};

export const CAD_CHECKSTANDARDS_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(checkStandardsCommand)];
