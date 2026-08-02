import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ArchiveIntegrityError,
  ArchiveWriter,
  emptyCounts,
  readArchiveBlob,
  readManifest,
  readNdjson,
  verifyArchiveFiles,
} from './archive';
import { sha256Hex } from './stable-json';

describe('archive — formato de exportación con verificación de integridad', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'migracion-archive-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeSample() {
    const writer = new ArchiveWriter(dir);
    writer.append('documents.ndjson', { legacySourceId: 'l1', tenantId: 't' });
    writer.append('documents.ndjson', {
      legacySourceId: 'l2',
      tenantId: 't',
      texto: 'Ñandú 🏭',
    });
    writer.append('blocks.ndjson', { legacySourceId: 'b1', tenantId: 't' });
    const data = Buffer.from('contenido-gzip-simulado');
    const sha = sha256Hex(data);
    writer.writeBlob(sha, data);
    const manifest = writer.finalize({
      createdAt: new Date().toISOString(),
      source: { database: 'fixture', tenantScope: ['t'] },
      delta: { baseManifestSha256: null },
      counts: { ...emptyCounts(), documents: 2, blocks: 1, blobs: 1 },
      countsByTenant: {
        t: { ...emptyCounts(), documents: 2, blocks: 1, blobs: 1 },
      },
      documents: [],
      blocks: [],
      blobs: [{ tenantId: 't', sha256: sha, size: data.length }],
    });
    return { manifest, sha, data };
  }

  it('escritura → lectura round-trip con manifiesto verificable', async () => {
    const { manifest, sha, data } = writeSample();
    expect(manifest.files['documents.ndjson'].records).toBe(2);
    expect(manifest.files['versions.ndjson'].records).toBe(0);

    const read = readManifest(dir);
    expect(read.archiveFormat).toBe(1);
    verifyArchiveFiles(dir, read); // no lanza

    const docs = await readNdjson<{ legacySourceId: string; texto?: string }>(
      dir,
      'documents.ndjson',
    );
    expect(docs.map((d) => d.legacySourceId)).toEqual(['l1', 'l2']);
    expect(docs[1].texto).toBe('Ñandú 🏭'); // unicode intacto

    const blob = await readArchiveBlob(dir, sha);
    expect(blob.equals(data)).toBe(true);
  });

  it('un NDJSON truncado se rechaza (sha del manifiesto no coincide)', () => {
    writeSample();
    const manifest = readManifest(dir);
    const path = join(dir, 'documents.ndjson');
    const body = readFileSync(path, 'utf8');
    writeFileSync(path, body.split('\n')[0] + '\n'); // trunca a la mitad
    expect(() => verifyArchiveFiles(dir, manifest)).toThrow(
      ArchiveIntegrityError,
    );
    expect(() => verifyArchiveFiles(dir, manifest)).toThrow(/truncado/);
  });

  it('un blob corrupto se rechaza al leer (hash del nombre no verifica)', async () => {
    const { sha } = writeSample();
    writeFileSync(join(dir, 'blobs', sha), 'bytes-alterados');
    await expect(readArchiveBlob(dir, sha)).rejects.toThrow(
      ArchiveIntegrityError,
    );
  });

  it('un blob ausente se rechaza', async () => {
    writeSample();
    await expect(readArchiveBlob(dir, 'f'.repeat(64))).rejects.toThrow(
      /Falta el blob/,
    );
  });

  it('formato desconocido del manifiesto se rechaza', () => {
    writeSample();
    const path = join(dir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.archiveFormat = 99;
    writeFileSync(path, JSON.stringify(manifest));
    expect(() => readManifest(dir)).toThrow(/no soportado/);
  });
});
