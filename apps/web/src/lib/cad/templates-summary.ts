/**
 * La ficha de una plantilla: lo que se muestra en la paleta sin cargar su
 * cuerpo. Vive aparte de `templates.ts` a propósito — este módulo pesa nada y
 * el otro 306 KB en el bundle (medido el 2026-09-02) — y aparte del catálogo
 * generado, para que el generador y el spec de deriva compartan la misma
 * definición de «ficha» con la única función que la produce.
 */
import type { CadLayoutTemplate, CadLayoutTemplateId } from "./templates";

export interface CadLayoutTemplateSummary {
  id: CadLayoutTemplateId;
  label: string;
  category: CadLayoutTemplate["category"];
  description: string;
  /** Activos que instancia: lo que la paleta rotula como «N obj». */
  assetCount: number;
}

export function cadLayoutTemplateSummary(template: CadLayoutTemplate): CadLayoutTemplateSummary {
  return {
    id: template.id,
    label: template.label,
    category: template.category,
    description: template.description,
    assetCount: template.assets.length,
  };
}
