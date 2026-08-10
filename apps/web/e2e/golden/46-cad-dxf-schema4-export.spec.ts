import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument, CadEntity } from '../../src/lib/cad/cad-document';
import { importDxfPrimitives } from '../../src/lib/cad/dxf-import';

/**
 * Los ocho tipos del esquema 4 llegan al fichero DXF que descarga el usuario.
 *
 * La regresión de confianza que este golden impide es concreta: un dibujante
 * pone una directriz de referencia (XLINE), un enmascaramiento (WIPEOUT) y una
 * imagen de fondo, exporta para mandárselo al cliente, y llegan tres cosas
 * menos sin que nadie avise.
 *
 * Se ejecuta EN EL NAVEGADOR y contra el botón real de exportar, no contra el
 * escritor: los specs de Node ya prueban que el escritor emite los códigos
 * correctos, y lo que aquí importa es que el camino completo —documento
 * canónico cargado del backend, filtro de ámbito, preflight de pérdidas,
 * descarga— entregue el fichero con esas entidades dentro.
 */

const IMAGE_DEFINITION = {
  id: 'img-fondo',
  name: 'fondo',
  uri: 'asset://tenant/planos/fondo.png',
  pixelWidth: 1_024,
  pixelHeight: 768,
};

/** Un dibujo con los ocho tipos a la vez, en coordenadas conocidas. */
const entities: CadEntity[] = [
  { id: 'p1', type: 'point', position: { x: 1_200, y: 2_400, z: 0 }, style: 34, size: 15, layer: '0' },
  {
    id: 'x1', type: 'xline',
    basePoint: { x: 1_000, y: 2_000, z: 0 },
    direction: { x: 1, y: 0, z: 0 },
    layer: '0',
  },
  {
    id: 'r1', type: 'ray',
    basePoint: { x: 3_000, y: 4_000, z: 0 },
    direction: { x: 0, y: 1, z: 0 },
    layer: '0',
  },
  {
    id: 's1', type: 'solid',
    points: [
      { x: 1_000, y: 1_000, z: 0 },
      { x: 2_000, y: 1_000, z: 0 },
      { x: 2_000, y: 1_800, z: 0 },
      { x: 1_000, y: 1_800, z: 0 },
    ],
    layer: '0',
  },
  {
    id: 'w1', type: 'wipeout',
    boundary: [
      { x: 4_000, y: 2_000, z: 0 },
      { x: 6_000, y: 2_000, z: 0 },
      { x: 6_000, y: 3_000, z: 0 },
      { x: 4_000, y: 3_000, z: 0 },
    ],
    frame: true,
    layer: '0',
  },
  {
    id: 'i1', type: 'image',
    definition: 'img-fondo',
    insertion: { x: 7_000, y: 1_000, z: 0 },
    uVector: { x: 2, y: 0, z: 0 },
    vVector: { x: 0, y: 2, z: 0 },
    size: { width: 1_024, height: 768 },
    brightness: 60,
    layer: '0',
  },
  {
    id: 'a1', type: 'attdef',
    tag: 'MARCA',
    prompt: 'Marca del equipo',
    defaultValue: 'P-101',
    insertion: { x: 1_500, y: 5_000, z: 0 },
    height: 120,
    invisible: true,
    layer: '0',
  },
  {
    id: 't1', type: 'table',
    insertion: { x: 8_000, y: 6_000, z: 0 },
    rows: 2,
    columns: 2,
    rowHeights: [200, 200],
    columnWidths: [600, 600],
    cells: [
      { row: 0, column: 0, text: 'Ref' },
      { row: 1, column: 0, text: 'P-101' },
    ],
    layer: '0',
  },
] as unknown as CadEntity[];

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 4, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [],
    unsupportedEntities: [], lossManifest: [], publications: [],
    imageDefinitions: [IMAGE_DEFINITION],
  } as unknown as CadDocument;
}

async function openStudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
}

test('the eight schema-4 entity types reach the exported DXF file', async ({ context, page }) => {
  test.setTimeout(180_000);
  await openStudio(context, page);
  await page.getByTitle(/Exportar a DXF/).click();
  await expect(page.getByTestId('cad-dxf-download')).toBeVisible();

  await test.step('1. el preflight declara lo que el FORMATO no sabe guardar', async () => {
    // Primera pulsación: enseña el informe, no descarga. Lo que queda por
    // declarar ya no son descartes —los ocho viajan— sino degradaciones: la
    // tabla que sale como geometría y la imagen que sólo lleva su ruta.
    await page.getByTestId('cad-dxf-download').click();
    const manifest = page.getByTestId('cad-dxf-loss-manifest');
    await expect(manifest).toBeVisible();
    await expect(manifest).toHaveAttribute('data-blocking', 'false');
    const rows = page.getByTestId('cad-dxf-loss-row');
    await expect(rows.filter({ hasText: 'ACAD_TABLE' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'fondo.png' })).toHaveCount(1);
    // Ninguna de las ocho se declara ya como descartada.
    await expect(rows.filter({ hasText: /no tiene representación/ })).toHaveCount(0);
  });

  await test.step('2. el fichero descargado contiene sus códigos DXF reales', async () => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('cad-dxf-download').click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).not.toBeNull();
    const text = await readFile(path!, 'utf8');

    for (const type of ['POINT', 'XLINE', 'RAY', 'SOLID', 'WIPEOUT', 'IMAGE', 'ATTDEF']) {
      expect(text, `${type} tiene que estar en el DXF descargado`).toContain(`\n${type}\n`);
    }
    // La imagen vive en un diccionario, no suelta: sin estos tres objetos el
    // fichero tendría una IMAGE que no apunta a ningún archivo.
    expect(text).toContain('ACAD_IMAGE_DICT');
    expect(text).toContain('IMAGEDEF');
    expect(text).toContain('IMAGEDEF_REACTOR');
    expect(text).toContain('ACAD_WIPEOUT_VARS');
    // El estilo de punto es una variable del dibujo.
    expect(text).toMatch(/\$PDMODE\n70\n34\n/);
    // La tabla viaja como geometría, con el texto de sus celdas.
    expect(text).toContain('\nP-101\n');

    await test.step('3. y vuelven a entrar como los MISMOS tipos', async () => {
      const reimported = importDxfPrimitives(text);
      const kinds = new Set(reimported.primitives.map((primitive) => primitive.kind));
      for (const kind of ['point', 'xline', 'ray', 'solid', 'wipeout', 'image', 'attdef']) {
        expect(kinds.has(kind as never), `${kind} tiene que volver a entrar`).toBe(true);
      }
      const xline = reimported.primitives.find((primitive) => primitive.kind === 'xline');
      // Ancla absoluta: el punto base es el que se dibujó, no uno aproximado.
      expect(xline?.points[0]).toEqual({ x: 1_000, y: 2_000 });
      expect(reimported.imageDefinitions).toHaveLength(1);
      expect(reimported.imageDefinitions[0].uri).toBe(IMAGE_DEFINITION.uri);
    });
  });
});
