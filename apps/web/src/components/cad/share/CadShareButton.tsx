"use client";

/**
 * «COMPARTIR», en la fila superior del estudio.
 *
 * ## Por qué existe
 *
 * El robot estudiante (`scripts/qa/medir-tareas.mjs`, tarea 4) busca un botón
 * que diga «Compartir» y no lo encontraba en ninguna parte: los enlaces de
 * revisión vivían dentro del muelle de colaboración, plegado en la barra de
 * estado, y en `/demo` ni siquiera existían. Mandar el plano al celular del
 * cliente es el final del primer uso; tiene que estar a un clic y con su
 * nombre escrito.
 *
 * ## Dos orígenes, un mismo gesto
 *
 * - `demo`: sin cuenta. Un clic crea el enlace temporal de siete días
 *   (`lib/cad/share/demo-share-repository.ts`), con su QR, «Copiar enlace»,
 *   «Borrar enlace» y la invitación a crear cuenta para conservarlo.
 * - `document`: con cuenta. Un clic abre una sesión de revisión con enlace
 *   (`POST /v1/cad/documents/{id}/review-sessions`); quien lo recibe ve y
 *   comenta sin cuenta. Se reutiliza durante esta visita al estudio para no
 *   gastar el tope de sesiones abiertas del documento con cada clic.
 *
 * Antes de compartir se vacía el autosave (`flush`): el enlace tiene que
 * enseñar lo último que se dibujó, no lo de hace dos segundos.
 *
 * El panel va en un portal con `z-[90]`, igual que «Vista, capas y plano»: el
 * editor vive en un `fixed z-[70]` con su propio contexto de apilamiento.
 */
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Share2, Trash2, X } from "lucide-react";
import { QrCode } from "@/components/ui";
import { reviewLinkUrl } from "@/components/cad/collab/ReviewLinkIssuer";
import type { CadDocument } from "@/lib/cad/cad-document";
import { reviewsRepository } from "@/lib/cad/repositories/reviews";
import { DesignApiError } from "@/lib/cad/repositories/client";
import {
  deleteDemoShare,
  shareDemoDocument,
  type StoredDemoShare,
} from "@/lib/cad/share/demo-share-repository";

export type CadShareSource =
  | {
      kind: "demo";
      flush: () => Promise<void>;
      /** El dibujo tal como lo tiene el puerto de la demostración. */
      currentDocument: () => CadDocument | null;
      /** A dónde lleva «Crea tu cuenta» (el tablero adopta el dibujo). */
      registerHref: string;
    }
  | { kind: "document"; flush: () => Promise<void>; documentId: string };

type Issued =
  | { kind: "demo"; url: string; expiresAt: string; share: StoredDemoShare }
  | { kind: "document"; url: string; expiresAt: string | null; sessionId: string };

type Phase =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "ready"; issued: Issued }
  | { kind: "deleted" }
  | { kind: "failed"; message: string };

/**
 * En Pro, por debajo de 1440 px, la cola fija de la fila superior no tiene
 * sitio para la palabra: queda el icono, con el mismo nombre accesible y su
 * `title`. En Esencial (y desde 1440) se lee «Compartir», que es lo que busca
 * quien empieza. `data-cad-ui` lo pone la fila (`CadRibbon`).
 */
const TRIGGER =
  "inline-flex items-center gap-1.5 px-3 py-1 mr-1.5 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [[data-cad-ui=pro]_&]:max-[1439px]:px-2 max-sm:mr-0 max-sm:px-2";
