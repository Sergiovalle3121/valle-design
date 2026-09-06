/**
 * LA REGLA de la presencia: cuándo se puede AFIRMAR que no hay nadie más.
 *
 * ## Por qué es una función aparte y no una línea en el hook
 *
 * `use-cad-presence.ts` abre dos transportes: `BroadcastChannel` (pestañas de
 * ESTE navegador) y el canal SSE del servidor (otras máquinas). Durante meses
 * `connected` se calculó como «hay alguno de los dos», y con eso el panel
 * decía «Nadie más en este documento ahora mismo» a un invitado del enlace de
 * revisión —que sólo tiene el primero— mientras el arquitecto miraba el mismo
 * plano desde otro portátil. `presence-channel.ts` ya lo advertía en su
 * cabecera: «no hay nadie más» y «no puedo saberlo» no son la misma frase.
 *
 * Aquí vive la única versión de esa regla, pura, con su spec al lado.
 *
 * ## La regla
 *
 * Se puede afirmar «no hay nadie más» SOLO si está abierto un transporte que
 * alcance OTRAS MÁQUINAS. Hoy ese transporte es el canal del servidor, y sólo
 * se abre para una sesión first-party: `EventSource` no puede mandar
 * `X-Review-Token`, así que el invitado no lo tiene (ver
 * `server-presence-channel.ts`). Por tanto:
 *
 *  · first-party con `EventSource`  → SÍ se puede afirmar.
 *  · first-party sin `EventSource`  → no: sólo ve sus propias pestañas.
 *  · invitado, tenga lo que tenga   → no: ningún transporte cruza máquinas.
 *
 * `channelAvailable` (BroadcastChannel) se recibe a propósito aunque no
 * decida nada: quien llama pasa todo lo que sabe y la regla —no el llamador—
 * es la que dice qué cuenta. Un peer que SÍ llegue por ese canal es
 * información real y se enseña; lo que ese canal no puede sostener es la
 * afirmación de ausencia.
 *
 * Cuando exista un transporte entre máquinas para el invitado, esta función
 * cambia y la frase honesta del panel desaparece sola.
 */

export interface CadPresenceAffirmationInput {
  /** Invitado del enlace de revisión: sin sesión first-party. */
  guest: boolean;
  /** `BroadcastChannel` construible: alcanza las pestañas de ESTE navegador. */
  channelAvailable: boolean;
  /** `EventSource` presente: el canal del servidor, si la sesión puede abrirlo. */
  serverChannelAvailable: boolean;
}

/**
 * true ⇒ una lista vacía significa «no hay nadie más».
 * false ⇒ una lista vacía significa «desde aquí no se puede saber».
 */
export function cadPresenceCanAffirmNobody(
  input: CadPresenceAffirmationInput,
): boolean {
  return !input.guest && input.serverChannelAvailable;
}
