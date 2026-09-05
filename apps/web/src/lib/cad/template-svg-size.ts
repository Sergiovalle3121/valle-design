/**
 * La geometría de la lámina de una plantilla: tres constantes y la aritmética
 * que convierte una huella en metros al tamaño exacto del SVG.
 *
 * POR QUÉ VIVE APARTE DE `template-render.ts`. Las tarjetas del explorador de
 * plantillas declaran `width`/`height` exactos para no mover la retícula al
 * cargar (CLS 0), y para eso sólo necesitan esta división. Pero
 * `template-render.ts` —donde estaba— importa `collab/plan-projection`, que a
 * su vez importa `CAD_ENTITY_REGISTRY` de `entity-runtime`: el registro de
 * entidades con todos sus adaptadores. Resultado: `/plantillas`, una página
 * pública que sólo enseña miniaturas, viajaba con el motor CAD dentro y se
 * comía su presupuesto de bytes.
 *
 * Medido el 2026-09-04: la ruta pasó de 362.5 KB gzip —6.0 por encima de su
 * techo de 356.5— a caber, sin tocar el techo. El presupuesto dice «sólo
 * bajan», así que lo que se corrige es la dependencia.
 *
 * `template-render.ts` consume estas mismas constantes, de modo que el tamaño
 * que declara la tarjeta y el que pinta el SVG no pueden separarse.
 */

/** Ancho por defecto del SVG de una lámina, en píxeles. */
export const SVG_WIDTH = 1200;
/** Alto del cajetín, en píxeles. */
export const TITLE_BLOCK_PX = 76;
/** Margen alrededor del dibujo, en píxeles. */
export const PLAN_MARGIN_PX = 36;

/**
 * Dimensiones del SVG SIN construir el documento: la misma aritmética que usa
 * `renderCadTemplateSvg`. Existe para que las tarjetas declaren width/height
 * exactos (CLS 0) sin pagar una construcción de documento por tarjeta.
 */
export function cadTemplateSvgSize(
  footprintW: number,
  footprintH: number,
  width = SVG_WIDTH,
): { width: number; height: number } {
  const scale = (width - PLAN_MARGIN_PX * 2) / footprintW;
  return {
    width,
    height: Math.round(footprintH * scale + PLAN_MARGIN_PX * 2 + TITLE_BLOCK_PX),
  };
}