const TRIGGER_LABEL = "[[data-cad-ui=pro]_&]:max-[1439px]:sr-only max-sm:sr-only";
const PANEL_MAX_WIDTH = 352;
const ACTION =
  "inline-flex items-center justify-center gap-1.5 rounded-control px-3 py-1.5 type-caption font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export default function CadShareButton({ source }: { source: CadShareSource }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // La sesión de revisión creada en esta visita: se reutiliza al reabrir.
  const issuedRef = useRef<Issued | null>(null);

  const issue = useCallback(async () => {
    setPhase({ kind: "creating" });
    setCopied(false);
    try {
      await source.flush();
      if (source.kind === "demo") {
        const document = source.currentDocument();
        if (!document) throw new Error("El dibujo todavía no está listo.");
        const share = await shareDemoDocument(document, undefined);
        const issued: Issued = {
          kind: "demo",
          url: reviewLinkUrl(share.shareToken),
          expiresAt: share.expiresAt,
          share,
        };
        setPhase({ kind: "ready", issued });
        return;
      }
      const reused = issuedRef.current;
      if (reused) {
        setPhase({ kind: "ready", issued: reused });
        return;
      }
      const created = await reviewsRepository.create(source.documentId, {
        shareLink: true,
        allowComments: true,
      });
      // Fallo cerrado, como en `ReviewLinkIssuer`: sin token no hay enlace.
      if (!created.shareToken) throw new Error("El servidor no emitió el enlace.");
      const issued: Issued = {
        kind: "document",
        url: reviewLinkUrl(created.shareToken),
        expiresAt: created.session.expiresAt ?? null,
        sessionId: created.session.id,
      };
      issuedRef.current = issued;
      setPhase({ kind: "ready", issued });
    } catch (cause) {
      setPhase({ kind: "failed", message: describe(cause) });
    }
  }, [source]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    void issue();
  };

  // El panel se ancla bajo el botón y SIEMPRE dentro de la ventana. En
  // Esencial el botón vive a la izquierda: alinearlo por su borde derecho lo
  // sacaba de la pantalla (medido por el robot estudiante el 2026-09-24).
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - 16);
      const preferred = rect.left + rect.width / 2 < window.innerWidth / 2 ? rect.left : rect.right - width;
      setPosition({
        top: Math.round(rect.bottom + 6),
        left: Math.round(Math.min(Math.max(8, preferred), window.innerWidth - width - 8)),
        width,
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  // Escape y clic fuera cierran, como el resto de menús de la fila superior.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open]);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Sin permiso de portapapeles el enlace sigue a la vista para copiarlo
      // a mano; se selecciona para que baste con Ctrl+C.
      const code = panelRef.current?.querySelector("code");
      if (code) window.getSelection()?.selectAllChildren(code);
    }
  };

  const remove = async (issued: Issued) => {
    try {
      if (issued.kind === "demo") await deleteDemoShare(issued.share);
      else {
        await reviewsRepository.close(issued.sessionId);
        issuedRef.current = null;
      }
      setPhase({ kind: "deleted" });
    } catch (cause) {
      setPhase({ kind: "failed", message: describe(cause) });
    }
  };

  const panel =
    open && position && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Compartir este plano"
            data-testid="cad-share-panel"
            style={{ top: position.top, left: position.left, width: position.width }}
            className="fixed z-[90] max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-card border border-border bg-popover p-3 text-popover-foreground shadow-floating"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="type-small font-semibold text-foreground">Compartir este plano</h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setOpen(false)}
                className="rounded-control p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <PanelBody
              source={source}
              phase={phase}
              copied={copied}
              onCopy={copy}
              onRemove={remove}
              onRetry={() => void issue()}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="cad-share"
        data-cad-readonly-allowed
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        title="Compartir este plano con un enlace"
        className={TRIGGER}
      >
        <Share2 aria-hidden="true" className="h-4 w-4" />
        <span className={TRIGGER_LABEL}>Compartir</span>
      </button>
      {panel}
    </>
  );
}

