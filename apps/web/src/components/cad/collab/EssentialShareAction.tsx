"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { FileCheck2, Share2 } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { cadDraftToolbarSlot } from "@/components/cad/shell/draft-toolbar-slot";
import { useCadUiMode } from "@/components/cad/shell/ui-mode-host";
import { reviewsRepository } from "@/lib/cad/repositories/reviews";
import { DesignApiError } from "@/lib/cad/repositories/client";
import { designClient } from "@/lib/cad/repositories/client";
import { versionsRepository } from "@/lib/cad/repositories/versions";
import { migrateCadDocument } from "@/lib/cad/cad-document-migrate";
import type { CadDocument } from "@/lib/cad/cad-document";
import {
  isEducationalDeliveryPlan,
  renderCadDeliveryPdf,
} from "@/lib/cad/plot/delivery-pdf";
import { reviewLinkUrl } from "./ReviewLinkIssuer";

type Purpose = "share" | "delivery";
type ShareState =
  | { kind: "idle" }
  | { kind: "creating"; purpose: Purpose }
  | {
      kind: "ready";
      purpose: Purpose;
      url: string;
      deliveredAt: string | null;
      deliveredVersion: number | null;
      expiresAt: string | null;
    }
  | { kind: "error"; purpose: Purpose; message: string };

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
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const liveQrRef = useRef<{
    deliveryUrl: string;
    url: string;
    expiresAt: string;
  } | null>(null);

  if (mode !== "esencial" || !slot) return null;

  const create = async (purpose: Purpose) => {
    if (state.kind === "creating") return;
    setCopied(false);
    setCopyFailed(false);
    setPdfError(false);
    liveQrRef.current = null;
    setState({ kind: "creating", purpose });
    try {
      if (createShareLink) {
        const url = await createShareLink();
        if (!url) throw new Error("missing_review_link");
        setState({
          kind: "ready",
          purpose,
          url,
          deliveredAt: null,
          deliveredVersion: null,
          expiresAt: null,
        });
        return;
      }
      const result = await reviewsRepository.create(documentId, {
        shareLink: true,
        allowComments: false,
        ...(purpose === "delivery" ? { delivery: true } : {}),
      });
      if (!result.shareToken) {
        setState({
          kind: "error",
          purpose,
          message: "El servidor no emitió un enlace válido.",
        });
        return;
      }
      setState({
        kind: "ready",
        purpose,
        url: reviewLinkUrl(result.shareToken),
        deliveredAt: result.session.deliveredAt ?? null,
        deliveredVersion: result.session.deliveredVersion ?? null,
        expiresAt: result.session.expiresAt ?? null,
      });
    } catch (cause) {
      console.error(
        "No se pudo crear el enlace de revisión",
        cause instanceof DesignApiError
          ? { status: cause.status, code: cause.code }
          : { kind: "unavailable" },
      );
      setState({
        kind: "error",
        purpose,
        message:
          cause instanceof DesignApiError &&
          cause.code === "delivery_save_required"
            ? "Guarda el plano antes de entregarlo."
            : "No pudimos crear el enlace. Inténtalo de nuevo.",
      });
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

  const downloadPdf = async () => {
    if (
      state.kind !== "ready" ||
      state.purpose !== "delivery" ||
      !state.deliveredVersion ||
      !state.deliveredAt ||
      pdfBusy
    )
      return;
    setPdfBusy(true);
    setPdfError(false);
    let newlyCreatedSession: string | null = null;
    try {
      const historical = await versionsRepository.get(
        documentId,
        state.deliveredVersion,
      );
      const plan = migrateCadDocument(
        historical.cadDocument as unknown as CadDocument,
      );
      const envelope = await designClient.documents.open(documentId);
      const subscription = await designClient.commercial
        .subscription()
        .catch(() => null);
      let latest =
        liveQrRef.current?.deliveryUrl === state.url ? liveQrRef.current : null;
      if (!latest) {
        const link = await reviewsRepository.create(documentId, {
          shareLink: true,
          allowComments: false,
        });
        newlyCreatedSession = link.session.id;
        if (!link.shareToken || !link.session.expiresAt)
          throw new Error("Falta el enlace vivo del QR.");
        latest = {
          deliveryUrl: state.url,
          url: reviewLinkUrl(link.shareToken),
          expiresAt: link.session.expiresAt,
        };
        liveQrRef.current = latest;
      }
      const pdf = await renderCadDeliveryPdf({
        document: plan,
        documentName: envelope.name ?? "Plano",
        version: state.deliveredVersion,
        deliveredAt: state.deliveredAt,
        latestReviewUrl: latest.url,
        latestReviewExpiresAt: latest.expiresAt,
        educational: isEducationalDeliveryPlan(subscription?.subscription),
      });
      if (!pdf.bytes.length) throw new Error("No se generó la lámina.");
      const blob = new Blob([pdf.bytes as BlobPart], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `entrega-v${state.deliveredVersion}.pdf`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      if (newlyCreatedSession) {
        liveQrRef.current = null;
        await reviewsRepository
          .close(newlyCreatedSession)
          .catch(() => undefined);
      }
      setPdfError(true);
    } finally {
      setPdfBusy(false);
    }
  };

  const purpose = state.kind === "idle" ? "share" : state.purpose;
  const delivery = purpose === "delivery";

  return createPortal(
    <>
      <Button
        variant="ghost"
        size="sm"
        iconLeft={<Share2 aria-hidden="true" className="h-4 w-4" />}
        data-testid="cad-essential-share"
        onClick={() => void create("share")}
        disabled={state.kind === "creating"}
        className="h-9 shrink-0 px-2 type-micro text-foreground"
      >
        Compartir
      </Button>
      {!snapshot ? (
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<FileCheck2 aria-hidden="true" className="h-4 w-4" />}
          data-testid="cad-essential-deliver"
          onClick={() => void create("delivery")}
          disabled={state.kind === "creating"}
          className="h-9 shrink-0 px-2 type-micro text-foreground"
        >
          Entregar
        </Button>
      ) : null}
      <Modal
        open={state.kind !== "idle"}
        onClose={close}
        title={delivery ? "Entregar plano" : "Compartir plano"}
        size="sm"
        data-testid={
          delivery
            ? "cad-essential-delivery-panel"
            : "cad-essential-share-panel"
        }
      >
        {state.kind === "creating" ? (
          <p role="status" className="mt-2 type-small">
            Creando enlace…
          </p>
        ) : null}
        {state.kind === "error" ? (
          <p role="alert" className="mt-2 type-small text-danger-ink">
            {state.message}
          </p>
        ) : null}
        {state.kind === "ready" ? (
          <>
            <p className="mt-2 type-small text-muted-foreground">
              {delivery
                ? `Versión ${state.deliveredVersion ?? "guardada"} congelada. Quien tenga este enlace verá esta entrega aunque sigas dibujando, hasta que venza o lo revoques. No permite comentarios. Cópialo ahora; por seguridad no se volverá a mostrar.`
                : snapshot
                  ? "Quien tenga este enlace puede ver una copia de este momento del plano durante 24 horas. No puede editarla ni comentar. Los cambios posteriores no se reflejan."
                  : "Quien tenga este enlace puede ver la versión más reciente del plano. No permite editar ni comentar. Cópialo ahora; por seguridad no se volverá a mostrar."}
            </p>
            {delivery && state.deliveredAt ? (
              <p
                data-testid="cad-essential-delivered-at"
                className="mt-2 type-small font-medium"
              >
                Entregado el{" "}
                {new Intl.DateTimeFormat("es-MX", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(state.deliveredAt))}
              </p>
            ) : null}
            {delivery && state.expiresAt ? (
              <p className="mt-1 type-micro text-muted-foreground">
                Enlace válido hasta el{" "}
                {new Intl.DateTimeFormat("es-MX", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(state.expiresAt))}
                .
              </p>
            ) : null}
            <code
              data-testid={
                delivery
                  ? "cad-essential-delivery-url"
                  : "cad-essential-share-url"
              }
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
              {delivery ? "Copiar enlace de entrega" : "Copiar enlace"}
            </Button>
            {delivery ? (
              <Button
                variant="secondary"
                fullWidth
                onClick={() => void downloadPdf()}
                loading={pdfBusy}
                className="mt-2"
              >
                {pdfBusy ? "Preparando PDF…" : "Descargar PDF con cajetín y QR"}
              </Button>
            ) : null}
            {copied ? (
              <p role="status" className="mt-2 type-small">
                Enlace copiado
              </p>
            ) : null}
            {pdfError ? (
              <p role="alert" className="mt-2 type-small text-danger-ink">
                No se pudo generar el PDF. Inténtalo de nuevo.
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
