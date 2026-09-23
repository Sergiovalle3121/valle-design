"use client";

import type { DocumentLifecyclePort } from "@/components/cad/document-lifecycle/controller";
import { reviewLinkUrl } from "@/components/cad/collab/ReviewLinkIssuer";
import { API_BASE, rawApiFetch } from "@/lib/apiFetch";
import { DEMO_DOCUMENT_ID } from "@/lib/cad/demo/demo-constants";

/** Wait until autosave has committed the current edit to the demo port. */
function waitForSavedDocument(): Promise<void> {
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => check());
    const done = (error?: Error) => {
      clearTimeout(timer);
      observer.disconnect();
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      const state = document
        .querySelector('[data-testid="cad-save-status"]')
        ?.getAttribute("data-state");
      if (state === "guardado") done();
      else if (state === "problema")
        done(new Error("Guarda el plano antes de compartirlo."));
    };
    const timer = setTimeout(
      () => done(new Error("El plano sigue guardándose. Inténtalo otra vez.")),
      30_000,
    );
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    check();
  });
}

/** Publish one bounded, immutable copy; the demo continues saving locally. */
export async function publishDemoSnapshot(
  port: DocumentLifecyclePort,
): Promise<string> {
  await waitForSavedDocument();
  const resource = await port.open(DEMO_DOCUMENT_ID);
  if (!resource.cadDocument)
    throw new Error("No hay un plano guardado para compartir.");
  const response = await rawApiFetch(`${API_BASE}/v1/cad/demo-shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document: resource.cadDocument }),
  });
  if (response.status === 413)
    throw new Error("Este plano supera el tamaño permitido para compartir desde la demostración.");
  if (response.status === 429)
    throw new Error("Has creado demasiados enlaces. Espera unos minutos antes de intentarlo otra vez.");
  if (!response.ok)
    throw new Error("No pudimos compartir el plano. Inténtalo de nuevo.");
  const result = (await response.json()) as { shareToken?: unknown };
  if (
    typeof result.shareToken !== "string" ||
    !result.shareToken.startsWith("vdrl_")
  ) {
    throw new Error("La API no devolvió un enlace válido.");
  }
  return reviewLinkUrl(result.shareToken);
}
