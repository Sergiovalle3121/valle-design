/**
 * QUÉ HACER CUANDO EL PAR SE CAE — la aritmética que separa una demo de un
 * producto. `RTCPeerConnection.iceConnectionState` pasa por `disconnected`
 * constantemente por blips de red que se autorreparan solos en segundos;
 * tratar cada `disconnected` como una llamada muerta sería colgar en cada
 * micro-corte de wifi. Y un `failed` sin TURN configurado NO se arregla
 * reintentando: sin relevo, dos NAT que no se atraviesan directo van a
 * seguir sin atravesarse la décima vez igual que la primera — ahí la
 * decisión correcta es rendirse YA y decirlo, no fingir que "conectando"
 * sigue teniendo sentido.
 *
 * Puro: entra el estado ICE nativo del navegador más el reloj, sale una
 * decisión. Nada de aquí toca `RTCPeerConnection` — eso es trabajo del
 * orquestador en `components/cad/calls/`, que SÍ vive en el navegador.
 */

/** Un subconjunto de `RTCIceConnectionState`: los siete valores reales del
 * navegador, escritos aquí para que este archivo no dependa de `lib.dom`. */
export type IceConnectionState =
  | 'new'
  | 'checking'
  | 'connected'
  | 'completed'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface PeerIceState {
  rtcState: IceConnectionState;
  /** Reloj LOCAL de cuándo entró a `rtcState`. */
  since: number;
  /** Reinicios ICE ya intentados desde el último `connected`/`completed`. */
  restartAttempts: number;
}

export function initialPeerIceState(now: number): PeerIceState {
  return { rtcState: 'new', since: now, restartAttempts: 0 };
}

/** `disconnected` por debajo de este margen es ruido de red, no una caída. */
export const ICE_DISCONNECT_GRACE_MS = 4_000;
/** Reinicios ICE que vale la pena intentar antes de rendirse (con TURN). */
export const ICE_MAX_RESTARTS = 3;

/**
 * Aplica un cambio de `iceConnectionState` reportado por el navegador. Un
 * reinicio ICE exitoso vuelve a `connected`/`completed` y esto pone
 * `restartAttempts` en cero — el contador es "desde el último enlace sano",
 * no "en toda la vida de la llamada".
 */
export function applyIceStateChange(
  state: PeerIceState,
  rtcState: IceConnectionState,
  now: number,
  restarted = false,
): PeerIceState {
  if (state.rtcState === rtcState && !restarted) return state;
  const isHealthy = rtcState === 'connected' || rtcState === 'completed';
  return {
    rtcState,
    since: now,
    restartAttempts: isHealthy
      ? 0
      : restarted
        ? state.restartAttempts + 1
        : state.restartAttempts,
  };
}

export type IcePolicyDecision = 'wait' | 'restart-ice' | 'give-up';

/**
 * La decisión, dado el estado actual y si este despliegue tiene TURN.
 *
 * - `disconnected` espera el margen de gracia antes de mover un dedo: la
 *   mayoría se resuelve sola.
 * - `failed` sin TURN es rendirse de inmediato — no hay reintento que lo
 *   arregle sin un relevo.
 * - `failed` con TURN reintenta con reinicio ICE hasta el tope, y se rinde
 *   después: un problema que sobrevive a tres reinicios con relevo
 *   disponible ya no es de red, es de otra cosa.
 */
export function decideIceAction(
  state: PeerIceState,
  turnConfigured: boolean,
  now: number,
): IcePolicyDecision {
  if (state.rtcState === 'connected' || state.rtcState === 'completed') {
    return 'wait';
  }
  if (state.rtcState === 'disconnected') {
    return now - state.since >= ICE_DISCONNECT_GRACE_MS ? 'restart-ice' : 'wait';
  }
  if (state.rtcState === 'failed') {
    if (!turnConfigured) return 'give-up';
    return state.restartAttempts < ICE_MAX_RESTARTS ? 'restart-ice' : 'give-up';
  }
  // 'new' | 'checking' | 'closed': todavía no hay nada que decidir.
  return 'wait';
}

/** El motivo de colgada que le corresponde a un `give-up` de ICE. */
export function iceGiveUpReason(
  turnConfigured: boolean,
): 'ice-failed-no-turn' | 'ice-failed' {
  return turnConfigured ? 'ice-failed' : 'ice-failed-no-turn';
}
