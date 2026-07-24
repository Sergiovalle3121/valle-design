import { BadRequestException } from '@nestjs/common';
import { validateCadDocumentPayload } from './cad-document-validation';

describe('validateCadDocumentPayload', () => {
  const valid = {
    meta: { schema: 3, version: 1, unit: 'mm' },
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
  };

  it('accepts and clones a bounded v3 document', () => {
    const result = validateCadDocumentPayload(valid);
    expect(result).toEqual(valid);
    expect(result).not.toBe(valid);
  });

  it.each([
    [{ ...valid, meta: { schema: 99 } }, 'schema'],
    [{ ...valid, entities: [{ id: 'same' }, { id: 'same' }] }, 'ids'],
    [
      { ...valid, entities: [{ id: 'bad', x: Number.POSITIVE_INFINITY }] },
      'finitos',
    ],
  ])('rejects malformed payload %#', (payload, message) => {
    expect(() => validateCadDocumentPayload(payload)).toThrow(
      BadRequestException,
    );
    expect(() => validateCadDocumentPayload(payload)).toThrow(message);
  });
});
