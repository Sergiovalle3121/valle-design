"use client";

/**
 * La mensajería de equipo DENTRO del estudio: el «como Teams» que pidió el
 * dueño de producto, montado al lado de `StudioCollaborationLayer` — un
 * segundo muelle de la misma familia, no una pantalla aparte.
 *
 * ## Aprovisionamiento sin formulario
 *
 * En vez de pedirle a la primera persona que crea el canal «General» de su
 * proyecto, este host lo hace por ella la primera vez que hay un `projectId`
 * en contexto y todavía no existe: nadie debería necesitar entender qué es
 * un «canal» antes de poder escribirle a su equipo. Crear un canal DIRECTO
 * (mensaje privado a una persona) queda fuera de este host — la aritmética y
 * la API ya lo soportan (`use-team-messaging.ts`, `/v1/messaging/channels`
 * con `kind: 'direct'`) y están probadas; falta el selector de persona en la
 * interfaz, declarado aquí como «todavía no» en vez de improvisado a última
 * hora con un `window.prompt`.
 *
 * ## Lo que NO hace
 *
 * No pinta chinchetas sobre el plano ni engancha «anclar desde la
 * selección»: eso comparte superficie (el mismo lienzo, el mismo modo
 * «colocar») con `StudioCollaborationLayer`, y dos consumidores cableando el
 * mismo overlay de forma independiente es exactamente la clase de colisión
 * que corresponde resolver en un solo sitio, no duplicar aquí.
 * `messageAnchorPins` (`lib/cad/messaging/message-model.ts`) ya deja lista
 * esa proyección para cuando se enganche.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStudioTraySlot } from "@/components/cad/studio/use-studio-tray";
import type { TeamChannelSummary } from "@/lib/cad/messaging/channel-state";
import { totalUnreadCount } from "@/lib/cad/messaging/channel-state";
import TeamMessagingPanel from "./TeamMessagingPanel";
import { useTeamMessaging } from "./use-team-messaging";

export interface TeamMessagingHostProps {
  /** Proyecto CAD activo. Sin él no se aprovisiona ningún canal de proyecto. */
  projectId?: string;
  viewerUserId: string;
  /** `cad:edit` de la membresía activa. */
  canWrite: boolean;
}

const DOCK =
  "fixed left-3 bottom-16 z-[75] flex max-w-[calc(100vw-1.5rem)] flex-col rounded-card border border-border bg-popover/95 text-popover-foreground p-2 shadow-floating backdrop-blur";
const DOCK_WIDTH = { open: "w-[22rem]", collapsed: "w-auto" } as const;
/**
 * PLEGADO, en la BANDEJA de la barra de estado (`cad-status-tray`), un
 * elemento más del renglón. Medido el 2026-09-02 (golden 67): en `fixed
 * left-3 bottom-16` la píldora caía sobre el botón de una plantilla de la
 * biblioteca en cuanto la cinta cambió de alto — cualquier altura fija sobre
 * una columna de paneles tapa algo de esa columna; la barra de estado no
 * tiene nada debajo.
 *
 * ABIERTO, abajo a la izquierda de siempre (`DOCK`), no desplegado desde la
 * bandeja: medido con la colaboración (ca86fc6, `real/cad-presencia-viva`),
 * un panel que se abre hacia arriba desde la bandeja cae sobre el CENTRO del
 * lienzo y se come el puntero; ver `StudioCollaborationLayer`. Abierto tapa
 * la parte baja de la biblioteca, y lo abrió el usuario.
 */
const TRAY_COLLAPSED = "inline-flex items-center gap-1";

/**
 * IZQUIERDA, mientras que la colaboración de revisión vive a la derecha
 * (`StudioCollaborationLayer`, `right-3`): dos muelles del mismo tamaño
 * anclados al mismo borde se solaparían. `z-[75]` es el mismo nivel — ver el
 * comentario de esa capa sobre por qué (por encima del lienzo `z-[70]` del
 * editor, por debajo de sus diálogos).
 */
export default function TeamMessagingHost({
  projectId,
  viewerUserId,
  canWrite,
}: TeamMessagingHostProps) {
  const [collapsed, setCollapsed] = useState(true);
  const tray = useStudioTraySlot();
  const [draft, setDraft] = useState("");
  const messaging = useTeamMessaging({
    viewerUserId,
    canRead: true,
    canWrite,
  });

  // Aprovisiona el canal "General" del proyecto UNA vez que la lista de
  // canales ya cargó y no existe ninguno para este projectId — nunca antes
  // (crearía un duplicado en cada carga a medio terminar) ni más de una vez
  // por proyecto (la ref evita reintentar tras un fallo de red silencioso en
  // el siguiente render).
  const provisioned = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId || !canWrite || messaging.channelsLoading) return;
    if (provisioned.current === projectId) return;
    const hasProjectChannel = messaging.channels.some(
      (channel) => channel.kind === "project" && channel.projectId === projectId,
    );
    if (hasProjectChannel) {
      provisioned.current = projectId;
      return;
    }
    provisioned.current = projectId;
    void messaging.createProjectChannel(projectId, "General").then((created) => {
      if (created) messaging.selectChannel(created.id);
    });
    // Sólo se dispara cuando cambian projectId/canWrite/estado de carga — no
    // en cada actualización de `channels` (llegan por SSE constantemente).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, canWrite, messaging.channelsLoading]);

  const send = canWrite
    ? () => {
        void messaging.send(draft).then((ok) => {
          if (ok) setDraft("");
        });
      }
    : null;

  const dock = (
    <aside
      className={
        tray && collapsed ? TRAY_COLLAPSED : `${DOCK} ${collapsed ? DOCK_WIDTH.collapsed : DOCK_WIDTH.open}`
      }
      data-testid="team-messaging-dock"
    >
      <div className="flex items-center justify-between gap-2">
        <strong className={`type-micro text-foreground ${tray && collapsed ? "@max-[40rem]:hidden" : ""}`}>Equipo</strong>
        <button
          type="button"
          data-testid="team-messaging-toggle"
          onClick={() => setCollapsed((value) => !value)}
          className="rounded-control border border-border px-2 py-0.5 type-micro text-foreground hover:border-primary/30 hover:text-primary-ink"
          aria-expanded={!collapsed}
        >
          {collapsed
            ? totalUnreadLabel(messaging.channels)
            : "Ocultar"}
        </button>
      </div>

      {collapsed ? null : (
        <div className="mt-2 flex max-h-[min(60vh,32rem)] min-h-[20rem] flex-col gap-2">
          <TeamMessagingPanel
            channels={messaging.channels}
            channelsLoading={messaging.channelsLoading}
            selectedChannelId={messaging.selectedChannelId}
            onSelectChannel={messaging.selectChannel}
            messages={messaging.messages}
            messagesLoading={messaging.messagesLoading}
            hasMoreOlder={messaging.hasMoreOlder}
            onLoadOlder={messaging.loadOlderMessages}
            draft={draft}
            onDraftChange={setDraft}
            onSend={send}
            busy={messaging.busy}
            error={messaging.error}
            connected={messaging.connected}
            viewerUserId={viewerUserId}
          />
        </div>
      )}
    </aside>
  );
  return tray && collapsed ? createPortal(<span className="relative inline-flex">{dock}</span>, tray) : dock;
}

function totalUnreadLabel(channels: readonly TeamChannelSummary[]): string {
  const total = totalUnreadCount(channels);
  return total > 0 ? `Abrir (${total})` : "Abrir";
}
