import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsMaster } from '../fixtures/session';
import { BASE_URL } from '../fixtures/constants';

function layoutResponse() {
  const cadDocument = {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      { id: 'CURVES', name: 'CURVES', color: '#60a5fa', visible: true, locked: false },
    ],
    entities: [{
      id: 'recovery-arc',
      type: 'arc',
      center: { x: 4_000, y: 3_000, z: 0 },
      radius: 120,
      startAngle: 0,
      endAngle: 180,
      layer: 'CURVES',
    }],
    history: [],
    modelSpace: { entityIds: ['recovery-arc'] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
  };
  return cadDocument;
}

// MIGRACIÓN R3: mock en la superficie v1 real (el adaptador R2 reescribe las
// rutas legacy antes de tocar la red). Mismo documento y huella del origen.
async function installCadBackend(context: BrowserContext) {
  await installCadV1Backend(context, {
    document: layoutResponse(),
    footprint: { footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100 },
  });
}

interface JournalEvidence {
  count: number;
  sequences: number[];
  latest: {
    format: string;
    encoder: string;
    storedBytes: number;
    uncompressedBytes: number;
    payloadBytes: number;
    hasInlineDocument: boolean;
  } | null;
}

async function readJournal(page: Page): Promise<JournalEvidence> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('cad-recovery', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction('journal', 'readonly');
      const records = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const request = transaction.objectStore('journal').getAll();
        request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
        request.onerror = () => reject(request.error);
      });
      records.sort((left, right) => Number(left.journalSequence) - Number(right.journalSequence));
      const latest = records.at(-1);
      const payload = latest?.payload instanceof Blob ? latest.payload : null;
      return {
        count: records.length,
        sequences: records.map((record) => Number(record.journalSequence)),
        latest: latest ? {
          format: String(latest.format),
          encoder: String(latest.encoder),
          storedBytes: Number(latest.storedBytes),
          uncompressedBytes: Number(latest.uncompressedBytes),
          payloadBytes: payload?.size ?? 0,
          hasInlineDocument: Object.hasOwn(latest, 'document'),
        } : null,
      };
    } finally {
      database.close();
    }
  });
}

async function forceVisibilityCheckpoint(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
}

test('CAD recovery uses compressed IndexedDB journal and restores the newest checkpoint', async ({ context, page }) => {
  test.setTimeout(90_000);
  await installMockBackend(context);
  await loginAsMaster(context);
  await installCadBackend(context);
  await page.goto('/studio');
  await page.getByTestId('cad-native-entity-recovery-arc').click();
  const radius = page.getByTestId('cad-native-property-radius');
  await radius.fill('141');
  await radius.blur();
  await expect(page.getByText('Recovery local activo')).toBeVisible({ timeout: 20_000 });

  for (const [index, value] of ['142', '143', '144'].entries()) {
    await radius.fill(value);
    await radius.blur();
    await forceVisibilityCheckpoint(page);
    await expect.poll(async () => (await readJournal(page)).sequences.at(-1), {
      timeout: 15_000,
    }).toBe(index + 2);
  }

  const journal = await readJournal(page);
  expect(journal.count).toBe(3);
  expect(journal.sequences).toEqual([2, 3, 4]);
  expect(journal.latest?.format).toMatch(/^(gzip-json|json)$/);
  expect(journal.latest?.encoder).toBe('worker');
  expect(journal.latest?.payloadBytes).toBe(journal.latest?.storedBytes);
  expect(journal.latest?.uncompressedBytes).toBeGreaterThan(0);
  expect(journal.latest?.hasInlineDocument).toBe(false);

  await page.reload();
  await expect(page.getByText('Borrador local recuperable')).toBeVisible({ timeout: 30_000 });
  // beforeunload may append one final checkpoint immediately before reload.
  await expect(page.getByText(/Journal #[45]/)).toBeVisible();
  await page.getByRole('button', { name: 'Restaurar', exact: true }).click();
  await page.getByTestId('cad-native-entity-recovery-arc').click();
  await expect(page.getByTestId('cad-native-property-radius')).toHaveValue('144');
});

test('CAD recovery surfaces exhausted browser quota', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsMaster(context);
  await installCadBackend(context);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Storage.overrideQuotaForOrigin', {
    origin: new URL(BASE_URL).origin,
    quotaSize: 1,
  });
  await page.goto('/studio');
  await page.getByTestId('cad-native-entity-recovery-arc').click();
  const radius = page.getByTestId('cad-native-property-radius');
  await radius.fill('155');
  await radius.blur();
  await expect(page.getByText('Recovery local en riesgo')).toBeVisible({ timeout: 20_000 });
});
