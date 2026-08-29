/**
 * MODO DEMOSTRACIÓN (/demo) — el humo que protege la promesa.
 *
 * La promesa pública es triple: (1) el editor REAL abre sin cuenta con la
 * casa habitación puesta; (2) se puede DIBUJAR de verdad (un comando por la
 * línea de comandos muta el documento); (3) nada viaja a la nube — cero
 * peticiones de documentos, el guardado vive en localStorage (valle_demo_document,
 * clave autorizada con su porqué en session-storage.spec).
 *
 * La tercera es la que más vale: si un refactor vuelve a colgar el guardado
 * del cliente Design, el demo rompería con un 401 silencioso en producción.
 * Aquí se cae en rojo con la URL de la petición delatora en el mensaje.
 */
import { expect, test, type Page } from '@playwright/test';
import { DEMO_STORAGE_KEY } from '@/lib/cad/demo/demo-constants';

function collectDocumentRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    /**
     * Lo vigilado son las rutas de DOCUMENTOS: la promesa del demo es «tu
     * dibujo vive en este navegador», y esa promesa se rompe si un guardado
     * viaja. El ping de sesión (`/v1/auth/session`) es el bootstrap global de
     * auth de toda la web y no lleva dibujo; el catálogo de bloques
     * (`/v1/cad/blocks`) es una LECTURA de biblioteca que degrada a vacío sin
     * API — pulirlo para que ni se pida en demo está en el backlog.
     */
    if (/\/v1\/cad\/documents|\/documents\//.test(url) && !url.includes('/_next/')) {
      requests.push(`${request.method()} ${url}`);
    }
  });
  return requests;
}

test.describe('Demostración sin cuenta', () => {
  test('abre el editor real, dibuja por comando y no toca la red de documentos', async ({
    page,
  }) => {
    const documentRequests = collectDocumentRequests(page);
    await page.goto('/demo');

    // El editor real, con las entidades nativas de la plantilla en su panel.
    // El TOTAL se lee del encabezado del panel: la lista se trunca («y 2 más»)
    // y contar nodos renderizados mentiría.
    const entityList = page.getByTestId('cad-native-entity-list');
    await expect(entityList).toBeVisible({ timeout: 60_000 });
    const readTotal = async () => {
      const text = (await entityList.innerText()).match(/\d+/);
      return text ? Number(text[0]) : 0;
    };
    const before = await readTotal();
    expect(before, 'la casa habitación llega con entidades dibujadas').toBeGreaterThanOrEqual(5);

    // El banner permanente con el CTA que se lleva el dibujo al registro.
    await expect(page.getByTestId('demo-banner')).toBeVisible();
    await expect(page.getByTestId('demo-register-cta')).toHaveAttribute(
      'href',
      /returnTo=%2Fdashboard%3Fdemo%3D1/,
    );

    // Dibujar de verdad: una línea por la línea de comandos. El protocolo es
    // un token por Enter — comando, luego cada punto — como en el producto.
    const input = page.getByTestId('cad-command-input');
    for (const token of ['LINE', '0,0', '3000,0']) {
      await input.click();
      await input.fill(token);
      await input.press('Enter');
    }
    // Enter VACÍO termina y confirma (Escape cancela el tramo en curso).
    await input.press('Enter');
    await expect
      .poll(readTotal, {
        message: 'el comando LINE debe añadir una entidad nativa',
        timeout: 15_000,
      })
      .toBeGreaterThan(before);

    // El dibujo queda en el navegador (autosave → localStorage valle_demo_document),
    // no en la nube. La clave va LITERAL en cada línea que toca el storage:
    // el gate de session-storage audita cada uso por su clave visible, y el
    // guardián de abajo la mantiene atada a la constante del producto.
    expect(DEMO_STORAGE_KEY).toBe('valle_demo_document');
    await expect
      .poll(
        async () =>
          page.evaluate(
            () => window.localStorage.getItem('valle_demo_document')?.length ?? 0,
          ),
        { message: 'el autosave del demo debe escribir el respaldo local', timeout: 30_000 },
      )
      .toBeGreaterThan(100);

    expect(
      documentRequests,
      `el demo no puede hablar con la API de documentos:\n${documentRequests.join('\n')}`,
    ).toEqual([]);
  });
});
