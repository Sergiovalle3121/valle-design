"use client";

import { createDesignClient, DesignApiError } from "@valle/design-sdk";
import { API_BASE } from "@/lib/apiFetch";
import { csrfToken } from "@/lib/session";

export const designClient = createDesignClient({
  baseUrl: API_BASE,
  csrfToken: () => (typeof window === "undefined" ? null : csrfToken()),
});

export { DesignApiError };
export type {
  ApiError,
  CadDocumentVersionConflictError,
} from "@valle/design-sdk";
