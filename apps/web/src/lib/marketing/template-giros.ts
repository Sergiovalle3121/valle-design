/**
 * Los giros del escaparate y sus tipos — MÓDULO HOJA, sin catálogo.
 *
 * Existe separado de `template-gallery.ts` por el bundle: el explorador de
 * /plantillas es un componente cliente y necesita la lista de giros para
 * pintar los filtros, pero el catálogo de plantillas pesa 5 000 líneas y es
 * asunto del servidor. Este módulo no importa nada, así que puede viajar al
 * navegador sin arrastrar geometría.
 */
export type TemplateGiro =
  | "vivienda"
  | "salud"
  | "alimentos"
  | "comercio"
  | "servicios"
  | "educacion"
  | "deporte-cultura"
  | "hospitalidad"
  | "industria-taller"
  | "tecnico";

export const TEMPLATE_GIROS: ReadonlyArray<{ id: TemplateGiro; label: string }> = [
  { id: "vivienda", label: "Vivienda" },
  { id: "salud", label: "Salud" },
  { id: "alimentos", label: "Alimentos y bebidas" },
  { id: "comercio", label: "Comercio" },
  { id: "servicios", label: "Servicios" },
  { id: "educacion", label: "Educación" },
  { id: "deporte-cultura", label: "Deporte y cultura" },
  { id: "hospitalidad", label: "Hospitalidad" },
  { id: "industria-taller", label: "Industria y taller" },
  { id: "tecnico", label: "Planos técnicos" },
];

/** La ficha serializable que viaja del servidor al explorador. */
export interface GalleryTemplate {
  id: string;
  label: string;
  description: string;
  giro: TemplateGiro;
  giroLabel: string;
  /** Huella en metros, para la ficha («12 × 8 m»). */
  widthM: number;
  heightM: number;
  objects: number;
}
