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
import { abrirPanelDerecho } from "../fixtures/docks";

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

// La misma cuadrícula de 8 px y el mismo conteo de elementos visibles que el
// golden 228: se mide la superficie que recibe clics, no sólo el DOM presente.
async function measureOpening(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width >= 4 && rect.height >= 4 && rect.bottom >= 0 && rect.right >= 0 &&
        rect.top <= innerHeight && rect.left <= innerWidth && style.display !== 'none' &&
        style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
    };
    const controls = [...document.querySelectorAll(
      'button, a[href], input, select, textarea, [role=button], [role=tab], [role=menuitem], [role=option]',
    )].filter(visible).length;
    const canvas = document.querySelector('[data-testid="cad-canvas"]');
    if (!canvas) return { controls, screenFree: 0, canvasCovered: 100 };
    const rect = canvas.getBoundingClientRect();
    let total = 0;
    let free = 0;
    for (let x = rect.left + 2; x < rect.right - 2; x += 8) {
      for (let y = rect.top + 2; y < rect.bottom - 2; y += 8) {
        total++;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit.tagName === 'CANVAS' || hit === canvas || canvas.contains(hit))) free++;
      }
    }
    return {
      controls,
      screenFree: 100 * (free / total) * rect.width * rect.height / (innerWidth * innerHeight),
      canvasCovered: 100 * (1 - free / total),
    };
  });
}

