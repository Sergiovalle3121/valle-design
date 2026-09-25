"use client";

/**
 * La página que abre el CLIENTE del arquitecto.
 *
 * ## Lo que esto vende
 *
 * Un arquitecto manda un enlace por WhatsApp. Su cliente lo abre en el móvil,
 * ve el plano, toca un punto y escribe «esta ventana da al patio de luces».
 * Sin instalar nada, sin crear cuenta, sin licencia. AutoCAD Web no hace esto:
 * el invitado necesita una cuenta de Autodesk. Es la razón por la que 199
 * pesos al mes tienen sentido frente a 181.
 *
 * ## Aislamiento: un enlace, UN documento
 *
 * No se elige aquí y no se puede relajar desde aquí. El canje es
 * `GET /v1/cad/review/context` con el token en la cabecera, y el servidor
 * decide: saca el tenant de la fila de la sesión, sirve EXCLUSIVAMENTE el
 * documento de esa sesión y responde 403 `review_read_only` a cualquier otra
 * ruta con ese contexto. Esta página no conoce el id de ningún otro documento
 * ni tiene forma de pedirlo, que es como debe ser: la barrera está en el
 * backend y aquí sólo se consume lo que llega.
 *
 * ## Fallo cerrado
 *
 * Enlace ausente, caducado, revocado o desconocido ⇒ pantalla explícita con lo
 * que hay que hacer, y el token se olvida. Nunca un plano parcial, nunca un
 * «modo demo», nunca un lienzo vacío que parezca un dibujo sin entidades.
 *
 * ## El enlace temporal de la demostración (`vdds_…`)
 *
 * Quien dibuja en `/demo` sin cuenta comparte una COPIA de sólo lectura que
 * caduca a los siete días (`lib/cad/share/demo-share-repository.ts`). Llega a
 * esta misma página con el mismo fragmento `#cadReview=`, y se canjea por
 * `GET /v1/cad/demo-shares/context`: sin comentarios ni presencia, porque no
 * hay documento ni autor detrás. Si su dueño creó cuenta y lo RECLAMÓ, el
 * servidor movió el mismo hash a una sesión de revisión: la copia temporal ya
 * no existe (401 `demo_share_invalid`) y el mismo token abre ahora la revisión
 * normal, con comentarios. Quien recibió el enlace no tiene que hacer nada.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CadDocument, CadPoint2 } from "@/lib/cad/cad-document";
import {
  cadCommentAnchor,
  type CadCommentAnchorPoint,
} from "@/lib/cad/collab/comment-anchor";
import { projectCadPlan } from "@/lib/cad/collab/plan-projection";
import { cadReviewRoomAreas } from "@/lib/cad/collab/review-room-areas";
import {
  browserReviewTokenEnvironment,
  forgetReviewToken,
  peekReviewToken,
  sweepReviewToken,
} from "@/lib/cad/collab/review-token";
import { reviewLinkRepository } from "@/lib/cad/repositories/reviews";
import { DesignApiError } from "@/lib/cad/repositories/client";
import { isDemoShareToken, redeemDemoShare } from "@/lib/cad/share/demo-share-repository";
import CollabThreadPanel from "./CollabThreadPanel";
import ReviewPlanView from "./ReviewPlanView";
import { useCadComments, type CadCommentSource } from "./use-cad-comments";
import { useCadPresence } from "./use-cad-presence";
import { PRODUCT_LABEL } from "@/config/brand";
import { COMMERCIAL_CONTACTS, COMMERCIAL_LINKS } from "@/config/commercial";

interface RedeemedReview {
  token: string;
  /** `demo`: copia temporal de `/demo`, sin comentarios ni presencia. */
  origin: "review" | "demo";
  documentId: string;
  documentName: string;
  allowComments: boolean;
  /** Sólo en la copia de la demostración: cuándo deja de abrir. */
  expiresAt: string | null;
  plan: CadDocument;
}

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; review: RedeemedReview }
  | { kind: "failed"; title: string; detail: string };

