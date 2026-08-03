/** Optional server-derived scopes retained for tenant-scoped CAD data. */
export interface UserScopes {
  buildings?: string[];
  programs?: string[];
  lines?: number[];
  warehouses?: string[];
}

/**
 * Request identity produced from a verified first-party session and an active
 * organization membership. None of these fields are accepted from the client.
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  tenant_id: string | null;
  organization_id: string | null;
  plant_id: string | null;
  permissions: string[] | null;
  scopes: UserScopes | null;
}
