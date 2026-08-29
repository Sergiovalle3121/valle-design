/**
 * LAS CIFRAS PÚBLICAS DE INGENIERÍA — leídas de los artefactos, jamás a mano.
 *
 * La sección «ingeniería que puedes auditar» de la portada publica números
 * que ningún competidor puede publicar: casos matemáticos contra oráculo,
 * comandos con veredicto de integridad, plantillas con hash de deriva. La
 * regla de la casa es que una cifra pública sale de un artefacto de evidencia
 * y de ningún otro sitio: estos imports se resuelven EN BUILD (webpack inlina
 * el JSON), así que la página no puede decir un número que el repositorio no
 * haya medido — y si el artefacto desaparece, el build revienta en vez de
 * publicar humo.
 *
 * Artefactos fuente:
 * - docs/cad/evidence/cad-math-cases.json     ← scripts/cad/check-cad-math.mjs --write
 * - docs/cad/evidence/command-integrity.json  ← scripts/cad/check-command-integrity.mjs --write
 * - docs/cad/evidence/template-gallery.json   ← apps/web/scripts/template-gallery-evidence.mts
 */
import mathCases from "../../../../../docs/cad/evidence/cad-math-cases.json";
import commandIntegrity from "../../../../../docs/cad/evidence/command-integrity.json";
import templateGallery from "../../../../../docs/cad/evidence/template-gallery.json";

export interface EvidenceFigure {
  /** El número, tal cual lo midió el artefacto. */
  value: number;
  /** Qué es, en una línea. */
  label: string;
  /** La explicación honesta de qué significa y qué no. */
  detail: string;
}

export function siteEvidenceFigures(): EvidenceFigure[] {
  const integrity = commandIntegrity as {
    total: number;
    verdicts: Record<string, number>;
  };
  const math = mathCases as { totalCases: number; outOfTolerance: number };
  const gallery = templateGallery as { plantillas: number };
  return [
    {
      value: math.totalCases,
      label: "casos matemáticos contra oráculo",
      detail:
        "Geometría, ángulos, escalas y unidades verificados contra un oráculo " +
        "independiente en cada corrida de CI. Desviaciones fuera de tolerancia " +
        `hoy: ${math.outOfTolerance}.`,
    },
    {
      value: integrity.total,
      label: "comandos con veredicto de integridad",
      detail:
        "Cada comando del editor se audita: o muta el documento, o delega, o " +
        "informa su límite. Comandos que fingen éxito sin hacer nada: " +
        `${integrity.verdicts.ROJO ?? 0}.`,
    },
    {
      value: integrity.verdicts.ROJO ?? 0,
      label: "éxitos falsos permitidos",
      detail:
        "La regla de oro del producto: ningún comando puede decir «listo» sin " +
        "haber hecho el trabajo. Este número tiene que ser cero para que CI " +
        "pase — y es cero.",
    },
    {
      value: gallery.plantillas,
      label: "plantillas con hash de deriva",
      detail:
        "Cada plantilla del catálogo se reconstruye y hashea en CI: si el motor " +
        "cambia cómo dibuja, el manifiesto lo delata y el cambio queda firmado " +
        "en el commit.",
    },
  ];
}
