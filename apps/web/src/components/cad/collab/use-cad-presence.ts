"use client";

/**
 * Presencia viva: quién más tiene este plano delante y dónde apunta.
 *
 * ## Qué hace este hook y qué NO
 *
 * Late, escucha, caduca y devuelve la lista. DOS transportes a la vez, no
 * uno: `presence-channel.ts` (BroadcastChannel, entre pestañas del mismo
 * navegador, latencia de proceso) y `server-presence-channel.ts` (SSE, entre
 * máquinas distintas, latencia de red) — ambos alimentan el MISMO mapa de
 * peers por `peerId`, así que la insignia ya cuenta personas de verdad y no
 * sólo pestañas propias. El segundo se omite para invitados de review link
 * (`guest: true`): `EventSource` no puede mandar `X-Review-Token`, así que
 * esa presencia sigue sin fanout entre máquinas — "todavía no", declarado, no
 * disimulado tras un `connected: true` que no sería cierto.
 *
 * ## El ritmo
 *
 * Dos relojes, y ninguno es el del ratón:
 *
 *  · Un latido cada `CAD_PRESENCE_BEAT_MS` diga lo que diga el cursor, para
 *    que quien mira sin mover el ratón siga existiendo.
 *  · Un envío cada `SEND_INTERVAL_MS` SÓLO si el cursor o el encuadre
 *    cambiaron. Emitir en cada `pointermove` serían mil mensajes por segundo
 *    con un ratón gaming, y cada uno despierta a todas las pestañas.
 *
 * La poda corre en su propio temporizador porque un compañero que se va no
 * manda nada: si sólo se podara al recibir, el último en irse se quedaría
 * eternamente en la lista.
 *
 * ## Por qué la lista lleva el documento pegado
 *
 * El estado guarda `{documentId, peers}` y la lista se DERIVA comparando ese
 * id con el actual. Vaciarla al cambiar de documento habría necesitado un
 * `setState` en el efecto, y —peor— habría dejado un fotograma con los
 * cursores del plano anterior encima del plano nuevo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CadPoint2 } from "@/lib/cad/cad-document";
import type { CadBounds } from "@/lib/cad/entity-runtime";
import {
  CAD_PRESENCE_BEAT_MS,
  applyCadPresenceBeat,
  cadPresenceRoster,
  pruneCadPresence,
  type CadPresenceBeat,
  type CadPresencePeer,
} from "@/lib/cad/collab/presence";
import {
  cadPresenceChannelAvailable,
  openCadPresenceTransport,
  type CadPresenceTransport,
} from "@/lib/cad/collab/presence-channel";
import { serverPresenceChannel } from "@/lib/cad/collab/server-presence-channel";

/** Ritmo máximo de emisión del cursor. 8 Hz basta para que se vea fluido. */
const SEND_INTERVAL_MS = 125;
const PRUNE_INTERVAL_MS = 2_000;
const EMPTY: CadPresencePeer[] = [];

interface TrackedPeers {
  documentId: string | null;
  peers: ReadonlyMap<string, CadPresencePeer>;
}

export interface CadPresenceState {
  peers: CadPresencePeer[];
  /** Identidad de ESTA pestaña. */
  selfId: string;
  /** false ⇒ no hay transporte: no se puede afirmar que no haya nadie más. */
  connected: boolean;
  /** Alimenta el latido. Barata: sólo guarda en refs. */
  report: (cursor: CadPoint2 | null, viewport: CadBounds | null) => void;
}

