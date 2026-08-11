/**
 * FASE 3 — El presupuesto del pipeline de render, y las reglas que lo hacen
 * defendible.
 *
 * ## De qué se viene
 *
 * `docs/cad/evidence/cad-render-benchmark-100k.json` entró con
 * `"enforcement": "report-only"` y su propia justificación decía por qué:
 * «Métrica nueva. Entra registrada y NO bloqueante hasta tener una línea base
 * versionada debajo». Ya tiene una corrida. Esto es la línea base.
 *
 * ## Las tres reglas que se respetan aquí, y por qué
 *
 * 1. **Una métrica nueva entra registrada durante una versión.** El benchmark
 *    de Node ya cumplió la suya, así que pasa a BLOQUEANTE. Las métricas de
 *    NAVEGADOR son nuevas de este trabajo y siguen en `report-only`: cumplen la
 *    suya ahora.
 * 2. **Nunca se aprieta un presupuesto existente en el mismo PR que añade uno
 *    nuevo.** Por eso este archivo y el retoque del presupuesto viejo del
 *    viewport viajan SIN métricas nuevas al lado.
 * 3. **Una línea base sin su máquina es una anécdota.** Cada perfil lleva el
 *    entorno en el que se midió y una guarda de hardware: en una máquina más
 *    pequeña que la de calibración el presupuesto NO falla, se degrada a
 *    registrado y dice por qué.
 *
 * ## Contra el ruido, que es el fallo que mata los gates
 *
 * Los goldens del repositorio ya son sensibles a la carga de máquina. Un gate
 * de tiempo mal calibrado falla de forma intermitente, la gente lo desactiva, y
 * un gate desactivado es peor que ninguno. Tres defensas:
 *
 * - **Margen sobre la peor corrida observada**, no sobre la media. El
 *   `marginFactor` viaja en el manifiesto para que se vea, y las muestras de
 *   calibración también: quien quiera discutir el número tiene los datos.
 * - **Guarda de hardware**, arriba.
 * - **Las INVARIANTES pesan más que los tiempos.** «En reposo, detalladas ==
 *   visibles» y «el camino anterior detalla como mucho 2.500 de 100.000» no
 *   dependen de la máquina, no parpadean, y son justo lo que el pipeline vino a
 *   arreglar. Si algún día hay que aflojar los tiempos, estas se quedan.
 */
import type { CadRenderBenchmarkResult } from "../render/render-benchmark";
import baselineJson from "./render-baseline.json";

export type CadRenderBudgetEnforcement = "blocking" | "report-only";

export interface CadRenderBudgetHardwareGuard {
  minimumLogicalCpuCount: number;
  minimumTotalMemoryBytes: number;
}

export interface CadRenderBudgetLimits {
  nextFirstDetailMs: number;
  nextZoomSettleMs: number;
  nextPanFrameP95Ms: number;
  nextPanFrameMaxMs: number;
  /** `null` cuando la corrida no puede forzar el recolector: no se juzga. */
  leakHeapGrowthMb: number | null;
}

export interface CadRenderBudgetInvariants {
  /** En reposo, `detailedAtRest` DEBE ser igual a `visibleAtRest`. */
  detailedEqualsVisibleAtRest: boolean;
  /** Mínimo de entidades detalladas con el dibujo entero a la vista. */
  minDetailedAtFullView: number;
  /**
   * Tope de lo que el camino ANTERIOR detalla en esa misma vista.
   *
   * No es un presupuesto que haya que cumplir: es la comprobación de que el
   * muestreo del camino anterior SIGUE AHÍ. Si un día este número sube, o el
   * camino anterior dejó de muestrear —buena noticia que hay que registrar— o
   * el arnés dejó de medirlo, que es una regresión silenciosa del benchmark.
   */
  maxLegacyDetailedAtFullView: number;
}

export interface CadRenderBudgetProfile {
  id: string;
  entities: number;
  panStops: number;
  enforcement: CadRenderBudgetEnforcement;
  enforcementRationale: string;
  hardware: CadRenderBudgetHardwareGuard;
  budgets: CadRenderBudgetLimits;
  invariants: CadRenderBudgetInvariants;
  calibration: {
    runs: number;
    marginFactor: number;
    recordedAt: string;
    environment: Record<string, string | number | boolean>;
    observed: Record<string, number[]>;
  };
}