/** Pantalla derivada de «el enlace llegó sin token». No es un estado. */
const MISSING_CREDENTIAL: Phase = {
  kind: "failed",
  title: "Este enlace no trae credencial",
  detail:
    "Abre el enlace completo tal y como te lo enviaron, sin recortarlo. Si lo copiaste a mano, puede que se haya perdido la parte de después de la almohadilla.",
};

export default function ReviewLinkClient() {
  /**
   * El token se LEE en un inicializador perezoso —no en un efecto— porque de
   * él depende la primera pantalla: leerlo después obligaría a un `setState`
   * dentro del efecto y a un fotograma de «cargando» para quien abrió un
   * enlace roto. La lectura es PURA (`peekReviewToken`); sacarlo de la barra
   * es un efecto y va abajo, porque `history.replaceState` durante el render
   * actualiza el Router de Next en mitad del render de otro componente.
   */
  const [token] = useState<string | null>(readTokenOnce);
  const [redeemed, setRedeemed] = useState<Phase>({ kind: "loading" });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingAnchor, setPendingAnchor] = useState<CadCommentAnchorPoint | null>(
    null,
  );

  // La credencial deja de estar en la barra en el primer efecto tras montar.
  // Va sola y sin dependencias: es un barrido, no una fuente de estado.
  useEffect(() => {
    const environment = browserReviewTokenEnvironment();
    if (environment) sweepReviewToken(environment);
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const redeem = async () => {
      try {
        const opened = await openLink(token);
        if (!active) return;
        const plan = inlineDocument(opened.document?.cadDocument);
        if (!plan) {
          setRedeemed({
            kind: "failed",
            title: "No pudimos abrir el plano",
            detail:
              "La revisión existe pero su documento no llegó en un formato que este visor pueda dibujar. Avisa a quien te mandó el enlace.",
          });
          return;
        }
        setRedeemed({
          kind: "ready",
          review: {
            token,
            origin: opened.origin,
            documentId: opened.origin === "demo" ? "" : String(opened.document?.id ?? ""),
            documentName: String(opened.document?.name ?? "Plano en revisión"),
            allowComments: opened.allowComments,
            expiresAt: opened.expiresAt,
            plan,
          },
        });
      } catch (cause) {
        if (!active) return;
        const environment = browserReviewTokenEnvironment();
        if (environment) forgetReviewToken(environment);
        setRedeemed({ kind: "failed", ...describeFailure(cause) });
      }
    };
    void redeem();
    return () => {
      active = false;
    };
  }, [token]);

  const phase: Phase = token ? redeemed : MISSING_CREDENTIAL;
  const review = phase.kind === "ready" ? phase.review : null;

  const source = useMemo<CadCommentSource | null>(() => {
    if (!review || review.origin === "demo") return null;
    const surface = reviewLinkRepository(review.token).comments;
    return {
      list: () => surface.list(),
      create: (input) => surface.create(input),
      resolve: (commentId) => surface.resolve(commentId),
    };
  }, [review]);
  const comments = useCadComments(source);

  const presence = useCadPresence({
    documentId: review && review.origin === "review" ? review.documentId : null,
    name: "Invitado",
    guest: true,
  });

  const projection = useMemo(
    () => (review ? projectCadPlan(review.plan) : null),
    [review],
  );
  const roomAreas = useMemo(
    () => review && projection ? cadReviewRoomAreas(review.plan, projection) : [],
    [review, projection],
  );

  const pins = useMemo(
    () =>
      comments.threads.flatMap((thread) =>
        thread.anchor.status === "anchored" && thread.anchor.anchor.space === "model"
          ? [
              {
                id: thread.id,
                world: { x: thread.anchor.anchor.x, y: thread.anchor.anchor.y },
                resolved: thread.resolved,
                ordinal: thread.ordinal,
              },
            ]
          : [],
      ),
    [comments.threads],
  );

  const place = useCallback((point: CadPoint2) => {
    setPendingAnchor(cadCommentAnchor(point));
    setPlacing(false);
  }, []);

  const submit = useCallback(
    async (body: string) => {
      const saved = await comments.create(body, pendingAnchor);
      if (!saved) return;
      setDraft("");
      setPendingAnchor(null);
    },
    [comments, pendingAnchor],
  );

  if (phase.kind === "loading") {
    return (
      <Shell>
        <p data-testid="cad-review-loading" role="status" className="text-sm text-muted-foreground">
          Abriendo la revisión…
        </p>
      </Shell>
    );
  }

  if (phase.kind === "failed") {
    return (
      <Shell>
        <div
          data-testid="cad-review-failed"
          className="max-w-md rounded-card border border-danger/30 bg-danger/15 p-6 text-center"
        >
          <h1 className="text-lg font-semibold text-rose-100">{phase.title}</h1>
          <p role="alert" className="mt-2 text-sm text-rose-100/80">
            {phase.detail}
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <main
      data-testid="cad-review-surface"
      className="flex h-dvh w-full flex-col bg-[#070b16] text-foreground lg:flex-row"
    >
      <div className="relative min-h-0 flex-1">
        <header className="absolute left-0 right-0 top-0 z-10 flex flex-wrap items-center gap-2 bg-gradient-to-b from-[#070b16] to-transparent px-3 py-2">
          <span
            data-testid="cad-review-banner"
            className="rounded-full border border-warning/30 bg-warning/15 px-2.5 py-0.5 type-micro font-semibold text-warning-ink"
          >
            {phase.review.origin === "demo" ? "COPIA COMPARTIDA · SOLO LECTURA" : "REVISIÓN · SOLO LECTURA"}
          </span>
          <h1
            data-testid="cad-review-document-name"
            className="min-w-0 truncate type-small font-medium text-foreground"
          >
            {phase.review.documentName}
          </h1>
        </header>
        {projection ? (
          <ReviewPlanView
            projection={projection}
            roomAreas={roomAreas}
            pins={pins}
            activeId={activeId}
            onSelect={setActiveId}
            placing={placing}
            onPlace={place}
          />
        ) : null}
      </div>

      {phase.review.origin === "demo" ? (
        <DemoShareAside expiresAt={phase.review.expiresAt} />
      ) : (
        <aside className="flex min-h-0 w-full shrink-0 flex-col border-t border-border bg-surface text-foreground p-3 lg:h-full lg:w-[22rem] lg:border-l lg:border-t-0">
          <CollabThreadPanel
            threads={comments.threads}
            error={comments.error}
            busy={comments.busy}
            activeId={activeId}
            onSelect={setActiveId}
            // El invitado NO resuelve hilos ajenos: cerrar una observación es
            // una decisión del autor del plano, y la superficie lo permitiría.
            onResolve={null}
            onSubmit={phase.review.allowComments ? (body) => void submit(body) : null}
            disabledReason="Quien compartió este plano dejó la revisión en solo lectura: puedes verlo, pero no comentar."
            draft={draft}
            onDraftChange={setDraft}
            onStartPlacing={phase.review.allowComments ? () => setPlacing(true) : null}
            placing={placing}
            onCancelPlacing={() => setPlacing(false)}
            pendingAnchor={pendingAnchor}
            onClearAnchor={() => setPendingAnchor(null)}
            peers={presence.peers}
            presenceConnected={presence.connected}
          />
          <p className="mt-2 shrink-0 type-micro text-muted-foreground">
            {PRODUCT_LABEL.design} · Este enlace da acceso únicamente a este plano.
          </p>
        </aside>
      )}
    </main>
  );
}

