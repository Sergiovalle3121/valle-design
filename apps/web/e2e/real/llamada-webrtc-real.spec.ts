/**
 * LA LLAMADA DE VERDAD — dos contextos de navegador, dos cuentas reales, una
 * `RTCPeerConnection` que conecta de verdad.
 *
 * ─── Por qué esto no es un golden con fetch interceptado ───────────────────
 *
 * La señalización (`/v1/calls/*`) se puede fingir con `route()` y probar que
 * el cliente manda las peticiones correctas — pero eso nunca demuestra que
 * dos navegadores intercambian audio/video de verdad. Esta suite no
 * intercepta NADA: dos cuentas se registran, verifican y entran a la MISMA
 * organización por invitación real, abren el MISMO documento en dos
 * `BrowserContext` separados (dos procesos de Chromium, no dos pestañas) y
 * llaman de verdad — con `--use-fake-device-for-media-stream` en vez de una
 * webcam real, pero con el resto de la pila (RTCPeerConnection, ICE, SDP,
 * SSE) intacta.
 *
 * ─── El oráculo ─────────────────────────────────────────────────────────────
 *
 * No se comprueba por la insignia "En curso": eso sólo dice que el ESTADO
 * dice que hay un enlace conectado. Se comprueba el `<video>` remoto por
 * PÍXELES — `videoWidth > 0` sólo es cierto si hay un frame real decodificado
 * llegando por la conexión punto a punto. Ahí es donde una demo (la barra se
 * ve bien, nadie prueba que el video fluye) se distingue de un producto.
 *
 * ─── El límite, dicho aquí ──────────────────────────────────────────────────
 *
 * Los dos navegadores corren en la MISMA máquina: la ruta ICE real es
 * host-a-host por loopback/LAN, nunca cruza un NAT. Esta suite demuestra que
 * la señalización, la negociación y el pipeline de medios funcionan de punta
 * a punta — NO demuestra conectividad a través de un NAT simétrico, que es
 * justo el 15% que necesita TURN (`call-ice-config.spec.ts`, en la API,
 * prueba esa lógica por separado y sin red real).
 */

import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import {
  E2E_PASSWORD,
  apiPost,
  apiLogin,
  capturedToken,
  latestCapturedEmail,
} from "../fixtures/first-party";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "los flags de dispositivo de medios simulado son de Chromium",
);

/**
 * Sin webcam ni pantalla real en el runner: Chromium sirve un patrón de
 * video sintético (`--use-fake-device-for-media-stream`), acepta el
 * permiso sin diálogo (`--use-fake-ui-for-media-stream`) y elige una fuente
 * de pantalla sin abrir el selector del sistema operativo
 * (`--auto-select-desktop-capture-source`). Sin los tres, `getUserMedia`/
 * `getDisplayMedia` se quedan colgados esperando una UI que nunca aparece.
 *
 * OJO CON EL NOMBRE DEL PRIMERO. Es `...-for-media-stream`, no
 * `...-for-media-capture`, que fue lo que este archivo pasó hasta hoy.
 * Chromium **ignora en silencio** un flag que no conoce: no avisa, no falla
 * al arrancar, simplemente no hay cámara falsa. Entonces `getUserMedia`
 * rechaza en un runner sin webcam, el botón se queda en `aria-pressed=false`
 * y el fallo aparece a quince segundos de distancia de su causa, disfrazado
 * de «la cámara no prende». Y no se vio en su momento porque el job de E2E
 * se cancelaba por presupuesto antes de llegar aquí.
 */
test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--auto-select-desktop-capture-source=Entire screen",
    ],
  },
});

async function registerAndVerify(
  context: BrowserContext,
  email: string,
): Promise<void> {
  const register = await context.request.post(
    `${API_ORIGIN}/v1/auth/register`,
    { data: { email, password: E2E_PASSWORD } },
  );
  expect(register.status(), await register.text()).toBe(202);
  const message = await latestCapturedEmail(context.request, email);
  expect(message.template).toBe("identity.verify-email");
  const verify = await context.request.post(
    `${API_ORIGIN}/v1/auth/verify-email`,
    { data: { token: capturedToken(message) } },
  );
  expect(verify.status(), await verify.text()).toBe(201);
}

