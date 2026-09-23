"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Share2 } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { cadDraftToolbarSlot } from "@/components/cad/shell/draft-toolbar-slot";
import { useCadUiMode } from "@/components/cad/shell/ui-mode-host";
import { reviewsRepository } from "@/lib/cad/repositories/reviews";
import { DesignApiError } from "@/lib/cad/repositories/client";
import { reviewLinkUrl } from "./ReviewLinkIssuer";

type ShareState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "ready"; url: string }
  | { kind: "error" };

/** The Essential action uses the same server-owned review sessions as Pro. */
export function EssentialShareAction({
  documentId,
  createShareLink,
  snapshot = false,
}: {
  documentId: string;
  createShareLink?: () => Promise<string>;
  snapshot?: boolean;
}) {
  const mode = useCadUiMode();
  const slot = useSyncExternalStore(
    cadDraftToolbarSlot.subscribe,
    cadDraftToolbarSlot.getSnapshot,
    cadDraftToolbarSlot.getServerSnapshot,
  );
  const [state, setState] = useState<ShareState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  if (mode !== "esencial" || !slot) return null;

  const create = async () => {
    if (state.kind === "creating") return;
    setCopied(false);
    setCopyFailed(false);
    setState({ kind: "creating" });
    try {
      if (createShareLink) {
        const url = await createShareLink();
        if (!url) throw new Error("missing_review_link");
        setState({ kind: "ready", url });
      } else {
        const result = await reviewsRepository.create(documentId, {
          shareLink: true,
          allowComments: false,
        });
        if (!result.shareToken) {
          setState({ kind: "error" });
          return;
        }
        setState({ kind: "ready", url: reviewLinkUrl(result.shareToken) });
      }
    } catch (error) {
      console.error(
        "No se pudo crear el enlace de revisión",
        error instanceof DesignApiError
          ? { status: error.status, code: error.code }
          : { kind: "unavailable" },
      );
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
  };

  return createPortal(
    <>
      <Button
        variant="ghost"
        size="sm"
        iconLeft={<Share2 aria-hidden="true" className="h-4 w-4" />}
        data-testid="cad-essential-share"
        onClick={() => void create()}
        disabled={state.kind === "creating"}
        className="h-9 shrink-0 px-2 type-micro text-foreground"
      >
        Compartir
      </Button>
      <Modal
        open={state.kind !== "idle"}
        onClose={close}
        title="Compartir plano"
        size="sm"
        data-testid="cad-essential-share-panel"
      >
        {state.kind === "creating" ? (
          <p role="status" className="mt-2 type-small">
            Creando enlace…
          </p>
        ) : null}
        {state.kind === "error" ? (
          <p role="alert" className="mt-2 type-small text-danger-ink">
            No pudimos crear el enlace. Inténtalo de nuevo.
          </p>
        ) : null}
        {state.kind === "ready" ? (
          <>
            <p className="mt-2 type-small text-muted-foreground">
              {snapshot
                ? "Quien tenga este enlace puede ver una copia de este momento del plano durante 24 horas. No puede editarla ni comentar. Los cambios posteriores no se reflejan."
                : "Quien tenga este enlace puede ver la versión más reciente del plano. No permite editar ni comentar. Cópialo ahora; por seguridad no se volverá a mostrar."}
            </p>
            <code
              data-testid="cad-essential-share-url"
              className="mt-2 block break-all rounded-control bg-muted p-2 type-micro"
            >
              {state.url}
            </code>
            <Button
              variant="primary"
              fullWidth
              onClick={() => void copy()}
              className="mt-3"
            >
              Copiar enlace
            </Button>
            {copied ? (
              <p role="status" className="mt-2 type-small">
                Enlace copiado
              </p>
            ) : null}
            {copyFailed ? (
              <p role="alert" className="mt-2 type-small text-danger-ink">
                Tu navegador no permitió copiarlo. Selecciona el enlace de
                arriba.
              </p>
            ) : null}
          </>
        ) : null}
      </Modal>
    </>,
    slot,
  );
}
