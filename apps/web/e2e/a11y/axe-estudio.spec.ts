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

/**
 * T-73(e): este gate sólo miraba `serious|critical` — `page-has-heading-one`
 * y `region` son impacto `moderate` y se colaban imprimiéndose, nunca
 * reprobando.
 *
 * `page-has-heading-one` ya está RESUELTO (no en el filtro de abajo, a
 * propósito): `CadStudioHost.tsx` — fuera del monolito — ahora envuelve todo
 * en `<main>` con un `<h1 className="sr-only">`.
 *
 * `region` sigue pendiente, y por una razón concreta que ese mismo `<main>`
 * NO alcanza a tapar: `Layout3DEditor.tsx` pinta TODO su marcado con
 * `createPortal(..., document.body)` (línea ~18451, para escapar el
 * `backdrop-filter` que si no atraparía sus overlays `position:fixed` dentro
 * de su propio contenedor). Un portal de React sale del árbol del DOM aunque
 * siga dentro del árbol de React — así que el `<main>` de `CadStudioHost`
 * envuelve el `<h1>` y las capas de colaboración, pero NO el editor
 * portado, que queda pintado como hijo directo de `<body>`, fuera de
 * cualquier landmark. Arreglo real: que el portal apunte a un contenedor
 * que YA sea (o esté dentro de) un landmark, en vez de a `document.body` a
 * secas — cambiar el segundo argumento de ese `createPortal` es una línea,
 * pero esa línea vive en el monolito. Petición P-07 en
 * `docs/history/execution/frentes-lunes-20260906/F9-peticiones.md`, con el diff exacto.
 *
 * Hasta que esa petición se aplique, contar `region` como grave pondría
 * este gate en rojo por algo que no puedo arreglar yo mismo, y el
 * fix-or-hide de la campaña es «arréglalo o escóndelo», no «rompe el CI de
 * quien no lo puede arreglar». Es UNA excepción nombrada, con su arreglo ya
 * escrito, no una lista que crece — el resto de `moderate` YA reprueba, y
 * es ESE resto el trinquete real de este cambio.
 */
const MODERADAS_PENDIENTES_DE_PETICION = new Set(['region']);

async function auditar(page: Page, etiqueta: string) {
  const resultado = await new AxeBuilder({ page }).analyze();
  const graves = resultado.violations.filter(
    (violation) =>
      violation.impact === 'serious' ||
      violation.impact === 'critical' ||
      (violation.impact === 'moderate' && !MODERADAS_PENDIENTES_DE_PETICION.has(violation.id)),
  );
  const leves = resultado.violations.filter(
    (violation) =>
      violation.impact === 'minor' ||
      (violation.impact === 'moderate' && MODERADAS_PENDIENTES_DE_PETICION.has(violation.id)),
  );
  if (leves.length > 0) {
    // Con el `target` de un par de nodos por aviso, un «region» suelto deja
    // de ser una etiqueta muda: dice EXACTAMENTE qué elemento quedó fuera de
    // landmark, que es lo que hizo falta para diagnosticar el portal de
    // arriba en minutos y no adivinando.
    const detalle = leves
      .map((violation) => {
        const nodos = violation.nodes
          .slice(0, 3)
          .map((node) => node.target.join(' '))
          .join(' || ');
        return `${violation.id} [${nodos}]`;
      })
      .join(', ');
    console.log(`[axe-estudio] ${etiqueta} · ${leves.length} avisos no bloqueantes: ${detalle}`);
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
