/**
 * FASE 4 — El presupuesto del viewport, reescrito para que exprese la
 * experiencia que se quiere y no la que había.
 *
 * ## Qué estaba mal, dicho con las palabras de la matriz de brechas
 *
 * `e2e/performance/cad-viewport-100k.spec.ts` exigía canónico 10k <30 s,
 * canónico 100k <60 s, detalle <90 s, cuadro <1 s, zoom <30 s, **máximo 2.500
 * detalles iniciales** y 10.000 tras zoom. La matriz de brechas lo dice sin
 * rodeos: «un zoom de 29,14 s pasa el gate y sigue siendo una brecha P0 de
 * experiencia».
 *
 * Y hay algo peor que un umbral flojo. `expect(initialRendered)
 * .toBeLessThanOrEqual(2_500)` es un techo POR ARRIBA sobre el número de
 * entidades dibujadas: **codifica el muestreo como si fuera lo correcto**. Con
 * ese gate en verde, un pipeline que dibujara las 100.000 entidades ROMPERÍA
 * la prueba. El gate no medía calidad de dibujo: la prohibía.
 *
 * ## Qué se hace en su lugar
 *
 * Dos niveles, y los dos versionados:
 *
 * - **`gate`** — BLOQUEANTE. Calibrado sobre la medida real de esta máquina con
 *   margen. Su trabajo es cazar regresiones sin parpadear.
 * - **`target`** — la experiencia que se quiere de verdad: un zoom que se siente
 *   inmediato y **fidelidad 1.0**, es decir, todo lo visible dibujado. NO
 *   bloquea, se REGISTRA, y lleva escrito quién tiene que desbloquearlo.
 *   Publicar el objetivo al lado de la medida convierte una brecha en una cifra
 *   que se puede seguir; dejarlo fuera la convierte en una conversación.
 *
 * El techo de 2.500 desaparece. En su sitio hay un SUELO de fidelidad:
 * `minDetailedFraction`. Un gate que se pueda satisfacer dibujando menos ya no
 * existe, y el día que el pipeline nuevo esté enchufado la fidelidad sube y el
 * gate sube con ella en vez de romperse.
 */
import baselineJson from "./viewport-baseline.json";

export interface CadViewportExperienceBudget {
  canonicalReadyMs: number;
  /** `null` en perfiles que no miden la fase de detalle (el de 10k). */
  detailReadyMs: number | null;
  frameLatencyMs: number;
  /**
   * Tiempo hasta que el índice espacial REACCIONA a la rueda: el conjunto
   * candidato baja. Es «el viewport me ha oído».
   */
  zoomReplanMs: number | null;
  /**
   * Tiempo hasta que el dibujo TERMINA de rehacerse. Es «ya puedo trabajar».
   *
   * Separarlo de `zoomReplanMs` no es cosmética. El presupuesto anterior los
   * medía juntos bajo un único «zoom <30 s», y con eso no se podía apretar
   * nada: el número lo dominaba la parte lenta y la parte rápida quedaba sin
   * gate. Partido, la reacción admite un presupuesto exigente hoy y el
   * asentado conserva el suyo mientras el editor siga usando el camino viejo.
   */
  zoomSettleMs: number | null;
  /**
   * SUELO de fidelidad: entidades detalladas dividido por visibles.
   *
   * Sustituye al techo de 2.500. Es la diferencia entre «no dibujes demasiado»
   * y «dibuja lo que hay», que es la diferencia entre un plano y una muestra.
   */
  minDetailedFractionAtOpen: number;
  minDetailedFractionAfterZoom: number;
}

