/**
 * El patrón del sombreado, camino del papel.
 *
 * ## Qué repara
 *
 * El render en pantalla generaba el patrón desde siempre —`hatch-entity-adapter`
 * tesela ANSI31 y CROSS con filtro de islas— y la publicación lo tiraba: el PDF
 * salía con el contorno y el aviso `hatch_pattern_outline_only`. Este módulo es
 * ESA MISMA generación (idéntico espaciado por defecto, idéntico filtro de
 * islas, idéntica segunda pasada del CROSS), parametrizada para el trazado.
 * Pantalla y papel dejan de discrepar porque comparten el generador de
 * `hatch.ts` y las mismas reglas.
 *
 * ## La guarda de densidad
 *
 * Un sombreado con espaciado diminuto proyectado a una escala grande produce
 * cientos de miles de trazos: un PDF de 100 MB que ningún visor abre, sin que
 * nadie lo haya pedido. Antes de generar se estima el número de líneas de
 * barrido y se mide el espaciado EN PAPEL; si el patrón baja de
 * `CAD_HATCH_MIN_PAPER_SPACING_MM` o supera `CAD_HATCH_MAX_PUBLISH_STROKES`,
 * el sombreado degrada al contorno de siempre con el aviso
 * `hatch_pattern_too_dense`, que nombra las cifras. Degradar en silencio o
 * publicar el archivo imposible son las dos mentiras que la guarda evita.
 */
import type { CadPoint2, CadPoint3 } from "./cad-document";
import type { HatchSegment } from "./hatch";
import { cadHatchPatternLineEstimate, cadHatchPatternStrokes } from "./hatch-pattern-strokes";

/** Espaciado mínimo del patrón EN PAPEL. Por debajo, tinta sólida: se degrada. */
export const CAD_HATCH_MIN_PAPER_SPACING_MM = 0.3;

/** Tope de trazos por sombreado publicado. Por encima, contorno + aviso. */
export const CAD_HATCH_MAX_PUBLISH_STROKES = 4_000;

/** Lo que este generador necesita saber de un HATCH; la entidad lo satisface. */
export interface CadHatchPatternSource {
  boundaries: readonly (readonly CadPoint3[])[];
  pattern: string;
  solid: boolean;
  scale?: number;
  angle?: number;
  origin?: CadPoint3;
  islandStyle?: "normal" | "outer" | "ignore";
}

export interface CadHatchPublishWarning {
  /** `hatch_pattern_unknown`: el nombre no está en la tabla y se publica el rayado de respaldo (ANSI31). */
  code: "hatch_pattern_too_dense" | "hatch_pattern_unknown";
  detail: string;
}

export interface CadHatchPublishPlan {
  /** Trazos del patrón en coordenadas de MODELO; vacío si es sólido o degrada. */
  strokes: readonly HatchSegment[];
  warning?: CadHatchPublishWarning;
}

/**
 * Trazos del patrón de un sombreado para la publicación.
 *
 * `paperScale` son los milímetros de papel por unidad de dibujo de la ventana
 * (la norma de la matriz de proyección): es lo que permite medir la densidad
 * donde importa — sobre el papel — en vez de en unidades de modelo, donde el
 * mismo patrón puede ser fino en una lámina 1:50 e ilegible en una 1:5.
 */
export function buildCadHatchPublishStrokes(
  entity: CadHatchPatternSource,
  paperScale: number,
): CadHatchPublishPlan {
  const boundaries = entity.boundaries
    .map((boundary) => boundary.map((point): CadPoint2 => ({ x: point.x, y: point.y })))
    .filter((boundary) => boundary.length >= 3);
  if (entity.solid || !boundaries[0]) return { strokes: [] };

  // MISMOS defaults que el render en pantalla (hatch-entity-adapter.ts): si
  // divergieran, la previa enseñaría un patrón y el papel imprimiría otro.
  const flat = boundaries.flat();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of flat) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  const spacing = Math.max(entity.scale ?? diagonal / 40, diagonal / 256, 1e-6);

  const spacingOnPaperMm = spacing * Math.max(paperScale, 0);
  const tooDense = (detail: string): CadHatchPublishPlan => ({
    strokes: [],
    warning: { code: "hatch_pattern_too_dense", detail },
  });
  if (!(spacingOnPaperMm >= CAD_HATCH_MIN_PAPER_SPACING_MM))
    return tooDense(
      `El patrón ${entity.pattern} proyecta a ${spacingOnPaperMm.toFixed(3)} mm de espaciado en papel ` +
        `(mínimo ${CAD_HATCH_MIN_PAPER_SPACING_MM} mm): se publica el contorno.`,
    );
  // Estimación ANTES de generar: en un polígono cóncavo cada línea de barrido
  // puede partirse en varios trazos, pero nunca hay más líneas que diagonal /
  // espaciado. Estimar primero evita fabricar los cien mil trazos que la
  // guarda existe para no publicar.
  const estimatedLines = cadHatchPatternLineEstimate(entity.pattern, entity.angle, spacing, diagonal);
  if (estimatedLines > CAD_HATCH_MAX_PUBLISH_STROKES)
    return tooDense(
      `El patrón ${entity.pattern} necesitaría ~${estimatedLines} líneas de barrido ` +
        `(tope ${CAD_HATCH_MAX_PUBLISH_STROKES}): se publica el contorno.`,
    );

  const { strokes, known } = cadHatchPatternStrokes(boundaries, entity, spacing);
  if (strokes.length > CAD_HATCH_MAX_PUBLISH_STROKES)
    return tooDense(
      `El patrón ${entity.pattern} produjo ${strokes.length} trazos ` +
        `(tope ${CAD_HATCH_MAX_PUBLISH_STROKES}): se publica el contorno.`,
    );
  if (!known)
    return {
      strokes,
      warning: {
        code: "hatch_pattern_unknown",
        detail: `El patrón ${entity.pattern} no está en la tabla: se publica el rayado de respaldo (ANSI31).`,
      },
    };
  return { strokes };
}
