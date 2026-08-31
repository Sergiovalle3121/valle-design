import type { components } from "./generated/design-api";

type Schemas = components["schemas"];

export type MessagingChannel = Schemas["MessagingChannel"];
export type MessagingChannelList = Schemas["MessagingChannelList"];
export type MessagingChannelCreate = Schemas["MessagingChannelCreate"];
export type MessagingMessage = Schemas["MessagingMessage"];
export type MessagingMessageCreate = Schemas["MessagingMessageCreate"];
export type MessagingMessagePage = Schemas["MessagingMessagePage"];
export type MessagingAuthor = Schemas["MessagingAuthor"];

/**
 * LA SUPERFICIE DE MENSAJERÍA DE EQUIPO, en su propio archivo por la misma
 * razón que `identity.ts`: `client.ts` vive pegado al techo de 800 líneas del
 * gate del monolito (`scripts/cad/check-monolith-budget.mjs`) y esta
 * superficie tiene forma propia — `channels`/`messages`/`events` — igual que
 * `sessions`/`mfa` en identidad. `call`/`resource` los da `client.ts`: el
 * transporte (CSRF, cookies, errores) sigue siendo UNO solo.
 *
 * `events` NO pasa por `call`: es un `EventSource` (Server-Sent Events), no
 * un `fetch` con cuerpo JSON — un transporte distinto necesita su propio
 * constructor. Reutiliza la MISMA cookie de sesión first-party (mismo
 * origen), así que no hace falta token aparte.
 */
export interface MessagingTransport {
  call<T>(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
  resource(apiPath: string): string;
}

export function createMessagingSurface({ call, resource }: MessagingTransport) {
  return {
    channels: {
      list: () =>
        call<MessagingChannelList>("GET", resource("/v1/messaging/channels")),
      create: (input: MessagingChannelCreate) =>
        call<MessagingChannel>(
          "POST",
          resource("/v1/messaging/channels"),
          input,
        ),
    },
    messages: {
      list: (
        channelId: string,
        query?: { cursor?: string; limit?: number },
      ) => {
        const url = new URL(
          resource(`/v1/messaging/channels/${channelId}/messages`),
        );
        if (query?.cursor) url.searchParams.set("cursor", query.cursor);
        if (query?.limit !== undefined)
          url.searchParams.set("limit", String(query.limit));
        return call<MessagingMessagePage>("GET", url.toString());
      },
      send: (channelId: string, input: MessagingMessageCreate) =>
        call<MessagingMessage>(
          "POST",
          resource(`/v1/messaging/channels/${channelId}/messages`),
          input,
        ),
      markRead: (channelId: string) =>
        call<{ read: true }>(
          "POST",
          resource(`/v1/messaging/channels/${channelId}/read`),
        ),
    },
    /**
     * `EventSource` sobre `/v1/messaging/events`: el navegador manda la
     * cookie de sesión automáticamente en mismo origen (`withCredentials`
     * cubre el caso de un origen de API distinto al del front). El llamante
     * decide cuándo cerrarla (`.close()`); este SDK no gestiona su ciclo de
     * vida — eso es del host de React.
     */
    events: () =>
      new EventSource(resource("/v1/messaging/events"), {
        withCredentials: true,
      }),
  };
}
