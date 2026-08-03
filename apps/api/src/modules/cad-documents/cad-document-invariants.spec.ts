import { BadRequestException } from '@nestjs/common';
import { validateCadDocumentPayload } from './cad-document-validation';

/**
 * Invariantes por entidad e integridad referencial.
 *
 * Los límites de tamaño, profundidad y conteo que ya existían NO impiden
 * persistir geometría imposible. Un radio negativo, un número no finito, una
 * polilínea de un solo vértice o un bloque que se contiene a sí mismo cruzaban
 * la frontera y reventaban render, índice espacial o exportación mucho después,
 * lejos de su causa. Aceptar ficheros externos con seguridad exige fallar
 * CERRADO en la entrada.
 */
describe('canonical document invariants', () => {
  const base = {
    meta: { schema: 3, version: 1, unit: 'mm' },
    entities: [] as Record<string, unknown>[],
    blocks: [] as Record<string, unknown>[],
    constraints: [],
  };

  const withEntities = (entities: Record<string, unknown>[]) => ({
    ...base,
    entities,
    modelSpace: { entityIds: entities.map((entity) => String(entity.id)) },
  });

  const line = {
    id: 'line-1',
    type: 'line',
    start: { x: 0, y: 0, z: 0 },
    end: { x: 1, y: 0, z: 0 },
    layer: '0',
  };

  it('accepts sound geometry', () => {
    expect(() =>
      validateCadDocumentPayload(withEntities([line])),
    ).not.toThrow();
  });

  describe('per-entity invariants', () => {
    it.each([
      [
        'zero radius',
        {
          id: 'c',
          type: 'circle',
          radius: 0,
          center: { x: 0, y: 0, z: 0 },
          layer: '0',
        },
      ],
      [
        'negative radius',
        {
          id: 'c',
          type: 'circle',
          radius: -5,
          center: { x: 0, y: 0, z: 0 },
          layer: '0',
        },
      ],
      [
        'arc without radius',
        {
          id: 'a',
          type: 'arc',
          center: { x: 0, y: 0, z: 0 },
          startAngle: 0,
          endAngle: 90,
          layer: '0',
        },
      ],
    ])('rejects %s', (_label, entity) => {
      expect(() => validateCadDocumentPayload(withEntities([entity]))).toThrow(
        BadRequestException,
      );
    });

    it('rejects a non-finite coordinate, which would poison bounds and indexes', () => {
      const poisoned = {
        ...line,
        end: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 },
      };
      expect(() =>
        validateCadDocumentPayload(withEntities([poisoned])),
      ).toThrow(/no finito/);
    });

    it('rejects a polyline with fewer than two vertices', () => {
      const degenerate = {
        id: 'pl',
        type: 'polyline',
        vertices: [{ x: 0, y: 0, z: 0 }],
        closed: false,
        layer: '0',
      };
      expect(() =>
        validateCadDocumentPayload(withEntities([degenerate])),
      ).toThrow(/2 vértices/);
    });

    it('rejects a spline whose degree cannot be satisfied by its control points', () => {
      const spline = {
        id: 'sp',
        type: 'spline',
        controlPoints: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 1, z: 0 },
        ],
        degree: 5,
        knots: [0, 0, 1, 1],
        closed: false,
        layer: '0',
      };
      expect(() => validateCadDocumentPayload(withEntities([spline]))).toThrow(
        /grado incompatible/,
      );
    });

    it('rejects spline weights that do not match the control points', () => {
      const spline = {
        id: 'sp',
        type: 'spline',
        controlPoints: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 1, z: 0 },
        ],
        degree: 1,
        knots: [0, 0, 1, 1],
        weights: [1],
        closed: false,
        layer: '0',
      };
      expect(() => validateCadDocumentPayload(withEntities([spline]))).toThrow(
        /pesos/,
      );
    });
  });

  describe('referential integrity', () => {
    it('rejects a draw order referencing an entity that does not exist', () => {
      expect(() =>
        validateCadDocumentPayload({
          ...base,
          entities: [line],
          modelSpace: { entityIds: ['line-1', 'fantasma'] },
        }),
      ).toThrow(/inexistente/);
    });

    it('rejects an entity appearing twice in the draw order', () => {
      expect(() =>
        validateCadDocumentPayload({
          ...base,
          entities: [line],
          modelSpace: { entityIds: ['line-1', 'line-1'] },
        }),
      ).toThrow(/dos veces/);
    });

    it('rejects a block that contains itself', () => {
      expect(() =>
        validateCadDocumentPayload({
          ...base,
          blocks: [
            {
              id: 'B',
              entities: [{ id: 'i', type: 'insert', block: 'B' }],
            },
          ],
        }),
      ).toThrow(/recursión ilegal/);
    });

    it('rejects an indirect block cycle', () => {
      expect(() =>
        validateCadDocumentPayload({
          ...base,
          blocks: [
            { id: 'A', entities: [{ id: 'i1', type: 'insert', block: 'B' }] },
            { id: 'B', entities: [{ id: 'i2', type: 'insert', block: 'A' }] },
          ],
        }),
      ).toThrow(/recursión ilegal/);
    });

    it('accepts legitimate block nesting that is not cyclic', () => {
      expect(() =>
        validateCadDocumentPayload({
          ...base,
          blocks: [
            {
              id: 'OUTER',
              entities: [{ id: 'i1', type: 'insert', block: 'INNER' }],
            },
            { id: 'INNER', entities: [] },
          ],
        }),
      ).not.toThrow();
    });
  });
});
