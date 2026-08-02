"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE, rawApiFetch } from "@/lib/apiFetch";

/** Compatibilidad de marcadores antiguos: sólo resuelve, nunca crea. */
export default function LegacyStudioLoader() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    rawApiFetch(`${API_BASE}/v1/cad/documents?limit=200`)
      .then(async (response) => {
        if (!response.ok) throw new Error("list failed");
        const body = (await response.json()) as {
          items: Array<{
            id: string;
            model: string | null;
            revision: string | null;
          }>;
        };
        const existing = body.items.find(
          (item) =>
            item.model === "AXOS-CAD-STUDIO" && item.revision === "UNIVERSAL",
        );
        if (!existing) throw new Error("missing legacy document");
        router.replace(`/studio/${existing.id}`);
      })
      .catch(() => setFailed(true));
  }, [router]);
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <p role="status">
        {failed
          ? "No existe un documento histórico compatible."
          : "Buscando documento histórico…"}
      </p>
    </main>
  );
}
