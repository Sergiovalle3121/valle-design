"use client";

/**
 * Sesión de Platform en el NAVEGADOR — adaptación Design del par
 * `session.ts` + AuthContext del origen.
 *
 * DIFERENCIA DELIBERADA con el origen: Valle Design NO tiene registro de
 * usuarios ni pantalla de login propia. La identidad ES el bearer JWT que
 * emite VALLE Platform (mismo contrato que valida `CadAuthGuard` en la API de
 * R1: HS256 con el secreto compartido, claims sub/email/role/tenant_id/
 * permissions). El navegador nunca verifica la firma — eso lo hace la API en
 * cada request — aquí sólo se DECODIFICA el payload para pintar identidad y
 * expirar sesiones vencidas, exactamente como hacía el AuthContext del origen.
 *
 * El token vive en localStorage bajo la MISMA clave del origen
 * (`axos_access_token`): así el arnés E2E (e2e/fixtures/session.ts) y
 * cualquier despliegue junto a Platform siguen funcionando sin cambios.
 *
 * La pantalla de acceso local puede adoptar un token entregado en el fragmento con
 * `returnTo`; Platform devuelve al usuario con el token en el fragmento
 * (`#access_token=…`, nunca en query para no filtrarlo a logs de servidor) y
 * `adoptSessionFromUrl()` lo persiste y limpia la URL.
 */

/** Clave de storage del origen — compartida con el arnés E2E. */
export const TOKEN_STORAGE_KEY = "axos_access_token";

/** Claims del JWT de Platform que el frontend consume. */
export interface PlatformTokenPayload {
  sub: string;
  email: string;
  role?: string;
  tenant_id?: string;
  organization_id?: string;
  plant_id?: string;
  permissions?: string[];
  iat?: number;
  exp: number;
}

/** Sesión resuelta para la UI. */
export interface DesignSession {
  userId: string;
  email: string;
  role: string | null;
  tenantId: string | null;
  permissions: string[];
  /** Epoch (s) en que expira el token. */
  expiresAt: number;
  token: string;
}

/** Decodifica el payload de un JWT sin verificar firma (patrón del origen). */
export function decodeJwtPayload(token: string): PlatformTokenPayload | null {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    const parsed = JSON.parse(jsonPayload) as PlatformTokenPayload;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function toSession(token: string): DesignSession | null {
  const payload = decodeJwtPayload(token);
  if (!payload?.sub || !payload.email) return null;
  if (typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000) {
    return null;
  }
  return {
    userId: String(payload.sub),
    email: String(payload.email),
    role: typeof payload.role === "string" && payload.role ? payload.role : null,
    tenantId: payload.tenant_id ?? null,
    permissions: Array.isArray(payload.permissions)
      ? payload.permissions.map(String)
      : [],
    expiresAt: payload.exp,
    token,
  };
}

/** Token crudo almacenado (o null si no hay). */
export function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Lee y VALIDA la sesión almacenada. Un token ilegible o vencido se descarta
 * (y se limpia el storage) — el llamador decide si redirige a Platform.
 */
export function readSession(): DesignSession | null {
  const token = readStoredToken();
  if (!token) return null;
  const session = toSession(token);
  if (!session) clearSession();
  return session;
}

/** Persiste un token válido; devuelve la sesión o null si el token no sirve. */
export function storeSessionToken(token: string): DesignSession | null {
  const session = toSession(token);
  if (!session) return null;
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    /* almacenamiento no disponible: la sesión vive sólo en memoria */
  }
  return session;
}

/** Borra la sesión almacenada. */
export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Adopta el token que Platform entrega en el fragmento tras el login
 * (`#access_token=…`). Si lo hay y es válido, lo persiste y limpia la URL
 * (replaceState — el token jamás queda en el historial). Devuelve la sesión
 * adoptada o null si no había handoff.
 */
export function adoptSessionFromUrl(): DesignSession | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash || !hash.includes("access_token=")) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("access_token");
  if (!token) return null;
  const session = storeSessionToken(token);
  // Limpia el fragmento aunque el token venga inválido: no debe persistir en
  // la barra de direcciones ni en capturas.
  const clean = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", clean);
  return session;
}

/**
 * Ruta de acceso de la aplicación con retorno opcional.
 */
export function platformLoginUrl(returnTo?: string): string | null {
  const base = "/login";
  const target =
    returnTo ??
    (typeof window !== "undefined" ? window.location.href : undefined);
  if (!target) return base;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}returnTo=${encodeURIComponent(target)}`;
}
