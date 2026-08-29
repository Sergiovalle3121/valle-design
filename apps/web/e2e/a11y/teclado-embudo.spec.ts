/**
 * EL PRODUCTO, SÓLO CON TECLADO.
 *
 * axe mide el marcado; esto mide el RECORRIDO. Un formulario puede tener todas
 * las etiquetas en su sitio y ser inservible sin ratón porque el foco salta, o
 * porque Escape no cierra nada, o porque un control no se alcanza tabulando.
 * Ninguna regla estática ve eso: hay que recorrerlo.
 *
 * ## El caso que motivó esta spec
 *
 * `Modal` montaba su efecto de foco con `onKeyDown` en las dependencias, y
 * `onKeyDown` dependía de `onClose`. Los consumidores pasan
 * `onClose={() => setOpen(false)}`, una función nueva en cada render, así que el
 * efecto se desmontaba y se volvía a montar en cada render del padre — y
 * montarlo mueve el foco al primer control del diálogo.
 *
 * Consecuencia real: en el diálogo de comentarios, cada tecla escrita devolvía
 * el foco al primer control. Escribir una frase era imposible. Y no en un rincón
 * cualquiera: en el único canal que el producto tiene para que alguien cuente
 * que algo se rompió.
 *
 * El primer test de aquí abajo falla con aquel código y pasa con el arreglo.
 */
import { expect, test } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installDashboardBackend } from '../fixtures/dashboard-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';

test.describe('Teclado · el embudo y los diálogos', () => {
  test.beforeEach(async ({ context }) => {
    await installMockBackend(context);
    // Con el genérico a secas el tablero recibe `[]` donde espera `{items}` y
    // se cae a la frontera de error — que también tiene un `h1`, así que el
    // fallo se disfrazaba de página cargada. Ver `dashboard-backend.ts`.
    await installDashboardBackend(context);
    await loginAsStandaloneOwner(context);
  });

  test('escribir en el diálogo de comentarios no le roba el foco al usuario', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await page.getByTestId('feedback-open').first().click();
    await expect(page.getByTestId('feedback-dialog')).toBeVisible();

    const area = page.getByLabel(/Cuéntanos con tus palabras/i);
    await area.click();

    // Se escribe TECLA A TECLA (`delay`), que es como escribe una persona y es
    // lo que destapa el remontaje: con el fallo, el foco se iba tras la primera
    // pulsación y el resto de la frase se perdía.
    const frase = 'El zoom se queda pegado al soltar el botón del ratón.';
    await page.keyboard.type(frase, { delay: 15 });

    await expect(area).toHaveValue(frase);
    await expect(area).toBeFocused();
  });

  test('Escape cierra el diálogo de comentarios y devuelve el foco a su botón', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    const boton = page.getByTestId('feedback-open').first();
    await boton.click();
    await expect(page.getByTestId('feedback-dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('feedback-dialog')).toHaveCount(0);
    // El foco vuelve a donde estaba: sin esto, quien navega con teclado
    // aparece al principio del documento y tiene que recorrer la página entera.
    await expect(boton).toBeFocused();
  });

  test('el diálogo atrapa el Tab: no se puede tabular fuera de él', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('feedback-open').first().click();
    const dialogo = page.getByTestId('feedback-dialog');
    await expect(dialogo).toBeVisible();

    // Veinte tabulaciones son más controles de los que el diálogo tiene: si el
    // foco escapa, alguna de ellas cae fuera.
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press('Tab');
      const dentro = await dialogo.evaluate(
        (nodo) => nodo.contains(document.activeElement) || nodo === document.activeElement,
      );
      expect(dentro, `la tabulación ${i + 1} sacó el foco del diálogo`).toBe(true);
    }
  });

  test('el tablero se recorre entero con Tab y el foco siempre se ve', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

    const invisibles: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const estilo = getComputedStyle(el);
        // Un anillo de foco puede venir de `outline`, de `box-shadow` (que es
        // como lo hacen las utilidades `ring-*` de Tailwind) o de un borde que
        // cambia. Se acepta cualquiera; lo que no se acepta es ninguno.
        const tieneAnillo =
          (estilo.outlineStyle !== 'none' && parseFloat(estilo.outlineWidth) > 0) ||
          (estilo.boxShadow !== 'none' && estilo.boxShadow !== '');
        return tieneAnillo
          ? null
          : `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`;
      });
      if (info) invisibles.push(info);
    }

    expect(
      invisibles,
      'estos controles reciben el foco sin ninguna señal visible de tenerlo',
    ).toEqual([]);
  });
});
