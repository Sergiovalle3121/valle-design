/**
 * Geometría pura de la rejilla de ejes estructurales (ARQ-03).
 *
 * Un plano arquitectónico y estructural empieza por los ejes A-B-C / 1-2-3.
 * Esta función calcula las líneas de eje, los globos (círculo + clave) y las
 * cruces de etiqueta a partir de una receta declarativa. No crea entidades: es
 * geometría pura que la orden AXISGRID (ARQ-04) consume.
 *
 * ## Convención de claves
 *
 * - Alfabéticas: A, B, C, D, … **saltando I, O y Ñ** (para no confundir con 1,
 *   0 y N). Tras Z sigue AA, AB, …
 * - Numéricas: 1, 2, 3, …
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CadGridRecipe {
  /** Origen de la rejilla en coordenadas del documento. */
  origin: { x: number; y: number };
  /** Ángulo de rotación de la rejilla en grados (0 = ejes X/Y del documento). */
  angleDeg: number;
  /**
   * Espaciamientos en la dirección X (antes de rotar). Cada número es un vano.
   * Se puede dar como lista `[4500, 4500, 3000]` o como repetición `"3x4500"`.
   */
  spacingsX: number[];
  /** Espaciamientos en la dirección Y (antes de rotar). */
  spacingsY: number[];
  /** Extensión más allá del último eje (en unidades del documento). */
  extent: number;
  /** Radio del globo de etiqueta (en unidades del documento). */
  globeRadius: number;
}

export interface CadGridAxis {
  /** Punto inicial de la línea de eje. */
  start: { x: number; y: number };
  /** Punto final de la línea de eje. */
  end: { x: number; y: number };
  /** Clave asignada (alfabética para X, numérica para Y). */
  key: string;
  /** true si es eje vertical (dirección X), false si horizontal (dirección Y). */
  vertical: boolean;
}

export interface CadGridGlobe {
  /** Centro del círculo del globo. */
  center: { x: number; y: number };
  /** Clave mostrada dentro del globo. */
  key: string;
}

export interface CadGridCross {
  /** Centro de la cruz de etiqueta. */
  center: { x: number; y: number };
  /** Ángulo de rotación de la cruz en radianes. */
  angleRad: number;
  /** Longitud de cada brazo de la cruz. */
  armLength: number;
}

export interface CadGridResult {
  axes: CadGridAxis[];
  globes: CadGridGlobe[];
  crosses: CadGridCross[];
}

// ---------------------------------------------------------------------------
// Claves alfabéticas (saltando I, O, Ñ)
// ---------------------------------------------------------------------------


/**
 * Devuelve la n-ésima clave alfabética (0 = A, 1 = B, …), saltando I, O y Ñ.
 * Tras Z sigue AA, AB, …
 */
