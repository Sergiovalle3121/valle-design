import {
  buildSupportIncidentPayload,
  supportIncidentIdempotencyKey,
} from './support-incident.payload';
import { createHash } from 'node:crypto';

/**
 * Qué sale del navegador de una persona hacia el buzón de soporte.
 *
 * La decisión que estas pruebas custodian no es de transporte: es de
 * privacidad. Un reporte de error es de las pocas cosas que un usuario manda
 * sin saber del todo qué lleva dentro, y por eso el límite tiene que ser
 * comprobable y no una intención escrita en un comentario.
 */

const CONTEXTO = {
  reportedBy: 'arquitecta@despacho.mx',
  organizationId: 'org-1',
  reportedAt: new Date('2026-08-27T18:45:30.500Z'),
};

const BASE = {
  summary: '  Al acotar   un muro largo   la cota sale del revés  ',
  appVersion: '2026.08.27',
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
  uiMode: 'esencial' as const,
  activeCommand: 'DIM',
  documentId: '3f0f1b6e-8e3a-4d1f-9b2a-1c2d3e4f5a6b',
};

describe('el reporte de «algo salió mal»', () => {
  it('sin autorización, el identificador del documento NO viaja', () => {
    const payload = buildSupportIncidentPayload(
      { ...BASE, documentAuthorized: false },
      CONTEXTO,
    );
    expect(payload.documentId).toBeNull();
    expect(payload.documentAuthorized).toBe(false);
    // Y el propio mensaje lo dice, para quien lo lea sin conocer esta regla.
    expect(payload.alcance).toMatch(/no autoriz/iu);
  });

  it('un identificador que llega SIN permiso se descarta en el servidor', () => {
    // La autorización no se deduce de que el dato esté presente: eso
    // convertiría un fallo del cliente en una fuga.
    const payload = buildSupportIncidentPayload(
      { ...BASE, documentAuthorized: false, documentId: BASE.documentId },
      CONTEXTO,
    );
    expect(payload.documentId).toBeNull();
  });

  it('con autorización explícita viaja el identificador, jamás el contenido', () => {
    const payload = buildSupportIncidentPayload(
      { ...BASE, documentAuthorized: true },
      CONTEXTO,
    );
    expect(payload.documentId).toBe(BASE.documentId);
    expect(payload.alcance).toMatch(/nunca su contenido/iu);
    // Nada del payload puede parecerse a un dibujo.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/"entities"|"modelSpace"|"layers"/u);
  });

  it('lleva lo que hace falta para reproducir: versión, navegador, modo y comando', () => {
    const payload = buildSupportIncidentPayload(
      { ...BASE, documentAuthorized: false },
      CONTEXTO,
    );
    expect(payload.appVersion).toBe('2026.08.27');
    expect(payload.userAgent).toContain('Linux');
    expect(payload.uiMode).toBe('esencial');
    expect(payload.activeCommand).toBe('DIM');
    expect(payload.reportedBy).toBe('arquitecta@despacho.mx');
    // Al minuto: ver la razón en `support-incident.payload.ts`.
    expect(payload.reportedAt).toBe('2026-08-27T18:45:00.000Z');
  });

  it('acepta Pro y conserva clientes anteriores sin modo', () => {
    const pro = buildSupportIncidentPayload(
      { ...BASE, uiMode: 'pro', documentAuthorized: false },
      CONTEXTO,
    );
    expect(pro.uiMode).toBe('pro');
    const legacy = buildSupportIncidentPayload(
      { ...BASE, uiMode: undefined, documentAuthorized: false },
      CONTEXTO,
    );
    expect(legacy.uiMode).toBe('desconocido');
  });

  it('normaliza el texto sin comerse lo que la persona quiso decir', () => {
    const payload = buildSupportIncidentPayload(
      { ...BASE, documentAuthorized: false },
      CONTEXTO,
    );
    expect(payload.summary).toBe(
      'Al acotar un muro largo la cota sale del revés',
    );
  });

  it('recorta un texto desmedido en vez de rechazarlo', () => {
    const payload = buildSupportIncidentPayload(
      { ...BASE, summary: 'x'.repeat(5_000), documentAuthorized: false },
      CONTEXTO,
    );
    expect(payload.summary.length).toBe(2_000);
    expect(payload.summary.endsWith('…')).toBe(true);
  });

  it('sin comando en curso, el campo es nulo y no una cadena vacía', () => {
    const payload = buildSupportIncidentPayload(
      { ...BASE, activeCommand: null, documentAuthorized: false },
      CONTEXTO,
    );
    expect(payload.activeCommand).toBeNull();
  });
});

