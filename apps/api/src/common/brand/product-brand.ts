import { resolveBrandManifest, productDisplayName } from "@valle-design/contracts";

export const BRAND = resolveBrandManifest(process.env);
export const PRODUCT_DISPLAY_NAME = productDisplayName(BRAND, "design");
