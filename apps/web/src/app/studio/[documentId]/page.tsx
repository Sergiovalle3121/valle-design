"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { isDocumentId } from "@/lib/cad/document-identity";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";
import { CadStudioSkeleton } from "@/components/cad/studio/CadStudioSkeleton";
import { Button } from "@/components/ui";
import { EditorCrashRecoveryAction } from "@/components/cad/studio/EditorCrashRecoveryAction";
import type { CadRecoveryScope } from "@/lib/cad/cad-recovery";

const CadStudioHost = dynamic(() => import("@/components/cad/CadStudioHost"), {
  ssr: false,
  // La carcasa del estudio, no un spinner. Pinta la misma retícula que el
  // editor —barra, riel, lienzo, panel, estado— así que cuando el editor llega
  // ocupa los mismos huecos y no hay salto de layout. Ver CadStudioSkeleton.
  loading: () => <CadStudioSkeleton etapa="Cargando el editor…" />,
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
  /**
   * T-75(b): abrir un plano caído no ofrecía ni reintentar ni el borrador
   * local — sólo un enlace de vuelta al tablero, es decir, abandonar. Un
   * contador de intento es lo mínimo que hace falta para volver a disparar
   * el efecto de abajo sin duplicar su lógica en un manejador aparte.
   */
  const [retryToken, setRetryToken] = useState(0);
  const retry = useCallback(() => setRetryToken((n) => n + 1), []);

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
  }, [auth.isAuthenticated, auth.isLoading, documentId, retryToken]);

  /**
   * T-75(b), la segunda mitad: si el servidor no responde, ¿qué queda del
   * lado del cliente? El mismo diario de recuperación que ya usa el editor
   * (`EditorCrashRecoveryAction`, T-72h) — un documento que se guardó antes
   * de la caída actual, si lo hay. `model`/`revision` son los mismos valores
   * fijos con los que `CadStudioHost` abriría este documento si el servidor
   * respondiera (ver más abajo). El `projectId` NO se puede saber aquí: viene
   * en la respuesta que acaba de fallar, y el editor lo lleva en la clave del
   * diario, así que la acción busca por documento bajo cualquier proyecto
   * (`matchAnyWorkspace`); por clave exacta nunca encontraba nada.
   */
  const authUser = auth.user;
  const recoveryScope = useMemo<CadRecoveryScope | null>(
    () =>
      auth.tenantId && authUser?.id
        ? {
            tenantId: auth.tenantId,
            userId: authUser.id,
            model: documentId,
            revision: "DOCUMENT",
          }
        : null,
    [auth.tenantId, authUser, documentId],
  );

  // Cargar NO es un error: es la primera mitad de una apertura que va a salir
  // bien. Enseñar la misma tarjeta centrada para «cargando» y para «no tienes
  // permiso» hacía que abrir un plano se pareciera a un fallo.
  if (state.kind === "loading") {
    return <CadStudioSkeleton etapa="Abriendo el documento…" />;
  }

  if (state.kind !== "ready") {
    const messages: Record<Exclude<State["kind"], "ready" | "loading">, string> = {
      invalid: "El identificador del documento no es válido.",
      deleted: "Este documento fue eliminado o ya no existe.",
      forbidden: "No tienes permiso suficiente para abrir este documento.",
      expired: "Tu sesión ha expirado. Vuelve a iniciar sesión.",
      offline: "Estás sin conexión. Reconecta para abrir el documento.",
      error: "No pudimos cargar el documento.",
    };
    return (
      // Tokens, no paleta cruda. Esta pantalla llevaba `bg-white`,
      // `text-gray-500`, `border-black/10` y `dark:bg-zinc-900` escritos a mano:
      // el blanco puro no es el fondo del sistema y el gris no es
      // `--muted-foreground`, así que la pantalla de error era la única del
      // producto que no se parecía al producto.
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <section className="max-w-md rounded-surface border border-border bg-card p-8 text-center shadow-raised">
          <h1 className="type-heading">Valle Design Studio</h1>
          <p
            role={state.kind === "error" ? "alert" : "status"}
            className="type-body mt-3 text-muted-foreground"
          >
            {messages[state.kind]}
          </p>
          {/*
            T-75(b): "offline" y "error" son los dos casos en que el
            documento puede seguir intacto en el servidor y sólo la
            CONEXIÓN falló — a diferencia de "deleted"/"forbidden", donde
            reintentar no puede cambiar nada. Ahí sí tiene sentido ofrecer
            reintentar y el borrador local; en los demás sería prometer una
            salida que no existe.
          */}
          {(state.kind === "offline" || state.kind === "error") && (
            <div className="mt-4 flex flex-col items-center gap-3">
              <Button variant="secondary" size="sm" onClick={retry}>
                Reintentar
              </Button>
              <EditorCrashRecoveryAction scope={recoveryScope} matchAnyWorkspace />
            </div>
          )}
          <Link
            className="type-small mt-6 inline-block font-semibold text-primary-ink underline underline-offset-4"
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