export interface CadRenderBaselineManifest {
  $schema: string;
  schemaVersion: 1;
  benchmarkId: string;
  profiles: CadRenderBudgetProfile[];
}

export const CAD_RENDER_BASELINE = baselineJson as CadRenderBaselineManifest;

export function findCadRenderBudgetProfile(
  id: string,
): CadRenderBudgetProfile | undefined {
  return CAD_RENDER_BASELINE.profiles.find((profile) => profile.id === id);
}

export interface CadRenderBudgetHost {
  logicalCpuCount: number;
  totalMemoryBytes: number;
  exposedGc: boolean;
}

export interface CadRenderBudgetViolation {
  metric: string;
  observed: number | boolean;
  limit: number | boolean;
  /** `invariant` no depende de la máquina; `timing` sí. */
  kind: "invariant" | "timing";
  message: string;
}

export interface CadRenderBudgetVerdict {
  profileId: string;
  /** Lo que REALMENTE se aplicó, tras la guarda de hardware. */
  enforcement: CadRenderBudgetEnforcement;
  downgradeReason: string | null;
  violations: CadRenderBudgetViolation[];
  /** Métricas que no se juzgaron, con el motivo. Nunca en silencio. */
  notEvaluated: string[];
}

function timing(
  metric: string,
  observed: number,
  limit: number,
): CadRenderBudgetViolation | null {
  if (observed <= limit) return null;
  return {
    metric,
    observed,
    limit,
    kind: "timing",
    message: `${metric}: ${observed} supera el presupuesto ${limit} (×${Math.round((observed / limit) * 100) / 100}).`,
  };
}

/**
 * Juzga un resultado contra un perfil. PURO: no lee el entorno ni el reloj —
 * el host entra por parámetro para que el spec pueda probar la degradación por
 * hardware sin necesitar una máquina pequeña de verdad.
 */
