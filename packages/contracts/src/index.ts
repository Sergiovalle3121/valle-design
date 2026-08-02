/**
 * Contratos EXCLUSIVOS del producto Valle Design (CAD).
 *
 * El paquete arrastraba el catálogo comercial completo del monorepo de origen
 * (precios, ofertas, entitlements, contratos de Office…). Nada de eso lo
 * consume Design: se retiró. Lo que queda es lo que este producto usa de
 * verdad, más el módulo `legacy/` con los identificadores que no pueden
 * renombrarse todavía (ver `legacy/README.md`).
 */
export * from "./product-catalog";
export * from "./brand";
export * from "./design-contracts";
export * from "./legacy";