interface OpenedLink {
  origin: "review" | "demo";
  document: { id?: unknown; name?: unknown; cadDocument?: unknown } | undefined;
  allowComments: boolean;
  expiresAt: string | null;
}

/**
 * Un token `vdds_` se canjea primero como copia de la demostración; si ya no
 * existe porque su dueño lo reclamó desde su cuenta, el MISMO token es ahora
 * un review link. Cualquier otro fallo se propaga tal cual.
 */
async function openLink(token: string): Promise<OpenedLink> {
  if (isDemoShareToken(token)) {
    try {
      const context = await redeemDemoShare(token);
      return {
        origin: "demo",
        document: context.document,
        allowComments: false,
        expiresAt: context.expiresAt,
      };
    } catch (cause) {
      const claimed =
        cause instanceof DesignApiError && cause.status === 401 && cause.code === "demo_share_invalid";
      if (!claimed) throw cause;
    }
  }
  const context = await reviewLinkRepository(token).context();
  return {
    origin: "review",
    document: context.document,
    allowComments: context.session?.allowComments !== false,
    expiresAt: null,
  };
}

/**
 * El pie de la copia de la demostración: qué es, cuándo caduca, cómo dibujar
 * uno propio y cómo avisar si el plano no debería estar aquí.
 */
function DemoShareAside({ expiresAt }: { expiresAt: string | null }) {
  const report = COMMERCIAL_CONTACTS.support
    ? `mailto:${COMMERCIAL_CONTACTS.support}?subject=${encodeURIComponent("Reportar un plano compartido")}`
    : COMMERCIAL_LINKS.support;
  return (
    <aside
      data-testid="cad-demo-share-aside"
      className="flex w-full shrink-0 flex-col gap-2 border-t border-border bg-surface p-3 text-foreground lg:h-full lg:w-[22rem] lg:border-l lg:border-t-0"
    >
      <p className="type-caption text-muted-foreground">
        Compartido desde la demostración de {PRODUCT_LABEL.design}
        {expiresAt ? ` · caduca el ${formatDay(expiresAt)}` : ""}.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/demo"
          data-testid="cad-demo-share-try"
          className="rounded-control bg-brand-strong px-3 py-1.5 type-caption font-medium text-primary-foreground"
        >
          Dibuja el tuyo gratis
        </Link>
        <a
          href={report}
          data-testid="cad-demo-share-report"
          className="type-micro text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Reportar este plano
        </a>
      </div>
    </aside>
  );
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" }).format(date);
}

