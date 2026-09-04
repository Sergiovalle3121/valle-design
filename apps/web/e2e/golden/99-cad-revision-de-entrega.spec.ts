import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * LA REVISIÓN DE ENTREGA — LO QUE AUTOCAD NO PUEDE HACER, EN EL SERVIDOR.
 *
 * ## Qué estaba medido
 *
 * Veintiséis nombres de revisión sondeados contra el registro COMPUESTO que usa
 * el estudio: 13 existen y son de dos clases. Los de AutoCAD miran el ARCHIVO
 * (`AUDIT`, `RECOVER`, `PURGE`) o las CAPAS (`CHECKSTANDARDS`, `LAYTRANS`); los
 * de esta campaña miran UNA disciplina cada uno (`AECHECK`, `PIDLIST`,
 * `UPDATEFIELD`…). `REVISA`, `ENTREGA`, `PREFLIGHT`, `QAQC`, `VALIDATE` y ocho
 * más: cero. Nadie pasaba el plano ENTERO por todos sus filtros de una vez.
 *
 * ## Qué fija este golden
 *
 * Un plano sucio en DOS disciplinas a la vez —un circuito cuya protección no
 * cabe en su conductor y un área escrita que dejó de ser cierta cuando
 * agrandaron el local— y una sola orden que encuentra las dos:
 *
 * - `REVISA` dice el veredicto primero y **qué miró** antes que qué encontró:
 *   un informe que no dice lo que miró se lee como un certificado;
 * - clasifica por a quién le toca: lo que **BLOQUEA** lo arregla el proyectista
 *   antes de firmar, el **aviso** lo decide la ingeniería;
 * - declara las áreas que **no aplican** en vez de callarlas, que de lejos se
 *   confunde con «limpio»;
 * - y cuando los dos defectos se arreglan de verdad —con las órdenes de dominio
 *   de siempre, no con un botón de «marcar como resuelto»—, el veredicto pasa a
 *   entregable **sin tocar el umbral**, porque lo que cambió es el dibujo. Eso
 *   se comprueba en el DOCUMENTO QUE RECIBE EL SERVIDOR: 20 A estampados en los
 *   dos conductores y 100.00 m² en el campo.
 */
const HOST_MODEL = 'AXOS-CAD-STUDIO';
const HOST_REVISION = 'UNIVERSAL';
const FOOTPRINT = { footprintW: 40_000, footprintH: 40_000, unit: 'mm', gridSize: 100 };

function planoVacio(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  } as unknown as CadDocument;
}

async function installCadBackend(context: BrowserContext) {
  const backend = new CadV1Backend([
    {
      model: HOST_MODEL, revision: HOST_REVISION, version: 0, footprint: FOOTPRINT,
      document: planoVacio() as unknown as Record<string, unknown>,
    },
  ]);
  await backend.install(context);
  return backend;
}

async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press('Enter');
}

async function enter(page: Page) {
  await page.keyboard.press('Enter');
}

