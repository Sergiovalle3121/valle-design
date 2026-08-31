"use client";

/**
 * EL ANFITRIÓN DE LA LLAMADA — fuera de React, montable con una línea:
 * `const host = createCallSessionHost({ documentId })`. Ata las piezas
 * puras de `lib/cad/calls/` (la máquina de estados, la política ICE, la
 * política de pistas, el transporte de señalización) con lo que SÍ necesita
 * navegador: `RTCPeerConnection`, `getUserMedia`, `getDisplayMedia`.
 *
 * ## El patrón de negociación
 *
 * Malla completa: cada participante mantiene una `RTCPeerConnection` por
 * cada otro (tope de cuatro, ver `call-room-store.ts` en la API — es el
 * mismo número en los dos lados). Con más de dos pares negociando a la vez,
 * dos ofertas pueden cruzarse (glare); esto implementa "perfect negotiation"
 * (el patrón que documenta MDN): cada par decide de forma determinista quién
 * es "cortés" comparando los dos `participantId` — el mismo criterio en
 * ambos extremos da resultados opuestos y consistentes sin coordinarse.
 * Quien es cortés cede su propia oferta (rollback) ante una oferta entrante
 * en colisión; quien no, la ignora.
 *
 * ## Qué pasa cuando el par se cae
 *
 * `oniceconnectionstatechange` alimenta `call-ice-policy.ts`. Un barrido
 * cada segundo revisa a TODOS los pares — hace falta porque "llevo 4s en
 * disconnected" no es un evento nativo del navegador, es tiempo transcurrido,
 * y sólo un reloj que se consulta puede notarlo.
 */
import {
  reduceCallState,
  INACTIVE_CALL_STATE,
  type ActiveCallState,
  type CallEvent,
  type CallHangupReason,
  type CallIceServerConfig,
  type CallRosterEntry,
  type CallState,
} from "@/lib/cad/calls/call-state";
import {
  applyIceStateChange,
  decideIceAction,
  iceGiveUpReason,
  initialPeerIceState,
  type IceConnectionState,
  type PeerIceState,
} from "@/lib/cad/calls/call-ice-policy";
import {
  CLOSED_TRACK_SLOTS,
  desiredVideoSource,
  planAudioChange,
  planVideoChange,
  slotsAfterPlan,
  type CallTrackPlan,
  type CallTrackSlots,
  type CallTrackToggles,
  type CallVideoSource,
} from "@/lib/cad/calls/call-track-policy";
import {
  createCallSignalingClient,
  type CallSignalingClient,
} from "@/lib/cad/calls/call-signaling-transport";
import type {
  CallWireEvent,
  CallWireSignal,
} from "@/lib/cad/calls/call-signaling-wire";

/** Barrido de política ICE: cada cuánto se revisa "¿pasó ya el margen de
 * gracia?" para pares que no dispararon un evento nuevo del navegador. */
const ICE_SWEEP_INTERVAL_MS = 1_000;

export interface CallSessionSnapshot {
  state: CallState;
  toggles: CallTrackToggles;
  /** Mensaje legible del último fallo de cámara/mic/pantalla, o null. */
  mediaError: string | null;
}

const CLOSED_TOGGLES: CallTrackToggles = {
  cameraEnabled: false,
  micEnabled: false,
  screenShareEnabled: false,
};

interface PeerRuntime {
  connection: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  iceState: PeerIceState;
  remoteStream: MediaStream;
  videoSender: RTCRtpSender | null;
  audioSender: RTCRtpSender | null;
  videoSource: CallVideoSource;
  audioEnabled: boolean;
  slots: CallTrackSlots;
}

export interface CallSessionHostOptions {
  documentId: string;
  displayName?: string;
  signaling?: CallSignalingClient;
  peerConnectionFactory?: (config: RTCConfiguration) => RTCPeerConnection;
  now?: () => number;
}

