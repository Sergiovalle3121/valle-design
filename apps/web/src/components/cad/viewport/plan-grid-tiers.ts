import * as THREE from "three";

/**
 * La rejilla de planta con DOS intensidades, como AutoCAD.
 *
 * ## Por qué esto era un bug de percepción, no de geometría
 *
 * `Layout3DEditor.applyTheme` ya construía una rejilla rectangular exacta al
 * contorno de la planta — la aritmética estaba bien. Lo que faltaba es que
 * `THEMES` (`studio/editor-presentation.ts`) declara `gridA` y `gridB` para
 * los CUATRO temas desde antes de esta ola y nunca se leía `gridA`: la rejilla
 * entera se pintaba con un solo color (`gridB`, el tenue). El resultado es la
 * queja del dueño — «fondo azul marino liso, SIN rejilla» — no porque no
 * hubiera rejilla, sino porque a la densidad y opacidad con la que se pintaba
 * era indistinguible del fondo en una laptop a la distancia normal de uso.
 *
 * Esta función separa las líneas en dos cubos —MENOR (cada `spacing`) y MAYOR
 * (cada `majorEvery` líneas menores)— para que `Layout3DEditor` las pinte con
 * `gridB`/`gridA` respectivamente. Pura y sin THREE.Scene a propósito: así se
 * puede fijar el contrato con `tsx`, sin navegador.
 */
export interface CadPlanGridTiersInput {
  /** Media anchura de la planta, en unidades de mundo (ya multiplicadas por `ctx.s`). */
  halfWidth: number;
  /** Media altura de la planta, en las mismas unidades. */
  halfHeight: number;
  /** Espaciado entre líneas MENORES, en las mismas unidades. Debe ser positivo. */
  spacing: number;
  /** Cada cuántas líneas menores cae una MAYOR. Redondeado, mínimo 1. Por defecto 5. */
  majorEvery?: number;
  /**
   * Techo de líneas POR EJE (igual que el límite de rendimiento que ya tenía
   * el bucle original: 60). Evita miles de segmentos cuando `spacing` es
   * minúsculo frente al tamaño de la planta.
   */
  maxLinesPerAxis?: number;
}

export interface CadPlanGridTierPoints {
  /** Pares de puntos para un `THREE.LineSegments` — las líneas MENORES. */
  minor: THREE.Vector3[];
  /** Pares de puntos para un `THREE.LineSegments` — las líneas MAYORES. */
  major: THREE.Vector3[];
}

const DEFAULT_MAJOR_EVERY = 5;
const DEFAULT_MAX_LINES_PER_AXIS = 60;

export function computeCadPlanGridTiers(
  input: CadPlanGridTiersInput,
): CadPlanGridTierPoints {
  const { halfWidth, halfHeight, spacing } = input;
  if (!(halfWidth > 0) || !(halfHeight > 0) || !(spacing > 0)) {
    return { minor: [], major: [] };
  }
  const majorEvery = Math.max(1, Math.round(input.majorEvery ?? DEFAULT_MAJOR_EVERY));
  const cap = Math.max(2, Math.round(input.maxLinesPerAxis ?? DEFAULT_MAX_LINES_PER_AXIS));
  const nx = Math.min(cap, Math.max(2, Math.round((halfWidth * 2) / spacing)));
  const nz = Math.min(cap, Math.max(2, Math.round((halfHeight * 2) / spacing)));
  const minor: THREE.Vector3[] = [];
  const major: THREE.Vector3[] = [];
  for (let i = 0; i <= nx; i++) {
    const x = -halfWidth + (i / nx) * (halfWidth * 2);
    const bucket = i % majorEvery === 0 ? major : minor;
    bucket.push(new THREE.Vector3(x, 0, -halfHeight), new THREE.Vector3(x, 0, halfHeight));
  }
  for (let j = 0; j <= nz; j++) {
    const z = -halfHeight + (j / nz) * (halfHeight * 2);
    const bucket = j % majorEvery === 0 ? major : minor;
    bucket.push(new THREE.Vector3(-halfWidth, 0, z), new THREE.Vector3(halfWidth, 0, z));
  }
  return { minor, major };
}

/**
 * «Espaciado que sigue el zoom» (pedido del dueño): a AutoCAD se le apaga la
 * subrejilla cuando queda demasiado densa para leerse — nunca la mayor. Aquí
 * no se reconstruye geometría cada cuadro (costaría caro); se decide UNA
 * comparación por cuadro y quien llama alterna `.visible` en el objeto MENOR
 * ya construido. `pixelsPerUnit` es el mismo valor que ya calcula
 * `viewController.view` para el resto del pipeline (cero fuente nueva de
 * verdad sobre el zoom).
 */
export function cadPlanGridMinorVisible(
  pixelsPerUnit: number,
  spacingWorld: number,
): boolean {
  if (!(pixelsPerUnit > 0) || !(spacingWorld > 0)) return false;
  return pixelsPerUnit * spacingWorld >= 6;
}