function PanelBody({
  source,
  phase,
  copied,
  onCopy,
  onRemove,
  onRetry,
}: {
  source: CadShareSource;
  phase: Phase;
  copied: boolean;
  onCopy: (url: string) => void | Promise<void>;
  onRemove: (issued: Issued) => void | Promise<void>;
  onRetry: () => void;
}) {
  if (phase.kind === "idle" || phase.kind === "creating") {
    return (
      <p role="status" className="mt-2 type-caption text-muted-foreground">
        Creando el enlace…
      </p>
    );
  }
  if (phase.kind === "failed") {
    return (
      <div className="mt-2 space-y-2">
        <p role="alert" data-testid="cad-share-error" className="type-caption text-danger-ink">
          {phase.message}
        </p>
        <button type="button" onClick={onRetry} className={`${ACTION} border border-border text-foreground hover:bg-muted`}>
          Reintentar
        </button>
      </div>
    );
  }
  if (phase.kind === "deleted") {
    return (
      <div className="mt-2 space-y-2">
        <p role="status" data-testid="cad-share-deleted" className="type-caption text-muted-foreground">
          Enlace borrado: ya no abre el plano.
        </p>
        <button type="button" onClick={onRetry} className={`${ACTION} border border-border text-foreground hover:bg-muted`}>
          Crear otro enlace
        </button>
      </div>
    );
  }
  const { issued } = phase;
  return (
    <div className="mt-2 space-y-3">
      <p className="type-caption text-muted-foreground">
        {issued.kind === "demo"
          ? "Quien lo abra ve una copia de sólo lectura de tu dibujo, sin instalar nada ni crear cuenta."
          : "Quien lo abra ve el plano y puede comentarlo sin instalar nada ni crear cuenta."}
      </p>
      <div className="flex items-center gap-3">
        {/* `QrCode` ocupa todo el ancho de su caja: la caja fija su tamaño. */}
        <div className="h-28 w-28 shrink-0">
          <QrCode value={issued.url} label="Código QR del enlace para abrirlo en el celular" />
        </div>
        <p className="type-micro text-muted-foreground">
          Escanéalo con la cámara del celular o manda el enlace por WhatsApp o correo.
        </p>
      </div>
      <code
        data-testid="cad-share-url"
        className="block max-h-16 overflow-y-auto break-all rounded-control border border-border bg-muted/40 px-2 py-1 font-mono type-micro text-foreground"
      >
        {issued.url}
      </code>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="cad-share-copy"
          onClick={() => void onCopy(issued.url)}
          className={`${ACTION} bg-brand-strong text-primary-foreground hover:opacity-90`}
        >
          {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
          {copied ? "Copiado" : "Copiar enlace"}
        </button>
        <button
          type="button"
          data-testid="cad-share-delete"
          onClick={() => void onRemove(issued)}
          className={`${ACTION} border border-border text-danger-ink hover:bg-muted`}
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          Borrar enlace
        </button>
      </div>
      {issued.expiresAt ? (
        <p data-testid="cad-share-expiry" className="type-micro text-muted-foreground">
          Caduca el {formatDate(issued.expiresAt)}.
          {issued.kind === "demo" ? " Si sigues dibujando, vuelve a pulsar «Compartir» para mandar la versión nueva." : ""}
        </p>
      ) : null}
      {source.kind === "demo" ? (
        <>
          <p className="type-micro text-muted-foreground">
            No incluyas datos personales de otras personas (nombres, direcciones, teléfonos) en un plano que compartes.
          </p>
          <Link
            href={source.registerHref}
            data-testid="cad-share-register"
            className="block rounded-control border border-primary/30 bg-primary/10 px-3 py-2 type-caption font-medium text-primary-ink hover:bg-primary/15"
          >
            Crea tu cuenta para conservarlo: tu dibujo pasa a tu cuenta y este mismo enlace sigue abriendo 90 días, con comentarios.
          </Link>
        </>
      ) : null}
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function describe(cause: unknown): string {
  if (cause instanceof DesignApiError) {
    if (cause.status === 429) return "Creaste varios enlaces seguidos. Espera unos minutos y vuelve a intentarlo.";
    if (cause.status === 413) return "El dibujo es demasiado grande para un enlace temporal. Crea tu cuenta para compartirlo.";
    if (cause.status === 503) return "Compartir desde la demostración está en pausa por ahora. Crea tu cuenta para compartir.";
    if (cause.status === 400 && /vac[ií]o/i.test(cause.message)) return "El plano está vacío: dibuja algo antes de compartirlo.";
  }
  return "No pudimos crear el enlace. Revisa tu conexión y vuelve a intentarlo.";
}
