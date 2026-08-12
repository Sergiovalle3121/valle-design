import { BadRequestException } from '@nestjs/common';
import { validateCadDocumentPayload } from './cad-document-validation';

/**
 * Invariantes de WALL en la frontera del servidor.
 *
 * Un muro persiste su RECETA —eje, grosor, altura— y toda su geometría se
 * deriva de ella al dibujar. Por eso una receta degenerada no revienta al
 * guardarse: revienta al abrirse, con un contorno de área nula que rompe el
 * hit-testing y el índice espacial lejos de su causa. Cada rechazo trae su
 * gemelo VÁLIDO: una validación que rechazara todo también pasaría los
 * rechazos.
 */
describe('schema 6 wall invariants', () => {
  const withEntities = (entities: Record<string, unknown>[]) => ({
    meta: { schema: 6, version: 1, unit: 'mm' },
    entities,
    blocks: [],
    constraints: [],
    modelSpace: { entityIds: entities.map((entity) => String(entity.id)) },
  });

  const soundWall = (override: Record<string, unknown> = {}) => ({
    id: 'w1',
    type: 'wall',
    start: { x: 0, y: 0, z: 0 },
    end: { x: 3_000, y: 0, z: 0 },
    thickness: 150,
    height: 2_400,
    layer: '0',
    ...override,
  });

  const rejects = (entity: Record<string, unknown>, pattern: RegExp) => {
    expect(() => validateCadDocumentPayload(withEntities([entity]))).toThrow(
      BadRequestException,
    );
    expect(() => validateCadDocumentPayload(withEntities([entity]))).toThrow(
      pattern,
    );
  };

  it('acepta un muro bien formado', () => {
    expect(() =>
      validateCadDocumentPayload(withEntities([soundWall()])),
    ).not.toThrow();
  });

  it('rechaza un eje degenerado: sin dos extremos no hay dirección de muro', () => {
    rejects(
      soundWall({ end: { x: 0, y: 0, z: 0 } }),
      /el muro w1 necesita un eje con dos extremos distintos/,
    );
  });

  it('rechaza un grosor no positivo o ausente', () => {
    rejects(soundWall({ thickness: 0 }), /requiere un grosor positivo/);
    rejects(soundWall({ thickness: -150 }), /requiere un grosor positivo/);
    rejects(soundWall({ thickness: undefined }), /requiere un grosor positivo/);
  });

  it('rechaza una altura no positiva o ausente', () => {
    rejects(soundWall({ height: 0 }), /requiere una altura positiva/);
    rejects(soundWall({ height: undefined }), /requiere una altura positiva/);
  });

  it('rechaza un eje sin coordenadas numéricas finitas', () => {
    rejects(
      soundWall({ start: { x: 'cero', y: 0 } }),
      /necesita coordenadas numéricas finitas/,
    );
  });
});
