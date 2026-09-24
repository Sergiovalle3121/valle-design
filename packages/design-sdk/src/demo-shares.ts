/**
 * Enlace TEMPORAL de la demostración (`/v1/cad/demo-shares*`), aparte de
 * `client.ts` por la misma razón que `presence.ts`: ese archivo está en su
 * techo de 800 líneas para un archivo no presupuestado
 * (`scripts/cad/monolith-budget.json`).
 *
 * Siete días, sin cuenta. Crear, canjear y borrar no necesitan sesión: el
 * canje va con el token de lectura en `X-Demo-Share-Token` y el borrado con el
 * de gestión en `X-Demo-Share-Manage-Token`. Reclamarlo desde una cuenta
 * (`claim`) sí exige sesión, CSRF y `cad:review`, y devuelve la sesión de
 * revisión que hereda el mismo token.
 */
import type { components } from "./generated/design-api";

type Schemas = components["schemas"];

export type DemoShareCreated = Schemas["DemoShareCreated"];
export type DemoShareContext = Schemas["DemoShareContext"];

export interface DemoShareTransport {
  call<T>(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
  resource(apiPath: string): string;
}

export function createDemoShareSurface({ call, resource }: DemoShareTransport) {
  return {
    create: (gzippedDocument: Blob, name?: string) => {
      const form = new FormData();
      if (name) form.append("name", name);
      form.append("file", gzippedDocument, "plano-demo.json.gz");
      return call<DemoShareCreated>("POST", resource("/v1/cad/demo-shares"), form);
    },
    context: (shareToken: string) =>
      call<DemoShareContext>(
        "GET",
        resource("/v1/cad/demo-shares/context"),
        undefined,
        { "X-Demo-Share-Token": shareToken },
      ),
    remove: (manageToken: string) =>
      call<void>(
        "DELETE",
        resource("/v1/cad/demo-shares/context"),
        undefined,
        { "X-Demo-Share-Manage-Token": manageToken },
      ),
    claim: (documentId: string, manageToken: string) =>
      call<Schemas["CadReviewSession"]>(
        "POST",
        resource(`/v1/cad/documents/${documentId}/demo-share-claims`),
        { manageToken },
      ),
  };
}
