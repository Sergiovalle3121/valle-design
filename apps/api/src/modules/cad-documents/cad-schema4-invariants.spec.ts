import { BadRequestException } from '@nestjs/common';
import {
  CAD_DOCUMENT_MAX_SCHEMA,
  validateCadDocumentPayload,
} from './cad-document-validation';

/**
 * Invariantes de los ocho tipos que estrena el esquema 4.
 *
 * Mismo criterio fail-closed que el resto: un documento inválido se RECHAZA, no
 * se «arregla». Lo que se comprueba aquí no es que la validación exista, sino
 * que cada regla impide una forma concreta de geometría imposible — de esas que
 * no fallan en la frontera sino mucho después, en el render, en el índice
 * espacial o en la exportación, lejos de su causa.
 */
describe('schema 4 entity invariants', () => {
  const base = {
    meta: { schema: 4, version: 1, unit: 'mm' },
    entities: [] as Record<string, unknown>[],
    blocks: [] as Record<string, unknown>[],
    constraints: [],
  };

  const withEntities = (
    entities: Record<string, unknown>[],
    extra: Record<string, unknown> = {},
  ) => ({
    ...base,
    ...extra,
    entities,
    modelSpace: { entityIds: entities.map((entity) => String(entity.id)) },
  });

  const imageDefinition = {
    id: 'img-1',
    name: 'planta.png',
    uri: 'asset://tenant-1/planta.png',
    pixelWidth: 1024,
    pixelHeight: 768,
  };

  const sound: Record<string, Record<string, unknown>> = {
    point: {
      id: 'pt',
      type: 'point',
      position: { x: 0, y: 0, z: 0 },
      layer: '0',
    },
    xline: {
      id: 'xl',
      type: 'xline',
      basePoint: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      layer: '0',
    },
    ray: {
      id: 'ry',
      type: 'ray',
      basePoint: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
      layer: '0',
    },
    solid: {
      id: 'sd',
      type: 'solid',
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        { x: 10, y: 10, z: 0 },
      ],
      layer: '0',
    },
    wipeout: {
      id: 'wp',
      type: 'wipeout',
      boundary: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        { x: 10, y: 10, z: 0 },
      ],
      layer: '0',
    },
    image: {
      id: 'im',
      type: 'image',
      definition: 'img-1',
      insertion: { x: 0, y: 0, z: 0 },
      uVector: { x: 1, y: 0, z: 0 },
      vVector: { x: 0, y: 1, z: 0 },
      size: { width: 1024, height: 768 },
      layer: '0',
    },
    attdef: {
      id: 'at',
      type: 'attdef',
      tag: 'CODIGO',
      insertion: { x: 0, y: 0, z: 0 },
      height: 120,
      layer: '0',
    },
    table: {
      id: 'tb',
      type: 'table',
      insertion: { x: 0, y: 0, z: 0 },
      rows: 2,
      columns: 2,
      rowHeights: [100, 100],
      columnWidths: [400, 400],
      cells: [{ row: 1, column: 1, text: 'x' }],
      layer: '0',
    },
  };

  it('accepts the schema number the client now writes', () => {
    expect(() =>
      validateCadDocumentPayload(withEntities([sound.point])),
    ).not.toThrow();
    // Rechazar el esquema vigente convertiría cada guardado del editor en un
    // 400. Ancla contra la CONSTANTE, no contra el número que fuera el techo
    // el día que esto se escribió: fijarlo a mano es justo lo que dejó esta
    // prueba en rojo la vez que el techo subió y nadie la tocó.
    //
    // El techo subió a 10 con los siete DIMVARs de `dimension`
    // (DIMTXT/DIMTXSTY/DIMCLRT/DIMCLRD/DIMCLRE/DIMTAD/DIMJUST,
    // `cad-entities-v10.ts` en el cliente): puramente aditivo, ninguno
    // introduce una forma nueva que este validador deba comprobar por
    // campo. Este mismo par de aserciones, con 8/9 en vez de 9/10, se
    // quedó verde después de que el cliente subiera a
    // `CAD_DOCUMENT_SCHEMA = 10` (commit b3fada9): confirmaba que el
    // esquema 10 se RECHAZABA, cuando el cliente ya lo escribía en cada
    // guardado nuevo. La prueba pasaba y el guardado real fallaba con 400
    // — exactamente el modo de fallo que describe el comentario de
    // `CAD_DOCUMENT_MAX_SCHEMA`, y que la campaña 3D-M1 y el cierre M1 de
    // DWG encontraron cada una por su lado, de forma independiente: aquí
    // (DWG) por un E2E real (API + Postgres, no mockeado) al guardar un
    // documento importado; allá por un agente de investigación sobre el
    // precedente de migración de esquema. El techo desactualizado no era
    // específico de DWG: afectaba cualquier guardado.
    expect(() =>
      validateCadDocumentPayload({
        ...withEntities([sound.point]),
        meta: { schema: CAD_DOCUMENT_MAX_SCHEMA - 1, version: 1, unit: 'mm' },
      }),
    ).not.toThrow();
    expect(() =>
      validateCadDocumentPayload({
        ...withEntities([sound.point]),
        meta: { schema: CAD_DOCUMENT_MAX_SCHEMA, version: 1, unit: 'mm' },
      }),
    ).not.toThrow();
    expect(() =>
      validateCadDocumentPayload({
        ...withEntities([sound.point]),
        meta: { schema: CAD_DOCUMENT_MAX_SCHEMA + 1, version: 1, unit: 'mm' },
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts sound geometry of every new type', () => {
    for (const [type, entity] of Object.entries(sound)) {
      expect(() =>
        validateCadDocumentPayload(
          withEntities([entity], { imageDefinitions: [imageDefinition] }),
        ),
      ).not.toThrow();
      expect(type).toBeTruthy();
    }
  });

  it('rejects a construction line with no direction', () => {
    // Sin dirección no hay recta: sus bounds salen degenerados, el impacto mide
    // contra un punto y el índice espacial la guarda donde no está.
    for (const type of ['xline', 'ray']) {
      expect(() =>
        validateCadDocumentPayload(
          withEntities([{ ...sound[type], direction: { x: 0, y: 0, z: 0 } }]),
        ),
      ).toThrow(BadRequestException);
    }
  });

  it('rejects a solid with more than four vertices or a null edge', () => {
    expect(() =>
      validateCadDocumentPayload(
        withEntities([
          {
            ...sound.solid,
            points: [
              { x: 0, y: 0, z: 0 },
              { x: 10, y: 0, z: 0 },
              { x: 10, y: 10, z: 0 },
              { x: 0, y: 10, z: 0 },
              { x: 0, y: 5, z: 0 },
            ],
          },
        ]),
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateCadDocumentPayload(
        withEntities([
          {
            ...sound.solid,
            points: [
              { x: 0, y: 0, z: 0 },
              { x: 0, y: 0, z: 0 },
              { x: 10, y: 10, z: 0 },
            ],
          },
        ]),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a wipeout that does not enclose anything', () => {
    expect(() =>
      validateCadDocumentPayload(
        withEntities([
          {
            ...sound.wipeout,
            boundary: [
              { x: 0, y: 0, z: 0 },
              { x: 10, y: 0, z: 0 },
            ],
          },
        ]),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an image whose definition does not exist', () => {
    // Misma clase de referencia rota que un INSERT a un bloque inexistente: el
    // editor no puede resolverla y sólo se descubre al abrir el plano.
    expect(() =>
      validateCadDocumentPayload(withEntities([sound.image])),
    ).toThrow(BadRequestException);
    expect(() =>
      validateCadDocumentPayload(
        withEntities([{ ...sound.image, definition: 'otra' }], {
          imageDefinitions: [imageDefinition],
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an image squashed to a segment or with an impossible fade', () => {
    expect(() =>
      validateCadDocumentPayload(
        withEntities([{ ...sound.image, uVector: { x: 0, y: 0, z: 0 } }], {
          imageDefinitions: [imageDefinition],
        }),
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateCadDocumentPayload(
        withEntities([{ ...sound.image, size: { width: 0, height: 768 } }], {
          imageDefinitions: [imageDefinition],
        }),
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateCadDocumentPayload(
        withEntities([{ ...sound.image, fade: 140 }], {
          imageDefinitions: [imageDefinition],
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a local path as an image URI', () => {
    // Es a la vez una filtración de la máquina de quien dibujó y una referencia
    // que ningún otro usuario podrá resolver.
    expect(() =>
      validateCadDocumentPayload(
        withEntities([sound.image], {
          imageDefinitions: [
            { ...imageDefinition, uri: 'C:\\Users\\ana\\planta.png' },
          ],
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an attribute tag that no block could resolve', () => {
    for (const tag of ['', '   ', 'CON ESPACIO']) {
      expect(() =>
        validateCadDocumentPayload(withEntities([{ ...sound.attdef, tag }])),
      ).toThrow(BadRequestException);
    }
  });

  it('rejects a table whose grid does not match what it declares', () => {
    // Declarar 4 filas y traer 2 alturas dibuja una rejilla de otro tamaño que
    // el que dice la tabla, y las celdas caen en la fila equivocada.
    expect(() =>
      validateCadDocumentPayload(withEntities([{ ...sound.table, rows: 4 }])),
    ).toThrow(BadRequestException);
    expect(() =>
      validateCadDocumentPayload(
        withEntities([{ ...sound.table, rowHeights: [100, 0] }]),
      ),
    ).toThrow(BadRequestException);
    // Una celda fuera de la rejilla no se dibuja en ningún sitio: su texto
    // viaja en cada guardado y nadie lo ve nunca.
    expect(() =>
      validateCadDocumentPayload(
        withEntities([
          { ...sound.table, cells: [{ row: 5, column: 0, text: 'x' }] },
        ]),
      ),
    ).toThrow(BadRequestException);
  });

  it('still rejects non-finite coordinates in the new types', () => {
    expect(() =>
      validateCadDocumentPayload(
        withEntities([
          { ...sound.point, position: { x: Number.NaN, y: 0, z: 0 } },
        ]),
      ),
    ).toThrow(BadRequestException);
  });

  it('keeps accepting a schema 3 document untouched', () => {
    // La compatibilidad hacia atrás es el punto entero de que la migración sea
    // aditiva: un cliente que todavía escriba v3 sigue guardando.
    expect(() =>
      validateCadDocumentPayload({
        ...withEntities([
          {
            id: 'l1',
            type: 'line',
            start: { x: 0, y: 0, z: 0 },
            end: { x: 1, y: 0, z: 0 },
            layer: '0',
          },
        ]),
        meta: { schema: 3, version: 1, unit: 'mm' },
      }),
    ).not.toThrow();
  });
});
