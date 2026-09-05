/**
 * Render SVG de una plantilla del catálogo — con el MOTOR, no con un dibujante.
 *
 * La geometría sale de `projectCadPlan`, que dibuja con el registro de
 * entidades del editor (el mismo que usa la vista de revisión del invitado):
 * si el motor cambia cómo se traza una entidad, el render cambia con él y el
 * manifiesto de la galería lo delata por hash. Encima de los trazos van solo
 * dos cosas que la proyección no rotula: las etiquetas de los locales (el
 * `label` de cada `box`, que es dato del documento) y el cajetín, relleno con
 * los campos REALES del espacio papel (lámina, escala elegida, disciplina).
 *
 * Colores: el papel y la tinta son los tokens del sistema (`theme-colors.ts`);
 * los trazos llevan el color de SU CAPA según la norma mexicana de capas, que
 * viaja en el documento. En claro, un color de capa pensado para fondo oscuro
 * se oscurece proporcionalmente para conservar el contraste — misma regla para
 * todas las capas, nada elegido a mano por plantilla.
 *
 * Determinista de punta a punta: mismo documento, mismo SVG, mismo hash.
 */
import type { CadEntity } from "./cad-document";
import {
  cadPlanStrokePath,
  projectCadPlan,
} from "./collab/plan-projection";
import { themeSurface, type ThemeName } from "../design/theme-colors";
import type { CadTemplateDocumentResult } from "./template-document";
// Las constantes de la lámina y el cálculo del tamaño viven en su propio módulo
// para que las tarjetas del explorador puedan pedirlos SIN arrastrar
// `plan-projection` y, con él, el registro de entidades entero. El porqué,
// medido en bytes, está escrito en `template-svg-size.ts`. Se consumen desde
// aquí para que el tamaño que declara la tarjeta y el que pinta el SVG no
// puedan separarse.
import { PLAN_MARGIN_PX, SVG_WIDTH, TITLE_BLOCK_PX } from "./template-svg-size";

export { cadTemplateSvgSize } from "./template-svg-size";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Un color de capa de la norma (pensado para grafito) sobre papel claro:
 * se reescala su luminancia hacia la tinta. Proporcional y uniforme — la
 * jerarquía relativa entre capas se conserva.
 */
