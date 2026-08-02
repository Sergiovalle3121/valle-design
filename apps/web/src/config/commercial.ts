export type CommercialPlan = {
  name: string;
  description: string;
  features: readonly string[];
  approvedPrice?: string;
  salesOnly?: boolean;
};

const configuredUrl = (value: string | undefined, fallback: string) =>
  value?.trim() || fallback;

/** Contenido comercial local. Un precio sólo se publica tras aprobarlo aquí. */
export const COMMERCIAL_PLANS: readonly CommercialPlan[] = [
  {
    name: "Individual",
    description:
      "Para profesionales que crean y publican documentación técnica.",
    features: [
      "Edición 2D de precisión",
      "Importación y exportación DXF",
      "Historial de versiones",
    ],
  },
  {
    name: "Equipo",
    description: "Para equipos que revisan, comparan y entregan planos juntos.",
    features: [
      "Todo lo incluido en Individual",
      "Reviews y trazabilidad",
      "Controles de acceso",
    ],
  },
  {
    name: "Organización",
    description:
      "Para despliegues con requisitos avanzados de control y soporte.",
    features: [
      "Todo lo incluido en Equipo",
      "Acompañamiento de adopción",
      "Gobierno y seguridad ampliados",
    ],
    salesOnly: true,
  },
];

export const COMMERCIAL_LINKS = {
  sales: configuredUrl(
    process.env.NEXT_PUBLIC_SALES_URL,
    "/contact?topic=demo",
  ),
  documentation: configuredUrl(
    process.env.NEXT_PUBLIC_DOCUMENTATION_URL,
    "/docs",
  ),
  support: configuredUrl(process.env.NEXT_PUBLIC_SUPPORT_URL, "/support"),
  status: configuredUrl(process.env.NEXT_PUBLIC_STATUS_URL, "/status"),
  contact: configuredUrl(process.env.NEXT_PUBLIC_CONTACT_URL, "/contact"),
  privacy: configuredUrl(process.env.NEXT_PUBLIC_PRIVACY_URL, "/privacy"),
  terms: configuredUrl(process.env.NEXT_PUBLIC_TERMS_URL, "/terms"),
  licenses: configuredUrl(process.env.NEXT_PUBLIC_LICENSES_URL, "/licenses"),
} as const;