export interface CallSessionHost {
  getSnapshot(): CallSessionSnapshot;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  hangup(): void;
  reset(): void;
  toggleCamera(): Promise<void>;
  toggleMic(): Promise<void>;
  toggleScreenShare(): Promise<void>;
  getLocalStream(): MediaStream | null;
  getRemoteStream(participantId: string): MediaStream | null;
  dispose(): void;
}

function toRosterEntry(p: { id: string; userId: string; name: string }): CallRosterEntry {
  return { participantId: p.id, userId: p.userId, name: p.name };
}

function joinErrorReason(error: unknown): CallHangupReason {
  const status = (error as { status?: number } | null)?.status;
  if (status === 404) return "access-denied";
  if (status === 409) return "room-full";
  if (status === 403) return "access-denied";
  return "signaling-lost";
}

export function createCallSessionHost(
  options: CallSessionHostOptions,
): CallSessionHost {
  const signaling = options.signaling ?? createCallSignalingClient();
  const now = options.now ?? (() => Date.now());
  const peerConnectionFactory =
    options.peerConnectionFactory ??
    ((config: RTCConfiguration) => new RTCPeerConnection(config));

  const listeners = new Set<() => void>();
  let snapshot: CallSessionSnapshot = {
    state: INACTIVE_CALL_STATE,
    toggles: CLOSED_TOGGLES,
    mediaError: null,
  };
  const peers = new Map<string, PeerRuntime>();
  let closeSignaling: (() => void) | null = null;
  let iceServers: CallIceServerConfig[] = [];
  let turnConfigured = false;

  let cameraTrack: MediaStreamTrack | null = null;
  let micTrack: MediaStreamTrack | null = null;
  let screenTrack: MediaStreamTrack | null = null;
  const localStream = new MediaStream();

  function notify() {
    for (const listener of listeners) listener();
  }

  function setSnapshot(patch: Partial<CallSessionSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    notify();
  }

  function dispatch(event: CallEvent) {
    setSnapshot({ state: reduceCallState(snapshot.state, event) });
  }

  function activeState(): ActiveCallState | null {
    const s = snapshot.state;
    return s.phase === "inactiva" || s.phase === "colgada" ? null : s;
  }

  // ── Peers ──────────────────────────────────────────────────────────────

  function ensurePeer(participantId: string): PeerRuntime {
    const existing = peers.get(participantId);
    if (existing) return existing;
    const active = activeState();
    const selfId = active?.participantId ?? "";
    const polite = selfId < participantId;
    const connection = peerConnectionFactory({ iceServers });
    const runtime: PeerRuntime = {
      connection,
      polite,
      makingOffer: false,
      ignoreOffer: false,
      iceState: initialPeerIceState(now()),
      remoteStream: new MediaStream(),
      videoSender: null,
      audioSender: null,
      videoSource: "none",
      audioEnabled: false,
      slots: CLOSED_TRACK_SLOTS,
    };
    peers.set(participantId, runtime);

    connection.onnegotiationneeded = async () => {
      const active2 = activeState();
      if (!active2) return;
      try {
        runtime.makingOffer = true;
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await signaling.sendSignal(
          active2.roomId,
          active2.participantId,
          participantId,
          "offer",
          offer as unknown as Record<string, unknown>,
        );
      } finally {
        runtime.makingOffer = false;
      }
    };
    connection.onicecandidate = ({ candidate }) => {
      const active2 = activeState();
      if (!active2 || !candidate) return;
      void signaling.sendSignal(
        active2.roomId,
        active2.participantId,
        participantId,
        "ice-candidate",
        candidate.toJSON() as unknown as Record<string, unknown>,
      );
    };
    connection.ontrack = (event) => {
      for (const track of event.streams[0]?.getTracks() ?? [event.track]) {
        runtime.remoteStream.addTrack(track);
      }
      notify();
    };
    connection.oniceconnectionstatechange = () => {
      const rtcState = connection.iceConnectionState as IceConnectionState;
      runtime.iceState = applyIceStateChange(runtime.iceState, rtcState, now());
      if (rtcState === "connected" || rtcState === "completed") {
        dispatch({ type: "peer-connected", participantId });
      } else if (rtcState === "disconnected") {
        dispatch({ type: "peer-reconnecting", participantId });
      }
      evaluateIcePolicy(participantId);
    };

    // Sin esto, una llamada que arranca con cámara y micrófono apagados
    // NUNCA negocia: `onnegotiationneeded` sólo dispara cuando se abre una
    // transceiver, y si nadie prendió nada todavía no hay ninguna que abrir.
    // Las dos partes se quedarían viéndose en el roster (la señalización SÍ
    // funciona) sin que ninguna mande jamás una oferta — "conectando" para
    // siempre, sin ser un fallo de ICE. Un canal de datos vacío, que no se
    // usa para nada, fuerza la primera negociación siempre.
    connection.createDataChannel("valle-calls-bootstrap");

    dispatch({ type: "peer-negotiating", participantId });
    applyTrackPolicyToPeer(participantId);
    return runtime;
  }

  function evaluateIcePolicy(participantId: string) {
    const runtime = peers.get(participantId);
    if (!runtime || runtime.connection.connectionState === "closed") return;
    const decision = decideIceAction(runtime.iceState, turnConfigured, now());
    if (decision === "restart-ice") {
      runtime.iceState = applyIceStateChange(
        runtime.iceState,
        runtime.iceState.rtcState,
        now(),
        true,
      );
      runtime.connection.restartIce();
    } else if (decision === "give-up") {
      dispatch({ type: "peer-failed", participantId });
      runtime.connection.close();
      // Si TODOS los enlaces se rindieron, la llamada no se queda flotando
      // en "conectando" para siempre: cuelga y DICE por qué — sin TURN, es
      // la falta de relevo; con TURN, es otra cosa y hay que decirlo igual.
      const active = activeState();
      if (
        active &&
        Object.values(active.peers).every((peer) => peer.status === "failed")
      ) {
        endCall(iceGiveUpReason(turnConfigured));
      }
    }
  }

  function reconcilePeers(roster: CallRosterEntry[]) {
    const active = activeState();
    if (!active) return;
    const wanted = new Set(
      roster
        .map((r) => r.participantId)
        .filter((id) => id !== active.participantId),
    );
    for (const id of wanted) ensurePeer(id);
    for (const [id, runtime] of [...peers]) {
      if (!wanted.has(id)) {
        runtime.connection.close();
        peers.delete(id);
      }
    }
  }

  async function handleIncomingSignal(signal: CallWireSignal) {
    const active = activeState();
    if (!active) return;
    const participantId = signal.fromParticipantId;
    const runtime = ensurePeer(participantId);
    const pc = runtime.connection;
    if (signal.kind === "offer") {
      const offerCollision =
        runtime.makingOffer || pc.signalingState !== "stable";
      runtime.ignoreOffer = !runtime.polite && offerCollision;
      if (runtime.ignoreOffer) return;
      const description = signal.payload as unknown as RTCSessionDescriptionInit;
      if (offerCollision) {
        await Promise.all([
          pc.setLocalDescription({ type: "rollback" }),
          pc.setRemoteDescription(description),
        ]);
      } else {
        await pc.setRemoteDescription(description);
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await signaling.sendSignal(
        active.roomId,
        active.participantId,
        participantId,
        "answer",
        answer as unknown as Record<string, unknown>,
      );
    } else if (signal.kind === "answer") {
      await pc.setRemoteDescription(
        signal.payload as unknown as RTCSessionDescriptionInit,
      );
    } else if (signal.kind === "ice-candidate") {
      try {
        await pc.addIceCandidate(
          signal.payload as unknown as RTCIceCandidateInit,
        );
      } catch (error) {
        if (!runtime.ignoreOffer) throw error;
      }
    } else if (signal.kind === "bye") {
      pc.close();
      peers.delete(participantId);
    }
  }

  // ── Pistas locales ────────────────────────────────────────────────────

  function trackFor(source: CallVideoSource): MediaStreamTrack | null {
    if (source === "camera") return cameraTrack;
    if (source === "screen") return screenTrack;
    return null;
  }

  function applyTrackPolicyToPeer(participantId: string) {
    const runtime = peers.get(participantId);
    if (!runtime) return;
    const source = desiredVideoSource(snapshot.toggles);
    const videoPlan = planVideoChange(runtime.videoSource, source, runtime.slots);
    executePlan(runtime, videoPlan, source);
    runtime.videoSource = source;
    runtime.slots = slotsAfterPlan(runtime.slots, videoPlan);

    const audioPlan = planAudioChange(
      runtime.audioEnabled,
      snapshot.toggles.micEnabled,
      runtime.slots,
    );
    executePlan(runtime, audioPlan, source);
    runtime.audioEnabled = snapshot.toggles.micEnabled;
    runtime.slots = slotsAfterPlan(runtime.slots, audioPlan);
  }

  function executePlan(
    runtime: PeerRuntime,
    plan: CallTrackPlan,
    videoSource: CallVideoSource,
  ) {
    if (plan.action === "open-video-transceiver") {
      const track = trackFor(plan.source);
      if (track) {
        runtime.videoSender = runtime.connection.addTrack(track, localStream);
      }
    } else if (plan.action === "replace-video-track") {
      void runtime.videoSender?.replaceTrack(trackFor(videoSource));
    } else if (plan.action === "open-audio-transceiver") {
      if (micTrack) {
        runtime.audioSender = runtime.connection.addTrack(micTrack, localStream);
      }
    }
    // 'set-audio-enabled' no hace nada aquí: silenciar es GLOBAL
    // (`micTrack.enabled`), ver `toggleMic` — la misma pista se comparte
    // entre todos los `RTCRtpSender` de todos los pares.
  }

  function applyTrackPolicyToAllPeers() {
    for (const participantId of peers.keys()) applyTrackPolicyToPeer(participantId);
  }

  async function ensureCameraTrack(): Promise<boolean> {
    if (cameraTrack) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const [track] = stream.getVideoTracks();
      if (!track) return false;
      cameraTrack = track;
      localStream.addTrack(track);
      setSnapshot({ mediaError: null });
      return true;
    } catch {
      setSnapshot({
        mediaError: "No se pudo abrir la cámara. Revisa los permisos del navegador.",
      });
      return false;
    }
  }

  async function ensureMicTrack(): Promise<boolean> {
    if (micTrack) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const [track] = stream.getAudioTracks();
      if (!track) return false;
      micTrack = track;
      localStream.addTrack(track);
      setSnapshot({ mediaError: null });
      return true;
    } catch {
      setSnapshot({
        mediaError: "No se pudo abrir el micrófono. Revisa los permisos del navegador.",
      });
      return false;
    }
  }

  async function ensureScreenTrack(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const [track] = stream.getVideoTracks();
      if (!track) return false;
      screenTrack = track;
      track.onended = () => {
        // El navegador tiene su PROPIO botón "dejar de compartir": si el
        // arquitecto lo usa ahí en vez de en la barra, el conmutador de la
        // barra tiene que enterarse igual.
        screenTrack = null;
        setSnapshot({ toggles: { ...snapshot.toggles, screenShareEnabled: false } });
        applyTrackPolicyToAllPeers();
      };
      setSnapshot({ mediaError: null });
      return true;
    } catch {
      // El usuario cerró el selector del SO sin elegir nada: no es un error
      // que valga la pena anunciar, es exactamente lo que "cancelar" hace.
      return false;
    }
  }

  // ── ICE, barrido periódico ────────────────────────────────────────────

  const iceSweepTimer =
    typeof window === "undefined"
      ? null
      : setInterval(() => {
          for (const participantId of peers.keys()) evaluateIcePolicy(participantId);
        }, ICE_SWEEP_INTERVAL_MS);

  function onWireEvent(event: CallWireEvent) {
    if (event.type === "roster") {
      const roster = event.participants.map(toRosterEntry);
      dispatch({ type: "roster-updated", roster });
      reconcilePeers(roster);
    } else if (event.type === "signal") {
      void handleIncomingSignal(event.signal);
    }
    // 'ping': sólo mantiene viva la conexión, no hay nada que hacer.
  }

  function onSignalingError() {
    if (activeState()) endCall("signaling-lost");
  }

  // ── Ciclo de vida público ────────────────────────────────────────────

  async function start(): Promise<void> {
    if (snapshot.state.phase !== "inactiva") return;
    try {
      const joined = await signaling.join(options.documentId, options.displayName);
      iceServers = joined.iceServers;
      turnConfigured = joined.turnConfigured;
      const self = joined.participants.find((p) => p.id === joined.participantId);
      dispatch({
        type: "joined",
        roomId: joined.roomId,
        participantId: joined.participantId,
        self: self
          ? toRosterEntry(self)
          : { participantId: joined.participantId, userId: "", name: "" },
        roster: joined.participants.map(toRosterEntry),
        iceServers: joined.iceServers,
        turnConfigured: joined.turnConfigured,
      });
      closeSignaling = signaling.connect(
        joined.roomId,
        joined.participantId,
        onWireEvent,
        onSignalingError,
      );
      reconcilePeers(joined.participants.map(toRosterEntry));
    } catch (error) {
      dispatch({ type: "hangup", reason: joinErrorReason(error) });
    }
  }

  function teardownPeers() {
    for (const runtime of peers.values()) runtime.connection.close();
    peers.clear();
  }

  function teardownMedia() {
    cameraTrack?.stop();
    micTrack?.stop();
    screenTrack?.stop();
    cameraTrack = null;
    micTrack = null;
    screenTrack = null;
    setSnapshot({ toggles: CLOSED_TOGGLES });
  }

  function endCall(reason: CallHangupReason): void {
    const active = activeState();
    closeSignaling?.();
    closeSignaling = null;
    teardownPeers();
    if (active) {
      void signaling.leave(active.roomId, active.participantId).catch(() => undefined);
    }
    teardownMedia();
    if (active) dispatch({ type: "hangup", reason });
  }

  function hangup(): void {
    endCall("local");
  }

  function reset(): void {
    dispatch({ type: "reset" });
  }

  async function toggleCamera(): Promise<void> {
    if (!snapshot.toggles.cameraEnabled) {
      const ok = await ensureCameraTrack();
      if (!ok) return;
    }
    setSnapshot({
      toggles: { ...snapshot.toggles, cameraEnabled: !snapshot.toggles.cameraEnabled },
    });
    applyTrackPolicyToAllPeers();
  }

  async function toggleMic(): Promise<void> {
    if (!snapshot.toggles.micEnabled) {
      const ok = await ensureMicTrack();
      if (!ok) return;
    }
    if (micTrack) micTrack.enabled = !snapshot.toggles.micEnabled;
    setSnapshot({
      toggles: { ...snapshot.toggles, micEnabled: !snapshot.toggles.micEnabled },
    });
    applyTrackPolicyToAllPeers();
  }

  async function toggleScreenShare(): Promise<void> {
    if (snapshot.toggles.screenShareEnabled) {
      screenTrack?.stop();
      screenTrack = null;
    } else {
      const ok = await ensureScreenTrack();
      if (!ok) return;
    }
    setSnapshot({
      toggles: {
        ...snapshot.toggles,
        screenShareEnabled: !snapshot.toggles.screenShareEnabled,
      },
    });
    applyTrackPolicyToAllPeers();
  }

  function dispose(): void {
    if (iceSweepTimer) clearInterval(iceSweepTimer);
    if (activeState()) hangup();
    listeners.clear();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    hangup,
    reset,
    toggleCamera,
    toggleMic,
    toggleScreenShare,
    getLocalStream: () => (localStream.getTracks().length > 0 ? localStream : null),
    getRemoteStream: (participantId) => peers.get(participantId)?.remoteStream ?? null,
    dispose,
  };
}
