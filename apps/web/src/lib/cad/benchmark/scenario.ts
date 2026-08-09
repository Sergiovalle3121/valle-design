/**
 * Guion de vistas y estadística compartidos por TODAS las medidas de render.
 *
 * ## Por qué esto vive aquí y no en `render/render-benchmark.ts`
 *
 * Aquel módulo importa `node:perf_hooks`, así que arrastrarlo a un paquete de
 * navegador rompe el empaquetado. Y sin embargo el guion —encuadre completo,
 * paseo horizontal, zoom de 4×— tiene que ser EL MISMO en Node y en el
 * navegador: comparar un `panFrameP95Ms` de Node con un FPS de Chromium
 * medidos sobre recorridos distintos no compara nada.
 *
 * De ahí la extracción: la geometría del guion es pura y no sabe dónde corre.
 * `render-benchmark.ts` lo reexporta para que nada de lo que ya lo importaba
 * tenga que cambiar de sitio.
 */
import { CAD_ENTITY_REGISTRY, type CadBounds, type CadNativeEntity } from "../entity-runtime";
import type { CadDocument } from "../cad-document";
import type { CadRenderView } from "../render/pipeline";

export interface CadRenderScenario {
  /** Vista inicial: el encuadre completo del dibujo. */
  initial: CadRenderView;
  /** Paradas de paneo, en orden. */
  pan: CadRenderView[];
  /** Vista tras el zoom. */
  zoom: CadRenderView;
}

/**
 * p-ésimo percentil por interpolación de rango («nearest rank»).
 *
 * Devuelve 0 con la muestra vacía en vez de `NaN` a propósito: un `NaN` que
 * viaja a un JSON de evidencia se serializa como `null` y desaparece. Quien
 * consuma esto debe mirar SIEMPRE el recuento de muestras al lado.
 */
export function cadPercentile(samples: readonly number[], fraction: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return Math.round(sorted[index] * 1_000) / 1_000;
}

export function cadRound3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

export function cadDocumentBounds(
  entities: readonly CadNativeEntity[],
  document?: CadDocument,
): CadBounds {
  let bounds: CadBounds | null = null;
  for (const entity of entities) {
    if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
    const entityBounds = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity, document);
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, entityBounds.minX),
          minY: Math.min(bounds.minY, entityBounds.minY),
          maxX: Math.max(bounds.maxX, entityBounds.maxX),
          maxY: Math.max(bounds.maxY, entityBounds.maxY),
        }
      : { ...entityBounds };
  }
  return bounds ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

/**
 * Guion determinista: encuadre completo, un paseo horizontal por el centro con
 * ventanas de un cuarto de la extensión, y un zoom de 4× al final. Mismo guion
 * para los dos caminos; cambiar el guion cambia los dos números a la vez, que es
 * la única forma de que la comparación siga significando algo.
 */
export function createCadRenderScenario(
  bounds: CadBounds,
  panStops = 12,
  viewportPx = 1_600,
): CadRenderScenario {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1);
  const initial: CadRenderView = {
    bounds: { ...bounds },
    pixelsPerUnit: viewportPx / Math.max(spanX, spanY),
  };
  const windowSpanX = spanX / 4;
  const windowSpanY = spanY / 4;
  const panPixelsPerUnit = viewportPx / Math.max(windowSpanX, windowSpanY);
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const pan: CadRenderView[] = [];
  for (let stop = 0; stop < panStops; stop += 1) {
    const originX =
      bounds.minX + ((spanX - windowSpanX) * stop) / Math.max(1, panStops - 1);
    pan.push({
      bounds: {
        minX: originX,
        minY: centerY - windowSpanY / 2,
        maxX: originX + windowSpanX,
        maxY: centerY + windowSpanY / 2,
      },
      pixelsPerUnit: panPixelsPerUnit,
    });
  }
  const last = pan[pan.length - 1] ?? initial;
  const zoomCenterX = (last.bounds.minX + last.bounds.maxX) / 2;
  const zoomCenterY = (last.bounds.minY + last.bounds.maxY) / 2;
  const zoomSpanX = (last.bounds.maxX - last.bounds.minX) / 4;
  const zoomSpanY = (last.bounds.maxY - last.bounds.minY) / 4;
  return {
    initial,
    pan,
    zoom: {
      bounds: {
        minX: zoomCenterX - zoomSpanX / 2,
        minY: zoomCenterY - zoomSpanY / 2,
        maxX: zoomCenterX + zoomSpanX / 2,
        maxY: zoomCenterY + zoomSpanY / 2,
      },
      pixelsPerUnit: last.pixelsPerUnit * 4,
    },
  };
}
