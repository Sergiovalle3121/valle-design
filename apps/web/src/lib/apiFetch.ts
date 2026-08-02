"use client";

import { csrfToken } from "@/lib/session";
import {
  handleLegacyCadRequest,
  isLegacyCadRequest,
} from "@/lib/cad/legacy/layout-http-adapter";

/**
 * Browser-facing API origin. Production should expose this same-origin through
 * the web proxy so first-party cookies and the readable CSRF cookie share a
 * host with the application.
 */
export const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000"
).replace(/\/$/, "");

export function withAuthHeaders(init?: RequestInit): RequestInit {
  const next: RequestInit = { ...(init ?? {}) };
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = csrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  next.headers = headers;
  next.credentials ??= "include";
  return next;
}

/** First-party authenticated fetch without legacy URL translation. */
export function rawApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, withAuthHeaders(init));
}

/** First-party fetch with the temporary editor-only legacy adapter. */
export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (isLegacyCadRequest(input)) return handleLegacyCadRequest(input, init);
  return rawApiFetch(input, init);
}
