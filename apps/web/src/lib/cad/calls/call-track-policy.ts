/**
 * QUÉ HACER CON CÁMARA, MICRÓFONO Y PANTALLA COMPARTIDA cuando el arquitecto
 * mueve un conmutador — decidido aquí, ejecutado por el orquestador (que sí
 * toca `RTCPeerConnection`, `getUserMedia`, `getDisplayMedia`).
 *
 * ## Un solo "carril" de video
 *
 * Cámara y pantalla compartida NUNCA van a la vez: "un arquitecto enseña el
 * plano, no su cara" es el pedido explícito, así que hay un único carril de
 * video por llamada, y pantalla compartida gana cuando ambos conmutadores
 * están prendidos. Un solo carril simplifica la UI (una miniatura de video,
 * no dos) y además es la razón por la que activar/apagar/cambiar de fuente
 * casi nunca renegocia.
 *
 * ## Por qué esto evita renegociar en cada clic
 *
 * WebRTC sólo dispara `negotiationneeded` al ABRIR una transceiver nueva. Una
 * vez abierta, cambiar qué track manda (`sender.replaceTrack`) o silenciarla
 * (`track.enabled = false`) NO renegocia — así que la primera vez que el
 * carril de video o el de audio se usa en la llamada sí dispara una ronda de
 * oferta/respuesta, y todo lo que pasa después de eso (cambiar de cámara a
 * pantalla, silenciar el micrófono) es instantáneo. `slots` es lo que
 * recuerda si ese primer open ya pasó.
 */

export interface CallTrackToggles {
  cameraEnabled: boolean;
  micEnabled: boolean;
  screenShareEnabled: boolean;
}

export type CallVideoSource = 'none' | 'camera' | 'screen';

/** Pantalla compartida gana: es la señal explícita "quiero enseñar el plano". */
export function desiredVideoSource(toggles: CallTrackToggles): CallVideoSource {
  if (toggles.screenShareEnabled) return 'screen';
  if (toggles.cameraEnabled) return 'camera';
  return 'none';
}

export interface CallTrackSlots {
  /** true si esta conexión ya abrió alguna vez una transceiver de video. */
  videoTransceiverOpen: boolean;
  /** true si esta conexión ya abrió alguna vez una transceiver de audio. */
  audioTransceiverOpen: boolean;
}

export const CLOSED_TRACK_SLOTS: CallTrackSlots = {
  videoTransceiverOpen: false,
  audioTransceiverOpen: false,
};

export type CallTrackPlan =
  | { action: 'noop' }
  | { action: 'open-video-transceiver'; source: 'camera' | 'screen' }
  | { action: 'replace-video-track'; source: CallVideoSource }
  | { action: 'open-audio-transceiver' }
  | { action: 'set-audio-enabled'; enabled: boolean };

/** ¿Este plan abre una transceiver por primera vez? Sólo esos renegocian. */
export function planNeedsNegotiation(plan: CallTrackPlan): boolean {
  return plan.action === 'open-video-transceiver' || plan.action === 'open-audio-transceiver';
}

export function planVideoChange(
  previous: CallVideoSource,
  next: CallVideoSource,
  slots: CallTrackSlots,
): CallTrackPlan {
  if (previous === next) return { action: 'noop' };
  if (!slots.videoTransceiverOpen) {
    if (next === 'none') return { action: 'noop' }; // nunca se abrió, y sigue sin haber nada que mandar
    return { action: 'open-video-transceiver', source: next };
  }
  return { action: 'replace-video-track', source: next };
}

export function planAudioChange(
  previousEnabled: boolean,
  nextEnabled: boolean,
  slots: CallTrackSlots,
): CallTrackPlan {
  if (previousEnabled === nextEnabled) return { action: 'noop' };
  if (!slots.audioTransceiverOpen) {
    if (!nextEnabled) return { action: 'noop' };
    return { action: 'open-audio-transceiver' };
  }
  return { action: 'set-audio-enabled', enabled: nextEnabled };
}

/** El slot que un plan, una vez EJECUTADO, deja abierto — para que quien
 * orquesta actualice `CallTrackSlots` sin tener que repetir esta lógica. */
export function slotsAfterPlan(
  slots: CallTrackSlots,
  plan: CallTrackPlan,
): CallTrackSlots {
  if (plan.action === 'open-video-transceiver') {
    return { ...slots, videoTransceiverOpen: true };
  }
  if (plan.action === 'open-audio-transceiver') {
    return { ...slots, audioTransceiverOpen: true };
  }
  return slots;
}
