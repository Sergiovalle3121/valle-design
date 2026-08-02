"use client";

export interface DesignSession {
  userId: string;
  email: string;
  role: string | null;
  tenantId: string | null;
  organizationId: string | null;
  permissions: string[];
  expiresAt: number;
}

const SESSION_API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000"
).replace(/\/$/, "");

export async function readSession(): Promise<DesignSession | null> {
  try {
    const response = await fetch(`${SESSION_API_BASE}/v1/auth/session`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      user: { id: string; email: string };
      session: { expiresAt: string };
      organization?: {
        id?: string | null;
        tenantId?: string | null;
        role?: string | null;
        permissions?: string[];
      } | null;
    };
    return {
      userId: data.user.id,
      email: data.user.email,
      role: data.organization?.role ?? null,
      tenantId: data.organization?.tenantId ?? null,
      organizationId: data.organization?.id ?? null,
      permissions: data.organization?.permissions ?? [],
      expiresAt: new Date(data.session.expiresAt).getTime() / 1000,
    };
  } catch {
    return null;
  }
}

export function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const item = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("valle_csrf="));
  if (!item) return null;
  try {
    return decodeURIComponent(item.slice("valle_csrf=".length));
  } catch {
    return null;
  }
}

export function localReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  try {
    const parsed = new URL(value, "https://valle-design.local");
    if (parsed.origin !== "https://valle-design.local") return "/dashboard";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}

export function loginUrl(returnTo?: string): string {
  const target =
    returnTo ??
    (typeof window === "undefined"
      ? "/dashboard"
      : `${window.location.pathname}${window.location.search}`);
  return `/login?returnTo=${encodeURIComponent(localReturnTo(target))}`;
}
