import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateCadCommentDto,
  CreateCadDocumentDto,
  CreateCadProjectDto,
  CreateReviewLinkCommentDto,
  ListDocumentsQueryDto,
  UpdateCadDocumentMetaDto,
  UpdateCadProjectDto,
} from './cad.dto';

describe('ListDocumentsQueryDto', () => {
  it('admite los filtros exactos model+revision y transforma la paginación', async () => {
    const query = plainToInstance(ListDocumentsQueryDto, {
      model: 'AXOS-CAD-STUDIO',
      revision: 'UNIVERSAL',
      limit: '1',
      offset: '0',
    });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query).toMatchObject({
      model: 'AXOS-CAD-STUDIO',
      revision: 'UNIVERSAL',
      limit: 1,
      offset: 0,
    });
  });

  it('rechaza filtros vacíos o mayores que las columnas persistidas', async () => {
    const empty = plainToInstance(ListDocumentsQueryDto, {
      model: '',
      revision: '',
    });
    const oversized = plainToInstance(ListDocumentsQueryDto, {
      model: 'm'.repeat(65),
      revision: 'r'.repeat(17),
    });

    expect(await validate(empty)).toHaveLength(2);
    expect(await validate(oversized)).toHaveLength(2);
  });
});

describe('CAD DTO normalization and bounded comment anchors', () => {
  it('rejects a whitespace-only name on all create/update DTOs', async () => {
    const values = [
      plainToInstance(CreateCadProjectDto, { name: ' \t\r\n ' }),
      plainToInstance(UpdateCadProjectDto, { name: ' \t\r\n ' }),
      plainToInstance(CreateCadDocumentDto, { name: ' \t\r\n ' }),
      plainToInstance(UpdateCadDocumentMetaDto, { name: ' \t\r\n ' }),
    ];

    for (const value of values) {
      expect(await validate(value)).toHaveLength(1);
      expect(value.name).toBe('');
    }
  });

  it('normalizes valid names on all create/update DTOs', async () => {
    const values = [
      plainToInstance(CreateCadProjectDto, { name: '  Plano norte  ' }),
      plainToInstance(UpdateCadProjectDto, { name: '  Plano norte  ' }),
      plainToInstance(CreateCadDocumentDto, { name: '  Plano norte  ' }),
      plainToInstance(UpdateCadDocumentMetaDto, {
        name: '  Plano norte  ',
      }),
    ];

    for (const value of values) {
      await expect(validate(value)).resolves.toHaveLength(0);
      expect(value.name).toBe('Plano norte');
    }
  });

  it.each([CreateCadCommentDto, CreateReviewLinkCommentDto])(
    'rejects oversized and deeply nested anchors on %s',
    async (Dto) => {
      const oversized = plainToInstance(Dto, {
        body: 'Revisar',
        anchor: { note: 'x'.repeat(16 * 1024) },
      });
      let deepAnchor: Record<string, unknown> = { x: 1 };
      for (let depth = 0; depth < 8; depth += 1) {
        deepAnchor = { nested: deepAnchor };
      }
      const deeplyNested = plainToInstance(Dto, {
        body: 'Revisar',
        anchor: deepAnchor,
      });

      expect(await validate(oversized)).not.toHaveLength(0);
      expect(await validate(deeplyNested)).not.toHaveLength(0);
    },
  );
});
