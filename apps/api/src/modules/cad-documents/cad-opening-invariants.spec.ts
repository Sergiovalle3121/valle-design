import { BadRequestException } from '@nestjs/common';
import { validateCadDocumentPayload } from './cad-document-validation';

/**
 * Invariantes de OPENING en la frontera del servidor.
 *
 * Un hueco del esquema 7 no persiste ni un punto del mundo: guarda a qué muro
 * pertenece y a qué distancia del arranque de su eje. Esa economía es lo que
 * hace que mover el muro lo mueva y borrarlo lo cierre — y es también lo que
 * hace que un hueco mal formado sea INVISIBLE al mirarlo solo. Todo lo que lo
 * valida es una afirmación sobre otra entidad, así que si no se comprueba aquí
 * no se comprueba en ningún sitio.
 *
 * Los tres desastres que este archivo impide, en orden de lo caro que sale
 * descubrirlos tarde:
 *
 *  1. `hostId` que no resuelve → una entidad que ningún cliente puede situar:
 *     no se ve, no se selecciona, viaja en cada guardado y sale en la tabla de
 *     cantidades como una puerta que no está en ninguna parte.
 *  2. Hueco que no cabe → la cara del muro se parte en dos trozos que no se
 *     tocan, y ese contorno roto llega al hit-test y a la exportación.
 *  3. Dos huecos superpuestos → lo mismo, con la puerta de otro encima.
 *
 * Cada rechazo trae su gemelo VÁLIDO: una validación que rechazara todo también
 * pasaría los rechazos.
 */
describe('schema 7 opening invariants', () => {
  const wall = (override: Record<string, unknown> = {}) => ({
    id: 'w1',
    type: 'wall',
    start: { x: 0, y: 0, z: 0 },
    end: { x: 4_000, y: 0, z: 0 },
    thickness: 250,
    height: 2_400,
    layer: '0',
    ...override,
  });

  const opening = (override: Record<string, unknown> = {}) => ({
    id: 'o1',
    type: 'opening',
    kind: 'door',
    hostId: 'w1',
    position: 1_500,
    width: 900,
    height: 2_100,
    sill: 0,
    swing: 'left',
    hinge: 'start',
    layer: '0',
    ...override,
  });

  const withEntities = (entities: Record<string, unknown>[]) => ({
    meta: { schema: 7, version: 1, unit: 'mm' },
    entities,
    blocks: [],
    constraints: [],
    modelSpace: { entityIds: entities.map((entity) => String(entity.id)) },
  });

  const rejects = (entities: Record<string, unknown>[], pattern: RegExp) => {
    expect(() => validateCadDocumentPayload(withEntities(entities))).toThrow(
      BadRequestException,
    );
    expect(() => validateCadDocumentPayload(withEntities(entities))).toThrow(
      pattern,
    );
  };

  it('acepta una puerta bien alojada', () => {
    expect(() =>
      validateCadDocumentPayload(withEntities([wall(), opening()])),
    ).not.toThrow();
  });

  it('acepta dos huecos que no se pisan en el mismo muro', () => {
    expect(() =>
      validateCadDocumentPayload(
        withEntities([
          wall(),
          opening(),
          opening({ id: 'o2', position: 3_000, kind: 'window', sill: 900 }),
        ]),
      ),
    ).not.toThrow();
  });

  it('rechaza un hueco cuyo muro anfitrión no existe', () => {
    rejects(
      [wall(), opening({ hostId: 'fantasma' })],
      /el hueco o1 se aloja en el muro inexistente fantasma/,
    );
  });

  it('rechaza un hueco que se aloja en algo que no es un muro', () => {
    rejects(
      [
        {
          id: 'l1',
          type: 'line',
          start: { x: 0, y: 0, z: 0 },
          end: { x: 1_000, y: 0, z: 0 },
          layer: '0',
        },
        opening({ hostId: 'l1' }),
      ],
      /el hueco o1 se aloja en el muro inexistente l1/,
    );
  });

  it('rechaza un hueco que se sale del muro por cualquiera de los dos extremos', () => {
    rejects([wall(), opening({ position: 300 })], /no cabe en su anfitrión/);
    rejects([wall(), opening({ position: 3_800 })], /no cabe en su anfitrión/);
  });

  it('rechaza dos huecos superpuestos en el mismo muro', () => {
    rejects(
      [wall(), opening(), opening({ id: 'o2', position: 1_800 })],
      /los huecos o1 y o2 se solapan en el muro w1/,
    );
  });

  it('rechaza medidas imposibles: anchura, altura y antepecho', () => {
    rejects([wall(), opening({ width: 0 })], /requiere una anchura positiva/);
    rejects([wall(), opening({ height: -1 })], /requiere una altura positiva/);
    rejects(
      [wall(), opening({ sill: -1 })],
      /requiere un antepecho de cero o más/,
    );
  });

  it('rechaza un hueco que no dice qué es ni cómo abre', () => {
    rejects(
      [wall(), opening({ kind: 'puerta' })],
      /debe declararse "door" o "window"/,
    );
    rejects(
      [wall(), opening({ swing: 'arriba' })],
      /debe declarar hacia qué lado barre/,
    );
    rejects(
      [wall(), opening({ hinge: 'medio' })],
      /debe declarar de qué jamba cuelga/,
    );
    rejects(
      [wall(), opening({ hostId: '' })],
      /no declara el muro que lo aloja/,
    );
  });

  it('rechaza un hueco dentro de una definición de bloque', () => {
    expect(() =>
      validateCadDocumentPayload({
        ...withEntities([wall()]),
        blocks: [
          {
            id: 'PUERTA',
            name: 'PUERTA',
            basePoint: { x: 0, y: 0, z: 0 },
            entities: [opening()],
          },
        ],
      }),
    ).toThrow(/un hueco sólo puede alojarse en un muro del dibujo/);
  });
});
