/**
 * El ESTILO de trazo de una entidad en la lámina: color, grosor y —desde el
 * 2026-09-02— el tipo de línea como `dash`.
 *
 * Medido antes: `CadVectorStyle.dash` existía y nadie lo asignaba; `styleFor`
 * resolvía `linetype` y lo tiraba, así que un eje en capa CENTER salía
 * continuo en el PDF y en la vista previa. Con PSLTSCALE=1 (el valor por
 * defecto de AutoCAD) el guion mide en PAPEL lo que dice el `.lin` por LTSCALE,
 * independiente de la escala de la ventana; PSLTSCALE no existe en el
 * documento y se asume ese defecto, dicho aquí y no escondido.
 */
import type { CadDocument, CadEntity, CadEntityPresentation, CadLayerDef, CadPaperViewport } from "./cad-document";
import type { CadVectorStyle } from "./paper-space";
import { cadLinetypeDashArray, cadLinetypePatternFor } from "./linetype-resolve";

export function unitToMm(unit: string): number {
  if (unit === "m") return 1000;
  if (unit === "cm") return 10;
  if (unit === "in") return 25.4;
  return 1;
}

export function blockPresentation(
  own: CadEntityPresentation | undefined,
  inherited: CadEntityPresentation | undefined,
): CadEntityPresentation | undefined {
  if (!own) return undefined;
  const property = <T extends { source: "byLayer" | "byBlock" | "explicit" }>(
    value: T | undefined,
    parent: T | undefined,
  ) => value?.source === "byBlock" ? parent : value;
  return {
    color: property(own.color, inherited?.color),
    linetype: property(own.linetype, inherited?.linetype),
    lineweight: property(own.lineweight, inherited?.lineweight),
  };
}

export function styleFor(
  entity: CadEntity,
  layerId: string,
  layers: Map<string, CadLayerDef>,
  viewport: CadPaperViewport,
  colorMode: "color" | "monochrome",
  lineweightScale: number,
  inheritedPresentation: CadEntityPresentation | undefined,
  document: Pick<CadDocument, "styles" | "meta">,
): CadVectorStyle {
  const layer = layers.get(layerId);
  const override = viewport.layerOverrides?.[layerId];
  const presentation = blockPresentation(entity.context?.presentation, inheritedPresentation);
  const explicit = presentation?.color;
  const color =
    colorMode === "monochrome"
      ? "#111827"
      : (override?.color ??
        (explicit?.source === "explicit" ? explicit.value : undefined) ??
        layer?.color ??
        "#334155");
  const rawWidth =
    override?.lineweight ??
    (presentation?.lineweight?.source === "explicit" ? presentation.lineweight.value : undefined) ??
    layer?.lineweight ??
    0.18;
  const lineWidth = Math.max(0.05, rawWidth * Math.max(0.1, lineweightScale));
  const linetypeName =
    presentation?.linetype?.source === "explicit" ? presentation.linetype.value : layer?.linetype;
  const pattern = linetypeName ? cadLinetypePatternFor(document, linetypeName) : undefined;
  const dash =
    pattern && pattern.length > 0
      ? cadLinetypeDashArray(pattern, document.meta.linetypeScale ?? 1, lineWidth)
      : undefined;
  // El NOMBRE viaja con el estilo para que el texto del tipo de línea
  // (`paper-space-linetype-text.ts`) se resuelva con la misma regla que el guion.
  return { stroke: color || "#334155", lineWidth, ...(dash ? { dash } : {}), ...(linetypeName ? { linetype: linetypeName } : {}) };
}
