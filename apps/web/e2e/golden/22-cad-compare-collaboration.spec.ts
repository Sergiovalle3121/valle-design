import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      { id: 'arc-a', type: 'arc', center: { x: 3_000, y: 3_000, z: 0 }, radius: 120, startAngle: 0, endAngle: 270, layer: '0' },
      { id: 'arc-b', type: 'arc', center: { x: 7_000, y: 5_000, z: 0 }, radius: 180, startAngle: 0, endAngle: 270, layer: '0' },
    ],
    history: [], modelSpace: { entityIds: ['arc-a', 'arc-b'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

// MIGRACIÓN R3: mock en la superficie v1 real (biblioteca de bloques vacía
// incluida en el fixture). Interfaz snapshot() intacta.
async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000, footprintH: 9_000, unit: 'mm', gridSize: 100,
  });
}

async function openCollaboration(page: Page) {
  await page.getByTitle(/^Compare \/ Merge \/ Review:/).click();
  await expect(page.getByTestId('cad-collaboration-palette')).toBeVisible();
}

async function checkpoint(page: Page, label: string) {
  await page.getByTestId('cad-version-label').fill(label);
  await page.getByTestId('cad-version-create').click();
  await expect(page.getByTestId('cad-collaboration-message')).toContainText(`Version created: ${label}`);
}

async function closeDock(page: Page) {
  await page.getByLabel('Cerrar panel profesional').click();
}

/**
 * Designa una entidad por su identificador y le cambia el radio.
 *
 * Antes buscaba el id como TEXTO —en el panel y recorriendo todos los botones
 * del documento con `page.evaluate`—, porque el estudio enseñaba
 * `cad_mt60y4ol_uzfo` tanto en la ficha como en cada fila de la lista. Desde
 * que la lista y la ficha hablan en español («Arco 1»), el id vive donde
 * siempre debió estar para una prueba: en el `data-testid` de la fila, que ES
 * la identidad del objeto y no cambia cuando cambia el idioma de la interfaz.
 * La designación pasa de barrer el DOM a señalar una fila concreta.
 */
async function setRadius(page: Page, entityId: string, value: number) {
  const properties = page.getByTestId('cad-native-properties');
  const identificador = properties.locator(`[title="Identificador técnico: ${entityId}"]`);
  const alreadySelected = await properties.isVisible().catch(() => false)
    && await identificador.isVisible().catch(() => false);
  if (!alreadySelected) {
    const deselect = page.getByRole('button', { name: 'Deseleccionar' });
    if (await deselect.isVisible().catch(() => false)) await deselect.click();
    const fila = page.getByTestId(`cad-native-entity-${entityId}`);
    await expect(fila).toBeVisible();
    await fila.click();
  }
  const radius = page.getByTestId('cad-native-property-radius');
  await radius.fill(String(value));
  await radius.blur();
  await expect(radius).toHaveValue(String(value));
}

async function selectVersion(page: Page, testId: string, label: string) {
  const select = page.getByTestId(testId);
  const value = await select.locator('option').filter({ hasText: label }).getAttribute('value');
  expect(value).toBeTruthy();
  await select.selectOption(value!);
}

