"use client";

/**
 * Estado del chat de equipo contra el servidor: canales, mensajes del canal
 * abierto y el flujo `@Sse` en vivo.
 *
 * ## Por qué SSE y no sondeo
 *
 * A diferencia de `use-cad-comments.ts` (que sondea porque «no hay canal en
 * vivo en la API — comprobado»), la mensajería SÍ tiene uno:
 * `GET /v1/messaging/events` es Server-Sent Events, servido por el mismo
 * origen con la misma cookie de sesión. `designClient.messaging.events()`
 * abre el `EventSource`; este hook sólo lo escucha y lo cierra al desmontar.
 *
 * ## Por qué el mensaje propio no espera al SSE
 *
 * `send` añade el mensaje devuelto por el `POST` en cuanto responde — el
 * autor no debe ver su propio mensaje aparecer con el retraso de un viaje de
 * ida y vuelta por el bus de eventos. El eco que llega después por SSE (todo
 * mensaje se publica para TODOS los que ven el canal, incluido quien lo
 * mandó) se descarta por id: `applyIncomingMessage`/`upsertMessage` son
 * idempotentes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MessagingChannel,
  MessagingChannelCreate,
  MessagingMessage,
} from "@valle/design-sdk";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";
import {
  applyIncomingMessage,
  applyMarkRead,
  sortChannelsByActivity,
  type TeamChannelSummary,
} from "@/lib/cad/messaging/channel-state";

const EMPTY_CHANNELS: TeamChannelSummary[] = [];
const EMPTY_MESSAGES: MessagingMessage[] = [];

export interface UseTeamMessagingOptions {
  /** Sin sesión resuelta no hay con quién comparar autoría propia. */
  viewerUserId: string | null;
  /** `cad:view` — sin él, el hook no hace ninguna llamada. */
  canRead: boolean;
  /** `cad:edit` — sin él, `send`/`createChannel` rechazan sin llamar a la API. */
  canWrite: boolean;
}

export interface UseTeamMessagingState {
  channels: TeamChannelSummary[];
  channelsLoading: boolean;
  selectedChannelId: string | null;
  selectChannel: (channelId: string | null) => void;
  messages: MessagingMessage[];
  messagesLoading: boolean;
  hasMoreOlder: boolean;
  loadOlderMessages: () => void;
  send: (
    body: string,
    options?: { parentMessageId?: string | null; anchor?: Record<string, unknown> | null },
  ) => Promise<boolean>;
  createProjectChannel: (projectId: string, name: string) => Promise<MessagingChannel | null>;
  createDirectChannel: (memberUserId: string) => Promise<MessagingChannel | null>;
  connected: boolean;
  error: string | null;
  busy: boolean;
}