export function cadGridAlphaKey(index: number): string {
  if (index < 0) return "?";
  const base = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let n = index;
  let result = "";
  while (n >= 0) {
    result = base[n % base.length] + result;
    n = Math.floor(n / base.length) - 1;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Parseo de espaciamientos
// ---------------------------------------------------------------------------

/**
 * Interpreta una cadena de espaciamientos. Soporta:
 * - Lista: "4500,4500,3000" → [4500, 4500, 3000]
 * - Repetición: "3x4500" → [4500, 4500, 4500]
 * - Mezcla: "2x6000,3000" → [6000, 6000, 3000]
 *
 * Rechaza espaciamientos no positivos.
 */
export function cadParseGridSpacings(input: string): number[] | string {
  const result: number[] = [];
  for (const part of input.split(",").map((s) => s.trim()).filter(Boolean)) {
    const repeatMatch = /^(\d+)\s*x\s*(.+)$/i.exec(part);
    if (repeatMatch) {
      const count = parseInt(repeatMatch[1], 10);
      const value = parseFloat(repeatMatch[2]);
      if (!Number.isFinite(value) || value <= 0) return `El espaciamiento debe ser mayor que cero: "${part}".`;
      if (count <= 0) return `La repetición debe ser mayor que cero: "${part}".`;
      for (let i = 0; i < count; i++) result.push(value);
    } else {
      const value = parseFloat(part);
      if (!Number.isFinite(value) || value <= 0) return `El espaciamiento debe ser mayor que cero: "${part}".`;
      result.push(value);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Motor de rejilla
// ---------------------------------------------------------------------------

/**
 * Calcula la geometría pura de una rejilla de ejes estructurales.
 */
export function cadColumnGrid(recipe: CadGridRecipe): CadGridResult {
  const { origin, angleDeg, spacingsX, spacingsY, extent, globeRadius } = recipe;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  /** Rota un vector local (dx, dy) al marco del documento. */
  const rotate = (dx: number, dy: number): { x: number; y: number } => ({
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  });

  // Posiciones acumuladas de los ejes
  const xPositions = accumulatePositions(spacingsX);
  const yPositions = accumulatePositions(spacingsY);

  const axes: CadGridAxis[] = [];
  const globes: CadGridGlobe[] = [];
  const crosses: CadGridCross[] = [];

  const totalY = yPositions.length > 0 ? yPositions[yPositions.length - 1] : 0;
  const totalX = xPositions.length > 0 ? xPositions[xPositions.length - 1] : 0;

  // Ejes verticales (paralelos a Y, claves alfabéticas)
  for (let i = 0; i < xPositions.length; i++) {
    const x = xPositions[i];
    const key = cadGridAlphaKey(i);
    const start = { x: origin.x + rotate(x, -extent).x, y: origin.y + rotate(x, -extent).y };
    const end = { x: origin.x + rotate(x, totalY + extent).x, y: origin.y + rotate(x, totalY + extent).y };
    axes.push({ start, end, key, vertical: true });

    // Globos: uno arriba y otro abajo
    const globeUp = { x: origin.x + rotate(x, totalY + extent + globeRadius * 1.5).x, y: origin.y + rotate(x, totalY + extent + globeRadius * 1.5).y };
    const globeDown = { x: origin.x + rotate(x, -extent - globeRadius * 1.5).x, y: origin.y + rotate(x, -extent - globeRadius * 1.5).y };
    globes.push({ center: globeUp, key }, { center: globeDown, key });

    // Cruces: arriba y abajo
    const crossUp = { x: origin.x + rotate(x, totalY + extent + globeRadius * 0.5).x, y: origin.y + rotate(x, totalY + extent + globeRadius * 0.5).y };
    const crossDown = { x: origin.x + rotate(x, -extent - globeRadius * 0.5).x, y: origin.y + rotate(x, -extent - globeRadius * 0.5).y };
    crosses.push({ center: crossUp, angleRad, armLength: globeRadius * 0.3 }, { center: crossDown, angleRad, armLength: globeRadius * 0.3 });
  }

  // Ejes horizontales (paralelos a X, claves numéricas)
  for (let j = 0; j < yPositions.length; j++) {
    const y = yPositions[j];
    const key = String(j + 1);
    const start = { x: origin.x + rotate(-extent, y).x, y: origin.y + rotate(-extent, y).y };
    const end = { x: origin.x + rotate(totalX + extent, y).x, y: origin.y + rotate(totalX + extent, y).y };
    axes.push({ start, end, key, vertical: false });

    // Globos: uno a la izquierda y otro a la derecha
    const globeLeft = { x: origin.x + rotate(-extent - globeRadius * 1.5, y).x, y: origin.y + rotate(-extent - globeRadius * 1.5, y).y };
    const globeRight = { x: origin.x + rotate(totalX + extent + globeRadius * 1.5, y).x, y: origin.y + rotate(totalX + extent + globeRadius * 1.5, y).y };
    globes.push({ center: globeLeft, key }, { center: globeRight, key });

    // Cruces: izquierda y derecha
    const crossLeft = { x: origin.x + rotate(-extent - globeRadius * 0.5, y).x, y: origin.y + rotate(-extent - globeRadius * 0.5, y).y };
    const crossRight = { x: origin.x + rotate(totalX + extent + globeRadius * 0.5, y).x, y: origin.y + rotate(totalX + extent + globeRadius * 0.5, y).y };
    crosses.push({ center: crossLeft, angleRad, armLength: globeRadius * 0.3 }, { center: crossRight, angleRad, armLength: globeRadius * 0.3 });
  }

  return { axes, globes, crosses };
}

/** Acumula espaciamientos: [4500, 4500, 3000] → [0, 4500, 9000, 12000]. */
function accumulatePositions(spacings: number[]): number[] {
  const positions = [0];
  for (const s of spacings) {
    positions.push(positions[positions.length - 1] + s);
  }
  return positions;
}