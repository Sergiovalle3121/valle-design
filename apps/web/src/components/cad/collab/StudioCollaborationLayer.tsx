"use client";

/**
 * La colaboración DENTRO del estudio.
 *
 * ## Por qué esto existe y por qué no vive en el editor
 *
 * La revisión ya estaba entera en el servidor —sesiones, enlaces, comentarios
 * con ancla— y no se veía por ninguna parte del trabajo diario: los hilos que
 * el editor enseñaba vivían DENTRO del documento guardado, en una paleta
 * lateral, y el invitado no podía escribir ni uno. Esta capa enchufa la
 * superficie real y la pone encima del dibujo, que es donde una anotación de
 * plano tiene sentido.
 *
 * Vive fuera de `Layout3DEditor.tsx` porque ese archivo tiene un trinquete que
 * sólo permite que encoja. Lo único que se le pidió al editor es que publique
 * su cámara y su lienzo (`viewport-registry.ts`): una línea neta.
 *
 * ## Lo que NO hace
 *
 * No edita el dibujo. Un comentario nunca mueve una entidad —ni la del autor
 * ni la del invitado—, así que esta capa no toca el documento canónico, no
 * pasa por `commitNativeCommands` y no puede ensuciar el guardado ni el
 * historial de deshacer. Su único efecto sobre el documento es ninguno.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CadPoint2 } from "@/lib/cad/cad-document";
import type { CadBounds } from "@/lib/cad/entity-runtime";
import { cadCommentAnchor, type CadCommentAnchorPoint } from "@/lib/cad/collab/comment-anchor";
import { cadViewportWorldBounds } from "@/lib/cad/collab/overlay-model";
import {
  onCadViewportPublished,
  type CadCollabSurface,
} from "@/lib/cad/collab/viewport-registry";
import { CadCollabOverlay } from "@/components/cad/viewport/collab-overlay";
import { reviewsRepository } from "@/lib/cad/repositories/reviews";
import CollabThreadPanel from "./CollabThreadPanel";
import { useCadComments, type CadCommentSource } from "./use-cad-comments";
import { useCadPresence } from "./use-cad-presence";
import ReviewLinkIssuer from "./ReviewLinkIssuer";

export interface StudioCollaborationLayerProps {
  documentId: string;
  /** Nombre con el que se le ve a uno en la presencia. */
  viewerName: string;
  /** `cad:review` — sin él no hay superficie de comentarios del autor. */
  canReview: boolean;
}

/**
 * `z-[75]` no es un número al azar: el editor se monta en un `fixed inset-0
 * z-[70]` que crea su propio contexto de apilamiento, así que cualquier valor
 * por debajo deja este panel VISIBLE pero intocable —el lienzo se come los
 * clics— y eso es peor que no enseñarlo. Por encima quedan sus diálogos
 * (80, 82, 90): un modal del editor sigue tapando la colaboración, que es el
 * orden correcto.
 */
const DOCK =
  "fixed right-3 top-24 z-[75] flex max-w-[calc(100vw-1.5rem)] flex-col rounded-card border border-border bg-popover/95 text-popover-foreground p-2 shadow-floating backdrop-blur";

/**
 * El ancho es del CONTENIDO, no del muelle. Plegado sólo hay un título y un
 * botón, así que reservar los 19rem abiertos dejaría una franja muerta de 304
 * px sobre el panel derecho para no enseñar nada en ella.
 */
const DOCK_WIDTH = { open: "w-[19rem]", collapsed: "w-auto" } as const;