export function useTeamMessaging(
  options: UseTeamMessagingOptions,
): UseTeamMessagingState {
  const { viewerUserId, canRead, canWrite } = options;
  const [channels, setChannels] = useState<TeamChannelSummary[]>(EMPTY_CHANNELS);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessagingMessage[]>(EMPTY_MESSAGES);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // El canal seleccionado vive también en una ref: el listener de SSE se crea
  // UNA vez (no en cada cambio de selección) y lee el valor vigente al
  // llegar cada evento, igual que `sourceRef` en `use-cad-comments.ts`.
  const selectedRef = useRef(selectedChannelId);
  useEffect(() => {
    selectedRef.current = selectedChannelId;
  }, [selectedChannelId]);

  // Sin setState SÍNCRONO antes del primer `await` (mismo motivo que
  // `fetchThreads`/`apply` en `use-cad-comments.ts`): `channelsLoading`
  // arranca en `true` por estado inicial y sólo se apaga cuando la
  // respuesta — de éxito o de error — ya llegó.
  const fetchChannels = useCallback(async (): Promise<TeamChannelSummary[] | null> => {
    if (!canRead) return null;
    try {
      const page = await designClient.messaging.channels.list();
      return sortChannelsByActivity(page.items);
    } catch (cause) {
      setError(messageOf(cause, "No pudimos listar los canales."));
      return null;
    }
  }, [canRead]);

  const refreshChannels = useCallback(async () => {
    const fetched = await fetchChannels();
    if (fetched) {
      setChannels(fetched);
      setError(null);
    }
    setChannelsLoading(false);
  }, [fetchChannels]);

  useEffect(() => {
    void refreshChannels();
  }, [refreshChannels]);

  /* ── Mensajes del canal seleccionado ───────────────────────────────────── */

  const loadMessages = useCallback(
    async (channelId: string, cursor?: string) => {
      setMessagesLoading(true);
      try {
        const page = await designClient.messaging.messages.list(channelId, {
          cursor,
          limit: 50,
        });
        setMessages((current) =>
          cursor ? [...page.items, ...current] : page.items,
        );
        setNextCursor(page.nextCursor);
        setError(null);
      } catch (cause) {
        setError(messageOf(cause, "No pudimos leer los mensajes de este canal."));
      } finally {
        setMessagesLoading(false);
      }
    },
    [],
  );

  const selectChannel = useCallback(
    (channelId: string | null) => {
      setSelectedChannelId(channelId);
      setMessages(EMPTY_MESSAGES);
      setNextCursor(null);
      if (!channelId) return;
      void loadMessages(channelId);
      void designClient.messaging.messages.markRead(channelId).catch(() => {
        // Marcar leído es una cortesía de UI, no una operación crítica: si
        // falla, el contador vuelve a subir en el próximo refresh de todas
        // formas y no vale la pena interrumpir al usuario por esto.
      });
      setChannels((current) => applyMarkRead(current, channelId));
    },
    [loadMessages],
  );

  const loadOlderMessages = useCallback(() => {
    if (!selectedChannelId || !nextCursor || messagesLoading) return;
    void loadMessages(selectedChannelId, nextCursor);
  }, [loadMessages, messagesLoading, nextCursor, selectedChannelId]);

  /* ── Flujo en vivo ──────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!canRead) return;
    const source = designClient.messaging.events();
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      let incoming: MessagingMessage;
      try {
        incoming = JSON.parse(event.data) as MessagingMessage;
      } catch {
        return; // Un frame que no es JSON válido se ignora, no tumba el chat.
      }
      setChannels((current) =>
        applyIncomingMessage(
          current,
          incoming.channelId,
          incoming,
          viewerUserId ?? "",
        ),
      );
      if (incoming.channelId === selectedRef.current) {
        setMessages((current) => upsertMessage(current, incoming));
      }
    };
    return () => {
      source.close();
      setConnected(false);
    };
  }, [canRead, viewerUserId]);

  /* ── Acciones ───────────────────────────────────────────────────────────── */

  const send = useCallback(
    async (
      body: string,
      sendOptions: { parentMessageId?: string | null; anchor?: Record<string, unknown> | null } = {},
    ) => {
      const text = body.trim();
      if (!canWrite || !selectedChannelId || !text) return false;
      setBusy(true);
      try {
        const saved = await designClient.messaging.messages.send(
          selectedChannelId,
          {
            body: text,
            parentMessageId: sendOptions.parentMessageId ?? undefined,
            // El contrato declara `anchor` como JSON LIBRE y openapi-typescript
            // lo tipa `Record<string, never>` (mismo límite conocido que
            // `CadComment.anchor`, ver `lib/cad/repositories/reviews.ts`) — la
            // forma real la impone `comment-anchor.ts` al escribir y al leer.
            anchor: (sendOptions.anchor ?? null) as unknown as Record<string, never> | null,
          },
        );
        setMessages((current) => upsertMessage(current, saved));
        setChannels((current) =>
          applyMarkRead(
            applyIncomingMessage(current, selectedChannelId, saved, viewerUserId ?? ""),
            selectedChannelId,
          ),
        );
        setError(null);
        return true;
      } catch (cause) {
        setError(messageOf(cause, "No pudimos enviar el mensaje."));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [canWrite, selectedChannelId, viewerUserId],
  );

  const createChannel = useCallback(
    async (input: MessagingChannelCreate) => {
      if (!canWrite) return null;
      setBusy(true);
      try {
        const channel = await designClient.messaging.channels.create(input);
        await refreshChannels();
        setError(null);
        return channel;
      } catch (cause) {
        setError(messageOf(cause, "No pudimos crear el canal."));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [canWrite, refreshChannels],
  );

  const createProjectChannel = useCallback(
    (projectId: string, name: string) =>
      createChannel({ kind: "project", projectId, name }),
    [createChannel],
  );
  const createDirectChannel = useCallback(
    (memberUserId: string) => createChannel({ kind: "direct", memberUserId }),
    [createChannel],
  );

  return {
    channels,
    channelsLoading,
    selectedChannelId,
    selectChannel,
    messages,
    messagesLoading,
    hasMoreOlder: nextCursor !== null,
    loadOlderMessages,
    send,
    createProjectChannel,
    createDirectChannel,
    connected,
    error,
    busy,
  };
}

/** Añade o reemplaza por id, sin duplicar el eco de un mensaje ya aplicado. */
function upsertMessage(
  current: readonly MessagingMessage[],
  incoming: MessagingMessage,
): MessagingMessage[] {
  if (current.some((message) => message.id === incoming.id)) return [...current];
  return [...current, incoming];
}

function messageOf(cause: unknown, fallback: string): string {
  if (cause instanceof DesignApiError) return cause.message || fallback;
  if (cause && typeof cause === "object" && "message" in cause) {
    const message = (cause as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