function inkForLightPaper(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const n = parseInt(match[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luminance <= 0.55) return `#${match[1].toLowerCase()}`;
  const factor = 0.55 / luminance;
  const dim = (channel: number) => Math.round(channel * factor);
  return `#${((dim(r) << 16) | (dim(g) << 8) | dim(b)).toString(16).padStart(6, "0")}`;
}

export interface CadTemplateSvgOptions {
  theme: ThemeName;
  /** Ancho del lienzo en px (alto en proporción a la huella + cajetín). */
  width?: number;
}

export interface CadTemplateSvgResult {
  svg: string;
  width: number;
  height: number;
  /** Trazos proyectados: la spec afirma que ninguna plantilla rinde vacía. */
  strokes: number;
}

export function renderCadTemplateSvg(
  built: CadTemplateDocumentResult,
  options: CadTemplateSvgOptions,
): CadTemplateSvgResult {
  const { document, template, scaleDenominator } = built;
  const surface = themeSurface(options.theme);
  const projection = projectCadPlan(document);
  const width = options.width ?? SVG_WIDTH;

  const footprintW = template.baseWidth;
  const footprintH = template.baseHeight;
  const planWidth = width - PLAN_MARGIN_PX * 2;
  const scale = planWidth / footprintW;
  const planHeight = footprintH * scale;
  const height = Math.round(planHeight + PLAN_MARGIN_PX * 2 + TITLE_BLOCK_PX);

  const toX = (x: number) => PLAN_MARGIN_PX + x * scale;
  /**
   * El modelo CAD es y-ARRIBA (la convención de todo el pipeline: DXF, plot,
   * cotas). El SVG es y-abajo, así que se voltea aquí — de lo contrario la
   * tarjeta de la galería y la lámina PDF descargable saldrían en espejo una
   * de la otra, y las dos son EL MISMO documento.
   */
  const toY = (y: number) => PLAN_MARGIN_PX + (footprintH - y) * scale;
  const ink = (color: string) =>
    options.theme === "light" ? inkForLightPaper(color) : color;

  /**
   * El adaptador de texto proyecta su CAJA (4 puntos), no sus glifos: esos
   * trazos se filtran y el rótulo se compone como <text> real con la
   * tipografía del sistema — mismo contenido, mejor letra.
   */
  const textIds = new Set(
    document.entities.flatMap((entity) => (entity.type === "text" ? [entity.id] : [])),
  );
  const paths: string[] = [];
  for (const stroke of projection.strokes) {
    if (textIds.has(stroke.entityId)) continue;
    const d = cadPlanStrokePath({
      ...stroke,
      points: stroke.points.map((point) => ({ x: toX(point.x), y: toY(point.y) })),
    });
    paths.push(
      `<path d="${d}" fill="none" stroke="${ink(stroke.color)}" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>`,
    );
  }

  /** Rótulos: las entidades de texto del documento, a su altura anotativa. */
  const labels: string[] = [];
  for (const entity of document.entities) {
    if (entity.type !== "text") continue;
    const cx = toX(entity.x);
    const cy = toY(entity.y);
    const fontPx = Math.max(8.5, Math.min(15, (entity.height ?? 250) * scale * 0.85));
    labels.push(
      `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${fontPx.toFixed(1)}" fill="${surface.foreground}" fill-opacity="0.82">${escapeXml(entity.text)}</text>`,
    );
  }

  /** Retícula de papel milimetrado, como la del producto (blueprint-grid). */
  const gridStep = 32;
  const grid = `<pattern id="g" width="${gridStep}" height="${gridStep}" patternUnits="userSpaceOnUse"><path d="M ${gridStep} 0 L 0 0 0 ${gridStep}" fill="none" stroke="${surface.border}" stroke-width="0.5" opacity="0.55"/></pattern>`;

  /** Cajetín: campos reales del espacio papel (atributos del cajetín). */
  const attributes = document.paperSpaces[0]?.titleBlock?.attributes ?? {};
  const sheetNumber = attributes.DRAWING_NO ?? "";
  const discipline = attributes.DISCIPLINE ?? "";
  const tbTop = height - TITLE_BLOCK_PX;
  const titleBlock = [
    `<g font-family="JetBrains Mono, ui-monospace, monospace">`,
    `<rect x="0" y="${tbTop}" width="${width}" height="${TITLE_BLOCK_PX}" fill="${surface.muted}"/>`,
    `<line x1="0" y1="${tbTop}" x2="${width}" y2="${tbTop}" stroke="${surface.border}" stroke-width="1"/>`,
    `<text x="${PLAN_MARGIN_PX}" y="${tbTop + 30}" font-size="17" font-weight="600" fill="${surface.foreground}">${escapeXml(template.label)}</text>`,
    `<text x="${PLAN_MARGIN_PX}" y="${tbTop + 52}" font-size="11" fill="${surface.foreground}" fill-opacity="0.66">${escapeXml(discipline)} · ${escapeXml(String(sheetNumber))} · ${footprintW / 1000} × ${footprintH / 1000} m</text>`,
    `<text x="${width - PLAN_MARGIN_PX}" y="${tbTop + 30}" text-anchor="end" font-size="14" font-weight="600" fill="${surface.primary}">ESC 1:${scaleDenominator}</text>`,
    `<text x="${width - PLAN_MARGIN_PX}" y="${tbTop + 52}" text-anchor="end" font-size="11" fill="${surface.foreground}" fill-opacity="0.66">VALLE DESIGN · plantilla del catálogo</text>`,
    `</g>`,
  ].join("");

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(`Plano de ${template.label}, plantilla CAD`)}">`,
    `<defs>${grid}</defs>`,
    `<rect width="${width}" height="${height}" fill="${surface.background}"/>`,
    `<rect width="${width}" height="${tbTop}" fill="url(#g)"/>`,
    `<g font-family="Inter, system-ui, sans-serif">`,
    ...labels,
    `</g>`,
    ...paths,
    titleBlock,
    `</svg>`,
  ].join("\n");

  return { svg, width, height, strokes: projection.strokes.length };
}

/** Entidades de texto del documento (para la ficha de la plantilla). */
export function cadTemplateNotes(entities: readonly CadEntity[]): string[] {
  return entities.flatMap((entity) => (entity.type === "text" ? [entity.text] : []));
}
