"use client";

export interface DesignSession {
  userId: string;
  email: string;
  role: string | null;
  tenantId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationSlug: string | null;
  permissions: string[];
  expiresAt: number;
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
