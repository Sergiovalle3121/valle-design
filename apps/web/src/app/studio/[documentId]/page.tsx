"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { isDocumentId } from "@/lib/cad/document-identity";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";

const CadStudioHost = dynamic(() => import("@/components/cad/CadStudioHost"), {
  ssr: false,
});

type OpenDocument = {
  id: string;
  name: string;
  projectId?: string | null;
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
    let active = true;
    setState({ kind: "loading" });
    void designClient.documents
      .open(documentId)
      .then((document) => {
        if (active) setState({ kind: "ready", document });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const status = error instanceof DesignApiError ? error.status : 0;
        setState({
          kind:
            status === 401
              ? "expired"
              : status === 403
                ? "forbidden"
                : status === 404
                  ? "deleted"
                  : navigator.onLine
                    ? "error"
                    : "offline",
        });
      });
    return () => {
      active = false;
    };
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
      readOnly={!auth.permissions.includes("cad:edit")}
      title={state.document.name}
      subtitle={`Documento ${documentId}`}
      onClose={() => window.location.assign("/dashboard")}
    />
  );
}
