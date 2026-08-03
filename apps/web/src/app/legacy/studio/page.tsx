"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { designClient } from "@/lib/cad/repositories/client";

/** Compatibilidad de marcadores antiguos: sólo resuelve, nunca crea. */
export default function LegacyStudioLoader() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const model = "AXOS-CAD-STUDIO";
    const revision = "UNIVERSAL";
    designClient.documents
      .list({ model, revision, limit: 1 })
      .then((body) => {
        const existing = body.items.find(
          (item) => item.model === model && item.revision === revision,
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
