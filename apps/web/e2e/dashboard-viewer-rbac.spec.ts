import { expect, test } from "@playwright/test";
import { API_ORIGIN } from "./fixtures/constants";
import {
  firstPartyRequestFailure,
  loginAsStandaloneViewer,
} from "./fixtures/standalone-identity";

const PROJECT_ID = "10000000-0000-4000-8000-000000000091";
const DOCUMENT_ID = "20000000-0000-4000-8000-000000000091";

test("viewer navega dashboard y estudio sin controles ni escrituras CAD", async ({
  context,
  page,
}) => {
  await loginAsStandaloneViewer(context);
  let mutationRequests = 0;
  let presenceBeats = 0;

  /**
   * LA PRESENCIA NO ES UNA ESCRITURA DEL PLANO, y esta distinción es el
   * contrato de esta prueba, no una excusa para dejarla pasar.
   *
   * Este spec contaba como mutación CUALQUIER no-GET bajo `/v1/cad/**`. Se
   * escribió antes de que existiera la presencia en vivo, cuando esa regla y
   * «no escribe el documento» eran lo mismo. Ya no lo son: publicar un latido
   * de presencia es un POST a `/v1/cad/documents/:id/presence` que dice «estoy
   * mirando este plano y mi cursor está aquí», y un viewer haciendo eso es
   * exactamente lo que la colaboración promete.
   *
   * Antes de estrechar una prueba de autorización comprobé el endpoint, que es
   * el orden correcto (`apps/api/src/modules/cad/cad-presence.controller.ts:54`):
   * exige `cad:view` —no `cad:edit`—, el `tenantId` y el correo salen del
   * contexto del servidor y no del cliente, el cuerpo se limita a `peerId`,
   * `cursor` y `viewport`, responde 204 y tiene su spec de aislamiento por
   * tenant. No toca el documento.
   *
   * Así que la intención de la prueba —«un viewer no escribe CAD»— se conserva
   * intacta y su mecanismo se corrige. Y queda MÁS estricta que antes: en vez
   * de exigir «cero no-GET» exige «cero mutaciones Y que lo único no-GET que
   * salga sea el latido de presencia». Cualquier otra escritura que aparezca
   * mañana —una que el contador viejo también habría cazado— sigue fallando.
   */
  const ES_LATIDO_DE_PRESENCIA = /^\/v1\/cad\/documents\/[^/]+\/presence$/;

  await context.route(`${API_ORIGIN}/v1/cad/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const authFailure = firstPartyRequestFailure(request);
    if (authFailure) return json(authFailure.body, authFailure.status);
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      if (method === "POST" && ES_LATIDO_DE_PRESENCIA.test(url.pathname)) {
        presenceBeats += 1;
        return json(null, 204);
      }
      mutationRequests += 1;
      return json({ code: "permission_denied" }, 403);
    }
    if (url.pathname === "/v1/cad/projects")
      return json({
        items: [{ id: PROJECT_ID, name: "Proyecto visible", status: "active" }],
      });
    if (url.pathname === "/v1/cad/documents")
      return json({
        items: [
          {
            id: DOCUMENT_ID,
            projectId: PROJECT_ID,
            name: "Plano de consulta",
            model: null,
            revision: null,
            cadDocumentVersion: 0,
          },
        ],
      });
    if (url.pathname === `/v1/cad/documents/${DOCUMENT_ID}`)
      return json({
        id: DOCUMENT_ID,
        projectId: PROJECT_ID,
        name: "Plano de consulta",
        model: null,
        revision: null,
        cadDocumentVersion: 0,
        cadDocument: null,
      });
    if (url.pathname === "/v1/cad/blocks") return json({ items: [] });
    return json({ message: "not found" }, 404);
  });

  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-read-only")).toBeVisible();
  await expect(page.getByLabel("Crear proyecto")).toHaveCount(0);
  await expect(page.getByLabel("Crear documento")).toHaveCount(0);
  await expect(
    page.getByText("Importar como documento", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Plano de consulta" }).click();

  await expect(page).toHaveURL(new RegExp(`${DOCUMENT_ID}$`));
  await expect(page.getByTestId("cad-readonly-banner")).toContainText(
    "VIEWER · SOLO LECTURA",
  );
  await expect(
    page.getByRole("button", { name: "Guardar", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Círculo", exact: true }),
  ).toBeDisabled();

  await page.keyboard.press("Control+s");
  await page.waitForTimeout(2_200);
  expect(
    mutationRequests,
    'Un viewer emitió una escritura CAD que no es un latido de presencia.',
  ).toBe(0);
  // El latido no se afirma en un número exacto —depende del reloj de la
  // ventana de 2,2 s— sino en que la presencia SIGUE viva para quien sólo
  // mira. Si un día deja de latir, esta línea lo dice en vez de dejar que la
  // colaboración se apague en silencio para los viewers.
  expect(
    presenceBeats,
    'La presencia dejó de latir para un viewer: quien sólo mira desaparece ' +
      'de la lista de presentes y la colaboración se vuelve ciega a él.',
  ).toBeGreaterThan(0);
});
