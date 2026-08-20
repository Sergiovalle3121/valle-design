import { BadRequestException } from '@nestjs/common';
import { validateCadDocumentPayload } from './cad-document-validation';

/**
 * Invariantes de SOLID3D y REGION en la frontera del servidor.
 *
 * Un SOLID3D no persiste su malla: persiste el ÁRBOL que la produce. Eso cambia
 * lo que significa «documento inválido». Un árbol mal formado no falla al
 * guardarse —tiene la forma correcta, todos sus campos son del tipo correcto—
 * sino al ABRIRSE: una referencia colgando revienta el render y un ciclo cuelga
 * el hilo del navegador de quien abra el plano, sin mensaje y sin culpable.
 *
 * Lo que se comprueba aquí no es que la validación exista, sino que cada regla
 * impide una forma concreta de programa imposible. Cada caso trae además su
 * gemelo VÁLIDO: una validación que rechazara todo también pasaría los rechazos.
 */
describe('schema 5 solid invariants', () => {
  const base = {
    meta: { schema: 5, version: 1, unit: 'mm' },
    entities: [] as Record<string, unknown>[],
    blocks: [] as Record<string, unknown>[],
    constraints: [],
  };

  const withEntities = (entities: Record<string, unknown>[]) => ({
    ...base,
    entities,
    modelSpace: { entityIds: entities.map((entity) => String(entity.id)) },
  });

  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  /** Sólido sano: una extrusión menos una caja. Es la pieza más común. */
  const soundSolid = (override: Record<string, unknown> = {}) => ({
    id: 'sol',
    type: 'solid3d',
    nodes: [
      { id: 'perfil', op: 'extrude', profile: { outer: square }, height: 50 },
      {
        id: 'hueco',
        op: 'box',
        min: { x: 10, y: 10, z: -5 },
        max: { x: 30, y: 30, z: 55 },
      },
      { id: 'pieza', op: 'subtract', operands: ['perfil', 'hueco'] },
    ],
    root: 'pieza',
    layer: '0',
    ...override,
  });

  const soundRegion = (override: Record<string, unknown> = {}) => ({
    id: 'reg',
    type: 'region',
    outer: [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 },
    ],
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

  it('acepta un sólido y una región bien formados', () => {
    expect(() =>
      validateCadDocumentPayload(withEntities([soundSolid(), soundRegion()])),
    ).not.toThrow();
  });

  it('acepta el esquema 5 y el 6 vigentes; el 7 es futuro y se rechaza', () => {
    expect(() =>
      validateCadDocumentPayload(withEntities([soundSolid()])),
    ).not.toThrow();
    expect(() =>
      validateCadDocumentPayload({
        ...withEntities([]),
        meta: { schema: 8, version: 1, unit: 'mm' },
      }),
    ).not.toThrow();
    expect(() =>
      validateCadDocumentPayload({
        ...withEntities([]),
        meta: { schema: 9, version: 1, unit: 'mm' },
      }),
    ).toThrow(BadRequestException);
  });

  it('rechaza una referencia rota en vez de arreglarla', () => {
    // No hay nada que adivinar en «el nodo `fantasma` no existe»: repararlo
    // exigiría inventar geometría que nadie dibujó.
    rejects(
      soundSolid({
        nodes: [
          {
            id: 'perfil',
            op: 'extrude',
            profile: { outer: square },
            height: 50,
          },
          { id: 'pieza', op: 'subtract', operands: ['perfil', 'fantasma'] },
        ],
      }),
      /referencia fantasma, que no existe/,
    );
  });

  it('rechaza un ciclo antes de que cuelgue el hilo de quien abra el plano', () => {
    rejects(
      soundSolid({
        nodes: [
          {
            id: 'a',
            op: 'box',
            min: { x: 0, y: 0, z: 0 },
            max: { x: 1, y: 1, z: 1 },
          },
          { id: 'u', op: 'union', operands: ['a', 'v'] },
          { id: 'v', op: 'union', operands: ['a', 'u'] },
        ],
        root: 'u',
      }),
      /forma un ciclo/,
    );
  });

  it('rechaza una raíz que no existe', () => {
    rejects(soundSolid({ root: 'inexistente' }), /raíz "inexistente"/);
  });

  it('rechaza ids de nodo duplicados', () => {
    rejects(
      soundSolid({
        nodes: [
          {
            id: 'n',
            op: 'box',
            min: { x: 0, y: 0, z: 0 },
            max: { x: 1, y: 1, z: 1 },
          },
          {
            id: 'n',
            op: 'box',
            min: { x: 0, y: 0, z: 0 },
            max: { x: 2, y: 2, z: 2 },
          },
        ],
        root: 'n',
      }),
      /duplicado/,
    );
  });

  it('rechaza una operación desconocida', () => {
    rejects(
      soundSolid({
        nodes: [{ id: 'x', op: 'teleport', operands: ['a', 'b'] }],
        root: 'x',
      }),
      /operación desconocida/,
    );
  });

  it('rechaza un árbol vacío', () => {
    rejects(soundSolid({ nodes: [] }), /al menos un nodo/);
  });

  it('rechaza una caja aplastada, que no encierra volumen', () => {
    rejects(
      soundSolid({
        nodes: [
          {
            id: 'c',
            op: 'box',
            min: { x: 0, y: 0, z: 0 },
            max: { x: 10, y: 10, z: 0 },
          },
        ],
        root: 'c',
      }),
      /caja degenerada/,
    );
  });

  it('rechaza una extrusión de altura cero y un desmoldeo imposible', () => {
    rejects(
      soundSolid({
        nodes: [
          { id: 'e', op: 'extrude', profile: { outer: square }, height: 0 },
        ],
        root: 'e',
      }),
      /altura finita distinta de cero/,
    );
    rejects(
      soundSolid({
        nodes: [
          {
            id: 'e',
            op: 'extrude',
            profile: { outer: square },
            height: 10,
            draftAngleRad: 2,
          },
        ],
        root: 'e',
      }),
      /desmoldeo fuera/,
    );
  });

  it('rechaza un perfil con menos de tres puntos', () => {
    rejects(
      soundSolid({
        nodes: [
          {
            id: 'e',
            op: 'extrude',
            profile: {
              outer: [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
              ],
            },
            height: 10,
          },
        ],
        root: 'e',
      }),
      /al menos 3 puntos/,
    );
  });

  it('rechaza una revolución que da más de una vuelta', () => {
    rejects(
      soundSolid({
        nodes: [
          { id: 'r', op: 'revolve', profile: { outer: square }, angleRad: 10 },
        ],
        root: 'r',
      }),
      /ángulo fuera de/,
    );
  });

  it('rechaza un barrido sin recorrido', () => {
    rejects(
      soundSolid({
        nodes: [
          {
            id: 's',
            op: 'sweep',
            profile: { outer: square },
            path: [{ x: 0, y: 0, z: 0 }],
          },
        ],
        root: 's',
      }),
      /al menos 2 puntos/,
    );
  });

  it('rechaza un solevado de una sola sección', () => {
    rejects(
      soundSolid({
        nodes: [
          {
            id: 'l',
            op: 'loft',
            sections: [
              {
                profile: { outer: square },
                frame: {
                  origin: { x: 0, y: 0, z: 0 },
                  zAxis: { x: 0, y: 0, z: 1 },
                },
              },
            ],
          },
        ],
        root: 'l',
      }),
      /al menos 2 secciones/,
    );
  });

  it('rechaza un nodo brep con un índice de vértice fuera de rango', () => {
    // Un índice fuera de rango no da una cara rara: da `undefined` al recorrer el
    // lazo, y de ahí `NaN` que envenenan bounds, índice espacial y exportación
    // muchísimo después de haberse guardado.
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
    ];
    rejects(
      soundSolid({
        nodes: [
          {
            id: 'b',
            op: 'brep',
            points,
            faces: [
              { outer: [0, 2, 1] },
              { outer: [0, 1, 3] },
              { outer: [1, 2, 3] },
              { outer: [0, 3, 99] },
            ],
          },
        ],
        root: 'b',
      }),
      /fuera del rango de vértices/,
    );
    // El mismo sólido con los índices correctos SÍ pasa: la regla no rechaza
    // todo nodo `brep`, rechaza el que apunta fuera.
    expect(() =>
      validateCadDocumentPayload(
        withEntities([
          soundSolid({
            nodes: [
              {
                id: 'b',
                op: 'brep',
                points,
                faces: [
                  { outer: [0, 2, 1] },
                  { outer: [0, 1, 3] },
                  { outer: [1, 2, 3] },
                  { outer: [0, 3, 2] },
                ],
              },
            ],
            root: 'b',
          }),
        ]),
      ),
    ).not.toThrow();
  });

  it('rechaza un plano de corte con normal nula y un lado inventado', () => {
    const nodes = (plane: Record<string, unknown>, keep: string) => [
      {
        id: 'a',
        op: 'box',
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 },
      },
      { id: 's', op: 'slice', operand: 'a', plane, keep },
    ];
    rejects(
      soundSolid({
        nodes: nodes(
          { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 } },
          'positive',
        ),
        root: 's',
      }),
      /vector nulo/,
    );
    rejects(
      soundSolid({
        nodes: nodes(
          { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } },
          'arriba',
        ),
        root: 's',
      }),
      /"positive" o "negative"/,
    );
  });

  it('rechaza un redondeo de radio no positivo', () => {
    rejects(
      soundSolid({
        nodes: [
          {
            id: 'a',
            op: 'box',
            min: { x: 0, y: 0, z: 0 },
            max: { x: 1, y: 1, z: 1 },
          },
          { id: 'f', op: 'fillet', operand: 'a', edges: [], radius: 0 },
        ],
        root: 'f',
      }),
      /radio positivo/,
    );
  });

  it('rechaza una colocación singular, que aplastaría el sólido a un plano', () => {
    rejects(
      soundSolid({ placement: { a: 1, b: 0, c: 1, d: 0, e: 0, f: 0 } }),
      /colocación singular/,
    );
    // Y una colocación que REFLEJA (determinante negativo) es perfectamente
    // legítima: es lo que produce MIRROR, y el cliente ya invierte las caras.
    expect(() =>
      validateCadDocumentPayload(
        withEntities([
          soundSolid({ placement: { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 } }),
        ]),
      ),
    ).not.toThrow();
  });

  it('rechaza una región sin contorno cerrado y acepta la que tiene agujeros', () => {
    rejects(
      soundRegion({
        outer: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
        ],
      }),
      /al menos 3 puntos/,
    );
    rejects(soundRegion({ inners: [[{ x: 0, y: 0, z: 0 }]] }), /agujero 0/);
    expect(() =>
      validateCadDocumentPayload(
        withEntities([
          soundRegion({
            outer: [
              { x: 0, y: 0, z: 0 },
              { x: 10, y: 0, z: 0 },
              { x: 10, y: 10, z: 0 },
              { x: 0, y: 10, z: 0 },
            ],
            inners: [
              [
                { x: 2, y: 2, z: 0 },
                { x: 2, y: 4, z: 0 },
                { x: 4, y: 4, z: 0 },
              ],
            ],
          }),
        ]),
      ),
    ).not.toThrow();
  });

  it('rechaza coordenadas no finitas dentro del árbol', () => {
    rejects(
      soundSolid({
        nodes: [
          {
            id: 'e',
            op: 'extrude',
            profile: {
              outer: [
                { x: 0, y: 0 },
                { x: Number.NaN, y: 0 },
                { x: 1, y: 1 },
              ],
            },
            height: 10,
          },
        ],
        root: 'e',
      }),
      /no finito|finitos/,
    );
  });
});