export default function StudioCollaborationLayer({
  documentId,
  viewerName,
  canReview,
}: StudioCollaborationLayerProps) {
  const [surface, setSurface] = useState<CadCollabSurface | null>(null);
  /**
   * NACE PLEGADO, y no es timidez del producto.
   *
   * El muelle es `fixed right-3 top-24 w-[19rem]`: 304 px clavados encima del
   * panel derecho del estudio, que es donde viven la lista de entidades y las
   * propiedades. Abierto de entrada no los TAPA visualmente sin más — se queda
   * sus clics: Playwright lo cazó como «cad-collab-dock subtree intercepts
   * pointer events» sobre `cad-native-entity-muro-curvo`, y con él caen el
   * golden 40, el 10 y el 12 (38 goldens tocan ese panel).
   *
   * Un panel de colaboración que impide seleccionar una entidad cuesta más de
   * lo que aporta el primer día. Plegado sigue AHÍ, con su «Abrir» a un clic y
   * su recuento de comentarios sin resolver a la vista, que es el aviso que
   * justifica abrirlo. Es la misma lección que la cabecera del recorrido
   * guiado: lo que flota sobre una superficie de trabajo se queda el ratón.
   */
  const [collapsed, setCollapsed] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<CadCommentAnchorPoint | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const overlayRef = useRef<CadCollabOverlay | null>(null);
  const cursorRef = useRef<CadPoint2 | null>(null);

  const source = useMemo<CadCommentSource | null>(
    () =>
      canReview
        ? {
            list: () => reviewsRepository.comments.list(documentId),
            create: (input) =>
              reviewsRepository.comments.create(documentId, input),
            resolve: (commentId) => reviewsRepository.comments.resolve(commentId),
          }
        : null,
    [canReview, documentId],
  );
  const comments = useCadComments(source);
  const presence = useCadPresence({
    documentId,
    name: viewerName,
    guest: false,
  });
  // El overlay se crea una vez por lienzo y su callback de cursor corre en
  // cada cuadro; la ref evita rehacerlo cada vez que la presencia se
  // reconstruye. Se sincroniza en un efecto porque leer o escribir
  // `ref.current` durante el render no está permitido.
  const reportRef = useRef(presence.report);
  useEffect(() => {
    reportRef.current = presence.report;
  }, [presence.report]);

  /* ── El overlay: se crea con el lienzo del editor y muere con él ───────── */
  useEffect(() => onCadViewportPublished(setSurface), []);

  useEffect(() => {
    if (!surface) return;
    const overlay = new CadCollabOverlay(surface.container, {
      open: (commentId) => setActiveId(commentId),
      place: (point) => {
        setPendingAnchor(cadCommentAnchor(point));
        setPlacing(false);
        setCollapsed(false);
      },
      cancel: () => setPlacing(false),
      cursor: (point) => {
        cursorRef.current = point;
        reportRef.current(point, viewportBoundsOf(surface));
      },
    });
    overlay.setViewport(surface.viewport);
    overlayRef.current = overlay;
    // El encuadre viaja en el latido: es lo que responde «qué está mirando».
    // `report` sólo escribe refs, así que puede colgarse del cambio de cámara
    // sin entrar en el presupuesto del cuadro.
    const unsubscribe = surface.viewport.onChange(() => {
      reportRef.current(cursorRef.current, viewportBoundsOf(surface));
    });
    reportRef.current(null, viewportBoundsOf(surface));
    return () => {
      unsubscribe();
      overlay.dispose();
      overlayRef.current = null;
      // Sin lienzo no hay nada que anclar: el modo colocar se apaga con él, o
      // el usuario volvería a un estudio nuevo con un modo colgado del viejo.
      setPlacing(false);
    };
  }, [surface]);

  /* ── Chinchetas: sólo las que tienen ancla LEGIBLE ─────────────────────── */
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
                author: thread.author,
                body: thread.body,
              },
            ]
          : [],
      ),
    [comments.threads],
  );

  useEffect(() => {
    overlayRef.current?.setPins(pins);
  }, [pins]);
  useEffect(() => {
    overlayRef.current?.setPeers(presence.peers);
  }, [presence.peers]);
  useEffect(() => {
    overlayRef.current?.setActive(activeId);
  }, [activeId]);
  useEffect(() => {
    overlayRef.current?.setPlacing(placing);
  }, [placing]);

  const submit = useCallback(
    async (body: string) => {
      const saved = await comments.create(body, pendingAnchor);
      if (!saved) return;
      setDraft("");
      setPendingAnchor(null);
    },
    [comments, pendingAnchor],
  );

  // Sin editor montado no hay plano sobre el que comentar y el panel sobra:
  // enseñarlo flotando sobre una pantalla de carga sería un muñón.
  if (!surface) return null;

  return (
    <aside
      className={`${DOCK} ${collapsed ? DOCK_WIDTH.collapsed : DOCK_WIDTH.open}`}
      data-testid="cad-collab-dock"
    >
      <div className="flex items-center justify-between gap-2">
        <strong className="type-micro text-foreground">Colaboración</strong>
        <button
          type="button"
          data-testid="cad-collab-toggle"
          onClick={() => setCollapsed((value) => !value)}
          className="rounded-control border border-border px-2 py-0.5 type-micro text-foreground hover:border-primary/30 hover:text-primary-ink"
          aria-expanded={!collapsed}
        >
          {collapsed ? "Abrir" : "Ocultar"}
        </button>
      </div>

      {collapsed ? null : canReview ? (
        <div className="mt-2 flex max-h-[min(60vh,32rem)] flex-col gap-2">
          <CollabThreadPanel
            threads={comments.threads}
            error={comments.error}
            busy={comments.busy}
            activeId={activeId}
            onSelect={setActiveId}
            onResolve={(commentId) => void comments.resolve(commentId)}
            onSubmit={(body) => void submit(body)}
            draft={draft}
            onDraftChange={setDraft}
            onStartPlacing={() => setPlacing(true)}
            placing={placing}
            onCancelPlacing={() => setPlacing(false)}
            pendingAnchor={pendingAnchor}
            onClearAnchor={() => setPendingAnchor(null)}
            peers={presence.peers}
            presenceConnected={presence.connected}
          />
          <ReviewLinkIssuer documentId={documentId} />
        </div>
      ) : (
        <p
          data-testid="cad-collab-no-permission"
          className="mt-2 type-micro text-muted-foreground"
        >
          Tu rol no incluye el permiso de revisión (cad:review), así que no
          puedes leer ni escribir comentarios de este documento.
        </p>
      )}
    </aside>
  );
}

function viewportBoundsOf(surface: CadCollabSurface): CadBounds | null {
  return cadViewportWorldBounds(
    (x, y) => surface.viewport.screenToWorld(x, y),
    {
      widthPx: surface.viewport.view.widthPx,
      heightPx: surface.viewport.view.heightPx,
    },
  );
}
