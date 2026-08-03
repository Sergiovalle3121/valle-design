import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';

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

/**
 * Los indicadores de recuperación ("Recovery local activo" / "en riesgo") sólo
 * son ciertos MIENTRAS hay cambios sin guardar en el servidor: en cuanto el
 * guardado remoto confirma, el journal local se purga y el aviso desaparece —
 * esa semántica es la correcta y no debe volverse pegajosa.
 *
 * El backend hermético responde el PUT de forma instantánea, así que el estado
 * `dirty` se apagaba antes de que el test pudiera observar el indicador. Esto
 * retiene el guardado remoto en vuelo para reproducir de forma determinista la
 * condición real (guardado lento) bajo la que el indicador existe.
 */
async function holdRemoteSaveInFlight(page: Page) {
  // SÓLO el guardado (PUT). Sin este filtro de método el patrón también
  // capturaba el GET de carga del documento y le añadía 30 s, lo que introduce
  // flakiness en este spec y en cualquiera que comparta la ruta: retrasar algo
  // que el test no pretendía interceptar es un fallo del harness, no una
  // condición del producto.
  const holdOnlyWrites = async (route: import('@playwright/test').Route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    await route.fallback();
  };
  await page.route('**/v1/cad/documents/*/content', holdOnlyWrites);
  await page.route('**/v1/cad/documents/*/archive', holdOnlyWrites);
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
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await holdRemoteSaveInFlight(page);
  await page.goto('/legacy/studio');
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
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  // Antes esto usaba `context.newCDPSession` + `Storage.overrideQuotaForOrigin`,
  // que sólo existe en Chromium: en Firefox el test fallaba SIEMPRE por el
  // harness, no por el producto. Agotar la cuota de IndexedDB directamente
  // ejercita EXACTAMENTE la misma ruta de producto (`isQuotaError` → prune
  // agresivo → reintento → CadRecoveryQuotaError) y es determinista en todos
  // los navegadores, sin depender de heurísticas de cuota del motor.
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function quotaExhausted(
      this: IDBObjectStore,
      ...args: unknown[]
    ) {
      if (this.transaction.db.name === 'cad-recovery') {
        throw new DOMException('Simulated store quota', 'QuotaExceededError');
      }
      return (put as never as (...a: unknown[]) => IDBRequest).apply(this, args);
    } as typeof IDBObjectStore.prototype.put;
  });
  await holdRemoteSaveInFlight(page);
  await page.goto('/legacy/studio');
  await page.getByTestId('cad-native-entity-recovery-arc').click();
  const radius = page.getByTestId('cad-native-property-radius');
  await radius.fill('155');
  await radius.blur();
  await expect(page.getByText('Recovery local en riesgo')).toBeVisible({ timeout: 20_000 });
});
