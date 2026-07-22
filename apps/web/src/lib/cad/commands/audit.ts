/**
 * Revisión del plano (AXOS-CAD-AUDIT-001): '¿qué le falta al plano para
 * protección civil?' — checklist de seguridad como reporte accionable:
 * extintor, botiquín, salida de emergencia y puerta de entrada. Cada
 * renglón dice cuántos hay o marca FALTA; el resumen enumera pendientes.
 * AUDIT-002: los extintores se exigen por superficie — uno por cada
 * 300 m² del footprint (referencia NOM-002-STPS), redondeando arriba.
 */
import type {
  CadCommandContext,
  CadCommandPreview,
  CadOperation,
} from "./types";

const M2_PER_EXTINGUISHER = 300;

export function auditPlanPreview(
  context: CadCommandContext,
): CadCommandPreview {
  const count = (kind: string) =>
    context.objects.filter((o) => (o.kind ?? "") === kind).length;
  const planAreaM2 =
    ((context.footprintW ?? 10000) / 1000) *
    ((context.footprintH ?? 6000) / 1000);
  const extRequired = Math.max(1, Math.ceil(planAreaM2 / M2_PER_EXTINGUISHER));
  const checks = [
    { label: "Extintor", n: count("fire-extinguisher"), req: extRequired },
    { label: "Botiquín", n: count("first-aid-kit"), req: 1 },
    { label: "Salida de emergencia", n: count("emergency-exit-sign"), req: 1 },
    { label: "Puerta de entrada", n: count("door"), req: 1 },
  ];
  const missing = checks.filter((c) => c.n < c.req);
  const report: CadOperation = {
    type: "report",
    title: `Protección civil — revisión del plano (${Math.round(planAreaM2)} m²)`,
    rows: checks.map((c) => ({
      label: c.label,
      value:
        c.n >= c.req
          ? `✓ ${c.n} en el plano${c.req > 1 ? ` (norma: ${c.req})` : ""}`
          : c.n > 0
            ? `${c.n} de ${c.req} — faltan ${c.req - c.n}`
            : "FALTA",
    })),
  };
  return {
    summary: missing.length
      ? `Faltan ${missing.length} punto(s): ${missing
          .map((c) => c.label.toLowerCase())
          .join(", ")}.`
      : "El plano trae extintor, botiquín, salida de emergencia y puerta. Listo para protección civil.",
    affectedObjectIds: [],
    operations: [report],
    issues: [],
  };
}
