import type { CadPipeClashKind, CadPipeClashReport } from "./clash";

const redondo = (valor: number): number => Math.round(valor * 100) / 100;

/** Cómo se nombra una severidad en la línea de órdenes. */
export const CAD_PL_CLASH_WORD: Record<CadPipeClashKind, string> = {
  "choque-duro": "CHOQUE",
  "holgura-insuficiente": "HOLGURA INSUFICIENTE",
  "paso-por-hueco": "PASO POR HUECO",
};

/** El informe en una línea, para el renglón de una orden. */
export function cadPipeClashSummary(report: CadPipeClashReport): string {
  if (report.obstacles === 0)
    return "sin estructura contra la que chocar: el dibujo no tiene muros ni sólidos";
  const duros = report.clashes.filter((choque) => choque.kind === "choque-duro").length;
  const holguras = report.clashes.filter(
    (choque) => choque.kind === "holgura-insuficiente",
  ).length;
  const pasos = report.clashes.filter((choque) => choque.kind === "paso-por-hueco").length;
  if (duros === 0 && holguras === 0 && pasos === 0)
    return `sin choques contra ${report.obstacles} elemento(s) construido(s), con holgura de ${redondo(report.clearance)}`;
  return `${duros} choque(s), ${holguras} holgura(s) insuficiente(s) y ${pasos} paso(s) por hueco contra ${report.obstacles} elemento(s) construido(s)`;
}
