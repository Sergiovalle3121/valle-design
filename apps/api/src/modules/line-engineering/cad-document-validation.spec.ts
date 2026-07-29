import { BadRequestException } from '@nestjs/common';
import {
  CAD_DOCUMENT_MAX_ARCHIVE_BYTES,
  validateCadDocumentPayload,
} from './cad-document-validation';

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

  it('validates bounded paper spaces, viewports and publication receipts', () => {
    const withPaper = {
      ...valid,
      paperSpaces: [
        {
          id: 'sheet-1',
          name: 'General',
          entityIds: [],
          page: {
            width: 420,
            height: 297,
            unit: 'mm',
            orientation: 'landscape',
          },
          viewports: [
            {
              id: 'viewport-1',
              paperBounds: { x: 10, y: 10, width: 400, height: 240 },
              modelBounds: { x: 0, y: 0, width: 20_000, height: 10_000 },
              scale: 50,
              locked: true,
            },
          ],
        },
      ],
      publications: [
        {
          id: 'publication-1',
          paperSpaceIds: ['sheet-1'],
          fileName: 'sheet-set.pdf',
          sha256: 'a'.repeat(64),
          bytes: 1024,
          publishedAt: '2026-07-26T00:00:00.000Z',
          publishedBy: 'ie@test',
        },
      ],
    };
    expect(validateCadDocumentPayload(withPaper)).toEqual(withPaper);
    expect(() =>
      validateCadDocumentPayload({
        ...withPaper,
        paperSpaces: [
          {
            ...withPaper.paperSpaces[0],
            viewports: [{ ...withPaper.paperSpaces[0].viewports[0], scale: 0 }],
          },
        ],
      }),
    ).toThrow('escalas de viewport');
    expect(() =>
      validateCadDocumentPayload({
        ...withPaper,
        publications: [{ ...withPaper.publications[0], sha256: 'unsafe' }],
      }),
    ).toThrow('publicación inválido');
  });

  it('keeps the JSON route bounded while allowing a validated archive budget', () => {
    const large = { ...valid, recoveryNotes: 'x'.repeat(8_000_100) };
    expect(() => validateCadDocumentPayload(large)).toThrow(
      BadRequestException,
    );
    expect(
      validateCadDocumentPayload(large, {
        maxBytes: CAD_DOCUMENT_MAX_ARCHIVE_BYTES,
      }),
    ).toEqual(large);
  });

  it('bounds and validates CAD collaboration state', () => {
    const collaboration = {
      versions: [],
      threads: [{ id: 'thread-1', body: 'Review this wall', status: 'open' }],
      reviewLinks: [
        { id: 'link-1', token: '0123456789abcdef', readOnly: true },
      ],
      audit: [],
    };
    expect(validateCadDocumentPayload({ ...valid, collaboration })).toEqual({
      ...valid,
      collaboration,
    });
    expect(() =>
      validateCadDocumentPayload({
        ...valid,
        collaboration: {
          ...collaboration,
          reviewLinks: [{ id: 'link-1', token: 'short', readOnly: true }],
        },
      }),
    ).toThrow('enlace de revisiÃ³n invÃ¡lido');
    expect(() =>
      validateCadDocumentPayload({
        ...valid,
        collaboration: {
          ...collaboration,
          versions: Array.from({ length: 13 }, () => ({})),
        },
      }),
    ).toThrow('collaboration.versions admite mÃ¡ximo 12');
  });
});
