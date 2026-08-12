import { BadRequestException } from '@nestjs/common';
import { validateCadDocumentPayload } from './cad-document-validation';

/**
 * Fase 2 — el validador canónico falla CERRADO.
 *
 * `cad-document-invariants.spec.ts` ya cubría radio, número no finito, spline y
 * ciclo de bloque. Un inventario de los discriminantes canónicos encontró que
 * el resto del contrato no se comprobaba en absoluto:
 *
 *  · LINE no tenía NINGUNA invariante propia: una línea sin `start`, con
 *    `start` de tipo string, o con los dos extremos en el mismo punto, cruzaba
 *    la frontera y reventaba OSNAP, bounds y exportación mucho después.
 *  · POLYLINE sólo miraba `vertices.length >= 2`: una cerrada de dos vértices
 *    no encierra área, un vértice repetido consecutivo produce un segmento
 *    nulo, y `closed` podía ser cualquier cosa.
 *  · Un INSERT podía apuntar a un bloque INEXISTENTE: la recursión sólo se
 *    exploraba desde `blocks[].entities`, así que un INSERT de primer nivel no
 *    se miraba, y un id desconocido se marcaba `done` sin error.
 *  · Los ids de bloque no eran obligatorios ni únicos: un bloque sin id se
 *    saltaba en silencio, y dos con el mismo id hacían impredecible qué
 *    resolvía un INSERT.
 *  · Las entidades ANIDADAS en un bloque no pasaban por las invariantes.
 *  · `modelSpace.entityIds` no exigía cubrir el documento: una entidad omitida
 *    existe pero no se dibuja nunca.
 *
 * Nada de esto se relaja para aceptar documentos viejos corruptos: lo que no
 * puede comprobarse por ausencia de dato (un documento sin `layers`, o sin
 * `modelSpace`) se declara explícitamente aquí.
 */
