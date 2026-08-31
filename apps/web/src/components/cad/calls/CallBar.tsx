"use client";

import { useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  Video,
  VideoOff,
} from "lucide-react";
import { Badge, Button, Surface } from "@/components/ui";
import type { CallHangupReason, PeerLinkStatus } from "@/lib/cad/calls/call-state";
import { useCallSession } from "./use-call-session";
import type { CallSessionHost, CallSessionSnapshot } from "./call-session-host";

/**
 * LA BARRA DE LLAMADA — autocontenida, montable con una línea:
 * `<CallBar documentId={documentId} displayName={perfil.nombre} />`.
 *
 * Miniaturas de video, conmutadores de cámara/micrófono/pantalla, botón de
 * colgar. Todo el estado y la orquestación de WebRTC viven en
 * `call-session-host.ts`; este componente sólo lee el snapshot y llama a
 * los métodos del anfitrión — ningún botón aquí "responde hecho" sin que el
 * anfitrión ejecute el efecto real (unirse a la sala, abrir la cámara,
 * mandar la señal).
 */

const HANGUP_MESSAGES: Record<CallHangupReason, string> = {
  local: "Llamada terminada.",
  "room-full":
    "La sala ya tiene el máximo de participantes de la malla completa (4).",
  "access-denied": "No tienes acceso a este documento para llamar.",
  "signaling-lost": "Se perdió la conexión de señalización. Intenta de nuevo.",
  "ice-failed-no-turn":
    "La llamada no pudo conectar: esta red necesita un servidor TURN que este despliegue no tiene configurado.",
  "ice-failed": "La llamada no pudo conectar. Intenta de nuevo.",
};

const PHASE_LABEL: Record<"llamando" | "conectando" | "en-curso", string> = {
  llamando: "Llamando…",
  conectando: "Conectando…",
  "en-curso": "En curso",
};

const PEER_STATUS_TONE: Record<
  PeerLinkStatus,
  "warning" | "success" | "danger"
> = {
  negotiating: "warning",
  connected: "success",
  reconnecting: "warning",
  failed: "danger",
};

const PEER_STATUS_LABEL: Record<PeerLinkStatus, string> = {
  negotiating: "conectando",
  connected: "conectado",
  reconnecting: "reconectando",
  failed: "sin conexión",
};

function VideoTile({
  stream,
  label,
  muted,
  statusTone,
  statusLabel,
}: {
  stream: MediaStream | null;
  label: string;
  muted: boolean;
  statusTone?: "warning" | "success" | "danger";
  statusLabel?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
  }, [stream]);

  return (
    <Surface
      radius="surface"
      elevation="resting"
      padded={false}
      className="relative flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden bg-muted"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="h-full w-full object-cover"
      />
      <span className="type-caption absolute inset-x-0 bottom-0 truncate bg-card/80 px-2 py-0.5 text-foreground">
        {label}
      </span>
      {statusTone && statusLabel ? (
        <Badge tone={statusTone} dot className="absolute right-1 top-1">
          {statusLabel}
        </Badge>
      ) : null}
    </Surface>
  );
}

function ToggleButton({
  enabled,
  onLabel,
  offLabel,
  onIcon,
  offIcon,
  onPress,
  testId,
}: {
  enabled: boolean;
  onLabel: string;
  offLabel: string;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
  onPress: () => void;
  testId?: string;
}) {
  return (
    <Button
      type="button"
      variant={enabled ? "primary" : "secondary"}
      size="sm"
      aria-pressed={enabled}
      aria-label={enabled ? onLabel : offLabel}
      onClick={onPress}
      data-testid={testId}
    >
      {enabled ? onIcon : offIcon}
    </Button>
  );
}

