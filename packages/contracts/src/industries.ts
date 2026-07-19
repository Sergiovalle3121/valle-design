/**
 * Catálogo de industrias de AXOS OS (AXOS-ADAPT-001).
 *
 * Fuente de verdad compartida del contrato de industria: los slugs viajan en
 * `tenants.industry` (alta self-service) y parametrizan el producto por
 * empresa — el descriptor del asistente CIDE hoy; plantillas de proceso,
 * seeds y símbolos CAD en slices posteriores.
 *
 * `apps/web/src/config/industries.ts` refleja la lista para el formulario de
 * alta; si añades una industria aquí, añádela también allí (y su etiqueta en
 * `apps/web/messages/{en,es}/auth.json`).
 */
export const INDUSTRY_IDS = [
  "electronics",
  "metalworking",
  "automotive",
  "aerospace",
  "food-beverage",
  "pharma-medical",
  "plastics-rubber",
  "textiles",
  "furniture-wood",
  "chemicals",
  "consumer-goods",
  "machinery",
  "logistics",
  "food-service",
  "retail",
  "professional-services",
  "construction",
  "healthcare",
  "other",
] as const;

export type IndustryId = (typeof INDUSTRY_IDS)[number];

export interface IndustryProfile {
  id: IndustryId;
  /** Descriptor en español para prompts/copys: "una empresa …". */
  descriptorEs: string;
  /** English descriptor for prompts/copy: "a … company". */
  descriptorEn: string;
}

export const INDUSTRY_PROFILES: Record<IndustryId, IndustryProfile> = {
  electronics: {
    id: "electronics",
    descriptorEs:
      "una empresa de manufactura electrónica (EMS/ensamble de electrónica)",
    descriptorEn: "an electronics manufacturing (EMS) company",
  },
  metalworking: {
    id: "metalworking",
    descriptorEs: "una empresa metalmecánica y de maquinado",
    descriptorEn: "a metalworking and machining company",
  },
  automotive: {
    id: "automotive",
    descriptorEs: "una empresa del sector automotriz",
    descriptorEn: "an automotive-sector company",
  },
  aerospace: {
    id: "aerospace",
    descriptorEs: "una empresa aeroespacial y de defensa",
    descriptorEn: "an aerospace and defense company",
  },
  "food-beverage": {
    id: "food-beverage",
    descriptorEs: "una empresa de alimentos y bebidas",
    descriptorEn: "a food and beverage company",
  },
  "pharma-medical": {
    id: "pharma-medical",
    descriptorEs: "una empresa farmacéutica o de dispositivos médicos",
    descriptorEn: "a pharmaceutical or medical-device company",
  },
  "plastics-rubber": {
    id: "plastics-rubber",
    descriptorEs: "una empresa de plásticos y hule",
    descriptorEn: "a plastics and rubber company",
  },
  textiles: {
    id: "textiles",
    descriptorEs: "una empresa textil y de confección",
    descriptorEn: "a textiles and apparel company",
  },
  "furniture-wood": {
    id: "furniture-wood",
    descriptorEs: "una empresa de muebles y madera",
    descriptorEn: "a furniture and woodworking company",
  },
  chemicals: {
    id: "chemicals",
    descriptorEs: "una empresa química",
    descriptorEn: "a chemicals company",
  },
  "consumer-goods": {
    id: "consumer-goods",
    descriptorEs: "una empresa de bienes de consumo",
    descriptorEn: "a consumer-goods company",
  },
  machinery: {
    id: "machinery",
    descriptorEs: "una empresa de maquinaria industrial",
    descriptorEn: "an industrial machinery company",
  },
  logistics: {
    id: "logistics",
    descriptorEs: "una empresa de logística y distribución",
    descriptorEn: "a logistics and distribution company",
  },
  "food-service": {
    id: "food-service",
    descriptorEs: "un restaurante o empresa de alimentos preparados",
    descriptorEn: "a restaurant / food-service company",
  },
  retail: {
    id: "retail",
    descriptorEs: "una empresa de comercio minorista (retail)",
    descriptorEn: "a retail company",
  },
  "professional-services": {
    id: "professional-services",
    descriptorEs: "una firma de servicios profesionales",
    descriptorEn: "a professional-services firm",
  },
  construction: {
    id: "construction",
    descriptorEs: "una constructora",
    descriptorEn: "a construction company",
  },
  healthcare: {
    id: "healthcare",
    descriptorEs: "una clínica u organización de salud",
    descriptorEn: "a healthcare organization",
  },
  other: {
    id: "other",
    descriptorEs: "una empresa industrial",
    descriptorEn: "an industrial company",
  },
};

/** Descriptor neutro cuando el tenant no declaró industria. */
export const DEFAULT_INDUSTRY_DESCRIPTOR_ES = "una empresa industrial";

export function industryDescriptorEs(industry?: string | null): string {
  if (!industry) return DEFAULT_INDUSTRY_DESCRIPTOR_ES;
  const profile = INDUSTRY_PROFILES[industry as IndustryId];
  return profile?.descriptorEs ?? DEFAULT_INDUSTRY_DESCRIPTOR_ES;
}