test('canonical Base/Mine/Theirs compare, collision review, comments, links and audit persist atomically', async ({ context, page }, testInfo) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByRole('button', { name: /^arc-a\s+ARC$/i })).toBeVisible();

  await openCollaboration(page);
  await checkpoint(page, 'Base');
  await closeDock(page);
  await setRadius(page, 'arc-a', 140);
  await openCollaboration(page);
  await checkpoint(page, 'Mine disjoint');
  await closeDock(page);
  await setRadius(page, 'arc-a', 120);
  await setRadius(page, 'arc-b', 200);
  await openCollaboration(page);
  await checkpoint(page, 'Theirs disjoint');
  await selectVersion(page, 'cad-merge-base', 'Base');
  await selectVersion(page, 'cad-merge-mine', 'Mine disjoint');
  await selectVersion(page, 'cad-merge-theirs', 'Theirs disjoint');
  await expect(page.getByTestId('cad-merge-summary')).toContainText('1 auto · 0 collision · 0 unresolved');
  await expect(page.getByTestId('cad-diff-selected')).toContainText('Geometry: radius');
  await page.getByTestId('cad-diff-overlay').click();
  await expect(page.getByText('Highlights 2')).toBeVisible();
  await page.getByTestId('cad-merge-apply').click();
  await expect(page.getByTestId('cad-collaboration-message')).toContainText('Three-way merge applied');

  await checkpoint(page, 'Merged base');
  await closeDock(page);
  await setRadius(page, 'arc-a', 150);
  await openCollaboration(page);
  await checkpoint(page, 'Mine collision');
  await closeDock(page);
  await setRadius(page, 'arc-a', 175);
  await openCollaboration(page);
  await checkpoint(page, 'Theirs collision');
  await selectVersion(page, 'cad-merge-base', 'Merged base');
  await selectVersion(page, 'cad-merge-mine', 'Mine collision');
  await selectVersion(page, 'cad-merge-theirs', 'Theirs collision');
  await expect(page.getByTestId('cad-merge-summary')).toContainText('0 auto · 1 collision · 1 unresolved');
  await expect(page.getByTestId('cad-merge-apply')).toBeDisabled();
  const conflict = page.getByTestId('cad-merge-conflict-arc-a');
  await conflict.getByRole('button', { name: 'Keep mine' }).click();
  await expect(page.getByTestId('cad-merge-summary')).toContainText('0 unresolved');
  await conflict.getByRole('button', { name: 'Reject / reset' }).click();
  await expect(page.getByTestId('cad-merge-apply')).toBeDisabled();
  await conflict.locator('textarea').fill(JSON.stringify({
    id: 'arc-a', type: 'arc', center: { x: 3_000, y: 3_000, z: 0 }, radius: 165,
    startAngle: 0, endAngle: 270, layer: '0',
  }));
  await conflict.getByRole('button', { name: 'Stage manual merge' }).click();
  await expect(page.getByTestId('cad-collaboration-message')).toContainText('Manual resolution staged');
  await conflict.getByRole('button', { name: 'Keep theirs' }).click();
  await page.getByTestId('cad-merge-apply').click();

  await page.getByTestId('cad-review-comment').fill('Verify the revised arc against the redline.');
  await page.getByPlaceholder('Assign to').fill('qa@example.com');
  await page.getByTestId('cad-review-markup').selectOption('arrow');
  await page.getByTestId('cad-review-add').click();
  await expect(page.getByRole('paragraph').filter({ hasText: 'Verify the revised arc against the redline.' })).toBeVisible();
  await page.getByRole('button', { name: 'Resolve' }).click();
  await page.getByTestId('cad-review-link-create').click();
  await expect(page.getByTestId('cad-collaboration-message')).toContainText('Read-only review link created');
  // El token lo emite el SERVIDOR y sólo aparece una vez, en la UI.
  await expect(page.getByTestId('cad-review-token-once')).toBeVisible();
  const shareToken = (await page.getByTestId('cad-review-token-value').textContent())?.trim() ?? '';
  expect(shareToken).toMatch(/^vdrl_/);
  expect(backend.backend.reviewSessions).toHaveLength(1);
  expect(backend.backend.reviewSessions[0].token).toBe(shareToken);
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: testInfo.outputPath('compare-collision-review.png'), fullPage: true, scale: 'css' });

  // El recorrido de comparación/revisión incluye esperas propias de varios
  // segundos, así que el autosave persiste parte del lote de forma legítima.
  // Se confirma que no queda trabajo pendiente y se afirma el CONTENIDO.
  await saveAndSettle(page, backend);
  const stored = backend.snapshot().document;
  const storedArcA = stored.entities.find((entity) => entity.id === 'arc-a');
  const storedArcB = stored.entities.find((entity) => entity.id === 'arc-b');
  expect(storedArcA?.type === 'arc' ? storedArcA.radius : null).toBe(175);
  expect(storedArcB?.type === 'arc' ? storedArcB.radius : null).toBe(200);
  expect(stored.collaboration?.versions.map((version) => version.label)).toEqual(expect.arrayContaining(['Base', 'Mine disjoint', 'Theirs disjoint', 'Merged base', 'Mine collision', 'Theirs collision']));
  expect(stored.collaboration?.threads[0]).toMatchObject({ status: 'resolved', assignedTo: 'qa@example.com', markup: { kind: 'arrow' } });
  expect(stored.collaboration?.audit.some((entry) => entry.action === 'merge_applied')).toBe(true);
  const reviewLink = stored.collaboration?.reviewLinks[0];
  expect(reviewLink?.readOnly).toBe(true);
  // El documento GUARDADO referencia la sesión server-owned y NO contiene
  // credencial alguna: ni el token emitido ni ninguna clave `token`.
  expect(reviewLink?.id).toBe(backend.backend.reviewSessions[0].id);
  expect(reviewLink && 'token' in reviewLink).toBe(false);
  expect(JSON.stringify(stored)).not.toContain(shareToken);
  expect(JSON.stringify(stored)).not.toContain('"token"');

  // El enlace compartible lleva el token en el FRAGMENTO (jamás en la query:
  // no viaja al servidor ni queda en Referer/logs) y el editor lo canjea
  // contra `/v1/cad/review/context` con la cabecera `X-Review-Token`.
  // El invitado abre el enlace en una PESTAÑA NUEVA, que es el flujo real:
  // navegar por fragmento dentro de la misma página no recarga la aplicación.
  // `/studio` a secas es un redirect a `/dashboard` desde que dejó de abrir el
  // documento sentinel, así que el fragmento nunca llegaba a montar el editor.
  // El invitado abre la MISMA superficie de edición que el propietario.
  const guest = await context.newPage();
  await guest.goto(`/studio/00000000-0000-4000-8000-000000000001#cadReview=${encodeURIComponent(shareToken)}`);
  await expect(guest.getByTestId('cad-review-banner')).toBeVisible();
  await expect(guest.getByTestId('cad-review-readonly')).toBeVisible();
  await expect(guest.getByTestId('cad-save')).toBeDisabled();
  await expect(guest.getByTestId('cad-merge-apply')).toBeDisabled();
  await expect(guest.getByTestId('cad-review-add')).toBeDisabled();
  // El token no sobrevive en la barra de direcciones.
  expect(guest.url()).not.toContain(shareToken);
  expect(page.url()).not.toContain('cadReview');
  await guest.close();

  // Revocar en el servidor mata el enlace: el mismo token ya no abre nada,
  // ni siquiera en una pestaña limpia.
  backend.backend.reviewSessions[0].status = 'closed';
  backend.backend.reviewSessions[0].revokedAt = new Date().toISOString();
  // Deliberadamente por el marcador legacy: comprueba de paso que la
  // resolución `/legacy/studio` → `/studio/:id` REENVÍA el fragmento. Antes lo
  // descartaba, así que este caso pasaba por accidente (sin token no hay canje
  // posible); ahora el token llega de verdad y es la REVOCACIÓN la que lo tumba.
  const revoked = await context.newPage();
  await revoked.goto(`/legacy/studio#cadReview=${encodeURIComponent(shareToken)}`);
  await expect(revoked.getByRole('button', { name: /^arc-a\s+ARC$/i })).toBeVisible();
  await expect(revoked.getByTestId('cad-review-banner')).toHaveCount(0);
  await revoked.close();
});