export interface CadViewportProfile {
  id: string;
  entities: number;
  gate: CadViewportExperienceBudget;
  target: CadViewportExperienceBudget;
  /** Quién tiene que aterrizar para que `target` sea alcanzable. */
  targetBlockedBy: string;
  /**
   * Proyectos de Playwright en los que se TOMARON las muestras.
   *
   * Los presupuestos de tiempo se calibraron en Chromium. Firefox corre la
   * misma suite sobre llvmpipe y no hay muestras suyas —el binario no se puede
   * descargar en el entorno donde se calibró—, así que aplicarle estos números
   * sería gatear a ojo en un motor que nadie midió: la receta exacta del gate
   * intermitente.
   *
   * En un proyecto no calibrado los TIEMPOS pasan a registrados y los SUELOS DE
   * FIDELIDAD siguen bloqueando, porque cuántas entidades se dibujan no depende
   * del navegador. Cuando alguien calibre Firefox, añade su nombre aquí con sus
   * muestras y el gate empieza a morder también allí.
   */
  calibratedProjects: string[];
  calibration: {
    recordedAt: string;
    runs: number;
    marginFactor: number;
    environment: Record<string, string | number | boolean | null>;
    observed: Record<string, number[]>;
  };
}

export interface CadViewportBaselineManifest {
  $schema: string;
  schemaVersion: 1;
  benchmarkId: string;
  profiles: CadViewportProfile[];
}

export const CAD_VIEWPORT_BASELINE = baselineJson as CadViewportBaselineManifest;

export function findCadViewportProfile(id: string): CadViewportProfile | undefined {
  return CAD_VIEWPORT_BASELINE.profiles.find((profile) => profile.id === id);
}

export interface CadViewportObservation {
  canonicalReadyMs: number;
  detailReadyMs: number | null;
  frameLatencyMs: number;
  zoomReplanMs: number | null;
  zoomSettleMs: number | null;
  visibleAtOpen: number;
  detailedAtOpen: number;
  visibleAfterZoom: number | null;
  detailedAfterZoom: number | null;
}

export interface CadViewportFinding {
  metric: string;
  observed: number;
  limit: number;
  message: string;
}

export interface CadViewportVerdict {
  profileId: string;
  /** Proyecto juzgado, y si sus TIEMPOS bloquean o sólo se registran. */
  project: string;
  timingEnforcement: "blocking" | "report-only";
  timingDowngradeReason: string | null;
  detailedFractionAtOpen: number;
  detailedFractionAfterZoom: number | null;
  /** Incumplimientos del gate BLOQUEANTE. */
  gateViolations: CadViewportFinding[];
  /** Incumplimientos que NO bloquean por falta de calibración del proyecto. */
  reportedOnly: CadViewportFinding[];
  /** Distancia al objetivo. NO bloquea; se publica. */
  targetGaps: CadViewportFinding[];
  notEvaluated: string[];
}

function slower(
  metric: string,
  observed: number | null,
  limit: number | null,
  notEvaluated: string[],
): CadViewportFinding | null {
  if (limit === null) return null;
  if (observed === null) {
    notEvaluated.push(`${metric}: no se midió en esta corrida`);
    return null;
  }
  if (observed <= limit) return null;
  return {
    metric,
    observed,
    limit,
    message: `${metric}: ${Math.round(observed)} ms frente a ${limit} ms.`,
  };
}

function lessFaithful(
  metric: string,
  observed: number | null,
  floor: number,
): CadViewportFinding | null {
  if (observed === null || observed >= floor) return null;
  return {
    metric,
    observed,
    limit: floor,
    message: `${metric}: se dibujó el ${Math.round(observed * 1_000) / 10}% de lo visible; el suelo es ${Math.round(floor * 1_000) / 10}%.`,
  };
}

/**
 * Juzga una observación contra el perfil. PURO.
 *
 * `detailedFraction` se calcula aquí y no en el spec a propósito: es la cifra
 * que sustituye al techo de 2.500, y quiero que exista una sola definición de
 * ella —dividida siempre por lo VISIBLE, nunca por el total del documento, que
 * daría un porcentaje halagador y sin sentido.
 */
