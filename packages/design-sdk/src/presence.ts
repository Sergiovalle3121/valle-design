/**
 * Superficie de presencia EN VIVO (`/v1/cad/documents/:id/presence*`),
 * aparte de `client.ts` por la MISMA razón que `identity.ts`: ese archivo
 * está en su techo de 800 líneas para un archivo no presupuestado
 * (`scripts/cad/monolith-budget.json`), y añadirle esto lo habría pasado.
 *
 * La fábrica toma `call`/`resource` en vez de reimplementarlos — mismo
 * transporte, misma política de CSRF, mismo desempaquetado de errores que el
 * resto del cliente (ver la cabecera de `createIdentitySurface`).
 *
 * `publish` es el único método fetch de este namespace: el stream (`GET
 * .../presence/stream`, `text/event-stream`) no encaja en `call<T>` (espera
 * un solo cuerpo JSON, no una conexión abierta) y se consume con
 * `EventSource` directo — ver
 * `apps/web/src/lib/cad/collab/server-presence-channel.ts`. `streamUrl` sólo
 * arma la URL para que ese adaptador no reconstruya la ruta canónica a mano.
 */
import type { components } from "./generated/design-api";

type Schemas = components["schemas"];

export type CadPresenceCursor = Schemas["CadPresenceCursor"];
export type CadPresenceViewport = Schemas["CadPresenceViewport"];
export type CadPresenceBeatCreate = Schemas["CadPresenceBeatCreate"];

export interface PresenceTransport {
  call<T>(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
  resource(apiPath: string): string;
}

export function createPresenceSurface({ call, resource }: PresenceTransport) {
  return {
    publish: (documentId: string, input: CadPresenceBeatCreate) =>
      call<void>(
        "POST",
        resource(`/v1/cad/documents/${documentId}/presence`),
        input,
      ),
    streamUrl: (documentId: string) =>
      resource(`/v1/cad/documents/${documentId}/presence/stream`),
  };
}
