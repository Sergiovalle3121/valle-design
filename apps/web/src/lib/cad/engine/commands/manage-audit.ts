/**
 * AUDIT: recorre el documento y dice qué está mal — y lo repara si se le pide.
 *
 * El mismo defecto de confianza que PURGE resuelve con su previsualización se
 * repite aquí y con más motivo: un AUDIT que arregla en silencio es peor que
 * uno que no arregla nada, porque nadie sabe qué perdió al deshacer. Por eso
 * el flujo es idéntico al de PURGE — contar, mostrar, PREGUNTAR, y sólo
 * entonces tocar el documento — y por eso la opción por defecto de la
 * pregunta es NO.
 *
 * El análisis en sí no vive aquí: `../../audit/report.ts` junta geometría
 * degenerada, referencias colgantes, huérfanos de PURGE y duplicados de
 * OVERKILL. Este archivo es sólo el diálogo tecleado sobre ese informe.
 */
import { cadAuditRepairCommands, buildCadAuditReport, type CadAuditReport } from "../../audit/report";
import {
  CAD_ACCEPT_KEYWORD,
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

interface AuditState {
  report: CadAuditReport | null;
}

const AUDIT_YES = { keyword: "Sí", shortcut: "S" } as const;
const AUDIT_NO = { keyword: "No", shortcut: "N" } as const;

/** Un renglón por categoría, con su cuenta. Es la previsualización. */
function auditSummary(report: CadAuditReport): string {
  const byCategory = new Map<string, number>();
  for (const finding of report.findings)
    byCategory.set(finding.category, (byCategory.get(finding.category) ?? 0) + 1);
  const label: Record<string, string> = {
    geometry: "geometría degenerada",
    reference: "referencias rotas",
    orphan: "sin usar",
    duplicate: "duplicados",
  };
  return [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, count]) => `${count} ${label[category] ?? category}`)
    .join(" · ");
}

function auditReport(context: CadCommandContext): CadAuditReport | string {
  const document = context.document?.();
  if (!document)
    return "El anfitrión no expone el documento: AUDIT no puede analizarlo.";
  return buildCadAuditReport(document, { activeLayer: context.activeLayer });
}

const auditCommand: CadCommandDescriptor<AuditState> = {
  name: "AUDIT",
  aliases: [],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    const report = auditReport(context);
    if (typeof report === "string") return message({ report: null }, report);
    if (report.findings.length === 0)
      return message({ report }, "AUDIT: no se encontró ningún defecto. El documento pasa la revisión.");
    return {
      state: { report },
      prompt: {
        message: `AUDIT encontró — ${auditSummary(report)}. ¿Reparar automáticamente lo reparable?`,
        options: [AUDIT_YES, AUDIT_NO],
        defaultOption: AUDIT_NO.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  },
  step: (state, input, context) => {
    const confirmedYes = input.kind === "keyword" && input.keyword === AUDIT_YES.keyword;
    if (!confirmedYes) {
      const count = state.report?.findings.length ?? 0;
      return message(state, `AUDIT no reparó nada: se informaron ${count} defecto(s), a la espera de confirmación.`);
    }
    if (!state.report) return message(state, "AUDIT no tiene ningún informe que aplicar.");
    const document = context.document?.();
    if (!document) return message(state, "El anfitrión no expone el documento: AUDIT no puede reparar.");
    const repairableFindings = state.report.findings.filter((finding) => finding.repairable);
    if (repairableFindings.length === 0)
      return message(state, "AUDIT no tiene nada reparable automáticamente en este informe.");
    const commands = cadAuditRepairCommands(document, state.report, context.layers?.() ?? [], {
      activeLayer: context.activeLayer,
    });
    if (commands.length === 0)
      return message(state, "AUDIT no produjo ningún cambio: nada de lo encontrado se pudo reparar.");
    const unrepaired = state.report.findings.length - repairableFindings.length;
    return {
      state,
      prompt: NO_PROMPT,
      accepts: 0,
      result: {
        kind: "document",
        commands,
        label: `AUDIT (reparado(s): ${repairableFindings.length}${unrepaired > 0 ? `; sin reparar: ${unrepaired}` : ""})`,
      },
    };
  },
};

export const CAD_AUDIT_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(auditCommand)];
