import {
  planBlobAction,
  planBlockAction,
  planDocumentAction,
  rewritePointerBlobKey,
} from './import-plan';

const SHA = 'd'.repeat(64);
const pointer = (blobKey: string) => ({
  _storage: {
    kind: 'document_blob',
    version: 1,
    blobKey,
    sha256: SHA,
    encoding: 'gzip',
    compressedBytes: 10,
    uncompressedBytes: 100,
  },
  summary: { schema: 3, contentVersion: 5, entityCount: 1 },
});

describe('planDocumentAction — upsert idempotente por (tenant, legacy_source_id)', () => {
  const record = { cadDocumentVersion: 3, contentSha256: SHA };

  it('sin fila existente → insert', () => {
    expect(planDocumentAction(null, record)).toEqual({ action: 'insert' });
  });

  it('misma versión y mismo hash → skip sin_cambios (re-import = 0 duplicados)', () => {
    expect(
      planDocumentAction(
        { id: 'doc-1', cadDocumentVersion: 3, contentSha256: SHA },
        record,
      ),
    ).toEqual({ action: 'skip', targetId: 'doc-1', reason: 'sin_cambios' });
  });

  it('destino con CAS más nuevo → skip destino_mas_nuevo (jamás retrocede)', () => {
    expect(
      planDocumentAction(
        { id: 'doc-1', cadDocumentVersion: 9, contentSha256: 'x' },
        record,
      ),
    ).toEqual({
      action: 'skip',
      targetId: 'doc-1',
      reason: 'destino_mas_nuevo',
    });
  });

  it('archivo más nuevo (delta) → update', () => {
    expect(
      planDocumentAction(
        { id: 'doc-1', cadDocumentVersion: 2, contentSha256: 'x' },
        record,
      ),
    ).toEqual({ action: 'update', targetId: 'doc-1' });
  });

  it('misma versión con hash distinto → update (repara contenido divergente)', () => {
    expect(
      planDocumentAction(
        { id: 'doc-1', cadDocumentVersion: 3, contentSha256: 'otra' },
        record,
      ),
    ).toEqual({ action: 'update', targetId: 'doc-1' });
  });
});

describe('planBlobAction — dedup content-addressed en destino', () => {
  const record = {
    tenantId: 't',
    sha256: SHA,
    size: 10,
    sourceBlobKey: 'bk-origen',
  };

  it('sin fila → insert conservando la blobKey del origen', () => {
    expect(planBlobAction(null, record)).toEqual({
      action: 'insert',
      targetBlobKey: 'bk-origen',
    });
  });

  it('mismo (tenant, sha) → reuse de la clave existente (dedup, 0 bytes duplicados)', () => {
    expect(
      planBlobAction(
        { blobKey: 'bk-nativo', size: 10, gcMarkedAt: null },
        record,
      ),
    ).toEqual({
      action: 'reuse',
      targetBlobKey: 'bk-nativo',
      resurrect: false,
    });
  });

  it('blob marcado para GC se resucita al reutilizarlo', () => {
    expect(
      planBlobAction(
        { blobKey: 'bk-gc', size: 10, gcMarkedAt: new Date() },
        record,
      ),
    ).toEqual({ action: 'reuse', targetBlobKey: 'bk-gc', resurrect: true });
  });

  it('mismo sha con tamaño distinto → colisión (alto, no se escribe)', () => {
    const plan = planBlobAction(
      { blobKey: 'bk', size: 99, gcMarkedAt: null },
      record,
    );
    expect(plan.action).toBe('collision');
  });
});

describe('rewritePointerBlobKey — verificación/reescritura de punteros', () => {
  it('documento inline pasa intacto', () => {
    const inline = { meta: { schema: 3 }, entities: [] };
    expect(rewritePointerBlobKey(inline, () => 'x')).toEqual({
      stored: inline,
      changed: false,
      missing: false,
    });
  });

  it('puntero cuyo blob resolvió a la MISMA clave no cambia', () => {
    const stored = pointer('bk-1');
    const result = rewritePointerBlobKey(stored, () => 'bk-1');
    expect(result.changed).toBe(false);
    expect(result.missing).toBe(false);
    expect(result.stored).toBe(stored);
  });

  it('puntero deduplicado bajo otra clave se re-escribe SIN tocar el sha', () => {
    const result = rewritePointerBlobKey(pointer('bk-1'), () => 'bk-2');
    expect(result.changed).toBe(true);
    const storage = (result.stored as { _storage: Record<string, unknown> })
      ._storage;
    expect(storage.blobKey).toBe('bk-2');
    expect(storage.sha256).toBe(SHA);
  });

  it('blob irresoluble → missing (el import rechaza el registro)', () => {
    const result = rewritePointerBlobKey(pointer('bk-1'), () => null);
    expect(result.missing).toBe(true);
  });

  it('el resolver recibe la clave origen y el sha en minúsculas', () => {
    const seen: Array<[string, string]> = [];
    rewritePointerBlobKey(pointer('bk-1'), (key, sha) => {
      seen.push([key, sha]);
      return 'bk-1';
    });
    expect(seen).toEqual([['bk-1', SHA]]);
  });
});

describe('planBlockAction', () => {
  const record = { version: 2, contentSha256: SHA };
  it('insert / skip idéntico / no-retroceso / update', () => {
    expect(planBlockAction(null, record)).toEqual({ action: 'insert' });
    expect(
      planBlockAction({ id: 'b', version: 2, contentSha256: SHA }, record),
    ).toEqual({ action: 'skip', targetId: 'b', reason: 'sin_cambios' });
    expect(
      planBlockAction({ id: 'b', version: 5, contentSha256: 'x' }, record),
    ).toEqual({ action: 'skip', targetId: 'b', reason: 'destino_mas_nuevo' });
    expect(
      planBlockAction({ id: 'b', version: 1, contentSha256: 'x' }, record),
    ).toEqual({ action: 'update', targetId: 'b' });
  });
});
