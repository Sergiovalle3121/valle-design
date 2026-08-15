import {
  MAX_SCRUBBED_LENGTH,
  REDACTED,
  scrubStack,
  scrubTags,
  scrubText,
} from './scrub';

describe('saneo de PII y secretos antes de salir del proceso', () => {
  it.each([
    [
      'correo dentro del mensaje de un QueryFailedError',
      `duplicate key value violates unique constraint "uq_identity_users_email" DETAIL: Key (email)=(ana.perez@empresa.com) already exists.`,
      'ana.perez@empresa.com',
    ],
    [
      'URL de conexion con credenciales',
      'connect ECONNREFUSED postgres://valle:sup3rS3cret@db.interno:5432/valle_design',
      'sup3rS3cret',
    ],
    [
      'cabecera Authorization',
      'upstream rejected request: Authorization: Bearer abcDEF123456ghijkl',
      'abcDEF123456ghijkl',
    ],
    [
      'JWT completo',
      'token invalido eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.7Hk9wQ2ab_cd',
      'eyJhbGciOiJIUzI1NiJ9',
    ],
    [
      'cookie de sesion',
      'request failed; Cookie: __Host-valle_session=opaco-pero-valido; valle_csrf=xyz',
      '__Host-valle_session=opaco-pero-valido',
    ],
    [
      'asignacion a clave sensible',
      'webhook rechazado (OUTBOX_WEBHOOK_SECRET=clave-compartida-de-32-caracteres)',
      'clave-compartida-de-32-caracteres',
    ],
    [
      'UUID de tenant',
      'no existe documento para tenant 3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    ],
    [
      'hash de sesion / firma HMAC',
      'firma no coincide: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    ],
    [
      'cuerpo CAD en data URI',
      'no se pudo hidratar data:application/gzip;base64,H4sIAAAAAAAAABcdEFGHIJ',
      'H4sIAAAAAAAAABcdEFGHIJ',
    ],
  ])('redacta %s', (_caso, entrada, secreto) => {
    const salida = scrubText(entrada);
    expect(salida).not.toContain(secreto);
    expect(salida).toContain(REDACTED);
  });

  it('conserva lo que hace accionable el reporte: clase de error y ruta', () => {
    const salida = scrubText(
      'QueryFailedError en GET /v1/cad/documents/:documentId -> 500',
    );
    expect(salida).toContain('QueryFailedError');
    expect(salida).toContain('/v1/cad/documents/:documentId');
  });

  it('conserva el host de una URL de conexion (diagnostico) sin las credenciales', () => {
    const salida = scrubText('postgres://valle:secreto@db.interno:5432/valle');
    expect(salida).toContain('db.interno:5432');
    expect(salida).not.toContain('secreto');
  });

  it('trunca un mensaje enorme: un payload no es una senal', () => {
    const salida = scrubText('x'.repeat(MAX_SCRUBBED_LENGTH * 3));
    expect(salida.length).toBeLessThanOrEqual(MAX_SCRUBBED_LENGTH + 20);
    expect(salida).toContain('truncado');
  });

  it('es estable entre llamadas (los regex globales no arrastran lastIndex)', () => {
    const entrada = 'a@b.com y c@d.com';
    expect(scrubText(entrada)).toBe(scrubText(entrada));
    expect(scrubText(entrada)).toBe(`${REDACTED} y ${REDACTED}`);
  });

  it('acepta vacio, null y undefined sin lanzar', () => {
    expect(scrubText(undefined)).toBe('');
    expect(scrubText(null)).toBe('');
    expect(scrubText('')).toBe('');
  });

  describe('trazas', () => {
    const stack = [
      'QueryFailedError: duplicate key (email)=(ana@empresa.com)',
      '    at PostgresQueryRunner.query (/app/node_modules/typeorm/driver/postgres/PostgresQueryRunner.js:219:19)',
      '    at IdentityService.register (/app/apps/api/dist/modules/identity/identity.service.js:88:5)',
    ].join('\n');

    it('conserva archivos y lineas, que es lo unico util de un stack', () => {
      const salida = scrubStack(stack)!;
      expect(salida).toContain('PostgresQueryRunner.js:219:19');
      expect(salida).toContain('identity.service.js:88:5');
    });

    it('redacta la PII que arrastra la primera linea', () => {
      expect(scrubStack(stack)).not.toContain('ana@empresa.com');
    });

    it('acota el numero de frames', () => {
      const largo = [
        'Error: x',
        ...new Array<string>(200).fill('    at f (a.js:1:1)'),
      ].join('\n');
      expect(scrubStack(largo, 5)!.split('\n')).toHaveLength(6);
    });

    it('sin traza devuelve undefined', () => {
      expect(scrubStack(undefined)).toBeUndefined();
    });
  });

  describe('etiquetas', () => {
    it('redacta por NOMBRE de clave sin mirar el valor', () => {
      expect(
        scrubTags({ password: '1', api_key: 'x', authorization: 'y' }),
      ).toEqual({
        password: REDACTED,
        api_key: REDACTED,
        authorization: REDACTED,
      });
    });

    it('sanea tambien los valores de claves inocentes', () => {
      expect(scrubTags({ detalle: 'fallo para ana@empresa.com' })).toEqual({
        detalle: `fallo para ${REDACTED}`,
      });
    });

    it('conserva etiquetas de baja cardinalidad utiles para agrupar', () => {
      expect(
        scrubTags({ route: '/v1/commercial/plans', status_code: 500 }),
      ).toEqual({ route: '/v1/commercial/plans', status_code: '500' });
    });

    it('sin etiquetas devuelve un objeto vacio', () => {
      expect(scrubTags(undefined)).toEqual({});
    });
  });
});
