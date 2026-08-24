import { BadRequestException } from '@nestjs/common';
import {
  CAD_DOCUMENT_MAX_SCHEMA,
  validateCadDocumentPayload,
} from './cad-document-validation';

/**
 * Invariantes de la CÁMARA de una ventana gráfica en la frontera del servidor.
 *
 * El esquema 8 le da dirección de vista a la ventana: deja de ser un recorte
 * del plano XY y pasa a poder mirar un alzado o un corte. Una cámara degenerada
 * —dirección de longitud cero, o una vertical paralela a la mirada— no se
 * detecta mirándola: el documento guarda, abre y se dibuja, y lo que falla es
 * el TRAZADO, mucho después y lejos de quien la metió.
 *
 * Por eso se valida al entrar. Es la misma regla que ya aplican los huecos y
 * los sólidos: lo que no se puede resolver no se aproxima, se rechaza con el
 * motivo.
 *
 * Cada rechazo trae su gemelo VÁLIDO. Una validación que rechazara todo también
 * pasaría los rechazos, y no estaría defendiendo nada.
 */
describe('schema 8 viewport view invariants', () => {
  const viewport = (view?: unknown) => ({
    id: 'vp1',
    paperBounds: { x: 10, y: 10, width: 180, height: 120 },
    modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
    scale: 50,
    locked: false,
    ...(view === undefined ? {} : { view }),
  });

  const withViewport = (view?: unknown) => ({
    meta: { schema: 8, version: 1, unit: 'mm' },
    entities: [],
    blocks: [],
    constraints: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [
      {
        id: 'layout:1',
        name: 'Planta',
        entityIds: [],
        page: {
          width: 420,
          height: 297,
          unit: 'mm',
          orientation: 'landscape',
        },
        viewports: [viewport(view)],
      },
    ],
  });

  const planta = {
    projection: 'parallel',
    kind: 'plan',
    target: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 1, z: 0 },
  };

  const alzado = {
    projection: 'parallel',
    kind: 'elevation',
    target: { x: 2_000, y: 0, z: 1_300 },
    direction: { x: 0, y: 1, z: 0 },
    up: { x: 0, y: 0, z: 1 },
  };

  const corte = {
    projection: 'parallel',
    kind: 'section',
    target: { x: 500, y: 0, z: 0 },
    direction: { x: 0, y: -1, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    sectionPlane: {
      origin: { x: 500, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
    },
  };

  it('acepta las tres cámaras bien formadas, y la ventana SIN cámara', () => {
    for (const view of [planta, alzado, corte]) {
      expect(() =>
        validateCadDocumentPayload(withViewport(view)),
      ).not.toThrow();
    }
    // Una ventana sin `view` es lo que trae CUALQUIER documento del esquema 7,
    // y también lo que fabrica un importador. Rechazarla convertiría en 400 el
    // guardado de todo lo que existía antes de esta ola: el campo es opcional
    // en la frontera y lo escribe la migración del cliente al abrir.
    expect(() => validateCadDocumentPayload(withViewport())).not.toThrow();
  });

  it('rechaza una dirección de mirada de longitud cero', () => {
    // No hay nada que adivinar: sin dirección no hay proyección, y elegir una
    // por el cliente dibujaría una lámina que nadie pidió.
    expect(() =>
      validateCadDocumentPayload(
        withViewport({ ...planta, direction: { x: 0, y: 0, z: 0 } }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rechaza una vertical paralela a la mirada', () => {
    // El «arriba» del papel queda indefinido: el alzado saldría girado un
    // ángulo cualquiera, distinto en cada corrida.
    expect(() =>
      validateCadDocumentPayload(
        withViewport({ ...alzado, up: { x: 0, y: 2, z: 0 } }),
      ),
    ).toThrow(BadRequestException);
    // Y el gemelo: casi paralela pero no del todo SÍ define una vista.
    expect(() =>
      validateCadDocumentPayload(
        withViewport({ ...alzado, up: { x: 0, y: 1, z: 0.001 } }),
      ),
    ).not.toThrow();
  });

  it('rechaza coordenadas no finitas en la cámara', () => {
    for (const field of ['target', 'direction', 'up']) {
      expect(() =>
        validateCadDocumentPayload(
          withViewport({ ...planta, [field]: { x: 0, y: 0, z: 'arriba' } }),
        ),
      ).toThrow(BadRequestException);
    }
  });

  it('rechaza una clase de vista desconocida y una proyección que no es paralela', () => {
    expect(() =>
      validateCadDocumentPayload(
        withViewport({ ...planta, kind: 'isometrica' }),
      ),
    ).toThrow(BadRequestException);
    // La perspectiva no es un descuido: una lámina en perspectiva no se puede
    // acotar, y aceptarla aquí sería prometer algo que el trazado no sabe hacer.
    expect(() =>
      validateCadDocumentPayload(
        withViewport({ ...planta, projection: 'perspective' }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rechaza una sección sin plano de corte o con normal nula', () => {
    const corteMutilado = { ...corte, sectionPlane: undefined };
    expect(() =>
      validateCadDocumentPayload(withViewport(corteMutilado)),
    ).toThrow(BadRequestException);
    expect(() =>
      validateCadDocumentPayload(
        withViewport({
          ...corte,
          sectionPlane: {
            origin: { x: 0, y: 0, z: 0 },
            normal: { x: 0, y: 0, z: 0 },
          },
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('acepta el esquema vigente y rechaza el siguiente, que todavía no existe', () => {
    expect(() =>
      validateCadDocumentPayload(withViewport(planta)),
    ).not.toThrow();
    expect(() =>
      validateCadDocumentPayload({
        ...withViewport(planta),
        meta: { schema: CAD_DOCUMENT_MAX_SCHEMA, version: 1, unit: 'mm' },
      }),
    ).not.toThrow();
    expect(() =>
      validateCadDocumentPayload({
        ...withViewport(planta),
        meta: { schema: CAD_DOCUMENT_MAX_SCHEMA + 1, version: 1, unit: 'mm' },
      }),
    ).toThrow(BadRequestException);
  });
});