export function CallBar({
  documentId,
  displayName,
}: {
  documentId: string;
  displayName?: string;
}) {
  const { snapshot, host } = useCallSession(documentId, displayName);
  const { state, toggles, mediaError } = snapshot;

  // `fixed ... z-[75]`: el estudio monta el editor en `fixed inset-0 z-[70]`
  // (su propio contexto de apilamiento — ver `StudioCollaborationLayer`),
  // así que cualquier chrome flotante encima necesita el mismo piso. La capa
  // de colaboración vive abajo a la derecha; esta va arriba para no pisarla.
  return (
    <div className="fixed right-3 top-3 z-[75]">
      <CallBarContent
        state={state}
        toggles={toggles}
        mediaError={mediaError}
        host={host}
      />
    </div>
  );
}

function CallBarContent({
  state,
  toggles,
  mediaError,
  host,
}: {
  state: CallSessionSnapshot["state"];
  toggles: CallSessionSnapshot["toggles"];
  mediaError: string | null;
  host: CallSessionHost;
}) {
  if (state.phase === "inactiva") {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        iconLeft={<Phone className="h-4 w-4" aria-hidden="true" />}
        onClick={() => void host.start()}
        data-testid="call-start-button"
      >
        Videollamada
      </Button>
    );
  }

  if (state.phase === "colgada") {
    return (
      <Surface
        radius="card"
        elevation="elevated"
        padded="sm"
        className="flex items-center gap-3"
      >
        <Badge tone={state.reason === "local" ? "neutral" : "danger"}>
          {HANGUP_MESSAGES[state.reason]}
        </Badge>
        <Button type="button" variant="secondary" size="sm" onClick={() => host.reset()}>
          Aceptar
        </Button>
      </Surface>
    );
  }

  return (
    <Surface
      radius="card"
      elevation="elevated"
      padded="sm"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-2">
        <Badge tone={state.phase === "en-curso" ? "success" : "warning"} dot>
          {PHASE_LABEL[state.phase]}
        </Badge>
        <span className="type-caption text-muted-foreground">
          {state.roster.length} participante{state.roster.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        <VideoTile
          stream={host.getLocalStream()}
          label={`${state.self.name || "Tú"} (tú)`}
          muted
        />
        {Object.values(state.peers).map((peer) => {
          const entry = state.roster.find(
            (r) => r.participantId === peer.participantId,
          );
          return (
            <VideoTile
              key={peer.participantId}
              stream={host.getRemoteStream(peer.participantId)}
              label={entry?.name || "Invitado"}
              muted={false}
              statusTone={PEER_STATUS_TONE[peer.status]}
              statusLabel={PEER_STATUS_LABEL[peer.status]}
            />
          );
        })}
      </div>

      {mediaError ? (
        <p className="type-small text-danger-ink">{mediaError}</p>
      ) : null}

      <div className="flex items-center gap-2">
        <ToggleButton
          enabled={toggles.micEnabled}
          onLabel="Silenciar micrófono"
          offLabel="Activar micrófono"
          onIcon={<Mic className="h-4 w-4" aria-hidden="true" />}
          offIcon={<MicOff className="h-4 w-4" aria-hidden="true" />}
          onPress={() => void host.toggleMic()}
          testId="call-mic-toggle"
        />
        <ToggleButton
          enabled={toggles.cameraEnabled}
          onLabel="Apagar cámara"
          offLabel="Prender cámara"
          onIcon={<Video className="h-4 w-4" aria-hidden="true" />}
          offIcon={<VideoOff className="h-4 w-4" aria-hidden="true" />}
          onPress={() => void host.toggleCamera()}
          testId="call-camera-toggle"
        />
        <ToggleButton
          enabled={toggles.screenShareEnabled}
          onLabel="Dejar de compartir pantalla"
          offLabel="Compartir pantalla"
          onIcon={<ScreenShare className="h-4 w-4" aria-hidden="true" />}
          offIcon={<ScreenShareOff className="h-4 w-4" aria-hidden="true" />}
          onPress={() => void host.toggleScreenShare()}
          testId="call-screenshare-toggle"
        />
        <Button
          type="button"
          variant="danger"
          size="sm"
          aria-label="Colgar"
          onClick={() => host.hangup()}
          className="ml-auto"
          data-testid="call-hangup-button"
        >
          <PhoneOff className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </Surface>
  );
}

export type { CallSessionHost };
