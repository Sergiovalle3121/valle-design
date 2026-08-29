/**
 * Gate de accesibilidad DEL ESTUDIO — axe-core sobre el editor de verdad.
 *
 * El gate público (`axe-superficies`) cubre el embudo y la cuenta; el editor
 * quedaba sin medir, y es donde el usuario pasa las horas. Se audita en /demo
 * a propósito: es el MISMO editor (mismo bundle, mismas paletas) sin exigir
 * sesión ni backend simulado — el gate corre contra `next start` pelado.
 *
 * Superficies: el editor recién abierto y el overlay de atajos (que monta el
 * `CadDialogShell` común de los cuadros — auditar uno audita el marco de los
 * ocho). Ambos temas, como en el gate público. Misma regla de la casa: cero
 * violaciones serias/críticas y NINGUNA lista de excepciones — lo serio se
 * arregla o se esconde, no se apunta.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const TEMAS = ['light', 'dark'] as const;

function fijarTema(page: Page, tema: (typeof TEMAS)[number]) {
  return page.addInitScript((valor) => {
    window.localStorage.setItem('valle_theme', valor);
  }, tema);
}

async function auditar(page: Page, etiqueta: string) {
  const resultado = await new AxeBuilder({ page }).analyze();
  const graves = resultado.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  const leves = resultado.violations.filter(
    (violation) => violation.impact === 'moderate' || violation.impact === 'minor',
  );
  if (leves.length > 0) {
    console.log(
      `[axe-estudio] ${etiqueta} · ${leves.length} avisos no bloqueantes: ${leves
        .map((violation) => violation.id)
        .join(', ')}`,
    );
  }
  expect(
    graves.map((violation) => `${violation.impact}/${violation.id}: ${violation.nodes
      .slice(0, 2)
      .map((node) => node.target.join(' '))
      .join(' | ')}`),
    `Violaciones serias en ${etiqueta}`,
  ).toEqual([]);
}

for (const tema of TEMAS) {
  test(`el estudio (${tema}) no tiene violaciones serias — editor y overlay de atajos`, async ({
    page,
  }) => {
    await fijarTema(page, tema);
    await page.goto('/demo');
    await expect(page.getByTestId('cad-native-entity-list')).toBeVisible({
      timeout: 60_000,
    });
    await auditar(page, `editor (${tema})`);

    // El overlay de atajos monta el CadDialogShell común: trampa de foco,
    // aria-modal y título anunciado. Auditarlo audita el marco de los ocho
    // cuadros del estudio.
    await page.getByTitle('Atajos y ayuda (?)').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await auditar(page, `overlay de atajos (${tema})`);

    // La trampa de foco del marco, comprobada de verdad: el foco arranca
    // dentro del cuadro y Tab NUNCA lo saca.
    const dentro = () =>
      page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        return Boolean(dialog && dialog.contains(document.activeElement));
      });
    expect(await dentro(), 'el foco debe arrancar dentro del cuadro').toBe(true);
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      expect(await dentro(), `Tab ${i + 1}: el foco se escapó del cuadro`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}
