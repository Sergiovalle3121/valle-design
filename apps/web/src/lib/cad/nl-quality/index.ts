/**
 * Banco de calidad NL→CAD: punto único de entrada.
 *
 * El corpus completo se exporta ya unido porque el banco no tiene sentido a
 * mitades: publicar sólo la tasa del corpus de despacho sería publicar la mitad
 * halagadora. Quien mide, mide las dos.
 */
export * from "./types";
export * from "./scene";
export * from "./harness";
export * from "./report";
export { NL_CAD_CORPUS_DESPACHO } from "./corpus-despacho";
export { NL_CAD_CORPUS_ADVERSARIAL } from "./corpus-adversarial";

import { NL_CAD_CORPUS_ADVERSARIAL } from "./corpus-adversarial";
import { NL_CAD_CORPUS_DESPACHO } from "./corpus-despacho";
import { runNlCadCases } from "./harness";
import { summarizeNlCad, type NlCadBenchmarkRun } from "./report";
import type { NlCadCase } from "./types";

/** Identificador del banco; viaja al artefacto de evidencia. */
export const NL_CAD_BENCHMARK_ID = "valle-design-nl-cad-quality-v1";

export const NL_CAD_CORPUS: NlCadCase[] = [
  ...NL_CAD_CORPUS_DESPACHO,
  ...NL_CAD_CORPUS_ADVERSARIAL,
];

/** Corre el banco entero. Determinista: mismo árbol, mismas cifras. */
export function runNlCadBenchmark(
  cases: NlCadCase[] = NL_CAD_CORPUS,
): NlCadBenchmarkRun {
  return summarizeNlCad(cases, runNlCadCases(cases));
}