export function evaluateCadViewportExperience(
  observation: CadViewportObservation,
  profile: CadViewportProfile,
  project = "chromium",
): CadViewportVerdict {
  const notEvaluated: string[] = [];
  const detailedFractionAtOpen =
    observation.visibleAtOpen > 0
      ? observation.detailedAtOpen / observation.visibleAtOpen
      : 0;
  const detailedFractionAfterZoom =
    observation.visibleAfterZoom && observation.visibleAfterZoom > 0
      ? (observation.detailedAfterZoom ?? 0) / observation.visibleAfterZoom
      : null;
  if (detailedFractionAfterZoom === null)
    notEvaluated.push("fidelidad tras zoom: la corrida no ejecutó el guion de zoom");

  const evaluate = (
    budget: CadViewportExperienceBudget,
    collector: string[],
  ): CadViewportFinding[] =>
    [
      slower("canonicalReadyMs", observation.canonicalReadyMs, budget.canonicalReadyMs, collector),
      slower("detailReadyMs", observation.detailReadyMs, budget.detailReadyMs, collector),
      slower("frameLatencyMs", observation.frameLatencyMs, budget.frameLatencyMs, collector),
      slower("zoomReplanMs", observation.zoomReplanMs, budget.zoomReplanMs, collector),
      slower("zoomSettleMs", observation.zoomSettleMs, budget.zoomSettleMs, collector),
      lessFaithful(
        "detailedFractionAtOpen",
        detailedFractionAtOpen,
        budget.minDetailedFractionAtOpen,
      ),
      lessFaithful(
        "detailedFractionAfterZoom",
        detailedFractionAfterZoom,
        budget.minDetailedFractionAfterZoom,
      ),
    ].filter((finding): finding is CadViewportFinding => finding !== null);

  const calibrated = profile.calibratedProjects.includes(project);
  const gateFindings = evaluate(profile.gate, notEvaluated);
  // Los suelos de fidelidad no dependen del navegador: bloquean siempre.
  const fidelityMetrics = new Set([
    "detailedFractionAtOpen",
    "detailedFractionAfterZoom",
  ]);
  return {
    profileId: profile.id,
    project,
    timingEnforcement: calibrated ? "blocking" : "report-only",
    timingDowngradeReason: calibrated
      ? null
      : `«${project}» no está entre los proyectos calibrados (${profile.calibratedProjects.join(", ")}): sus tiempos se registran y sólo bloquean los suelos de fidelidad.`,
    detailedFractionAtOpen: Math.round(detailedFractionAtOpen * 10_000) / 10_000,
    detailedFractionAfterZoom:
      detailedFractionAfterZoom === null
        ? null
        : Math.round(detailedFractionAfterZoom * 10_000) / 10_000,
    gateViolations: calibrated
      ? gateFindings
      : gateFindings.filter((finding) => fidelityMetrics.has(finding.metric)),
    reportedOnly: calibrated
      ? []
      : gateFindings.filter((finding) => !fidelityMetrics.has(finding.metric)),
    // El objetivo se evalúa sobre un colector aparte y se descarta: sus «no
    // medido» ya los recogió el gate y repetirlos sólo haría ruido.
    targetGaps: evaluate(profile.target, []),
    notEvaluated,
  };
}

export function formatCadViewportVerdict(verdict: CadViewportVerdict): string {
  const lines = [
    `perfil ${verdict.profileId} · fidelidad al abrir ${Math.round(verdict.detailedFractionAtOpen * 1_000) / 10}%` +
      (verdict.detailedFractionAfterZoom === null
        ? ""
        : ` · tras zoom ${Math.round(verdict.detailedFractionAfterZoom * 1_000) / 10}%`),
  ];
  if (verdict.timingDowngradeReason)
    lines.push(`  tiempos REGISTRADOS: ${verdict.timingDowngradeReason}`);
  for (const note of verdict.notEvaluated) lines.push(`  no evaluado: ${note}`);
  for (const reported of verdict.reportedOnly)
    lines.push(`  registrado (sin bloquear): ${reported.message}`);
  for (const violation of verdict.gateViolations)
    lines.push(`  GATE: ${violation.message}`);
  if (verdict.gateViolations.length === 0) lines.push("  gate: sin incumplimientos");
  for (const gap of verdict.targetGaps)
    lines.push(`  brecha con el objetivo: ${gap.message}`);
  if (verdict.targetGaps.length === 0)
    lines.push("  objetivo ALCANZADO: sube el gate al objetivo en el próximo PR");
  return lines.join("\n");
}
