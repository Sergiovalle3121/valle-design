/** Stable, brand-neutral code for the standalone product. */
export const PRODUCT_CODES = ["design"] as const;

export type ProductCode = (typeof PRODUCT_CODES)[number];

/**
 * Commercial capability enforced by the local subscription and entitlement
 * model. Identity, tenant and RBAC are first-party product concerns, not
 * purchasable capabilities.
 */
export const PRODUCT_CAPABILITY_IDS = ["design.cad"] as const;

export type ProductCapabilityId = (typeof PRODUCT_CAPABILITY_IDS)[number];

export function isProductCapabilityId(
  value: unknown,
): value is ProductCapabilityId {
  return (
    typeof value === "string" &&
    (PRODUCT_CAPABILITY_IDS as readonly string[]).includes(value)
  );
}
