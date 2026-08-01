import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CadDocumentsService } from './cad-documents.service';
import {
  encodeCadDocumentArchive,
  isStoredCadDocumentBlobPointer,
} from './cad-document-storage';
import type { CadBlobStore } from './ports/cad-blob-store.port';

// Documento v3 mínimo y válido; `extra` permite inflarlo o adjuntar campos.
const documentOf = (extra: Record<string, unknown> = {}) => ({
  meta: { version: 1, schema: 3, unit: 'mm' },
  entities: [
    {
      id: 'line-1',
      type: 'line',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1000, y: 0, z: 0 },
      layer: 'A-WALL',
    },
  ],
  ...extra,
});

function memoryBlobStore(): CadBlobStore {
  const blobs = new Map<string, { data: Buffer; sha256: string }>();
  return {
    async put(data, sha256) {
      const blobKey = `blob-${sha256}`;
      blobs.set(blobKey, { data: Buffer.from(data), sha256 });
      return { blobKey, sha256, size: data.length };
    },
    async get(blobKey) {
      const blob = blobs.get(blobKey);
      if (!blob) throw new Error('missing test blob');
      return Buffer.from(blob.data);
    },
  };
}

describe('CadDocumentsService (dominio del documento canónico, WP2b)', () => {
  it('keeps compact documents inline but requires the blob store for archives', async () => {
    const withoutStore = new CadDocumentsService();
    const document = documentOf();
    // Compacto → inline: no necesita blob store.
    await expect(withoutStore.storeCadDocument(document)).resolves.toEqual(
      document,
    );
    // Forzar archivo sin almacenamiento disponible → 503 explícito.
    await expect(
      withoutStore.storeCadDocument(document, true),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(() => withoutStore.requireCadBlobs()).toThrow(
      'El almacenamiento de archivos CAD no está disponible.',
    );
  });

  it('round-trips an archived document through the blob store', async () => {
    const service = new CadDocumentsService(memoryBlobStore());
    const document = documentOf({ recoveryNotes: 'x'.repeat(2_000_000) });
    const stored = await service.storeCadDocument(document, true);
    expect(isStoredCadDocumentBlobPointer(stored)).toBe(true);
    await expect(service.hydrateCadDocument(stored)).resolves.toEqual(document);
    // Restaurar desde un snapshot conserva el formato en que vivía.
    const restoredPointer = await service.restoreStoredCadDocument(stored);
    expect(isStoredCadDocumentBlobPointer(restoredPointer)).toBe(true);
    await expect(service.hydrateCadDocument(restoredPointer)).resolves.toEqual(
      document,
    );
    const inline = documentOf();
    await expect(service.restoreStoredCadDocument(inline)).resolves.toEqual(
      inline,
    );
  });

  it('rejects a blob store that does not confirm archive integrity', async () => {
    const lyingStore = {
      ...memoryBlobStore(),
      async put(data: Buffer) {
        return {
          blobKey: 'blob-liar',
          sha256: 'f'.repeat(64), // no coincide con el sha real del archivo
          size: data.length,
        };
      },
    } as CadBlobStore;
    const service = new CadDocumentsService(lyingStore);
    await expect(service.storeCadDocument(documentOf(), true)).rejects.toThrow(
      'El almacenamiento CAD no confirmó la integridad del archivo.',
    );
  });

  it('requires the concurrency token and rejects stale writers on a new document', async () => {
    const service = new CadDocumentsService();
    await expect(
      service.prepareCadDocumentSave({
        document: documentOf(),
        storedDocument: null,
        currentVersion: 0,
        isNewDocument: true,
      }),
    ).rejects.toMatchObject({
      response: { code: 'cad_document_version_required' },
    });
    await expect(
      service.prepareCadDocumentSave({
        document: documentOf(),
        expectedVersion: 3,
        storedDocument: null,
        currentVersion: 0,
        isNewDocument: true,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'cad_document_version_conflict',
        expected: 3,
        current: 0,
      },
    });
    const plan = await service.prepareCadDocumentSave({
      document: documentOf(),
      expectedVersion: 0,
      storedDocument: null,
      currentVersion: 0,
      isNewDocument: true,
    });
    expect(plan).toMatchObject({
      expectedVersion: 0,
      storedAsBlobPointer: false,
      entityCount: 1,
    });
  });

  it('pins server-managed publication receipts to what is persisted', async () => {
    const service = new CadDocumentsService();
    const receipt = {
      id: 'pub-1',
      paperSpaceIds: ['sheet-general'],
      fileName: 'set.pdf',
      sha256: 'a'.repeat(64),
      bytes: 1024,
      publishedAt: '2026-08-01T00:00:00.000Z',
      publishedBy: 'ie@test',
    };
    const persisted = documentOf({ publications: [receipt] });
    // Eco exacto del escritor vigente → pasa y el plan fija la lista leída.
    const plan = await service.prepareCadDocumentSave({
      document: documentOf({ publications: [{ ...receipt }] }),
      expectedVersion: 1,
      storedDocument: persisted,
      currentVersion: 1,
      isNewDocument: false,
    });
    expect(plan.document.publications).toEqual([receipt]);
    // Mutación de recibos por un escritor vigente → rechazo explícito.
    await expect(
      service.prepareCadDocumentSave({
        document: documentOf({ publications: [] }),
        expectedVersion: 1,
        storedDocument: persisted,
        currentVersion: 1,
        isNewDocument: false,
      }),
    ).rejects.toMatchObject({
      response: { code: 'cad_publications_server_managed' },
    });
  });

  it('rejects duplicated, excluded or unknown sheets when publishing', async () => {
    const service = new CadDocumentsService();
    const stored = documentOf({
      history: [],
      publications: [],
      paperSpaces: [
        {
          id: 'sheet-general',
          includeInPublish: true,
          page: { width: 420, height: 297 },
        },
        {
          id: 'sheet-draft',
          includeInPublish: false,
          page: { width: 420, height: 297 },
        },
      ],
    });
    const input = {
      fileName: ' set.pdf ',
      sha256: 'B'.repeat(64),
      bytes: 2048,
      publishedBy: 'ie@test',
    };
    for (const paperSpaceIds of [
      ['sheet-general', 'sheet-general'], // duplicada
      ['sheet-draft'], // excluida de publicación
      ['sheet-ghost'], // inexistente
    ]) {
      await expect(
        service.appendCadPublication(stored, { ...input, paperSpaceIds }),
      ).rejects.toThrow('hojas duplicadas, excluidas o inexistentes');
    }
    // Camino feliz: recorta nombre, normaliza el sha y anota meta/historial.
    const { publication, storedDocument } = await service.appendCadPublication(
      stored,
      {
        ...input,
        paperSpaceIds: [' sheet-general '],
      },
    );
    expect(publication).toMatchObject({
      paperSpaceIds: ['sheet-general'],
      fileName: 'set.pdf',
      sha256: 'b'.repeat(64),
      bytes: 2048,
      publishedBy: 'ie@test',
    });
    expect(storedDocument.publications).toEqual([publication]);
    expect((storedDocument.meta as { version: number }).version).toBe(2);
    expect(storedDocument.history).toEqual([
      { version: 2, label: 'Publicar set.pdf' },
    ]);
  });

  it('applies and projects the DXF placement with clamped values', () => {
    const service = new CadDocumentsService();
    const record = {
      dxfData: 'contenido',
      dxfName: null as string | null,
      dxfOffsetX: 0,
      dxfOffsetY: 0,
      dxfScale: 2,
      dxfRotation: 0,
      dxfVisible: true,
      dxfOpacity: 0.5,
    };
    service.applyDxfMeta(record, {
      offsetX: 100,
      scale: -5, // inválida → conserva la vigente
      rotation: 45,
      visible: false,
      opacity: 2, // fuera de rango → recortada a 1
    });
    expect(record).toMatchObject({
      dxfOffsetX: 100,
      dxfScale: 2,
      dxfRotation: 45,
      dxfVisible: false,
      dxfOpacity: 1,
    });
    expect(service.toDxfPlacement(record)).toEqual({
      name: 'plano.dxf', // sin nombre → fallback
      offsetX: 100,
      offsetY: 0,
      scale: 2,
      rotation: 45,
      visible: false,
      opacity: 1,
    });
    expect(service.toDxfPlacement({ ...record, dxfData: null })).toBeNull();
  });

  it('serialises the layout onto named DXF layers with a sanitised filename', () => {
    const service = new CadDocumentsService();
    const out = service.buildLayoutDxf({
      model: 'AX 1000/η',
      revision: 'A',
      footprint: { footprintW: 10000, footprintH: 5000, unit: 'mm' },
      stations: [
        {
          id: 's1',
          station: 'EST-10',
          x: 0,
          y: 0,
          w: 200,
          h: 200,
          rotation: null,
        },
        {
          id: 's2',
          station: 'EST-20',
          x: 700,
          y: 0,
          w: 200,
          h: 200,
          rotation: 0,
        },
        // Sin colocar → fuera del plano y sin centro para el flujo.
        {
          id: 's3',
          station: 'EST-30',
          x: null,
          y: null,
          w: null,
          h: null,
          rotation: null,
        },
      ],
      assets: [
        { kind: 'wall', x: 0, y: 0, w: 10, h: 500, rotation: 0 },
        { kind: 'zone', x: 100, y: 100, w: 300, h: 300, rotation: 0 },
        {
          kind: 'rack',
          x: 500,
          y: 500,
          w: 50,
          h: 50,
          rotation: 0,
          label: 'R1',
        },
      ],
      connectors: [
        { from: 's1', to: 's2' },
        { from: 's2', to: 's3' }, // extremo sin colocar → se omite
      ],
      annotations: [
        { type: 'dim', x: 0, y: 0, x2: 1000, y2: 0 },
        { type: 'text', x: 500, y: 600, text: 'Celda A' },
      ],
    });
    expect(out.filename).toBe('layout_AX-1000-_A.dxf');
    expect(out.unit).toBe('mm');
    for (const layer of [
      'ESTACIONES',
      'MUROS',
      'ZONAS',
      'EQUIPO',
      'FLUJO',
      'COTAS',
      'TEXTO',
    ]) {
      expect(out.dxf).toContain(layer);
    }
    expect(out.dxf).toContain('EST-10');
    expect(out.dxf).toContain('Celda A');
    expect(out.dxf).not.toContain('EST-30'); // sin colocar → no se exporta
  });

  it('decodes and validates an uploaded gzip archive', async () => {
    const service = new CadDocumentsService();
    const document = documentOf();
    const archive = await encodeCadDocumentArchive(document);
    await expect(
      service.decodeCadDocumentUpload(archive.compressed),
    ).resolves.toEqual(document);
    await expect(
      service.decodeCadDocumentUpload(Buffer.from('no-gzip')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
