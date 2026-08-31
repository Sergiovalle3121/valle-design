import type { components } from "./generated/design-api";

type Schemas = components["schemas"];

export type CallJoinRequest = Schemas["CallJoinRequest"];
export type CallJoinResponse = Schemas["CallJoinResponse"];
export type CallLeaveRequest = Schemas["CallLeaveRequest"];
export type CallSignalRequest = Schemas["CallSignalRequest"];
export type CallSignalKind = Schemas["CallSignalKind"];
export type CallParticipant = Schemas["CallParticipant"];
export type CallIceServer = Schemas["CallIceServer"];

/**
 * LA SUPERFICIE DE LLAMADAS DEL SDK.
 *
 * ── POR QUÉ VIVE EN SU PROPIO ARCHIVO ───────────────────────────────────────
 * Misma costura que `identity.ts`: `client.ts` reúne el resto de superficies
 * del API y el gate del monolito pone el techo en 800 líneas para un archivo
 * no presupuestado — añadir señalización de llamada lo habría cruzado. La
 * fábrica toma `call`/`resource` en vez de reimplementar transporte: sigue
 * habiendo UN solo `fetch` con UNA política de CSRF.
 *
 * `eventsUrl` es la excepción del grupo: NO pasa por `call()`. Un stream SSE
 * no es una promesa que resuelve una vez — el navegador abre un
 * `EventSource` directo sobre la URL que este método construye.
 */
export interface CallsTransport {
  call<T>(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
  resource(apiPath: string): string;
}

export function createCallsSurface({ call, resource }: CallsTransport) {
  return {
    join: (input: CallJoinRequest) =>
      call<CallJoinResponse>("POST", resource("/v1/calls/rooms"), input),
    leave: (roomId: string, participantId: string) =>
      call<{ left: true }>(
        "POST",
        resource(`/v1/calls/rooms/${roomId}/leave`),
        { participantId } satisfies CallLeaveRequest,
      ),
    signal: (roomId: string, input: CallSignalRequest) =>
      call<{ queued: true }>(
        "POST",
        resource(`/v1/calls/rooms/${roomId}/signals`),
        input,
      ),
    eventsUrl: (roomId: string, participantId: string): string => {
      const url = new URL(resource(`/v1/calls/rooms/${roomId}/events`));
      url.searchParams.set("participantId", participantId);
      return url.toString();
    },
  };
}
