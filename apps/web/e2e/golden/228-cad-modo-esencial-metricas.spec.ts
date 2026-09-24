import { expect, test, type Page } from '@playwright/test';

/**
 * Golden 228 — MODO ESENCIAL: las cifras que mandan, medidas en DOM.
 *
 * Línea base medida en producción el 2026-09-22 (protocolo de
 * `work/medir-primer-minuto.mjs`, 1440×769, en reposo, diálogo cerrado): 122
 * controles visibles, 38 % de la pantalla libre para dibujar y 22 % del
 * lienzo tapado por interfaz. Metas del encargo, en Esencial:
 *   · ≤ 30 controles visibles al abrir, a 1440×769;
 *   · ≥ 75 % de pantalla libre a 1440×769 y ≥ 70 % a 1366×768;
 *   · ≤ 3 % del lienzo tapado en reposo.
 * Además: sin paleta flotante (`cad-toolbar`), sin pestañas Modelo/Presentación,
 * rieles reducidos y muelles plegados, y las ayudas de dibujo detrás de un
 * solo control «Ayudas de dibujo» que las despliega con sus testids de siempre.
 *
 * Las funciones de conteo y de lienzo tapado son las MISMAS que el script de
 * medición pública: toma el canvas más grande, no su contenedor, y sólo un
 * CANVAS descubierto cuenta como superficie libre. El recorrido permanece
 * visible como en la primera visita real.
 */

/**
 * Un navegador nuevo DE VERDAD: se retira la preferencia «pro» que
 * `playwright.config.ts` siembra para el resto de la suite (allí está el
 * porqué). Se hace una sola vez, antes de abrir el estudio, para medir el
 * arranque que ve una visita real a vallecad.com/demo.
 */
async function navegadorNuevo(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    try {
      window.localStorage.removeItem('valle:cad:ui-mode:v1'); // preferencia de interfaz
    } catch {
      /* sin almacenamiento no hay nada que retirar */
    }
  });
}

async function medir(page: Page) {
  return page.evaluate(() => {
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05;
    };
    const controles = [
      ...document.querySelectorAll(
        'button, a[href], input, select, textarea, [role=button], [role=tab], [role=menuitem], [role=option]',
      ),
    ].filter(vis);
    const nombres = controles.map(
      (el) =>
        el.getAttribute('data-testid') ??
        el.getAttribute('aria-label') ??
        el.getAttribute('title') ??
        (el.textContent ?? '').trim().slice(0, 24) ??
        el.tagName.toLowerCase(),
    );
    const r = [...document.querySelectorAll('canvas')].map(c => c.getBoundingClientRect())
      .filter(box => box.width > 100).sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!r) return { controles: controles.length, nombres, error: 'sin lienzo' };
    let total = 0;
    let libre = 0;
    for (let x = r.left + 2; x < r.right - 2; x += 8) {
      for (let y = r.top + 2; y < r.bottom - 2; y += 8) {
        total++;
        const el = document.elementFromPoint(x, y);
        if (el && el.tagName === 'CANVAS') libre++;
      }
    }
    return {
      controles: controles.length,
      nombres,
      lienzo: { width: r.width, height: r.height },
      pctTapado: 100 * (1 - libre / total),
      pctLibreDePantalla: 100 * (libre / total) * r.width * r.height / (innerWidth * innerHeight),
    };
  });
}

async function abrirDemoEsencial(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await navegadorNuevo(page);
  await page.goto('/demo');
  await expect(page.getByTestId('cad-canvas')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('cad-guided-tour')).toBeVisible();
  await expect(page.getByTestId('cad-essential-bar')).toBeVisible();
  // Mismo reposo de tres segundos que el protocolo público, sin saltar la guía.
  await page.waitForTimeout(3000);
}

test('a 1440×769 Esencial deja ≤30 controles, ≥75 % de pantalla libre y ≤3 % del lienzo tapado', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirDemoEsencial(page, { width: 1440, height: 769 });
  const m = await medir(page);
  expect(m.error).toBeUndefined();
  expect(
    m.controles,
    `controles visibles al abrir (meta ≤ 30):\n  · ${m.nombres.join('\n  · ')}`,
  ).toBeLessThanOrEqual(30);
  expect(m.pctLibreDePantalla, 'pantalla libre para dibujar (meta ≥ 75 %)').toBeGreaterThanOrEqual(75);
  expect(m.pctTapado, 'lienzo tapado por interfaz en reposo (meta ≤ 3 %)').toBeLessThanOrEqual(3);

  // Lo que Esencial esconde (no borra).
  await expect(page.getByTestId('cad-toolbar'), 'sin paleta flotante sobre el lienzo').toHaveCount(0);
  await expect(page.getByTestId('cad-space-tabs')).toHaveCount(0);
  await expect(page.getByTestId('cad-ribbon')).toHaveCount(0);
  await expect(page.getByTestId('cad-left-dock')).toHaveAttribute('data-collapsed', 'true');
  await expect(page.getByTestId('cad-right-dock')).toHaveAttribute('data-collapsed', 'true');
  for (const id of ['cad-rail-biblioteca', 'cad-rail-properties', 'cad-rail-workspace']) {
    await expect(page.getByTestId(id), `${id} sigue a un clic`).toBeVisible();
  }
  await expect(page.getByTestId('cad-navigation-fit-selection'),
    'sin selección, el encuadre deshabilitado no ocupa un control en Esencial').toHaveCount(0);
  await expect(page.getByTestId('cad-close-editor'),
    'la salida que comprueba el guardado sigue visible').toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar el CAD' }),
    'una sola salida visible; el cierre seguro ya está en la cabecera').toHaveCount(0);
  for (const id of ['cad-rail-hatch', 'cad-rail-dimension', 'cad-rail-mleader', 'cad-rail-blocks', 'cad-rail-selection']) {
    await expect(page.getByTestId(id), `${id} no se pinta en Esencial`).toHaveCount(0);
  }

  // Lo que se queda: coordenadas, escala, guardado, «Más», reportar, línea de comandos.
  for (const id of [
    'cad-cursor-coordinate',
    'cad-save-status',
    'cad-status-annotation-scale',
    'cad-status-overflow-trigger',
    'cad-incident-open',
    'cad-command-input',
  ]) {
    await expect(page.getByTestId(id), `${id} visible en Esencial`).toBeVisible();
  }

  // Las ayudas de dibujo, detrás de un solo control y con sus testids de siempre.
  await expect(page.getByTestId('cad-draft-status-osnap')).toBeHidden();
  const ayudas = page.getByTestId('cad-draft-aids-toggle');
  await expect(ayudas).toBeVisible();
  await ayudas.click();
  await expect(ayudas).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('cad-draft-status-osnap')).toBeVisible();
  await expect(page.getByTestId('cad-draft-status-otrack')).toBeVisible();
});

test('a 1366×768 Esencial conserva ≥70 % de pantalla libre y ≤30 controles', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirDemoEsencial(page, { width: 1366, height: 768 });
  const m = await medir(page);
  expect(m.error).toBeUndefined();
  expect(m.controles, `controles visibles:\n  · ${m.nombres.join('\n  · ')}`).toBeLessThanOrEqual(30);
  expect(m.pctLibreDePantalla, 'pantalla libre a 1366×768 (meta ≥ 70 %)').toBeGreaterThanOrEqual(70);
  expect(m.pctTapado, 'lienzo tapado (meta ≤ 3 %)').toBeLessThanOrEqual(3);
});
