"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChevronLeft, DraftingCompass } from "lucide-react";
import { glass } from "@/lib/glass";

const CadStudioHost = dynamic(() => import("@/components/cad/CadStudioHost"), {
  ssr: false,
});

/** Product entry point for new drawings. Historical sentinels remain in /studio only. */
export default function DocumentStudioPage() {
  const params = useParams<{ documentId: string }>();
  const search = useSearchParams();
  const documentId = params.documentId;
  const projectId = search.get("projectId") ?? undefined;

  return (
    <div className="min-h-screen text-foreground">
      <header className={`${glass} sticky top-0 z-40 px-6 py-3`}>
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Link
            href="/dashboard"
            aria-label="Volver a documentos"
            className="rounded-xl p-2 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <DraftingCompass className="h-5 w-5 text-cyan-500" />
          <div>
            <h1 className="font-semibold">Valle Design</h1>
            <p className="text-xs text-gray-500">
              Documento {documentId.slice(0, 8)}
            </p>
          </div>
        </div>
      </header>
      <CadStudioHost
        model={documentId}
        revision="A"
        models={[{ model: documentId, revision: "A" }]}
        projectId={projectId}
        open
        standalone
        title="Valle Design"
        subtitle="Dibujo CAD profesional"
        onClose={() => {
          window.location.href = "/dashboard";
        }}
      />
    </div>
  );
}
