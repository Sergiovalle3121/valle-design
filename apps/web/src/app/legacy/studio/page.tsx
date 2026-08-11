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
        // El fragmento viaja con el marcador y puede llevar la credencial del
        // enlace de revisión (`#cadReview=…`). Descartarlo aquí la destruía en
        // silencio: el invitado aterrizaba en modo edición sin canjear nada.
        // Nunca se envía al servidor; sólo se reenvía al destino interno.
        const fragment =
          typeof window === "undefined" ? "" : window.location.hash;
        // La CONSULTA también viaja. Descartarla perdía en silencio las
        // banderas que se pasan por URL —`?cadRenderPipeline=legacy` es la que
        // devuelve el editor al pipeline de render heredado—, de modo que el
        // respaldo existía y no se podía activar desde un marcador.
        const search =
          typeof window === "undefined" ? "" : window.location.search;
        router.replace(`/studio/${existing.id}${search}${fragment}`);
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
