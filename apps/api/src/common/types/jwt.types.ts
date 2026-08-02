/** Shape of user scopes for authorization */
export interface UserScopes {
  buildings?: string[];
  programs?: string[];
  lines?: number[];
  warehouses?: string[];
}

/** Shape signed into every JWT. */
export interface JwtPayload {
  /** User primary key (UUID). Standard JWT subject claim. */
  sub: string;
  email: string;
  role: string;
  tenant_id: string | null;
  organization_id: string | null;
  /** Active plant for this session. Null = org-level / multi-plant access. */
  plant_id: string | null;
  permissions: string[] | null;
  scopes: UserScopes | null;
}

/** Shape of `req.user` after JwtStrategy.validate() resolves. */
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
