/**
 * Revisión del plano (AXOS-CAD-AUDIT-001): '¿qué le falta al plano para
 * protección civil?' — checklist de seguridad como reporte accionable:
 * extintor, botiquín, salida de emergencia y puerta de entrada. Cada
 * renglón dice cuántos hay o marca FALTA; el resumen enumera pendientes.
 */
import type {
  CadCommandContext,
  CadCommandPreview,
  CadOperation,
} from "./types";

export function auditPlanPreview(
  context: CadCommandContext,
): CadCommandPreview {
  const count = (kind: string) =>
    context.objects.filter((o) => (o.kind ?? "") === kind).length;
  const checks = [
    { label: "Extintor", n: count("fire-extinguisher") },
    { label: "Botiquín", n: count("first-aid-kit") },
    { label: "Salida de emergencia", n: count("emergency-exit-sign") },
    { label: "Puerta de entrada", n: count("door") },
  ];
  const missing = checks.filter((c) => c.n === 0);
  const report: CadOperation = {
    type: "report",
    title: "Protección civil — revisión del plano",
    rows: checks.map((c) => ({
      label: c.label,
      value: c.n > 0 ? `✓ ${c.n} en el plano` : "FALTA",
    })),
  };
  return {
    summary: missing.length
      ? `Faltan ${missing.length} elemento(s): ${missing
          .map((c) => c.label.toLowerCase())
          .join(", ")}.`
      : "El plano trae extintor, botiquín, salida de emergencia y puerta. Listo para protección civil.",
    affectedObjectIds: [],
    operations: [report],
    issues: [],
  };
}
