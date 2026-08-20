/**
 * Agregación del banco: de 152 desenlaces a las seis cifras que se publican.
 *
 * QUÉ SE PUBLICA Y POR QUÉ. Una sola «tasa de acierto» sería una cifra bonita e
 * inútil, porque promediaría dos preguntas distintas: si el producto entiende
 * el español de obra, y si sabe decir que no. Van separadas. Y por encima de las
 * dos va `graveRate`, que cuenta lo único que la regla de la casa prohíbe: haber
 * entregado algo plausible y equivocado.
 *
 * LOS PORCENTAJES SE REDONDEAN A CUATRO DECIMALES para que el artefacto sea
 * estable entre corridas (es determinista, no hay ruido que suavizar) y para que
 * los umbrales de la rúbrica se comparen contra un número y no contra la coleta
 * binaria de un double.
 */
import type { NlCadCase, NlCadCaseResult, NlCadOutcome } from "./types";
import { NL_CAD_GRAVE_OUTCOMES } from "./types";

const OUTCOMES: NlCadOutcome[] = [
  "acierto",
  "rechazo_tipado",
  "rechazo_sin_codigo",
  "rechazo_indebido",
  "bloqueado_al_ejecutar",
  "comando_equivocado",
  "argumentos_equivocados",
  "geometria_indebida",
];

const rate = (part: number, whole: number) =>
  whole === 0 ? 0 : Number((part / whole).toFixed(4));

function tally(results: NlCadCaseResult[]): Record<NlCadOutcome, number> {
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<
    NlCadOutcome,
    number
  >;
  for (const result of results) counts[result.outcome] += 1;
  return counts;
}

export interface NlCadDespachoSummary {
  cases: number;
  aciertos: number;
  /** Instrucciones legítimas que salieron con la geometría pedida. */
  accuracy: number;
  /** Dijo que no a algo que sabía hacer: caro, pero honesto. */
  rechazoIndebido: number;
  /** Entendió y la validación lo paró: fallo cerrado funcionando. */
  bloqueadoAlEjecutar: number;
  comandoEquivocado: number;
  argumentosEquivocados: number;
  /** Los dos anteriores, pero APLICADOS: geometría plausible y equivocada. */
  graves: number;
  graveRate: number;
}

export interface NlCadAdversarialSummary {
  cases: number;
  /** Rechazos que traen un código legible por máquina. */
  rechazoTipado: number;
  typedRejectionRate: number;
  /** Rechazos que sólo traen prosa: no se pueden ramificar ni traducir. */
  rechazoSinCodigo: number;
  /** Rechazos totales (tipados o no). */
  rejectionRate: number;
  /** Dijo que sí a lo irrealizable. El fallo grave de esta mitad. */
  geometriaIndebida: number;
  graveRate: number;
  /** Desglose por familia: ambigua, contradictoria, imposible, unidades, absurda. */
  byFamily: Record<
    string,
    { cases: number; rechazados: number; graves: number }
  >;
}

export interface NlCadBenchmarkSummary {
  corpus: { total: number; despacho: number; adversarial: number };
  despacho: NlCadDespachoSummary;
  adversarial: NlCadAdversarialSummary;
  global: { cases: number; graves: number; graveRate: number };
  outcomes: Record<NlCadOutcome, number>;
}

export interface NlCadBenchmarkRun {
  summary: NlCadBenchmarkSummary;
  results: NlCadCaseResult[];
  /** Los peores desenlaces, ya ordenados: primero los graves. */
  worst: NlCadCaseResult[];
}

/** Orden de gravedad para el listado de peores fallos del informe. */
const SEVERITY: Record<NlCadOutcome, number> = {
  geometria_indebida: 0,
  argumentos_equivocados: 1,
  comando_equivocado: 2,
  rechazo_sin_codigo: 3,
  rechazo_indebido: 4,
  bloqueado_al_ejecutar: 5,
  rechazo_tipado: 6,
  acierto: 7,
};

export function summarizeNlCad(
  cases: NlCadCase[],
  results: NlCadCaseResult[],
): NlCadBenchmarkRun {
  const byId = new Map(cases.map((kase) => [kase.id, kase]));
  const despacho = results.filter((r) => r.lane === "despacho");
  const adversarial = results.filter((r) => r.lane === "adversarial");
  const dTally = tally(despacho);
  const aTally = tally(adversarial);

  const dGraves = despacho.filter((r) => r.grave).length;
  const aGraves = adversarial.filter((r) => r.grave).length;

  const byFamily: NlCadAdversarialSummary["byFamily"] = {};
  for (const result of adversarial) {
    const expectation = byId.get(result.id)?.expect;
    const family =
      expectation && expectation.kind === "reject"
        ? expectation.family
        : "sin-familia";
    const bucket = (byFamily[family] ??= {
      cases: 0,
      rechazados: 0,
      graves: 0,
    });
    bucket.cases += 1;
    if (!result.grave) bucket.rechazados += 1;
    else bucket.graves += 1;
  }

  const worst = [...results]
    .filter((r) => r.outcome !== "acierto" && r.outcome !== "rechazo_tipado")
    .sort(
      (a, b) =>
        SEVERITY[a.outcome] - SEVERITY[b.outcome] || a.id.localeCompare(b.id),
    );

  return {
    summary: {
      corpus: {
        total: results.length,
        despacho: despacho.length,
        adversarial: adversarial.length,
      },
      despacho: {
        cases: despacho.length,
        aciertos: dTally.acierto,
        accuracy: rate(dTally.acierto, despacho.length),
        rechazoIndebido: dTally.rechazo_indebido,
        bloqueadoAlEjecutar: dTally.bloqueado_al_ejecutar,
        comandoEquivocado: dTally.comando_equivocado,
        argumentosEquivocados: dTally.argumentos_equivocados,
        graves: dGraves,
        graveRate: rate(dGraves, despacho.length),
      },
      adversarial: {
        cases: adversarial.length,
        rechazoTipado: aTally.rechazo_tipado,
        typedRejectionRate: rate(aTally.rechazo_tipado, adversarial.length),
        rechazoSinCodigo: aTally.rechazo_sin_codigo,
        rejectionRate: rate(
          aTally.rechazo_tipado + aTally.rechazo_sin_codigo,
          adversarial.length,
        ),
        geometriaIndebida: aTally.geometria_indebida,
        graveRate: rate(aGraves, adversarial.length),
        byFamily,
      },
      global: {
        cases: results.length,
        graves: dGraves + aGraves,
        graveRate: rate(dGraves + aGraves, results.length),
      },
      outcomes: Object.fromEntries(
        OUTCOMES.map((outcome) => [outcome, dTally[outcome] + aTally[outcome]]),
      ) as Record<NlCadOutcome, number>,
    },
    results,
    worst,
  };
}

/** Los desenlaces que la regla «fallo cerrado» prohíbe, para el informe. */
export function graveResults(results: NlCadCaseResult[]): NlCadCaseResult[] {
  return results.filter(
    (result) => result.grave && NL_CAD_GRAVE_OUTCOMES.includes(result.outcome),
  );
}
