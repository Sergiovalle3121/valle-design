"use client";

import { CircleAlert, CircleCheck, ShieldAlert, ShieldCheck } from "lucide-react";
import type { DesignReport } from "@/lib/cad/design-checks";
import type { CadClearanceIssue, CadCollisionHit } from "@/lib/cad/collisions";
import type { CadSafetyIssue } from "@/lib/cad/safety-zones";
import type {
  CadValidationIssueRow,
  CadValidationReport,
} from "@/lib/cad/validation-report";
import { fmtLen } from "../studio/format-units";
import { formatRegionNumber } from "@/lib/cad/region";
import { getClientRegion } from "@/lib/cad/region/client";
import { CadDialogShell } from "./CadDialogShell";

/**
 * LA REVISIÓN DE DISEÑO, FUERA DEL MONOLITO.
 *
 * Doscientas noventa y tres líneas que juntan cinco fuentes de verdad sobre el
 * mismo dibujo —revisión base, validación CAD, colisiones, holguras y zonas de
 * seguridad— más la lista de comprobaciones de emisión. Es el cuadro con más
 * datos de entrada y ninguna decisión: cada fila viene ya calculada por el
 * editor, y aquí sólo se ordena y se pinta.
 *
 * ## Por qué las cinco fuentes van en un cuadro
 *
 * Porque la pregunta que responde es una sola: «¿puedo emitir este plano?». Un
 * cuadro por fuente obligaría a abrir cinco y a llevar la cuenta a mano de cuál
 * bloquea. El encabezado dice el veredicto y el cuerpo enseña por qué.
 *
 * ## Los tonos
 *
 * El color del icono sigue siendo un valor resuelto en línea, igual que estaba
 * en el monolito: es una escala de semáforo de tres pasos atada a
 * `report.score` y no a un token semántico. Queda anotado en
 * `DEUDA-MONOLITO.md` — moverlo a tokens es un cambio del sistema de diseño,
 * no de esta extracción, y mezclarlo aquí escondería un cambio visual dentro
 * de un refactor que promete no tener ninguno.
 */

/** Una comprobación de emisión, ya resuelta por el editor. */
export interface CadReleaseCheck {
  label: string;
  value: string;
  tone: string;
}