describe('la clave de idempotencia del reporte', () => {
  const hash = (value: string) =>
    createHash('sha256').update(value).digest('hex').slice(0, 16);

  it('un doble clic dentro del mismo minuto es UN reporte, con la MISMA carga', () => {
    const primero = buildSupportIncidentPayload(
      { ...BASE, documentAuthorized: false },
      CONTEXTO,
    );
    const segundo = buildSupportIncidentPayload(
      { ...BASE, documentAuthorized: false },
      { ...CONTEXTO, reportedAt: new Date('2026-08-27T18:45:59.900Z') },
    );
    expect(supportIncidentIdempotencyKey(primero, hash)).toBe(
      supportIncidentIdempotencyKey(segundo, hash),
    );
    // Misma clave Y misma carga: el outbox rechaza —con razón— una clave que
    // se repite con un contenido distinto, así que no basta con que la clave
    // coincida. Esta comprobación existe porque la primera versión fallaba
    // justo aquí, contra PostgreSQL.
    expect(primero).toEqual(segundo);
  });

  it('pero el mismo problema dos minutos después es un reporte NUEVO', () => {
    const primero = buildSupportIncidentPayload(
      { ...BASE, documentAuthorized: false },
      CONTEXTO,
    );
    const tarde = buildSupportIncidentPayload(
      { ...BASE, documentAuthorized: false },
      { ...CONTEXTO, reportedAt: new Date('2026-08-27T18:47:30.500Z') },
    );
    expect(supportIncidentIdempotencyKey(primero, hash)).not.toBe(
      supportIncidentIdempotencyKey(tarde, hash),
    );
  });

  it('el mismo texto en Esencial y Pro produce dos reportes distinguibles', () => {
    const esencial = buildSupportIncidentPayload(
      { ...BASE, uiMode: 'esencial', documentAuthorized: false },
      CONTEXTO,
    );
    const pro = buildSupportIncidentPayload(
      { ...BASE, uiMode: 'pro', documentAuthorized: false },
      CONTEXTO,
    );
    expect(supportIncidentIdempotencyKey(esencial, hash)).not.toBe(
      supportIncidentIdempotencyKey(pro, hash),
    );
  });

  it('no confunde reintentos con reportes que cambian el contexto o el permiso del plano', () => {
    const original = buildSupportIncidentPayload(
      { ...BASE, documentAuthorized: false },
      CONTEXTO,
    );
    const changed = [
      buildSupportIncidentPayload(
        { ...BASE, activeCommand: 'HATCH', documentAuthorized: false },
        CONTEXTO,
      ),
      buildSupportIncidentPayload(
        { ...BASE, appVersion: '2026.08.28', documentAuthorized: false },
        CONTEXTO,
      ),
      buildSupportIncidentPayload(
        {
          ...BASE,
          userAgent: 'Mozilla/5.0 Firefox',
          documentAuthorized: false,
        },
        CONTEXTO,
      ),
      buildSupportIncidentPayload(
        { ...BASE, documentAuthorized: true },
        CONTEXTO,
      ),
      buildSupportIncidentPayload(
        { ...BASE, documentAuthorized: false },
        { ...CONTEXTO, organizationId: 'org-2' },
      ),
    ];
    for (const next of changed) {
      expect(supportIncidentIdempotencyKey(next, hash)).not.toBe(
        supportIncidentIdempotencyKey(original, hash),
      );
    }
  });

  it('y dos personas distintas nunca se pisan', () => {
    const una = buildSupportIncidentPayload(
      { ...BASE, documentAuthorized: false },
      CONTEXTO,
    );
    const otra = buildSupportIncidentPayload(
      { ...BASE, documentAuthorized: false },
      { ...CONTEXTO, reportedBy: 'otro@despacho.mx' },
    );
    expect(supportIncidentIdempotencyKey(una, hash)).not.toBe(
      supportIncidentIdempotencyKey(otra, hash),
    );
  });

  it('no escribe correo, texto ni identificador de plano en claro en la clave', () => {
    const payload = buildSupportIncidentPayload(
      { ...BASE, documentAuthorized: true },
      CONTEXTO,
    );
    const key = supportIncidentIdempotencyKey(payload, hash);
    expect(key).not.toContain(CONTEXTO.reportedBy);
    expect(key).not.toContain(payload.summary);
    expect(key).not.toContain(BASE.documentId);
  });
});
