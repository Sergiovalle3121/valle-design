import assert from 'node:assert/strict';
import { migrateCadDocument } from './cad-document';
import { decodeCadRecoveryPayload, encodeCadRecoveryPayload } from './cad-recovery-codec';

void (async () => {
  const document = migrateCadDocument({
    meta: { version: 1, schema: 3, unit: 'mm' },
    entities: Array.from({ length: 1_000 }, (_, index) => ({
      id: `arc-${index}`,
      type: 'arc',
      center: { x: index, y: index % 20, z: 0 },
      radius: 10,
      startAngle: 0,
      endAngle: 180,
      layer: 'CURVES',
    })),
  });
  const encoded = await encodeCadRecoveryPayload(document);
  assert.match(encoded.sha256, /^[a-f0-9]{64}$/);
  assert.ok(encoded.uncompressedBytes > 100_000);
  assert.ok(encoded.storedBytes > 0);
  if (encoded.format === 'gzip-json')
    assert.ok(encoded.storedBytes < encoded.uncompressedBytes);
  const decoded = await decodeCadRecoveryPayload(encoded.format, encoded.buffer);
  assert.equal(decoded.entities.length, 1_000);
  assert.equal(decoded.entities[999]?.id, 'arc-999');
  console.log('CAD recovery codec: 7 passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