describe('canonical document integrity (fail-closed)', () => {
  const base = {
    meta: { schema: 3, version: 1, unit: 'mm' },
    entities: [] as Record<string, unknown>[],
    blocks: [] as Record<string, unknown>[],
    constraints: [],
  };

  const withEntities = (
    entities: Record<string, unknown>[],
    extra: Record<string, unknown> = {},
  ) => ({
    ...base,
    entities,
    modelSpace: { entityIds: entities.map((entity) => String(entity.id)) },
    ...extra,
  });

  const line = (over: Record<string, unknown> = {}) => ({
    id: 'line-1',
    type: 'line',
    start: { x: 0, y: 0, z: 0 },
    end: { x: 1_000, y: 0, z: 0 },
    layer: '0',
    ...over,
  });

  const reject = (document: unknown, matcher: RegExp) =>
    expect(() => validateCadDocumentPayload(document)).toThrow(matcher);

  /* ── LINE ─────────────────────────────────────────────────────────────── */

  describe('LINE', () => {
    it('accepts a well formed line', () => {
      expect(() =>
        validateCadDocumentPayload(withEntities([line()])),
      ).not.toThrow();
    });

    it.each([
      ['sin start', { start: undefined }],
      ['sin end', { end: undefined }],
      ['start que no es un objeto', { start: 'origen' }],
      ['end que es un arreglo', { end: [0, 0, 0] }],
      ['coordenada que no es número', { end: { x: '1000', y: 0, z: 0 } }],
      ['coordenada ausente', { end: { x: 1_000, z: 0 } }],
    ])('rechaza una línea %s', (_label, over) => {
      reject(withEntities([line(over)]), /línea/i);
    });

    it('rechaza una línea degenerada: sus dos extremos son el mismo punto', () => {
      reject(
        withEntities([line({ end: { x: 0, y: 0, z: 0 } })]),
        /extremos distintos/i,
      );
    });

    it('acepta una línea cuya longitud es pequeña pero real', () => {
      expect(() =>
        validateCadDocumentPayload(
          withEntities([line({ end: { x: 1e-6, y: 0, z: 0 } })]),
        ),
      ).not.toThrow();
    });

    it('rechaza una entidad sin capa', () => {
      reject(withEntities([line({ layer: '' })]), /capa/i);
    });

    it('rechaza una capa que el documento no declara', () => {
      reject(
        withEntities([line({ layer: 'FANTASMA' })], {
          layers: [{ id: '0', name: '0' }],
        }),
        /capa/i,
      );
    });

    it('acepta la capa cuando el documento SÍ la declara', () => {
      expect(() =>
        validateCadDocumentPayload(
          withEntities([line({ layer: 'MUROS' })], {
            layers: [
              { id: '0', name: '0' },
              { id: 'MUROS', name: 'Muros' },
            ],
          }),
        ),
      ).not.toThrow();
    });
  });

  /* ── POLYLINE ─────────────────────────────────────────────────────────── */

  describe('POLYLINE', () => {
    const polyline = (over: Record<string, unknown> = {}) => ({
      id: 'pl',
      type: 'polyline',
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1_000, y: 0, z: 0 },
        { x: 1_000, y: 1_000, z: 0 },
      ],
      closed: false,
      layer: '0',
      ...over,
    });

    it('acepta una abierta de dos vértices y una cerrada de tres', () => {
      expect(() =>
        validateCadDocumentPayload(
          withEntities([
            polyline({
              vertices: [
                { x: 0, y: 0, z: 0 },
                { x: 10, y: 0, z: 0 },
              ],
            }),
          ]),
        ),
      ).not.toThrow();
      expect(() =>
        validateCadDocumentPayload(withEntities([polyline({ closed: true })])),
      ).not.toThrow();
    });

    it('rechaza una CERRADA de dos vértices: no encierra área', () => {
      reject(
        withEntities([
          polyline({
            closed: true,
            vertices: [
              { x: 0, y: 0, z: 0 },
              { x: 10, y: 0, z: 0 },
            ],
          }),
        ]),
        /3 vértices/,
      );
    });

    it('rechaza un segmento consecutivo nulo', () => {
      reject(
        withEntities([
          polyline({
            vertices: [
              { x: 0, y: 0, z: 0 },
              { x: 0, y: 0, z: 0 },
              { x: 10, y: 10, z: 0 },
            ],
          }),
        ]),
        /segmento nulo/i,
      );
    });

    it('rechaza una cerrada cuyo último vértice repite el primero', () => {
      // El cierre lo declara `closed`; repetirlo produce un tramo de cierre de
      // longitud cero, que es exactamente el segmento nulo del caso anterior
      // pero en la costura.
      reject(
        withEntities([
          polyline({
            closed: true,
            vertices: [
              { x: 0, y: 0, z: 0 },
              { x: 10, y: 0, z: 0 },
              { x: 10, y: 10, z: 0 },
              { x: 0, y: 0, z: 0 },
            ],
          }),
        ]),
        /segmento nulo/i,
      );
    });

    it('rechaza un `closed` que no es booleano', () => {
      reject(withEntities([polyline({ closed: 'yes' })]), /closed/i);
    });

    it('rechaza un bulge no finito', () => {
      reject(
        withEntities([
          polyline({
            vertices: [
              { x: 0, y: 0, z: 0, bulge: Number.NaN },
              { x: 10, y: 0, z: 0 },
            ],
          }),
        ]),
        /no finito/i,
      );
    });

    it('rechaza un vértice que no es un objeto de coordenadas', () => {
      reject(
        withEntities([
          polyline({ vertices: [{ x: 0, y: 0, z: 0 }, 'siguiente'] }),
        ]),
        /vértice/i,
      );
    });
  });

  /* ── BLOCK / INSERT ───────────────────────────────────────────────────── */

  describe('BLOCK e INSERT', () => {
    const block = (over: Record<string, unknown> = {}) => ({
      id: 'blk',
      name: 'PUERTA',
      basePoint: { x: 0, y: 0, z: 0 },
      entities: [],
      ...over,
    });

    const insert = (over: Record<string, unknown> = {}) => ({
      id: 'ins',
      type: 'insert',
      block: 'blk',
      insertion: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: 0,
      layer: '0',
      ...over,
    });

    it('acepta un INSERT de primer nivel que resuelve a un bloque definido', () => {
      expect(() =>
        validateCadDocumentPayload(
          withEntities([insert()], { blocks: [block()] }),
        ),
      ).not.toThrow();
    });

    it('rechaza un INSERT de primer nivel que apunta a un bloque inexistente', () => {
      reject(
        withEntities([insert({ block: 'NO_EXISTE' })], { blocks: [block()] }),
        /bloque inexistente|no existe/i,
      );
    });

    it('rechaza un INSERT ANIDADO que apunta a un bloque inexistente', () => {
      reject(
        withEntities([], {
          blocks: [
            block({
              entities: [insert({ id: 'nested', block: 'NO_EXISTE' })],
            }),
          ],
        }),
        /bloque inexistente|no existe/i,
      );
    });

    it('rechaza un bloque sin id', () => {
      reject(
        withEntities([], { blocks: [block({ id: '' })] }),
        /id de bloque|ids de bloque/i,
      );
    });

    it('rechaza dos bloques con el mismo id', () => {
      reject(
        withEntities([], { blocks: [block(), block({ name: 'OTRA' })] }),
        /id de bloque|ids de bloque/i,
      );
    });

    it('rechaza un ciclo DIRECTO', () => {
      reject(
        withEntities([], {
          blocks: [block({ entities: [insert({ id: 'self', block: 'blk' })] })],
        }),
        /recursión|se contiene/i,
      );
    });

    it('rechaza un ciclo INDIRECTO a través de un tercer bloque', () => {
      reject(
        withEntities([], {
          blocks: [
            block({ id: 'a', entities: [insert({ id: 'i1', block: 'b' })] }),
            block({ id: 'b', entities: [insert({ id: 'i2', block: 'c' })] }),
            block({ id: 'c', entities: [insert({ id: 'i3', block: 'a' })] }),
          ],
        }),
        /recursión|se contiene/i,
      );
    });

    it('aplica las invariantes de entidad también DENTRO de un bloque', () => {
      reject(
        withEntities([], {
          blocks: [
            block({
              entities: [
                {
                  id: 'inner',
                  type: 'circle',
                  radius: -3,
                  center: { x: 0, y: 0, z: 0 },
                  layer: '0',
                },
              ],
            }),
          ],
        }),
        /radio positivo/i,
      );
    });
  });

  /* ── MODEL SPACE ──────────────────────────────────────────────────────── */

  describe('MODEL SPACE', () => {
    it('rechaza una entidad OMITIDA del orden de dibujo', () => {
      reject(
        {
          ...base,
          entities: [line(), line({ id: 'line-2' })],
          modelSpace: { entityIds: ['line-1'] },
        },
        /no se dibuja|omitida/i,
      );
    });

    it('rechaza un id inexistente en el orden de dibujo', () => {
      reject(
        {
          ...base,
          entities: [line()],
          modelSpace: { entityIds: ['fantasma'] },
        },
        /inexistente/,
      );
    });

    it('rechaza un id duplicado en el orden de dibujo', () => {
      reject(
        {
          ...base,
          entities: [line()],
          modelSpace: { entityIds: ['line-1', 'line-1'] },
        },
        /dos veces/,
      );
    });

    it('conserva el orden proporcionado, no lo reordena', () => {
      const document = validateCadDocumentPayload({
        ...base,
        entities: [
          line({ id: 'zeta' }),
          line({ id: 'medio' }),
          line({ id: 'alfa' }),
        ],
        modelSpace: { entityIds: ['zeta', 'medio', 'alfa'] },
      }) as { modelSpace: { entityIds: string[] } };
      expect(document.modelSpace.entityIds).toEqual(['zeta', 'medio', 'alfa']);
    });

    it('un documento SIN modelSpace sigue siendo válido (compatibilidad declarada)', () => {
      // Los documentos heredados no siempre traen orden de dibujo. No se
      // inventa uno ni se rechaza el documento: lo que no puede comprobarse
      // por ausencia de dato se declara, no se finge.
      expect(() =>
        validateCadDocumentPayload({ ...base, entities: [line()] }),
      ).not.toThrow();
    });
  });

  /* ── El rechazo es 400, nunca 500 ─────────────────────────────────────── */

  it('todo rechazo es un BadRequestException', () => {
    const hostile: unknown[] = [
      { ...base, entities: [line({ start: undefined })] },
      { ...base, entities: [line({ layer: '' })] },
      withEntities([], { blocks: [{ id: '', name: 'x', entities: [] }] }),
    ];
    for (const document of hostile) {
      expect(() => validateCadDocumentPayload(document)).toThrow(
        BadRequestException,
      );
    }
  });

  /* ── Referencias de restricciones y parámetros ────────────────────────── */

  describe('CONSTRAINTS', () => {
    const constrained = (
      constraints: Record<string, unknown>[],
      extra: Record<string, unknown> = {},
    ) => withEntities([line()], { constraints, ...extra });

    it('acepta una restricción cuyas referencias existen', () => {
      validateCadDocumentPayload(
        constrained([
          {
            id: 'k1',
            kind: 'horizontal',
            entityIds: ['line-1'],
            enabled: true,
          },
        ]),
      );
    });

    it('rechaza una restricción que referencia una entidad inexistente', () => {
      reject(
        constrained([
          {
            id: 'k1',
            kind: 'coincident',
            entityIds: ['line-1', 'ghost'],
            enabled: true,
          },
        ]),
        /restricción k1 referencia la entidad inexistente ghost/,
      );
    });

    it('rechaza una restricción sin entityIds', () => {
      reject(
        constrained([
          { id: 'k1', kind: 'horizontal', entityIds: [], enabled: true },
        ]),
        /necesita entityIds no vacíos/,
      );
    });

    it('rechaza una restricción cuyo parámetro no existe en el documento', () => {
      reject(
        constrained([
          {
            id: 'k1',
            kind: 'distance',
            entityIds: ['line-1'],
            value: 100,
            parameter: 'ancho',
            enabled: true,
          },
        ]),
        /restricción k1 referencia el parámetro inexistente ancho/,
      );
    });

    it('acepta el parámetro cuando el documento SÍ lo declara', () => {
      validateCadDocumentPayload(
        constrained(
          [
            {
              id: 'k1',
              kind: 'distance',
              entityIds: ['line-1'],
              value: 100,
              parameter: 'ancho',
              enabled: true,
            },
          ],
          { parameters: [{ name: 'ancho', expression: '100', value: 100 }] },
        ),
      );
    });
  });

  /* ── Sin contaminación del prototipo ──────────────────────────────────── */

  it('un `__proto__` en el payload no contamina Object.prototype', () => {
    const payload: unknown = JSON.parse(
      '{"meta":{"schema":3,"version":1,"unit":"mm"},"entities":[],"blocks":[],"constraints":[],"__proto__":{"pwned":true}}',
    );
    try {
      validateCadDocumentPayload(payload);
    } catch {
      /* aceptar o rechazar es indiferente aquí: lo que no puede pasar es esto */
    }
    expect(({} as Record<string, unknown>).pwned).toBeUndefined();
  });
});
