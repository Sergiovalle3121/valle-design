import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { loginAsMaster } from '../fixtures/session';
import { API_ORIGIN } from '../fixtures/constants';
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

async function installCadBackend(context: BrowserContext) {
  let document = canonicalDocument();
  let version = 0;
  const layout = () => ({
    model: 'AXOS-CAD-STUDIO', revision: 'UNIVERSAL',
    footprint: { footprintW: 12_000, footprintH: 9_000, unit: 'mm', gridSize: 100 },
    stations: [], dxf: null, connectors: [], assets: [], annotations: [], cells: [], layers: [],
    cadDocument: document, cadDocumentVersion: version,
    approval: { status: 'draft', by: null, at: null, note: null },
  });
  await context.route(`${API_ORIGIN}/line-engineering/layout**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname !== '/line-engineering/layout') return route.fallback();
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(layout()) });
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as { cadDocument: CadDocument; expectedCadDocumentVersion: number };
      expect(body.expectedCadDocumentVersion).toBe(version);
      document = body.cadDocument;
      version += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(layout()) });
    }
    return route.fallback();
  });
  await context.route(`${API_ORIGIN}/line-engineering/cad-blocks**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  return { snapshot: () => ({ document, version }) };
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

async function setRadius(page: Page, entityId: string, value: number) {
  const properties = page.getByTestId('cad-native-properties');
  const alreadySelected = await properties.isVisible().catch(() => false)
    && await properties.getByText(entityId, { exact: true }).isVisible().catch(() => false);
  if (!alreadySelected) {
    const deselect = page.getByRole('button', { name: 'Deseleccionar' });
    if (await deselect.isVisible().catch(() => false)) await deselect.click();
    await expect.poll(() => page.evaluate((targetId) => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes(targetId)), entityId)).toBe(true);
    const clicked = await page.evaluate((targetId) => {
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(targetId));
      button?.click();
      return !!button;
    }, entityId);
    expect(clicked).toBe(true);
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
  await loginAsMaster(context);
  const backend = await installCadBackend(context);
  await page.goto('/dashboard/cad');
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
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: testInfo.outputPath('compare-collision-review.png'), fullPage: true, scale: 'css' });

  await page.getByTestId('cad-save').click();
  await expect.poll(() => backend.snapshot().version).toBe(1);
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

  await page.goto(`/dashboard/cad?cadReview=${encodeURIComponent(reviewLink!.token)}`);
  await expect(page.getByTestId('cad-review-banner')).toBeVisible();
  await expect(page.getByTestId('cad-review-readonly')).toBeVisible();
  await expect(page.getByTestId('cad-save')).toBeDisabled();
  await expect(page.getByTestId('cad-merge-apply')).toBeDisabled();
  await expect(page.getByTestId('cad-review-add')).toBeDisabled();
});
