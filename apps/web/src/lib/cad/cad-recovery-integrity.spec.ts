import assert from 'node:assert/strict';
import { migrateCadDocument, type CadDocument } from './cad-document';
import {
  decodeCadRecoveryPayload,
  encodeCadRecoveryPayload,
  CadRecoveryIntegrityError,
} from './cad-recovery-codec';

/**
 * Fase 4 — el journal de recuperación se VERIFICA antes de restaurar.
 *
 * `encodeCadRecoveryPayload` calculaba y guardaba un SHA-256 de los bytes del
 * documento… y `decodeCadRecoveryPayload` no lo miraba nunca. El hash existía
 * como metadato decorativo: cualquier carga aceptaba lo que hubiese en
 * IndexedDB siempre que fuese JSON parseable.
 *
 * Eso importa porque el borrador de recuperación es lo que se le ofrece al
 * usuario tras un cierre inesperado. Restaurar un checkpoint alterado o
 * truncado —pero todavía parseable— le devuelve un plano que NO es el que
 * dibujó, y lo hace en el momento exacto en que más confía en la herramienta.
 * Un fallo ruidoso es infinitamente preferible: `loadCadRecovery` ya descarta
 * el registro que no decodifica y sigue con el siguiente, así que verificar
 * aquí convierte «restaura basura» en «cae al último checkpoint válido».
 */

function documentOf(entityCount: number): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 3, unit: 'mm' },
    entities: Array.from({ length: entityCount }, (_, index) => ({
      id: `line-${index}`,
      type: 'line',
      start: { x: index, y: 0, z: 0 },
      end: { x: index + 1, y: 1, z: 0 },
      layer: '0',
    })),
  } as unknown as CadDocument);
}

void (async () => {
  const document = documentOf(50);
  const encoded = await encodeCadRecoveryPayload(document);

  /* ── 1. Un payload íntegro se restaura y su hash se comprueba ─────────── */

  const restored = await decodeCadRecoveryPayload(
    encoded.format,
    encoded.buffer,
    encoded.sha256,
  );
  assert.equal(restored.entities.length, 50);
  assert.equal(restored.entities[49]?.id, 'line-49');

  /* ── 2. Un payload ALTERADO se rechaza aunque siga siendo JSON válido ── */

  // Se re-codifica un documento DISTINTO y se presenta con el hash del
  // original: es exactamente lo que ocurre si el registro se sustituye o se
  // corrompe de una forma que aún parsea.
  const other = await encodeCadRecoveryPayload(documentOf(3));
  await assert.rejects(
    () => decodeCadRecoveryPayload(other.format, other.buffer, encoded.sha256),
    (error: unknown) => {
      assert.ok(
        error instanceof CadRecoveryIntegrityError,
        'el rechazo es tipado, no un error genérico',
      );
      assert.match(String((error as Error).message), /integridad/i);
      return true;
    },
    'un payload que no corresponde a su hash NO puede restaurarse',
  );

  /* ── 3. Sin hash almacenado no se inventa una verificación ────────────── */

  // Los registros heredados del journal no traen `sha256`. No se rechazan por
  // eso —sería tirar el borrador del usuario por un metadato que nunca
  // existió—, pero tampoco se declara que estén verificados.
  const legacy = await decodeCadRecoveryPayload(encoded.format, encoded.buffer);
  assert.equal(legacy.entities.length, 50);

  /* ── 4. El hash cubre el CONTENIDO, no la representación comprimida ──── */

  // Dos codificaciones del mismo documento producen el mismo sha256, así que
  // el journal puede cambiar de formato (gzip ↔ json) sin invalidar nada.
  const again = await encodeCadRecoveryPayload(document);
  assert.equal(again.sha256, encoded.sha256);

  /* ── 5. Un buffer truncado falla, y falla de forma tipada ─────────────── */

  const truncated = encoded.buffer.slice(0, Math.floor(encoded.buffer.byteLength / 2));
  await assert.rejects(
    () => decodeCadRecoveryPayload(encoded.format, truncated, encoded.sha256),
    'un payload truncado no puede restaurarse',
  );

  console.log('cad-recovery-integrity.spec.ts OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
