/**
 * LA FRONTERA DE RED DE LA SUITE: nada sale de la máquina.
 *
 * La capa de datos del producto (`lib/apiFetch.ts`) manda cada llamada a
 * `NEXT_PUBLIC_API_URL`, que en pruebas es un origen donde NADIE escucha. Este
 * fixture intercepta ese origen entero y contesta por él, de modo que la suite
 * es hermética: sin NestJS, sin Postgres, sin red.
 *
 * ## Qué hace, exactamente
 *
 * Tres cosas, y ninguna más:
 *
 *  1. **Intercepta todo el origen.** Una petición que se escapara saldría a un
 *     puerto muerto y el fallo sería un tiempo de espera sin nombre.
 *  2. **Aplica la comprobación de primera parte.** Es la misma que el servidor
 *     real: sin sesión o sin CSRF, la respuesta es la del servidor real, no un
 *     éxito de mentira. Vive en `standalone-identity.ts` y aquí sólo se llama.
 *  3. **Contesta vacío pero con éxito.** `GET` → `[]`, lo demás → `{ ok: true }`.
 *     Nunca 401 ni 403 desde aquí: eso dispararía las pantallas de «Sin acceso»
 *     y una prueba de dibujo se caería por una razón que no está probando.
 *
 * Los datos del CAD NO pasan por aquí: los sirve `cad-v1-backend.ts`, que se
 * instala DESPUÉS y registra rutas más específicas sobre el mismo origen.
 *
 * ## Por qué es tan corto ahora — y qué había antes
 *
 * Este archivo tenía 739 líneas y era un ERP/MES completo en miniatura: modelos
 * de producto, listas de materiales, planes, ÓRDENES DE TRABAJO con su takt
 * objetivo, surtido a línea con estados PENDING/STAGED/SHORTAGE, llamadas de
 * reabasto, terminal de operador con andon y paro de línea, no conformidades y
 * acciones correctivas. Treinta rutas. Era residuo del producto del que Valle
 * Design se separó (ver `IDENTITY.md`), y sobrevivió a la purga de identidad
 * porque 61 specs importan este archivo y nadie quiso tocarlo a ciegas.
 *
 * No hizo falta tocarlo a ciegas. El cruce es inequívoco y se puede repetir:
 *
 *  · **Ninguna de las 30 rutas aparece en ninguna spec.** Las 61 importan
 *    exactamente un símbolo, `installMockBackend`, y ninguna nombra una ruta,
 *    ni lee `state`, ni pasa opciones de sembrado.
 *  · **Ninguna de las 30 rutas aparece en el código de producto.** Ninguna
 *    página puede pedirlas, así que tampoco llegaban por la puerta de atrás.
 *
 * Es decir: de las 739 líneas, las 60 que quedan eran las únicas que hacían
 * algo. Las otras 679 sembraban un mundo que nadie miraba.
 */

import type { BrowserContext, Route } from "@playwright/test";
import { API_ORIGIN } from "./constants";
import { firstPartyRequestFailure } from "./standalone-identity";

export class MockBackend {
  /** Registra el interceptor del origen entero en el contexto. */
  async install(context: BrowserContext): Promise<void> {
    await context.route(`${API_ORIGIN}/**`, (route) => this.handleApi(route));
  }

  private async handleApi(route: Route): Promise<void> {
    const request = route.request();
    const json = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });

    // La identidad se comprueba igual que en el servidor real: una petición sin
    // sesión o sin CSRF recibe LO QUE RECIBIRÍA de verdad. Un fixture que
    // regalara la sesión convertiría en verde cualquier fallo de autenticación.
    // Un EventSource (mensajería, presencia) espera `text/event-stream` y NO
    // puede mandar la cookie de sesión entre orígenes ni cabeceras propias: con
    // el 401 JSON de la comprobación de primera parte, Chromium anotaba
    // «EventSource's response has a MIME type» en consola y el golden 10, que
    // exige consola limpia, caía por el fixture (medido). Va ANTES de esa
    // comprobación a propósito.
    if ((request.headers()["accept"] ?? "").includes("text/event-stream"))
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: "retry: 600000\n\n" });
    const authFailure = firstPartyRequestFailure(request);
    if (authFailure) return json(authFailure.body, authFailure.status);
    if (request.method().toUpperCase() === "GET") return json([]);
    return json({ ok: true });
  }
}

/** Construye e instala la frontera de red en un contexto. */
export async function installMockBackend(
  context: BrowserContext,
): Promise<MockBackend> {
  const mock = new MockBackend();
  await mock.install(context);
  return mock;
}
