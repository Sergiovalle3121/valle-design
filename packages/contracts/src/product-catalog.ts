/**
 * CATÁLOGO DE PRODUCTOS — SUPERFICIE DE VALLE DESIGN.
 *
 * En el monorepo de origen este archivo era el catálogo comercial completo
 * (ofertas, métricas de cobro, canales de venta, modalidades de despliegue,
 * políticas de prueba). Nada de eso pertenece a Valle Design: aquí no se
 * vende, no se cotiza y no se factura. Lo único que el producto necesita del
 * catálogo son los identificadores que cruzan la frontera hacia Platform:
 *
 *   • el `productCode` con el que Platform nombra a este producto (`design`),
 *     junto a la base común incluida (`platform-core`);
 *   • el `capabilityId` que el guard server-side exige en TODOS los endpoints
 *     (`design.cad`, ver `design-contracts.ts`).
 *
 * ─── Neutralidad de marca ────────────────────────────────────────────────────
 * `productCode` y `capabilityId` son NEUTRALES: no contienen "VALLE", "AXOS"
 * ni ninguna marca. Viajan a columnas de base de datos y a las APIs de
 * Platform, y deben sobrevivir a cualquier rebranding — incluido el renombre
 * de ESTE paquete. El nombre visible se resuelve en `brand.ts`.
 *
 * ─── Por qué no vuelve el catálogo comercial ─────────────────────────────────
 * Ofertas, precios y libros de precio viven donde se cobra (Platform), no en
 * los contratos de un producto. Duplicarlos aquí garantiza que se desincronicen
 * y tienta a un frontend a decidir precios en el navegador.
 */

/**
 * Códigos internos estables que Valle Design conoce. `platform-core` es la
 * base común incluida (identidad, tenant, RBAC, auditoría) y no se contrata
 * por separado; `design` es este producto.
 */
export const PRODUCT_CODES = ["platform-core", "design"] as const;

export type ProductCode = (typeof PRODUCT_CODES)[number];

/**
 * Capacidades exigibles server-side. Cada id es una frontera REAL: si aparece
 * aquí, existe un guard que la aplica. Son los identificadores que Design
 * consulta contra la API de entitlements de Platform
 * (`specs/platform-api.v1.yaml`), así que su VALOR es contrato de
 * integración, no nomenclatura interna: no se renombran sin coordinar con
 * Platform.
 */
export const PRODUCT_CAPABILITY_IDS = [
  // platform-core (incluido en cualquier contratación)
  "platform.identity",
  "platform.tenant",
  "platform.rbac",
  "platform.audit",
  "platform.billing",
  "platform.notifications",
  "platform.onboarding",
  "platform.support",
  "platform.governance",
  // design
  "design.cad",
  "design.viewer",
] as const;

export type ProductCapabilityId = (typeof PRODUCT_CAPABILITY_IDS)[number];

export function isProductCapabilityId(
  value: unknown,
): value is ProductCapabilityId {
  return (
    typeof value === "string" &&
    (PRODUCT_CAPABILITY_IDS as readonly string[]).includes(value)
  );
}
