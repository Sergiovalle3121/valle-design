import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  buildCadDocumentBlobPointer,
  decodeCadDocumentArchive,
  encodeCadDocumentArchive,
  isStoredCadDocumentBlobPointer,
} from './cad-document-storage';

describe('CadDocument archive storage', () => {
  const document = {
    meta: { schema: 3, version: 17, unit: 'mm' },
    entities: [
      {
        id: 'line-1',
        type: 'line',
        start: { x: 0, y: 0, z: 0 },
        end: { x: 1, y: 0, z: 0 },
        layer: '0',
      },
    ],
    blocks: [],
    constraints: [],
    recoveryNotes: 'repeatable-cad-data\n'.repeat(80_000),
  };

  it('round-trips a large canonical document and builds a strict manifest', async () => {
    const archive = await encodeCadDocumentArchive(document);
    expect(archive.uncompressedBytes).toBeGreaterThan(1_000_000);
    expect(archive.compressed.length).toBeLessThan(archive.uncompressedBytes);

    const pointer = buildCadDocumentBlobPointer(
      document,
      archive,
      'tenant-scoped-blob-key',
    );
    expect(isStoredCadDocumentBlobPointer(pointer)).toBe(true);
    expect(pointer.summary).toEqual({
      schema: 3,
      contentVersion: 17,
      entityCount: 1,
    });
    await expect(
      decodeCadDocumentArchive(archive.compressed, pointer._storage),
    ).resolves.toEqual(document);
  });

  it('rejects corrupted stored bytes before decompression', async () => {
    const archive = await encodeCadDocumentArchive(document);
    const pointer = buildCadDocumentBlobPointer(document, archive, 'blob-key');
    const corrupted = Buffer.from(archive.compressed);
    corrupted[corrupted.length - 1] ^= 1;
    await expect(
      decodeCadDocumentArchive(corrupted, pointer._storage),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects a non-gzip upload without exposing parser errors', async () => {
    await expect(
      decodeCadDocumentArchive(Buffer.from('not-a-gzip')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