test.describe("Llamada WebRTC real: dos contextos de navegador", () => {
  let contextA: BrowserContext;
  let contextB: BrowserContext;
  let pageA: Page;
  let pageB: Page;

  const runId = Date.now().toString(36);
  const emailA = `llamada-a-${runId}@example.test`;
  const emailB = `llamada-b-${runId}@example.test`;
  let organizationId = "";
  let documentId = "";

  test.beforeAll(async ({ browser }) => {
    contextA = await browser.newContext({
      baseURL: BASE_URL,
      permissions: ["camera", "microphone"],
    });
    contextB = await browser.newContext({
      baseURL: BASE_URL,
      permissions: ["camera", "microphone"],
    });
    pageA = await contextA.newPage();
    pageB = await contextB.newPage();
  });

  test.afterAll(async () => {
    await contextA?.close();
    await contextB?.close();
  });

  test("1 · dos cuentas reales, la misma organización por invitación, un documento", async () => {
    test.setTimeout(180_000);

    await registerAndVerify(contextA, emailA);
    await registerAndVerify(contextB, emailB);

    await apiLogin(contextA, emailA);
    const org = await apiPost<{ id: string; tenantId: string }>(
      contextA,
      "/v1/organizations",
      {
        name: `Taller Llamadas ${runId}`,
        slug: `taller-llamadas-${runId}`,
      },
    );
    expect(org.status, JSON.stringify(org.body)).toBe(201);
    organizationId = org.body.id;
    expect(org.body.tenantId).toBe(organizationId);

    const project = await apiPost<{ id: string }>(
      contextA,
      "/v1/cad/projects",
      { name: "Proyecto de la llamada" },
    );
    expect(project.status, JSON.stringify(project.body)).toBe(201);

    const doc = await apiPost<{ id: string }>(contextA, "/v1/cad/documents", {
      name: "Plano compartido",
      projectId: project.body.id,
    });
    expect(doc.status, JSON.stringify(doc.body)).toBe(201);
    documentId = doc.body.id;

    // A invita a B. El token NUNCA viaja en la respuesta HTTP — sólo por
    // correo, igual que la verificación de cuenta.
    const invite = await apiPost<{ invitationId: string }>(
      contextA,
      `/v1/organizations/${organizationId}/invitations`,
      { email: emailB, role: "member" },
    );
    expect(invite.status, JSON.stringify(invite.body)).toBe(201);

    await apiLogin(contextB, emailB);
    const inviteEmail = await latestCapturedEmail(
      contextB.request,
      emailB,
      organizationId,
    );
    expect(inviteEmail.template).toBe("organization.invitation");
    const accept = await apiPost<{ organizationId: string }>(
      contextB,
      "/v1/organizations/invitations/accept",
      { token: capturedToken(inviteEmail) },
    );
    expect(accept.status, JSON.stringify(accept.body)).toBe(201);
    expect(accept.body.organizationId).toBe(organizationId);

    const activation = await apiPost<{ organizationId: string }>(
      contextB,
      "/v1/organizations/active",
      { organizationId },
    );
    expect(activation.status, JSON.stringify(activation.body)).toBe(201);
  });

  test("2 · A y B abren el mismo documento en el estudio real", async () => {
    test.setTimeout(120_000);

    await pageA.goto(`/studio/${documentId}`);
    await expect(pageA.getByTestId("cad-command-line")).toBeVisible({
      timeout: 120_000,
    });
    await pageB.goto(`/studio/${documentId}`);
    await expect(pageB.getByTestId("cad-command-line")).toBeVisible({
      timeout: 120_000,
    });
  });

  test("3 · A llama, queda esperando sola", async () => {
    await pageA.getByTestId("call-start-button").click();
    await expect(pageA.getByText("Llamando…")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("4 · B se une y los dos llegan a en-curso — la sala real, no un mock", async () => {
    test.setTimeout(90_000);
    await pageB.getByTestId("call-start-button").click();

    await expect(pageA.getByText("En curso")).toBeVisible({ timeout: 60_000 });
    await expect(pageB.getByText("En curso")).toBeVisible({ timeout: 60_000 });
    await expect(pageA.getByText("2 participantes")).toBeVisible();
    await expect(pageB.getByText("2 participantes")).toBeVisible();
  });

  test("5 · A prende la cámara y B recibe VIDEO REAL — píxeles, no sólo estado", async () => {
    test.setTimeout(60_000);
    await pageA.getByTestId("call-camera-toggle").click();
    await expect(pageA.getByTestId("call-camera-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // El primer <video> de B es su propia miniatura; el segundo es el par (A).
    const remoteVideo = pageB.locator("video").nth(1);
    await expect
      .poll(
        () => remoteVideo.evaluate((el: HTMLVideoElement) => el.videoWidth),
        { timeout: 30_000, message: "el video remoto nunca mostró un frame real" },
      )
      .toBeGreaterThan(0);
  });

  test("6 · A comparte pantalla — un getDisplayMedia real, no un botón decorativo", async () => {
    test.setTimeout(60_000);
    await pageA.getByTestId("call-screenshare-toggle").click();
    await expect(
      pageA.getByTestId("call-screenshare-toggle"),
    ).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });

    // El carril de video ya estaba abierto (la cámara lo abrió en el paso
    // anterior): cambiar a pantalla es un replaceTrack, no renegocia — y el
    // frame remoto sigue llegando con la fuente nueva.
    const remoteVideo = pageB.locator("video").nth(1);
    await expect
      .poll(
        () => remoteVideo.evaluate((el: HTMLVideoElement) => el.videoWidth),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
  });

  test("7 · A cuelga y B ve la sala vaciarse por SSE, sin refrescar", async () => {
    test.setTimeout(60_000);
    await pageA.getByTestId("call-hangup-button").click();
    await expect(pageA.getByText("Llamada terminada.")).toBeVisible();

    // B nunca recargó la página: el roster le llega solo por el stream SSE.
    await expect(pageB.getByText("Llamando…")).toBeVisible({
      timeout: 30_000,
    });
    await expect(pageB.getByText("1 participante")).toBeVisible();
  });
});