test('Una sola orden revisa el plano entero antes de entregar y dice qué bloquea', async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  const skip = page.getByTestId('cad-guided-tour-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();

  const log = page.getByTestId('cad-command-line-log');

  // ---- a. Un local de 5 × 5 m con su área escrita ------------------------
  await type(page, 'RECTANG');
  await type(page, '0,0');
  await type(page, '5000,5000');

  await page.getByTitle(/Selección profesional/).click();
  const palette = page.getByTestId('cad-selection-palette');
  await expect(palette).toBeVisible();
  await palette.getByLabel('Filtrar por tipo').selectOption('polyline');
  await page.getByTestId('cad-quick-select-apply').click();
  await expect(page.getByTestId('cad-selection-count')).toHaveText('1 seleccionados');

  await type(page, 'FIELD');
  await type(page, 'Área');
  await type(page, '2500,2500');
  await expect(log, 'el campo nace con su valor puesto').toContainText(/FIELD: Area = 25\.00 m²/);

  // Agrandan el local al doble. Nadie vuelve a mirar el número escrito.
  await type(page, 'SCALE');
  await type(page, '0,0');
  await type(page, '2');
  await palette.getByRole('button', { name: 'Limpiar' }).click();
  await expect(page.getByTestId('cad-selection-count')).toHaveText('0 seleccionados');

  // ---- b. Un ramal con la protección equivocada --------------------------
  // 30 m de 12 AWG: la caída ya se pasa, y una protección de 30 A además no
  // cabe en el conductor (Art. 240-4(D)).
  await type(page, 'AEWIRE');
  await type(page, 'C-1');
  await type(page, '12');
  await type(page, '0,10000');
  await type(page, '15000,10000');
  await enter(page);
  await type(page, 'AEWIRE');
  await type(page, 'C-1');
  await type(page, '12');
  await type(page, '15000,10000');
  await type(page, '15000,25000');
  await enter(page);
  await type(page, 'AECIRCUIT');
  await type(page, 'C-1');
  await type(page, '30');
  await type(page, '127');
  await type(page, 'M');
  await expect(log, 'los dos conductores quedan marcados de una vez').toContainText(
    /AECIRCUIT: C-1 a 30 A, 127 V, monofásico — 2 conductor\(es\)/,
  );

  // ---- c. UNA orden encuentra los dos defectos ---------------------------
  await type(page, 'REVISA');
  await expect(log, 'el veredicto va primero: es el único renglón que se lee con prisa').toContainText(
    /REVISA — NO ENTREGABLE: 2 hallazgo\(s\)/,
  );
  await expect(log, 'y dice QUÉ MIRÓ antes que qué encontró, con lo que contó en cada área').toContainText(
    /Revisado: Eléctrico: 2 conductor\(es\) en 1 circuito\(s\)/,
  );
  await expect(log, 'las áreas que no aplican se declaran, no se callan').toContainText(
    /No aplica: Planta/,
  );
  await expect(log, 'el defecto eléctrico BLOQUEA y cita el artículo, para poder cotejarlo').toContainText(
    /BLOQUEA · Eléctrico: Circuito C-1: .*240-4\(D\)/,
  );
  await expect(log, 'y el área que dejó de ser cierta BLOQUEA también, diciendo cómo se arregla').toContainText(
    /BLOQUEA · Campos: 1 campo\(s\) desfasados.*UPDATEFIELD/,
  );
  await expect(log, 'el límite va SIEMPRE: una revisión que no dice lo que NO mira es un certificado').toContainText(
    /no mira la integridad del archivo \(para eso está AUDIT\)/,
  );

  // ---- d. Se arreglan de verdad, con las órdenes de dominio de siempre ----
  await type(page, 'AECIRCUIT');
  await type(page, 'C-1');
  await type(page, '20');
  await type(page, '127');
  await type(page, 'M');
  await type(page, 'UPDATEFIELD');
  await expect(log, 'el campo se entera del cambio').toContainText(
    /UPDATEFIELD — 1 campo\(s\) actualizado\(s\)/,
  );

  await type(page, 'REVISA');
  await expect(
    log,
    'ya se puede entregar, y lo que queda es de la ingeniería: la caída sigue alta y esa decisión no es del revisor',
  ).toContainText(/REVISA — ENTREGABLE CON 1 AVISO\(S\)/);
  await expect(log, 'el aviso dice de qué va, no sólo que existe').toContainText(
    /aviso · Eléctrico: Circuito C-1: .*caída/,
  );

  // ---- e. En el DOCUMENTO QUE RECIBE EL SERVIDOR -------------------------
  await saveAndSettle(page, {
    snapshot: () => ({ version: backend.snapshotFor(HOST_MODEL, HOST_REVISION).version }),
  });
  const guardado = backend.snapshotFor(HOST_MODEL, HOST_REVISION).document as unknown as CadDocument;

  const conductores = guardado.entities.filter(
    (entidad) => entidad.context?.metadata?.['ie:circuito'] === 'C-1',
  );
  expect(conductores.length, 'los dos conductores viajan en el documento canónico').toBe(2);
  expect(
    conductores.every((cable) => cable.context!.metadata!['ie:proteccion'] === '20'),
    'con la protección corregida estampada en los DOS, no sólo en un renglón del registro',
  ).toBe(true);

  const campo = guardado.entities.find(
    (entidad) => typeof entidad.context?.metadata?.campo === 'string',
  ) as Extract<CadDocument['entities'][number], { type: 'mtext' }> | undefined;
  expect(campo, 'el campo viaja con su expresión en los metadatos').toBeTruthy();
  expect(campo!.text, 'y con el valor al día, que es lo que se imprime').toBe('100.00 m²');

  // Ninguna entidad ni campo nuevo: la revisión LEE, no escribe.
  expect(
    guardado.entities.some((entidad) => entidad.context?.metadata?.['revisa'] !== undefined),
    'REVISA no deja rastro en el dibujo: una revisión que modifica lo que revisa no se puede repetir',
  ).toBe(false);
});
