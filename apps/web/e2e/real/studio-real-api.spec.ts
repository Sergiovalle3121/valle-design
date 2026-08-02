/**
 * E2E FULL-STACK REAL (R3): /studio contra la API v1 de Valle Design SIN
 * interceptar NINGÚN endpoint — el navegador habla con el NestJS real (R1),
 * autenticado con un JWT de Platform FIRMADO con el secreto compartido.
 *
 * Requisitos para correr (por eso el gate E2E_REAL_API=1):
 *  - API real escuchando en E2E_API_ORIGIN (default http://localhost:4000)
 *    con el secreto dev (o E2E_API_JWT_SECRET) y ENTITLEMENTS_MODE=allow-all.
 *  - El web build apuntando NEXT_PUBLIC_API_URL a ese MISMO origen.
 *
 * Cubre el flujo que los goldens moquean:
 *  1. apertura real (resolución model+revision → documento hidratado),
 *     edición en el editor y guardado CAS por el navegador;
 *  2. HIDRATACIÓN R3 de documentos >1MB: el corpus viaja al blob store
 *     (storedAsBlobPointer) y el navegador lo recibe COMPLETO al abrir;
 *  3. el 409 contractual con un escritor desfasado.
 */

import { expect, test, type APIRequestContext } from '@playwright/test';
import { loginAsMasterReal, signedPlatformJwt } from '../fixtures/session';
import { API_ORIGIN } from '../fixtures/constants';

const MODEL = 'AXOS-CAD-STUDIO';
const REVISION = 'UNIVERSAL';

test.describe.configure({ mode: 'serial' });
test.skip(process.env.E2E_REAL_API !== '1', 'Corre con E2E_REAL_API=1 (API real arrancada).');

interface DocumentSummary {
  id: string;
  model: string | null;
  revision: string | null;
  cadDocumentVersion: number;
}

