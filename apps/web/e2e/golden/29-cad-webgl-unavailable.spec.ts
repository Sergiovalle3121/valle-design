import { expect, test } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';

/**
 * Regresión P0 — degradación honesta sin WebGL.
 *
 * `THREE.WebGLRenderer` LANZA cuando el navegador no concede contexto WebGL.
 * Esa excepción escapaba del efecto de ciclo de vida de la escena, tumbaba el
 * árbol React completo y el usuario perdía TODO el editor (no sólo el
 * viewport) sin ningún mensaje: pantalla vacía. Afecta a navegadores con WebGL
 * deshabilitado por política, máquinas sin GPU utilizable y perfiles
 * endurecidos — no es un caso hipotético de laboratorio.
 *
 * El contrato que fija este test: sin WebGL el viewport se degrada con un
 * aviso explícito y el resto del editor (documento, capas, propiedades,
 * guardado) sigue montado y utilizable.
 */
test('the editor degrades honestly when the browser cannot provide WebGL', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadV1Backend(context, {
    document: null,
    footprint: { footprintW: 12_000, footprintH: 8_000, unit: 'mm', gridSize: 100 },
  });

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  // Un navegador sin WebGL: `getContext` devuelve null y THREE lanza.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patched(
      this: HTMLCanvasElement,
      id: string,
      ...rest: unknown[]
    ) {
      if (id === 'webgl' || id === 'webgl2' || id === 'experimental-webgl') return null;
      return (original as never as (...a: unknown[]) => unknown).call(this, id, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });

  await page.goto('/legacy/studio');

  // 1. El editor sigue montado: el viewport existe en el DOM.
  await expect(page.getByTestId('cad-canvas')).toBeVisible();

  // 2. El usuario recibe una explicación, no una pantalla vacía.
  await expect(page.getByTestId('cad-webgl-unavailable')).toBeVisible();

  // 3. El resto del editor sigue operativo (no se perdió el documento).
  await expect(page.getByTestId('cad-save-status')).toBeVisible();

  // 4. Ninguna excepción escapó al árbol React.
  expect(pageErrors).toEqual([]);
});
