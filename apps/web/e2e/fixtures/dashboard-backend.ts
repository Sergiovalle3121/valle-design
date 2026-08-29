/**
 * EL TABLERO, CON DATOS QUE TIENEN LA FORMA CORRECTA.
 *
 * ## Por qué hace falta un fixture propio
 *
 * `installMockBackend` contesta `[]` a todo `GET` del origen de la API. Eso vale
 * para las suites de dibujo, que no miran el tablero. Pero el tablero pide
 * páginas —`{ items, total }`— y una lista pelada NO es una página: leer
 * `.items` de un array da `undefined`, y el tablero se caía a la frontera de
 * error de la aplicación.
 *
 * Ese fallo estaba tapado dos veces. En el producto, porque el error escapaba
 * del `try` del tablero (se producía dentro de un actualizador perezoso de
 * `setState`, que corre después, durante el render). Y en las pruebas, porque
 * la spec de accesibilidad esperaba a `h1, h2` — **y la pantalla de error
 * también tiene un `h1`**, así que axe auditaba la pantalla de error y pasaba en
 * verde. Un gate que dice «esta página cumple» sobre una página que no se está
 * pintando es peor que no tener gate.
 *
 * Este fixture existe para que el tablero de las pruebas sea el tablero.
 */
import type { BrowserContext } from "@playwright/test";
import { API_ORIGIN } from "./constants";

export interface DashboardSeed {
  projects?: Array<{ id: string; name: string; status?: string }>;
  documents?: Array<{ id: string; projectId: string; name: string }>;
}

/**
 * Instala las respuestas que el tablero necesita para pintarse. Va DESPUÉS de
 * `installMockBackend`: las rutas más específicas ganan a la genérica.
 */
export async function installDashboardBackend(
  context: BrowserContext,
  seed: DashboardSeed = {},
) {
  const projects = seed.projects ?? [
    { id: "10000000-0000-4000-8000-0000000000a1", name: "Casa Valle", status: "active" },
  ];
  const documents = seed.documents ?? [];

  const pagina = (items: unknown[]) => ({ items, total: items.length });

  await context.route(`${API_ORIGIN}/v1/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (url.pathname === "/v1/cad/projects") return json(pagina(projects));
    if (url.pathname === "/v1/cad/documents") return json(pagina(documents));
    if (url.pathname === "/v1/organizations")
      return json(
        pagina([
          {
            id: "10000000-0000-4000-8000-000000000003",
            name: "Valle Design E2E",
            slug: "valle-design-e2e",
          },
        ]),
      );
    if (url.pathname === "/v1/commercial/subscription")
      return json({
        subscription: {
          plan: "trial",
          status: "trialing",
          // Lejos: el aviso de vencimiento no debe salir y ensuciar la auditoría.
          currentPeriodEndsAt: "2099-01-01T00:00:00.000Z",
          trialEndsAt: "2099-01-01T00:00:00.000Z",
        },
      });
    if (url.pathname === "/v1/commercial/entitlements") return json(pagina([]));
    return route.fallback();
  });
}
