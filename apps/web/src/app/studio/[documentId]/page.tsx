"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { API_BASE, rawApiFetch } from "@/lib/apiFetch";
import { isDocumentId } from "@/lib/cad-api";
import { useDesignAuth } from "@/contexts/DesignAuthContext";

const CadStudioHost = dynamic(() => import("@/components/cad/CadStudioHost"), {
  ssr: false,
});

type OpenDocument = {
  id: string;
  name: string;
  projectId: string | null;
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; document: OpenDocument }
  | {
      kind:
        "invalid" | "deleted" | "forbidden" | "expired" | "offline" | "error";
    };

export default function DocumentStudioPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = use(params);
  const auth = useDesignAuth();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!isDocumentId(documentId)) {
      setState({ kind: "invalid" });
      return;
    }
    if (auth.isLoading) return;
    if (!auth.isAuthenticated) {
      setState({ kind: "expired" });
      return;
    }
    const controller = new AbortController();
    setState({ kind: "loading" });
    rawApiFetch(`${API_BASE}/v1/cad/documents/${documentId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) return setState({ kind: "expired" });
        if (response.status === 403) return setState({ kind: "forbidden" });
        if (response.status === 404) return setState({ kind: "deleted" });
        if (!response.ok) return setState({ kind: "error" });
        const document = (await response.json()) as OpenDocument;
        setState({ kind: "ready", document });
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name === "AbortError") return;
        setState({ kind: navigator.onLine ? "error" : "offline" });
      });
    return () => controller.abort();
  }, [auth.isAuthenticated, auth.isLoading, documentId]);

  if (state.kind !== "ready") {
    const messages: Record<Exclude<State["kind"], "ready">, string> = {
      loading: "Cargando documento…",
      invalid: "El identificador del documento no es válido.",
      deleted: "Este documento fue eliminado o ya no existe.",
      forbidden: "No tienes permiso suficiente para abrir este documento.",
      expired: "Tu sesión ha expirado. Vuelve a iniciar sesión.",
      offline: "Estás sin conexión. Reconecta para abrir el documento.",
      error: "No pudimos cargar el documento.",
    };
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <section className="max-w-md rounded-2xl border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold">Valle Design Studio</h1>
          <p
            role={state.kind === "error" ? "alert" : "status"}
            className="mt-3 text-sm text-gray-500"
          >
            {messages[state.kind]}
          </p>
          <Link
            className="mt-6 inline-block text-sm font-semibold text-indigo-500"
            href="/dashboard"
          >
            Volver a proyectos
          </Link>
        </section>
      </main>
    );
  }

  return (
    <CadStudioHost
      documentId={documentId}
      model={documentId}
      revision="DOCUMENT"
      projectId={state.document.projectId ?? undefined}
      models={[]}
      open
      standalone
      title={state.document.name}
      subtitle={`Documento ${documentId}`}
      onClose={() => window.location.assign("/dashboard")}
    />
  );
}