test.describe('Demostración sin cuenta', () => {
  test('abre el editor real, dibuja por comando y no toca la red de documentos', async ({
    page,
  }) => {
    const documentRequests = collectDocumentRequests(page);
    await page.goto('/demo?cadUi=pro');

    // El editor real, con las entidades nativas de la plantilla en su panel.
    // El TOTAL se lee del encabezado del panel: la lista se trunca («y 2 más»)
    // y contar nodos renderizados mentiría.
    await abrirPanelDerecho(page);
    const entityList = page.getByTestId('cad-native-entity-list');
    await expect(entityList).toBeVisible({ timeout: 60_000 });
    const readTotal = async () => {
      const text = (await entityList.innerText()).match(/\d+/);
      return text ? Number(text[0]) : 0;
    };
    const before = await readTotal();
    expect(before, 'la casa habitación llega con entidades dibujadas').toBeGreaterThanOrEqual(5);

    // El banner permanente con el CTA que se lleva el dibujo al registro.
    // Verificación de oclusión: elementFromPoint en el centro de cada superficie
    // debe devolver ese elemento o un descendiente, confirmando que nada lo tapa.
    const cta = page.getByTestId('demo-register-cta');
    await expect(cta).toHaveAttribute(
      'href',
      /returnTo=%2Fdashboard%3Fdemo%3D1/,
    );
    await expect(async () => {
      const ctaBox = await cta.boundingBox();
      expect(ctaBox, 'el CTA debe ser visible en pantalla').not.toBeNull();
      const hit = await page.evaluate(
        ({ cx, cy }) => {
          const el = document.elementFromPoint(cx, cy);
          return el?.getAttribute('data-testid') ?? el?.closest('[data-testid]')?.getAttribute('data-testid') ?? null;
        },
        { cx: ctaBox!.x + ctaBox!.width / 2, cy: ctaBox!.y + ctaBox!.height / 2 },
      );
      expect(hit).toBe('demo-register-cta');
    }).toPass({ timeout: 10_000 });

    const commandInput = page.getByTestId('cad-command-input');
    await expect(async () => {
      const inputBox = await commandInput.boundingBox();
      expect(inputBox, 'la línea de comandos debe ser visible').not.toBeNull();
      const hit = await page.evaluate(
        ({ cx, cy }) => {
          const el = document.elementFromPoint(cx, cy);
          return el?.getAttribute('data-testid') ?? el?.closest('[data-testid]')?.getAttribute('data-testid') ?? null;
        },
        { cx: inputBox!.x + inputBox!.width / 2, cy: inputBox!.y + inputBox!.height / 2 },
      );
      expect(hit).toBe('cad-command-input');
    }).toPass({ timeout: 10_000 });

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

  test('una visita con almacenamiento heredado abre limpia y deja recuperar el dibujo a voluntad', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/demo?cadUi=pro');
    await abrirPanelDerecho(page);
    const entityList = page.getByTestId('cad-native-entity-list');
    await expect(entityList).toBeVisible({ timeout: 60_000 });
    const count = async () => Number((await entityList.innerText()).match(/\d+/)?.[0] ?? 0);
    const houseCount = await count();
    expect(houseCount).toBeGreaterThan(5);

    // Una visita previa dejó trabajo propio. El sobre se vuelve a poner en el
    // formato anterior, que no tenía la marca `edited`, para cubrir el caso de
    // las personas que ya habían usado /demo antes de este cambio.
    const input = page.getByTestId('cad-command-input');
    for (const token of ['LINE', '0,0', '3000,0']) {
      await input.click();
      await input.fill(token);
      await input.press('Enter');
    }
    await input.press('Enter');
    await expect.poll(count, { timeout: 15_000 }).toBeGreaterThan(houseCount);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('valle_demo_document')?.length ?? 0),
      { timeout: 30_000 }).toBeGreaterThan(100);
    await page.evaluate(() => {
      const old = JSON.parse(localStorage.getItem('valle_demo_document')!);
      delete old.edited;
      localStorage.setItem('valle_demo_document', JSON.stringify(old));
    });

    await page.goto('/demo?cadUi=pro');
    await abrirPanelDerecho(page);
    await expect(entityList).toBeVisible({ timeout: 60_000 });
    await expect.poll(count, { timeout: 15_000 }).toBe(houseCount);
    const recover = page.getByRole('button', { name: 'Recuperar mi dibujo anterior' });
    await expect(recover).toBeVisible();
    await recover.click();
    await abrirPanelDerecho(page);
    await expect.poll(count, { timeout: 15_000 }).toBeGreaterThan(houseCount);
    await expect(recover).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('valle_demo_document')?.length ?? 0),
      { timeout: 15_000 }).toBeGreaterThan(100);
  });

  for (const viewport of [{ width: 1440, height: 769 }, { width: 1366, height: 768 }]) {
    test(`la puerta de salida sigue despejada para visita nueva y heredada a ${viewport.width}×${viewport.height}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await page.goto('/');
      await page.evaluate(() => localStorage.removeItem('valle:cad:ui-mode:v1'));
      await page.goto('/demo');
      const canvas = page.getByTestId('cad-canvas');
      await expect(canvas).toBeVisible({ timeout: 60_000 });
      const skip = page.getByTestId('cad-guided-tour-skip');
      if (await skip.count()) await skip.click();
      await expect(page.getByTestId('cad-essential-bar')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(3000);
      const newVisit = await measureOpening(page);
      expect(newVisit.controls, `visita nueva: ${JSON.stringify(newVisit)}`).toBeLessThanOrEqual(30);
      expect(newVisit.screenFree, `visita nueva: ${JSON.stringify(newVisit)}`).toBeGreaterThanOrEqual(
        viewport.width === 1440 ? 75 : 70,
      );
      expect(newVisit.canvasCovered, `visita nueva: ${JSON.stringify(newVisit)}`).toBeLessThanOrEqual(3);

      // Simula un sobre de antes de este cambio sin usar ninguna API interna.
      await page.evaluate(() => {
        const old = JSON.parse(localStorage.getItem('valle_demo_document')!);
        delete old.edited;
        localStorage.setItem('valle_demo_document', JSON.stringify(old));
      });
      await page.goto('/demo');
      await expect(canvas).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('button', { name: 'Recuperar mi dibujo anterior' })).toBeVisible();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(3000);
      const returningVisit = await measureOpening(page);
      console.log(`demo opening ${viewport.width}×${viewport.height}: ${JSON.stringify({ newVisit, returningVisit })}`);
      expect(returningVisit.controls, `visita heredada: ${JSON.stringify(returningVisit)}`).toBeLessThanOrEqual(30);
      expect(returningVisit.screenFree, `visita heredada: ${JSON.stringify(returningVisit)}`).toBeGreaterThanOrEqual(
        viewport.width === 1440 ? 75 : 70,
      );
      expect(returningVisit.canvasCovered, `visita heredada: ${JSON.stringify(returningVisit)}`).toBeLessThanOrEqual(3);
    });
  }
});

/**
 * EN UN TELÉFONO, LA DEMOSTRACIÓN TIENE QUE CABER.
 *
 * Medido el 24-sep-2026 a 390 px: la fila superior medía 560 px, así que
 * «Cerrar» y «Crea tu cuenta» —la salida de la demostración— quedaban fuera de
 * la pantalla; y el encuadre inicial, pensado apaisado, cortaba la casa por los
 * dos lados (Sala y Cocina a medias). Sin `isMobile` a propósito: Firefox lo
 * rechaza (ver `e2e/real/movil.spec.ts`) y lo que se mide aquí depende del
 * ancho y del toque, no del agente.
 */
test.describe('Demostración en un teléfono', () => {
  for (const width of [360, 390]) {
    test(`a ${width} px la fila superior cabe y la casa abre entera`, async ({ browser }) => {
      test.setTimeout(120_000);
      const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, locale: 'es-MX' });
      try {
        const page = await context.newPage();
        // Visita nueva: sin modo guardado, la demostración abre en Esencial.
        await page.goto('/');
        await page.evaluate(() => localStorage.removeItem('valle:cad:ui-mode:v1'));
        await page.goto('/demo');
        const canvas = page.getByTestId('cad-canvas');
        await expect(canvas).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId('cad-essential-bar')).toBeVisible();

        for (const testId of ['cad-share', 'cad-save', 'cad-close-editor', 'demo-register-cta']) {
          const box = await page.getByTestId(testId).boundingBox();
          expect(box, `${testId} está en la página`).not.toBeNull();
          expect(box!.x, `${testId} empieza dentro de la pantalla`).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width, `${testId} acaba dentro de ${width} px`).toBeLessThanOrEqual(width);
        }
        // Los rótulos siguen diciendo qué hace cada botón aunque sólo se vea el icono.
        await expect(page.getByRole('button', { name: 'Compartir', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeVisible();

        // Los seis cuartos de la casa, con su nombre, dentro del lienzo.
        const names = page.getByTestId('cad-room-name-hitbox');
        await expect.poll(() => names.count(), { timeout: 30_000 }).toBe(6);
        await expect.poll(async () => {
          const area = await canvas.boundingBox();
          if (!area) return ['sin lienzo'];
          const fuera: string[] = [];
          for (const name of await names.all()) {
            const box = await name.boundingBox();
            const cx = box ? box.x + box.width / 2 : -1;
            const cy = box ? box.y + box.height / 2 : -1;
            if (cx < area.x || cx > area.x + area.width || cy < area.y || cy > area.y + area.height) {
              fuera.push((await name.innerText()).trim());
            }
          }
          return fuera;
        }, { timeout: 15_000, message: 'cuartos fuera del lienzo al abrir' }).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});
