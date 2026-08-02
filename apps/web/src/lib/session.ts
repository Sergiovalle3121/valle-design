"use client";

export interface DesignSession {
  userId: string;
  email: string;
  role: string | null;
  tenantId: string | null;
  permissions: string[];
  expiresAt: number;
}

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

export async function readSession(): Promise<DesignSession | null> {
  const response = await fetch(`${API_BASE}/v1/auth/session`, { credentials: "include", cache: "no-store" });
  if (!response.ok) return null;
  const data = await response.json();
  return { userId: data.user.id, email: data.user.email, role: null, tenantId: null, permissions: [], expiresAt: new Date(data.session.expiresAt).getTime() / 1000 };
}
export function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const item = document.cookie.split(";").map(v => v.trim()).find(v => v.startsWith("valle_csrf="));
  return item ? decodeURIComponent(item.slice("valle_csrf=".length)) : null;
}
/** @deprecated Only the disabled legacy exchange uses this deletion key. */
export const TOKEN_STORAGE_KEY = "axos_access_token";
