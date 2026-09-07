import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  MAX_CAD_DOCUMENT_LAYERS,
  MAX_CAD_DOCUMENT_LAYERS_BYTES,
  UpdateCadDocumentMetaDto,
} from './cad.dto';

/**
 * Topes de `layers` en `PATCH /v1/cad/documents/:id` (hallazgo «PATCH
 * /v1/cad/documents/:id accepts an unbounded layers array»). Son validación
 * del servidor: el contrato sigue sin `maxItems`, y por eso la prueba vive
 * junto al DTO y no en el router de contrato.
 */

const layer = (i: number) => ({
  id: `capa-${i}`,
  name: `Capa ${i}`,
  color: '7',
  visible: true,
  locked: false,
});

const layers = (count: number) =>
  Array.from({ length: count }, (_, i) => layer(i));

const errorsFor = (body: Record<string, unknown>) =>
  validate(plainToInstance(UpdateCadDocumentMetaDto, body));

describe('UpdateCadDocumentMetaDto.layers — acotado', () => {
  it('admite null y una lista normal de capas', async () => {
    expect(await errorsFor({ layers: null })).toHaveLength(0);
    expect(await errorsFor({ layers: layers(12) })).toHaveLength(0);
    expect(
      await errorsFor({ layers: layers(MAX_CAD_DOCUMENT_LAYERS) }),
    ).toHaveLength(0);
  });

  it('rechaza más de mil capas', async () => {
    expect(MAX_CAD_DOCUMENT_LAYERS).toBe(1000);
    const errors = await errorsFor({
      layers: layers(MAX_CAD_DOCUMENT_LAYERS + 1),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('arrayMaxSize');
  });

  it('rechaza una sola capa que pese más que el tope serializado', async () => {
    const pesada = {
      ...layer(0),
      notas: 'x'.repeat(MAX_CAD_DOCUMENT_LAYERS_BYTES),
    };
    const errors = await errorsFor({ layers: [pesada] });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('maxSerializedBytes');
  });
});
