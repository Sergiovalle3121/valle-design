"use client";

import { createDesignClient, DesignApiError } from "@valle/design-sdk";
import { API_BASE } from "@/lib/apiFetch";
import { readStoredToken } from "@/lib/session";

export const designClient = createDesignClient({
  baseUrl: API_BASE,
  token: () => (typeof window === "undefined" ? null : readStoredToken()),
});

export { DesignApiError };
export type {
  ApiError,
  CadDocumentVersionConflictError,
} from "@valle/design-sdk";
