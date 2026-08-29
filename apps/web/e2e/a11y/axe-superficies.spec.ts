/**
 * Gate de accesibilidad — axe-core sobre las superficies que un cliente ve.
 *
 * ## Qué exige
 *
 * Cero violaciones **serias o críticas** en cada superficie, **en los dos
 * temas**. Las de nivel `moderate` y `minor` se listan por consola pero no
 * fallan: son útiles como deuda visible y demasiado ruidosas como puerta.
 *
 * ## Por qué los dos temas
 *
 * Casi todas las reglas de contraste de axe dependen del color computado. Un
 * componente puede cumplir en claro y no en oscuro —o al revés— porque los
 * tokens cambian de valor y no de nombre. Pasar sólo el tema por defecto deja
 * la mitad del producto sin medir. El tema se fija ANTES de la primera pintura
 * con `addInitScript` sobre `localStorage['valle_theme']`, que es la misma
 * clave que usa el script anti-flash del layout: así no hay ventana en la que
 * axe analice el tema equivocado.
 *
 * ## Por qué cada caso comprueba que está donde dice
 *
 * La primera versión esperaba a `h1, h2` y auditaba. Parece razonable y es una
 * trampa: **la pantalla de error de la aplicación también tiene un `h1`**. Un
 * fallo de render dejaba a axe auditando la pantalla de «algo se rompió» y el
 * caso pasaba en verde — el peor resultado posible, un gate que informa de que
 * una página cumple cuando esa página ni siquiera se está pintando.
 *
 * Pasó de verdad, en `/dashboard`, y lo destapó otra spec. Ahora cada caso
 * comprueba que NO está en la frontera de error y que la página no soltó
 * ningún error de JavaScript antes de medir nada.
 *
 * ## Por qué no hay lista de excepciones
 *
 * Porque una lista de excepciones es una violación que ya no se ve. Si algo
 * serio aparece, se arregla o se esconde (fix-or-hide) — no se apunta.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installDashboardBackend } from '../fixtures/dashboard-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';

type Tema = 'light' | 'dark';

/** Fija el tema antes de la primera pintura, por la misma clave que el anti-flash. */
async function fijarTema(page: Page, tema: Tema) {
  await page.addInitScript((valor) => {
    try {
      window.localStorage.setItem('valle_theme', valor);
    } catch {
      /* un navegador sin storage cae al default; el test sigue siendo válido */
    }
  }, tema);
}

/**
 * Comprueba que la página es la que se pidió y no la pantalla de error. Se llama
 * antes de auditar; sin esto, un gate verde puede significar «la pantalla de
 * error no tiene violaciones».
 */
async function asegurarQueNoEsLaPantallaDeError(page: Page, ruta: string) {
  const titular = (await page.locator("h1, h2").first().textContent()) ?? "";
  if (/se rompió|Algo salió mal|Error/i.test(titular)) {
    throw new Error(
      `La ruta ${ruta} pintó la frontera de error («${titular.trim()}»), no la página. ` +
        "Auditarla habría dado un verde que no significa nada.",
    );
  }
}

async function analizar(page: Page) {
  return new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
}

function formatear(violaciones: Awaited<ReturnType<typeof analizar>>['violations']) {
  return violaciones
    .map((v) => {
      const nodos = v.nodes
        .slice(0, 3)
        .map(
          (n) =>
            `      ${n.target.join(' ')}\n        ${n.html}\n        ${n.failureSummary?.split('\n').join('\n        ')}`,
        )
        .join('\n');
      return `  [${v.impact}] ${v.id}: ${v.help}\n    ${v.helpUrl}\n${nodos}`;
    })
    .join('\n');
}

const PUBLICAS = [
  { ruta: '/', nombre: 'landing' },
  { ruta: '/register', nombre: 'registro' },
  { ruta: '/login', nombre: 'acceso' },
  { ruta: '/precios', nombre: 'precios' },
  { ruta: '/contact', nombre: 'contacto' },
  { ruta: '/forgot-password', nombre: 'recuperar contraseña' },
  { ruta: '/docs', nombre: 'documentación' },
] as const;

const CUENTA = [
  { ruta: '/dashboard', nombre: 'tablero' },
  { ruta: '/cuenta', nombre: 'cuenta' },
] as const;

const TEMAS: Tema[] = ['light', 'dark'];

test.describe('Accesibilidad · superficies públicas', () => {
  for (const { ruta, nombre } of PUBLICAS) {
    for (const tema of TEMAS) {
      test(`${nombre} (${ruta}) en tema ${tema} no tiene violaciones serias`, async ({ page }) => {
        await fijarTema(page, tema);
        const erroresDePagina: string[] = [];
        page.on('pageerror', (e) => erroresDePagina.push(e.message));
        await page.goto(ruta);
        await page.locator('h1, h2').first().waitFor({ state: 'visible' });
        await asegurarQueNoEsLaPantallaDeError(page, ruta);
        expect(erroresDePagina, `${ruta} soltó errores de JavaScript`).toEqual([]);
        const resultado = await analizar(page);
        const graves = resultado.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical',
        );
        const leves = resultado.violations.filter(
          (v) => v.impact !== 'serious' && v.impact !== 'critical',
        );
        if (leves.length > 0) {
          console.log(`[axe] ${ruta} (${tema}) · ${leves.length} avisos no bloqueantes:\n${formatear(leves)}`);
        }
        // Se compara la LISTA DE IDS, no los objetos: el diff de `toEqual` sobre
        // el resultado crudo de axe entierra el mensaje útil bajo el volcado de
        // cada nodo. El detalle completo va en el mensaje de la aserción.
        expect(
          graves.map((v) => `${v.impact}/${v.id}`),
          `Violaciones serias en ${ruta} (${tema}):\n${formatear(graves)}`,
        ).toEqual([]);
      });
    }
  }
});

test.describe('Accesibilidad · superficies con sesión', () => {
  test.beforeEach(async ({ context }) => {
    await installMockBackend(context);
    await installDashboardBackend(context);
    await loginAsStandaloneOwner(context);
  });

  for (const { ruta, nombre } of CUENTA) {
    for (const tema of TEMAS) {
      test(`${nombre} (${ruta}) en tema ${tema} no tiene violaciones serias`, async ({ page }) => {
        await fijarTema(page, tema);
        const erroresDePagina: string[] = [];
        page.on('pageerror', (e) => erroresDePagina.push(e.message));
        await page.goto(ruta);
        await page.locator('h1, h2').first().waitFor({ state: 'visible' });
        await asegurarQueNoEsLaPantallaDeError(page, ruta);
        expect(erroresDePagina, `${ruta} soltó errores de JavaScript`).toEqual([]);
        const resultado = await analizar(page);
        const graves = resultado.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical',
        );
        const leves = resultado.violations.filter(
          (v) => v.impact !== 'serious' && v.impact !== 'critical',
        );
        if (leves.length > 0) {
          console.log(`[axe] ${ruta} (${tema}) · ${leves.length} avisos no bloqueantes:\n${formatear(leves)}`);
        }
        // Se compara la LISTA DE IDS, no los objetos: el diff de `toEqual` sobre
        // el resultado crudo de axe entierra el mensaje útil bajo el volcado de
        // cada nodo. El detalle completo va en el mensaje de la aserción.
        expect(
          graves.map((v) => `${v.impact}/${v.id}`),
          `Violaciones serias en ${ruta} (${tema}):\n${formatear(graves)}`,
        ).toEqual([]);
      });
    }
  }
});
