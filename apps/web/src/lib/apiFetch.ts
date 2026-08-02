"use client";

/**
 * Cliente HTTP de Valle Design hacia la API de R1 (adaptación del
 * `apiFetch.ts` del origen).
 *
 * - Añade `Authorization: Bearer <jwt>` desde la sesión de Platform
 *   (localStorage, misma clave del origen — ver `src/lib/session.ts`).
 * - `credentials: 'include'`: si Platform comparte dominio y entrega cookie,
 *   viaja también; la API de R1 sólo exige el bearer.
 * - REESCRITURA LEGACY→v1: el editor CAD extraído del origen llama
 *   `${API_BASE}/line-engineering/*` (~21 call sites intactos). Aquí se
 *   detectan esas rutas y `src/lib/cad-api.ts` las traduce al contrato REAL
 *   `/v1/cad/*` de la API de R1 (mapa documentado en ese módulo). El resto de
 *   URLs pasa tal cual.
 *
 * DIFERENCIA DELIBERADA con el origen: no hay bridge `/api/backend/token` ni
 * re-exchange en 401 — Design no emite tokens; una sesión rechazada se
 * resuelve volviendo a Platform (login real), no auto-horneando otro JWT.
 */

import { readStoredToken } from "@/lib/session";
import { isLegacyCadRequest, handleLegacyCadRequest } from "@/lib/cad-api";

/**
 * Origen de la API de R1. `NEXT_PUBLIC_API_URL` es la variable que el editor
 * CAD del origen ya lee para construir sus URLs; `NEXT_PUBLIC_API_BASE` se
 * acepta como alias para despliegues que usen la nomenclatura nueva.
 */
export const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000"
).replace(/\/$/, "");

/** Añade el bearer de la sesión (si existe) sin pisar un Authorization explícito. */
export function withAuthHeaders(init?: RequestInit): RequestInit {
  const next: RequestInit = { ...(init || {}) };
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined") {
    const token = readStoredToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  next.headers = headers;
  if (next.credentials === undefined) next.credentials = "include";
  return next;
}

/** Fetch autenticado SIN reescritura (lo usa también el adaptador cad-api). */
export function rawApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, withAuthHeaders(init));
}

/** Fetch autenticado con la reescritura legacy→v1 del editor CAD. */
export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (isLegacyCadRequest(input)) {
    return handleLegacyCadRequest(input, init);
  }
  return rawApiFetch(input, init);
}