function baseDocument(radius = 120) {
  return {
    meta: {
      version: 1,
      schema: 3,
      unit: 'mm',
      footprintW: 12_000,
      footprintH: 10_000,
      gridSize: 100,
    },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      { id: 'REAL', name: 'REAL', color: '#60a5fa', visible: true, locked: false },
    ],
    entities: [
      {
        id: 'real-arc',
        type: 'arc',
        center: { x: 4_000, y: 3_000, z: 0 },
        radius,
        startAngle: 0,
        endAngle: 180,
        layer: 'REAL',
      },
    ],
    history: [],
    modelSpace: { entityIds: ['real-arc'] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

/** Corpus real >1MB serializado: el servidor lo persiste como blob gzip. */
function largeDocument(entityCount = 12_000) {
  const entities = Array.from({ length: entityCount }, (_, index) => ({
    id: `bulk-${String(index).padStart(6, '0')}`,
    type: 'arc' as const,
    center: { x: (index % 1_000) * 20 + 10, y: Math.floor(index / 1_000) * 20 + 10, z: 0 },
    radius: 8,
    startAngle: 0,
    endAngle: 180,
    layer: 'REAL',
    note: `relleno-${'x'.repeat(64)}`,
  }));
  return {
    ...baseDocument(),
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  };
}

function apiHeaders() {
  return { Authorization: `Bearer ${signedPlatformJwt()}` };
}

async function resolveDocument(api: APIRequestContext): Promise<DocumentSummary> {
  const list = await api.get(`${API_ORIGIN}/v1/cad/documents?limit=200`, {
    headers: apiHeaders(),
  });
  expect(list.ok()).toBe(true);
  const { items } = (await list.json()) as { items: DocumentSummary[] };
  const existing = items.find(
    (item) => item.model === MODEL && (item.revision ?? 'A') === REVISION,
  );
  if (existing) return existing;
  const created = await api.post(`${API_ORIGIN}/v1/cad/documents`, {
    headers: apiHeaders(),
    data: { name: MODEL, model: MODEL, revision: REVISION },
  });
  expect(created.status()).toBe(201);
  return (await created.json()) as DocumentSummary;
}

async function currentVersion(api: APIRequestContext, id: string): Promise<number> {
  const res = await api.get(`${API_ORIGIN}/v1/cad/documents/${id}`, {
    headers: apiHeaders(),
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { cadDocumentVersion: number }).cadDocumentVersion;
}

async function putContent(
  api: APIRequestContext,
  id: string,
  cadDocument: unknown,
  expected: number,
) {
  return api.put(`${API_ORIGIN}/v1/cad/documents/${id}/content`, {
    headers: apiHeaders(),
    data: { cadDocument, expectedCadDocumentVersion: expected },
  });
}

test('abre, edita y guarda contra la API real; un escritor desfasado recibe el 409 contractual', async ({ context, page, request }) => {
  test.setTimeout(180_000);
  const doc = await resolveDocument(request);

  // Estado inicial determinista (la BD real puede traer contenido previo).
  const seeded = await putContent(request, doc.id, baseDocument(), await currentVersion(request, doc.id));
  expect(seeded.ok()).toBe(true);
  const seededVersion = ((await seeded.json()) as { cadDocumentVersion: number }).cadDocumentVersion;

  await loginAsMasterReal(context);
  await page.goto('/studio');

  // Apertura REAL: el documento llega por la superficie v1 sin ningún mock.
  await page.getByTestId('cad-native-entity-real-arc').click();
  const radius = page.getByTestId('cad-native-property-radius');
  await expect(radius).toHaveValue('120');
  await radius.fill('140');
  await radius.blur();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();

  // El guardado del navegador avanzó el CAS y persistió la edición.
  await expect
    .poll(() => currentVersion(request, doc.id), { timeout: 30_000 })
    .toBe(seededVersion + 1);
  const opened = await request.get(`${API_ORIGIN}/v1/cad/documents/${doc.id}`, {
    headers: apiHeaders(),
  });
  const body = (await opened.json()) as {
    cadDocument: { entities: Array<{ id: string; radius?: number }> };
  };
  expect(body.cadDocument.entities.find((entity) => entity.id === 'real-arc')?.radius).toBe(140);

  // Escritor desfasado → 409 contractual (expected/current al nivel superior).
  const stale = await putContent(request, doc.id, baseDocument(150), seededVersion);
  expect(stale.status()).toBe(409);
  const conflict = (await stale.json()) as Record<string, unknown>;
  expect(conflict.code).toBe('cad_document_version_conflict');
  expect(conflict.expected).toBe(seededVersion);
  expect(conflict.current).toBe(seededVersion + 1);
});

test('hidratación R3: un documento real >1MB va al blob store y el navegador lo abre COMPLETO', async ({ context, page, request }) => {
  test.setTimeout(240_000);
  const doc = await resolveDocument(request);
  const corpus = largeDocument();
  expect(Buffer.byteLength(JSON.stringify(corpus), 'utf8')).toBeGreaterThan(1_000_000);

  const saved = await putContent(request, doc.id, corpus, await currentVersion(request, doc.id));
  expect(saved.ok()).toBe(true);
  const savedBody = (await saved.json()) as {
    cadDocumentVersion: number;
    storedAsBlobPointer: boolean;
    entityCount: number;
  };
  // >1MB ⇒ el servidor decidió puntero a blob (gzip en design_blobs).
  expect(savedBody.storedAsBlobPointer).toBe(true);
  expect(savedBody.entityCount).toBe(12_000);

  await loginAsMasterReal(context);
  await page.goto('/studio');

  // ANTES de R3 esta apertura era un 502 (puntero sin hidratar). Ahora el
  // navegador recibe el documento completo desde el blob store.
  const stats = page.getByTestId('cad-native-render-stats');
  await expect(stats).toHaveAttribute('data-total', String(12_000), { timeout: 120_000 });

  // Edición sobre el corpus grande + guardado del navegador (CAS otra vez).
  await page.getByTitle(/Selecci.n profesional/).click();
  const palette = page.getByTestId('cad-selection-palette');
  await palette.getByTestId('cad-quick-select-text').fill('bulk-011999');
  await palette.getByTestId('cad-quick-select-apply').click();
  await expect(page.getByTestId('cad-selection-count')).toHaveText('1 seleccionados');
  await page.getByTitle(/Selecci.n profesional/).click();
  await expect(page.getByTestId('cad-native-properties')).toContainText('bulk-011999');
  const radius = page.getByTestId('cad-native-property-radius');
  await radius.fill('9');
  await radius.blur();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect
    .poll(() => currentVersion(request, doc.id), { timeout: 60_000 })
    .toBe(savedBody.cadDocumentVersion + 1);

  // Round-trip completo: la lectura hidratada devuelve las 12k entidades con
  // la edición del navegador aplicada.
  const reopened = await request.get(`${API_ORIGIN}/v1/cad/documents/${doc.id}`, {
    headers: apiHeaders(),
  });
  const reopenedBody = (await reopened.json()) as {
    cadDocument: { entities: Array<{ id: string; radius?: number }>; _storage?: unknown };
  };
  expect(reopenedBody.cadDocument._storage).toBeUndefined();
  expect(reopenedBody.cadDocument.entities).toHaveLength(12_000);
  expect(
    reopenedBody.cadDocument.entities.find((entity) => entity.id === 'bulk-011999')?.radius,
  ).toBe(9);
});