export function evaluateCadRenderBudget(
  result: CadRenderBenchmarkResult,
  profile: CadRenderBudgetProfile,
  host: CadRenderBudgetHost,
  fullView?: { next: { detailedAtRest: number }; legacy: { detailedAtRest: number } },
): CadRenderBudgetVerdict {
  const violations: CadRenderBudgetViolation[] = [];
  const notEvaluated: string[] = [];

  // --- Invariantes: lo que no depende de la máquina ------------------------
  if (profile.invariants.detailedEqualsVisibleAtRest)
    if (result.next.detailedAtRest !== result.next.visibleAtRest)
      violations.push({
        metric: "next.detailedAtRest == next.visibleAtRest",
        observed: result.next.detailedAtRest,
        limit: result.next.visibleAtRest,
        kind: "invariant",
        message: `En reposo el pipeline detalló ${result.next.detailedAtRest} de ${result.next.visibleAtRest} visibles. La propiedad central del pipeline es que sean iguales: si no lo son, ha vuelto el muestreo.`,
      });

  if (fullView) {
    if (fullView.next.detailedAtRest < profile.invariants.minDetailedAtFullView)
      violations.push({
        metric: "nextAtFullView.detailedAtRest",
        observed: fullView.next.detailedAtRest,
        limit: profile.invariants.minDetailedAtFullView,
        kind: "invariant",
        message: `Con el dibujo entero a la vista el pipeline detalló ${fullView.next.detailedAtRest}; el mínimo versionado es ${profile.invariants.minDetailedAtFullView}.`,
      });
    if (
      fullView.legacy.detailedAtRest > profile.invariants.maxLegacyDetailedAtFullView
    )
      violations.push({
        metric: "legacyAtFullView.detailedAtRest",
        observed: fullView.legacy.detailedAtRest,
        limit: profile.invariants.maxLegacyDetailedAtFullView,
        kind: "invariant",
        message: `El camino anterior detalló ${fullView.legacy.detailedAtRest}, por encima de ${profile.invariants.maxLegacyDetailedAtFullView}. O dejó de muestrear —regístralo— o el arnés dejó de medir el muestreo.`,
      });
  } else notEvaluated.push("invariantes de vista completa: no se midió esa vista");

  // --- Tiempos -------------------------------------------------------------
  for (const violation of [
    timing("next.firstDetailMs", result.next.firstDetailMs, profile.budgets.nextFirstDetailMs),
    timing("next.zoomSettleMs", result.next.zoomSettleMs, profile.budgets.nextZoomSettleMs),
    timing("next.panFrameP95Ms", result.next.panFrameP95Ms, profile.budgets.nextPanFrameP95Ms),
    timing("next.panFrameMaxMs", result.next.panFrameMaxMs, profile.budgets.nextPanFrameMaxMs),
  ])
    if (violation) violations.push(violation);

  // --- Fuga ----------------------------------------------------------------
  //
  // Sin `--expose-gc` el crecimiento de montón incluye basura sin recoger: NO
  // es comparable con la corrida que fijó la línea base, así que no se juzga.
  // Juzgarlo igualmente sería fabricar rojos aleatorios.
  if (profile.budgets.leakHeapGrowthMb === null)
    notEvaluated.push("leak.heapGrowthMb: el perfil no lo presupuesta");
  else if (!host.exposedGc)
    notEvaluated.push(
      "leak.heapGrowthMb: sin --expose-gc la cifra incluye basura sin recoger y no es comparable con la línea base",
    );
  else {
    const violation = timing(
      "leak.heapGrowthMb",
      result.leak.heapGrowthMb,
      profile.budgets.leakHeapGrowthMb,
    );
    if (violation) violations.push(violation);
  }

  // --- Guarda de hardware --------------------------------------------------
  let enforcement = profile.enforcement;
  let downgradeReason: string | null = null;
  const weakCpu = host.logicalCpuCount < profile.hardware.minimumLogicalCpuCount;
  const weakMemory = host.totalMemoryBytes < profile.hardware.minimumTotalMemoryBytes;
  if (enforcement === "blocking" && (weakCpu || weakMemory)) {
    // Las INVARIANTES siguen bloqueando: no dependen de la máquina. Sólo se
    // degradan los tiempos, que es lo que la máquina puede alterar.
    enforcement = "report-only";
    downgradeReason = weakCpu
      ? `${host.logicalCpuCount} CPU lógicas frente a las ${profile.hardware.minimumLogicalCpuCount} de la calibración: los tiempos pasan a registrados.`
      : `${Math.round(host.totalMemoryBytes / 1_073_741_824)} GiB de memoria frente a los ${Math.round(profile.hardware.minimumTotalMemoryBytes / 1_073_741_824)} GiB de la calibración: los tiempos pasan a registrados.`;
  }

  return { profileId: profile.id, enforcement, downgradeReason, violations, notEvaluated };
}

/**
 * Las violaciones que DEBEN romper la corrida.
 *
 * Cuando la guarda de hardware degrada el perfil, las invariantes siguen
 * bloqueando. Es la separación que hace que un gate de rendimiento sobreviva a
 * una máquina lenta sin dejar de detectar la regresión que importa —que vuelva
 * el muestreo— y sin volverse intermitente por los tiempos.
 */
export function blockingCadRenderViolations(
  verdict: CadRenderBudgetVerdict,
): CadRenderBudgetViolation[] {
  return verdict.enforcement === "blocking"
    ? verdict.violations
    : verdict.violations.filter((violation) => violation.kind === "invariant");
}

export function formatCadRenderVerdict(verdict: CadRenderBudgetVerdict): string {
  const lines = [`perfil ${verdict.profileId} · enforcement ${verdict.enforcement}`];
  if (verdict.downgradeReason) lines.push(`  degradado: ${verdict.downgradeReason}`);
  for (const note of verdict.notEvaluated) lines.push(`  no evaluado: ${note}`);
  for (const violation of verdict.violations)
    lines.push(`  ${violation.kind === "invariant" ? "INVARIANTE" : "tiempo"}: ${violation.message}`);
  if (verdict.violations.length === 0) lines.push("  sin violaciones");
  return lines.join("\n");
}