export function useCadPresence(options: {
  documentId: string | null;
  name: string;
  guest: boolean;
  enabled?: boolean;
}): CadPresenceState {
  const { documentId, name, guest, enabled = true } = options;
  const [tracked, setTracked] = useState<TrackedPeers>(() => ({
    documentId: null,
    peers: new Map(),
  }));
  const selfId = useMemo(() => newPeerId(), []);
  // La sonda del canal está cacheada en su módulo, así que leerla una vez al
  // montar no cuesta nada y no cambia durante la sesión.
  const [channelAvailable] = useState(() => cadPresenceChannelAvailable());
  // `EventSource` existe en todo navegador real (no en SSR): no hace falta
  // sondearlo abriendo uno, a diferencia de BroadcastChannel más arriba.
  const [serverChannelAvailable] = useState(
    () => typeof EventSource !== "undefined",
  );
  const cursor = useRef<CadPoint2 | null>(null);
  const viewport = useRef<CadBounds | null>(null);
  const dirty = useRef(true);
  const nameRef = useRef(name);
  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  const report = useCallback(
    (nextCursor: CadPoint2 | null, nextViewport: CadBounds | null) => {
      if (!samePoint(cursor.current, nextCursor)) {
        cursor.current = nextCursor;
        dirty.current = true;
      }
      if (!sameBounds(viewport.current, nextViewport)) {
        viewport.current = nextViewport;
        dirty.current = true;
      }
    },
    [],
  );

  useEffect(() => {
    if (!documentId || !enabled) return;
    const onBeat = (beat: CadPresenceBeat) => {
      setTracked((previous) => {
        // Al cambiar de documento se parte de cero: un compañero del plano
        // anterior no puede heredar sitio en la lista del nuevo.
        const base =
          previous.documentId === documentId ? previous.peers : new Map();
        const applied = applyCadPresenceBeat(base, beat, documentId, Date.now());
        // Un latido rechazado (otro documento, coordenadas no finitas, orden
        // invertido) deja la lista EXACTAMENTE como estaba. No hay estado
        // intermedio "medio aplicado". Aplica igual venga de la pestaña de al
        // lado o de otra máquina — el peerId ya llega desduplicado por
        // transporte (cada uno emite el suyo una vez).
        return applied.status === "applied"
          ? { documentId, peers: applied.peers }
          : previous;
      });
    };
    const transport = openCadPresenceTransport({ documentId, selfPeerId: selfId, onBeat });
    // Invitado de review link ⇒ sin segundo transporte (ver cabecera): sólo
    // se abre para sesión first-party, y sólo si el navegador tiene EventSource.
    const serverTransport: CadPresenceTransport | null = guest
      ? null
      : openCadPresenceTransport({
          documentId,
          selfPeerId: selfId,
          onBeat,
          factory: serverPresenceChannel,
        });

    const emit = () => {
      const beat = {
        peerId: selfId,
        documentId,
        name: nameRef.current,
        at: Date.now(),
        cursor: cursor.current,
        viewport: viewport.current,
        guest,
      };
      transport.send(beat);
      serverTransport?.send(beat);
      dirty.current = false;
    };
    emit();
    const sender = setInterval(() => {
      if (dirty.current) emit();
    }, SEND_INTERVAL_MS);
    const heartbeat = setInterval(emit, CAD_PRESENCE_BEAT_MS);
    const pruner = setInterval(() => {
      setTracked((previous) => {
        const pruned = pruneCadPresence(previous.peers, Date.now());
        return pruned === previous.peers ? previous : { ...previous, peers: pruned };
      });
    }, PRUNE_INTERVAL_MS);

    return () => {
      clearInterval(sender);
      clearInterval(heartbeat);
      clearInterval(pruner);
      transport.close();
      serverTransport?.close();
    };
  }, [documentId, enabled, guest, selfId]);

  const peers = useMemo(
    () =>
      documentId && enabled && tracked.documentId === documentId
        ? cadPresenceRoster(tracked.peers)
        : EMPTY,
    [documentId, enabled, tracked],
  );

  return {
    peers,
    selfId,
    // Conectado si HAY algún transporte real: el de pestañas, o el de
    // servidor cuando aplica (no para invitados — ver cabecera). Con
    // cualquiera de los dos, "nadie en la lista" es una afirmación real.
    connected:
      (channelAvailable || (serverChannelAvailable && !guest)) &&
      enabled &&
      !!documentId,
    report,
  };
}

/**
 * Identidad de la PESTAÑA. `crypto.randomUUID` cuando existe; si no, un id
 * derivado del reloj y del azar, que para distinguir pestañas basta y no
 * pretende ser una credencial de nada.
 */
function newPeerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function samePoint(left: CadPoint2 | null, right: CadPoint2 | null): boolean {
  if (!left || !right) return left === right;
  // Medio píxel de dibujo no es un movimiento que nadie vea; redondear aquí
  // corta la mitad de los mensajes en un arrastre lento.
  return Math.abs(left.x - right.x) < 0.5 && Math.abs(left.y - right.y) < 0.5;
}

function sameBounds(left: CadBounds | null, right: CadBounds | null): boolean {
  if (!left || !right) return left === right;
  return (
    left.minX === right.minX &&
    left.minY === right.minY &&
    left.maxX === right.maxX &&
    left.maxY === right.maxY
  );
}