export function CadDesignReportDialog({
  onClose,
  report,
  model,
  revision,
  unidad,
  hayHighlights,
  onLimpiarHighlights,
  cadValidationReport,
  onSelectValidationIssue,
  collisionHits,
  onHideCollisions,
  onSelectCollisionPair,
  clearanceIssues,
  onHideClearance,
  onSelectClearanceIssue,
  safetyIssues,
  onHideSafety,
  onSelectSafetyIssue,
  releaseState,
  releaseTone,
  releaseChecks,
  releaseBlockers,
  releaseWarnings,
}: {
  onClose: () => void;
  report: DesignReport;
  model: string;
  revision: string;
  /** Unidad del documento, para formatear distancias de holgura. */
  unidad: string;
  hayHighlights: boolean;
  onLimpiarHighlights: () => void;
  cadValidationReport: CadValidationReport | null;
  onSelectValidationIssue: (issue: CadValidationIssueRow) => void;
  collisionHits: readonly CadCollisionHit[];
  onHideCollisions: () => void;
  onSelectCollisionPair: (hit: CadCollisionHit) => void;
  clearanceIssues: readonly CadClearanceIssue[];
  onHideClearance: () => void;
  onSelectClearanceIssue: (issue: CadClearanceIssue) => void;
  safetyIssues: readonly CadSafetyIssue[];
  onHideSafety: () => void;
  onSelectSafetyIssue: (issue: CadSafetyIssue) => void;
  releaseState: string;
  releaseTone: string;
  releaseChecks: readonly CadReleaseCheck[];
  releaseBlockers: number;
  releaseWarnings: number;
}) {
  const region = getClientRegion();
  return (
    <CadDialogShell
      id="cad-revision"
      onClose={onClose}
      icon={
        <ShieldCheck
          className="w-4 h-4 text-primary"
          style={{
            color:
              report.score === "ok"
                ? "#34d399"
                : report.score === "warn"
                  ? "#fbbf24"
                  : "#f87171",
          }}
        />
      }
      titulo={`Revisión de diseño · ${model} · ${revision}`}
      insignia={
        hayHighlights ? (
          <button
            type="button"
            onClick={onLimpiarHighlights}
            className="rounded-lg border border-border px-2 py-1 type-micro text-foreground hover:bg-muted"
          >
            Ocultar highlights
          </button>
        ) : null
      }
      ancho="w-[440px]"
      alto="max-h-[80vh] overflow-y-auto"
    >
      <div className="p-4 space-y-2">
        <div className="type-caption mb-1">
          {report.score === "ok" ? (
            <span className="text-emerald-400">
              Sin problemas detectados.
            </span>
          ) : (
            <span
              className={
                report.score === "error"
                  ? "text-danger-ink"
                  : "text-amber-400"
              }
            >
              {report.errors} {report.errors === 1 ? "error" : "errores"}{" "}
              · {report.warnings}{" "}
              {report.warnings === 1 ? "aviso" : "avisos"}
            </span>
          )}
        </div>
        <div className="mb-3 rounded-xl border border-border bg-muted/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="type-micro uppercase tracking-wide text-muted-foreground">
                Release readiness
              </div>
              <div className={`text-sm font-semibold ${releaseTone}`}>
                {releaseState}
              </div>
            </div>
            <div className="text-right type-micro text-muted-foreground dark:text-muted-foreground">
              <div>{releaseBlockers} bloqueos</div>
              <div>{releaseWarnings} avisos</div>
            </div>
          </div>
          <div className="grid gap-1.5">
            {releaseChecks.map((check) => (
              <div
                key={check.label}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface/80 px-2 py-1.5 type-micro"
              >
                <span className="text-foreground">{check.label}</span>
                <span className={check.tone}>{check.value}</span>
              </div>
            ))}
          </div>
        </div>
        {cadValidationReport && (
          <div className="mb-3 rounded-xl border border-indigo-400/20 bg-indigo-400/10 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 type-caption font-semibold text-primary-ink">
              <span>CAD validation center</span>
              <span
                className={
                  cadValidationReport.severity === "critical"
                    ? "text-danger-ink"
                    : cadValidationReport.severity === "warning"
                      ? "text-warning-ink"
                      : "text-success-ink"
                }
              >
                {cadValidationReport.severity}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 type-micro">
              <div className="rounded-lg bg-surface/80 px-2 py-1.5">
                <span className="text-muted-foreground">Collisions</span>
                <b className="ml-2 tabular-nums text-foreground">
                  {cadValidationReport.collisions.length}
                </b>
              </div>
              <div className="rounded-lg bg-surface/80 px-2 py-1.5">
                <span className="text-muted-foreground">Clearance</span>
                <b className="ml-2 tabular-nums text-foreground">
                  {cadValidationReport.clearances.length}
                </b>
              </div>
              <div className="rounded-lg bg-surface/80 px-2 py-1.5">
                <span className="text-muted-foreground">Safety</span>
                <b className="ml-2 tabular-nums text-foreground">
                  {cadValidationReport.safety.length}
                </b>
              </div>
              <div className="rounded-lg bg-surface/80 px-2 py-1.5">
                <span className="text-muted-foreground">
                  Architecture
                </span>
                <b className="ml-2 tabular-nums text-foreground">
                  {cadValidationReport.architecture.length}
                </b>
              </div>
            </div>
            {cadValidationReport.issues.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {cadValidationReport.issues.slice(0, 4).map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => onSelectValidationIssue(issue)}
                    className={`w-full rounded-lg border px-2 py-1.5 text-left type-micro transition ${issue.severity === "critical" ? "border-rose-400/20 bg-rose-400/10 hover:bg-rose-400/15" : "border-amber-400/20 bg-amber-400/10 hover:bg-amber-400/15"}`}
                  >
                    <span
                      className={
                        issue.severity === "critical"
                          ? "block font-medium text-rose-100"
                          : "block font-medium text-warning-ink"
                      }
                    >
                      {issue.title}
                    </span>
                    <span className="block text-foreground">
                      {issue.suggestedFix}
                    </span>
                    <span className="block pt-0.5 type-micro text-muted-foreground">
                      {issue.actionLabel}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {collisionHits.length > 0 && (
          <div className="mb-3 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 type-caption font-semibold text-rose-100">
              <span>Colisiones detectadas · {collisionHits.length}</span>
              <button
                onClick={onHideCollisions}
                className="type-micro text-danger-ink/70 hover:text-foreground"
              >
                Ocultar
              </button>
            </div>
            <div className="max-h-36 space-y-1 overflow-y-auto">
              {collisionHits.slice(0, 8).map((hit) => (
                <button
                  key={`${hit.aId}-${hit.bId}`}
                  onClick={() => onSelectCollisionPair(hit)}
                  className="w-full rounded-lg bg-muted/60 px-2 py-1.5 text-left type-micro hover:bg-muted"
                >
                  <span className="block text-rose-100">
                    {hit.aLabel} ↔ {hit.bLabel}
                  </span>
                  <span className="text-muted-foreground dark:text-muted-foreground">
                    Área aprox.{" "}
                    {formatRegionNumber(Math.round(hit.area), region)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {clearanceIssues.length > 0 && (
          <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 type-caption font-semibold text-warning-ink">
              <span>Clearance warnings - {clearanceIssues.length}</span>
              <button
                onClick={onHideClearance}
                className="type-micro text-warning-ink/70 hover:text-foreground"
              >
                Ocultar
              </button>
            </div>
            <div className="max-h-36 space-y-1 overflow-y-auto">
              {clearanceIssues.slice(0, 8).map((issue) => (
                <button
                  key={`${issue.aId}-${issue.bId}`}
                  onClick={() => onSelectClearanceIssue(issue)}
                  className="w-full rounded-lg bg-muted/60 px-2 py-1.5 text-left type-micro hover:bg-muted"
                >
                  <span className="block text-warning-ink">
                    {issue.message}
                  </span>
                  <span className="text-muted-foreground dark:text-muted-foreground">
                    Actual{" "}
                    {fmtLen(issue.distance, unidad, region)}{" "}
                    - minimo{" "}
                    {fmtLen(issue.required, unidad, region)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {safetyIssues.length > 0 && (
          <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 type-caption font-semibold text-warning-ink">
              <span>Safety issues - {safetyIssues.length}</span>
              <button
                onClick={onHideSafety}
                className="type-micro text-warning-ink/70 hover:text-foreground"
              >
                Ocultar
              </button>
            </div>
            <div className="max-h-36 space-y-1 overflow-y-auto">
              {safetyIssues.slice(0, 8).map((issue) => (
                <button
                  key={`${issue.zoneId}-${issue.objectId}-${issue.code}`}
                  onClick={() => onSelectSafetyIssue(issue)}
                  className="w-full rounded-lg bg-muted/60 px-2 py-1.5 text-left type-micro hover:bg-muted"
                >
                  <span className="block text-warning-ink">
                    {issue.message}
                  </span>
                  <span className="text-muted-foreground dark:text-muted-foreground">
                    Seleccionar objeto + zona/ruta
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {report.items.map((it) => {
          const Icon =
            it.level === "ok"
              ? CircleCheck
              : it.level === "warn"
                ? CircleAlert
                : ShieldAlert;
          const color =
            it.level === "ok"
              ? "#34d399"
              : it.level === "warn"
                ? "#fbbf24"
                : "#f87171";
          return (
            <div
              key={it.key}
              className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-3 py-2"
            >
              <Icon
                className="w-4 h-4 mt-0.5 shrink-0"
                style={{ color }}
              />
              <div className="min-w-0">
                <div className="type-small font-medium">
                  {it.label}
                  {it.count > 0 ? ` · ${it.count}` : ""}
                </div>
                <div className="type-micro text-muted-foreground dark:text-muted-foreground leading-snug">
                  {it.detail}
                </div>
              </div>
            </div>
          );
        })}
        <p className="type-micro text-muted-foreground pt-1 leading-relaxed">
          Traslapes y límites se evalúan sobre la caja sin rotación
          (aproximado).
        </p>
      </div>
    </CadDialogShell>
  );
}