function readTokenOnce(): string | null {
  const environment = browserReviewTokenEnvironment();
  return environment ? peekReviewToken(environment) : null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#070b16] p-6">
      {children}
    </main>
  );
}

/**
 * El canje devuelve el documento HIDRATADO. Un puntero a blob sin hidratar
 * significaría una API anterior a R3: se rechaza en vez de dibujar el lienzo
 * vacío que un `?? {}` habría producido, porque un plano vacío se parece
 * demasiado a un plano sin entidades.
 */
function inlineDocument(value: unknown): CadDocument | null {
  if (!value || typeof value !== "object") return null;
  const storage = (value as { _storage?: { kind?: unknown } })._storage;
  if (storage && storage.kind === "document_blob") return null;
  const candidate = value as Partial<CadDocument>;
  if (!Array.isArray(candidate.entities) || !Array.isArray(candidate.layers))
    return null;
  if (!candidate.modelSpace || !Array.isArray(candidate.modelSpace.entityIds))
    return null;
  return value as CadDocument;
}

function describeFailure(cause: unknown): { title: string; detail: string } {
  const status = cause instanceof DesignApiError ? cause.status : 0;
  if (cause instanceof DesignApiError && cause.code === "demo_share_expired") {
    return {
      title: "Este enlace ya caducó",
      detail:
        "Los planos compartidos desde la demostración se borran a los siete días. Pídele a quien te lo mandó que lo comparta otra vez.",
    };
  }
  if (status === 401 || status === 403) {
    return {
      title: "Este enlace ya no abre el plano",
      detail:
        "Puede haber caducado o el autor pudo haberlo revocado. Pídele uno nuevo: los enlaces de revisión se emiten en segundos.",
    };
  }
  if (status === 404) {
    return {
      title: "El plano ya no existe",
      detail: "El documento que revisabas fue eliminado por su autor.",
    };
  }
  return {
    title: "No pudimos abrir la revisión",
    detail:
      "Comprueba tu conexión y vuelve a intentarlo. Si sigue fallando, avisa a quien te mandó el enlace.",
  };
}
