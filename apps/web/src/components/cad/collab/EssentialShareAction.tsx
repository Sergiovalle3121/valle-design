"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Share2, X } from "lucide-react";
import { cadDraftToolbarSlot } from "@/components/cad/shell/draft-toolbar-slot";
import { useCadUiMode } from "@/components/cad/shell/ui-mode-host";
import { reviewsRepository } from "@/lib/cad/repositories/reviews";
import { reviewLinkUrl } from "./ReviewLinkIssuer";

type ShareState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "ready"; url: string }
  | { kind: "error" };

/** The Essential action uses the same server-owned review sessions as Pro. */
export function EssentialShareAction({ documentId }: { documentId: string }) {
  const mode = useCadUiMode();
  const slot = useSyncExternalStore(
    cadDraftToolbarSlot.subscribe,
    cadDraftToolbarSlot.getSnapshot,
    cadDraftToolbarSlot.getServerSnapshot,
  );
  const [state, setState] = useState<ShareState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (state.kind !== "idle") panelRef.current?.focus();
  }, [state.kind]);

  if (mode !== "esencial" || !slot) return null;

  const create = async () => {
    if (state.kind === "creating") return;
    setCopied(false);
    setCopyFailed(false);
    setState({ kind: "creating" });
    try {
      const result = await reviewsRepository.create(documentId, {
        shareLink: true,
        allowComments: false,
      });
      if (!result.shareToken) {
        setState({ kind: "error" });
        return;
      }
      setState({ kind: "ready", url: reviewLinkUrl(result.shareToken) });
    } catch {
      setState({ kind: "error" });
    }
  };

  const copy = async () => {
    if (state.kind !== "ready") return;
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  };

  const close = () => {
    setState({ kind: "idle" });
    triggerRef.current?.focus();
  };

  return createPortal(
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="cad-essential-share"
        onClick={() => void create()}
        disabled={state.kind === "creating"}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-control px-2 type-micro text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <Share2 aria-hidden="true" className="h-4 w-4" />
        Compartir
      </button>
      {state.kind !== "idle"
        ? createPortal(
            <section
              ref={panelRef}
              role="dialog"
              aria-label="Compartir plano"
              tabIndex={-1}
              onKeyDown={(event) => {
                if (event.key === "Escape") close();
              }}
              data-testid="cad-essential-share-panel"
              className="fixed right-3 top-28 z-[85] w-80 max-w-[calc(100vw-1.5rem)] rounded-card border border-border bg-popover p-4 text-foreground shadow-floating"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="type-small font-semibold">Compartir plano</h2>
                <button
                  type="button"
                  aria-label="Cerrar Compartir"
                  onClick={close}
                  className="rounded-control p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              {state.kind === "creating" ? (
                <p role="status" className="mt-2 type-small">Creando enlace…</p>
              ) : null}
              {state.kind === "error" ? (
                <p role="alert" className="mt-2 type-small text-danger-ink">
                  No pudimos crear el enlace. Inténtalo de nuevo.
                </p>
              ) : null}
              {state.kind === "ready" ? (
                <>
                  <p className="mt-2 type-small text-muted-foreground">
                    Quien tenga este enlace puede ver la versión más reciente del plano. No permite editar ni comentar. Cópialo ahora; por seguridad no se volverá a mostrar.
                  </p>
                  <code data-testid="cad-essential-share-url" className="mt-2 block break-all rounded-control bg-muted p-2 type-micro">
                    {state.url}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copy()}
                    className="mt-3 w-full rounded-control bg-brand-strong px-3 py-2 type-small font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Copiar enlace
                  </button>
                  {copied ? <p role="status" className="mt-2 type-small">Enlace copiado</p> : null}
                  {copyFailed ? (
                    <p role="alert" className="mt-2 type-small text-danger-ink">
                      Tu navegador no permitió copiarlo. Selecciona el enlace de arriba.
                    </p>
                  ) : null}
                </>
              ) : null}
            </section>,
            document.body,
          )
        : null}
    </>,
    slot,
  );
}
