import { createHmac } from 'node:crypto';
import {
  OutboxSignatureError,
  verifyOutboxSignature,
} from './outbox-signature';

/**
 * La firma se construye aquí EXACTAMENTE como la construye el emisor
 * (webhook-outbox.transport.ts:53-88 y su spec): HMAC-SHA256 hex sobre
 * `${timestamp}.${body}` con timestamp ISO. Si alguien cambia un lado del
 * contrato sin el otro, esta suite es la alarma.
 */
describe('verifyOutboxSignature', () => {
  const secret = 's'.repeat(48);

  function signedDelivery(options: { at?: Date; body?: string } = {}) {
    const timestamp = (options.at ?? new Date()).toISOString();
    const body =
      options.body ??
      JSON.stringify({
        id: 'outbox-1',
        queue: 'email',
        organizationId: null,
        tenantId: null,
        idempotencyKey: 'identity.verify-email:token-1',
        attemptCount: 1,
        recipient: 'user@example.test',
        template: 'identity.verify-email',
        payload: { token: 'secreto' },
      });
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    return {
      rawBody: Buffer.from(body, 'utf8'),
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'identity.verify-email:token-1',
        'x-valle-timestamp': timestamp,
        'x-valle-signature': `sha256=${signature}`,
      } as Record<string, string | string[] | undefined>,
    };
  }

  it('acepta una entrega firmada tal y como firma el transporte', () => {
    const { headers, rawBody } = signedDelivery();
    expect(() =>
      verifyOutboxSignature({ headers, rawBody, secret }),
    ).not.toThrow();
  });

  it('acepta dentro de la ventana de ±300 s y rechaza fuera', () => {
    const now = new Date('2026-08-20T12:00:00.000Z');
    const cases: Array<[number, boolean]> = [
      [-299_000, true],
      [299_000, true],
      [-301_000, false],
      [301_000, false],
    ];
    for (const [offsetMs, accepted] of cases) {
      const { headers, rawBody } = signedDelivery({
        at: new Date(now.getTime() + offsetMs),
      });
      const attempt = () =>
        verifyOutboxSignature({ headers, rawBody, secret, now });
      if (accepted) {
        expect(attempt).not.toThrow();
      } else {
        // Fuera de la ventana es un replay: se rechaza aunque la firma sea
        // criptográficamente correcta.
        expect(attempt).toThrow(OutboxSignatureError);
      }
    }
  });

  it('rechaza un cuerpo alterado después de firmar', () => {
    const { headers } = signedDelivery();
    const tampered = Buffer.from(
      JSON.stringify({ recipient: 'atacante@example.test' }),
      'utf8',
    );
    expect(() =>
      verifyOutboxSignature({ headers, rawBody: tampered, secret }),
    ).toThrow(OutboxSignatureError);
  });

  it('rechaza la firma de otro secreto', () => {
    const { headers, rawBody } = signedDelivery();
    expect(() =>
      verifyOutboxSignature({ headers, rawBody, secret: 'x'.repeat(48) }),
    ).toThrow(OutboxSignatureError);
  });

  it('falla CERRADO sin secreto configurado', () => {
    const { headers, rawBody } = signedDelivery();
    // Un HMAC con clave vacía verificaría cualquier cuerpo firmado con clave
    // vacía: la ausencia de secreto jamás puede significar «acepta todo».
    expect(() =>
      verifyOutboxSignature({ headers, rawBody, secret: '' }),
    ).toThrow(OutboxSignatureError);
  });

  it('rechaza cabeceras ausentes, repetidas o malformadas', () => {
    const { headers, rawBody } = signedDelivery();

    const sinTimestamp = { ...headers };
    delete sinTimestamp['x-valle-timestamp'];
    expect(() =>
      verifyOutboxSignature({ headers: sinTimestamp, rawBody, secret }),
    ).toThrow(OutboxSignatureError);

    const sinFirma = { ...headers };
    delete sinFirma['x-valle-signature'];
    expect(() =>
      verifyOutboxSignature({ headers: sinFirma, rawBody, secret }),
    ).toThrow(OutboxSignatureError);

    // Una cabecera repetida es ambigüedad, y la ambigüedad se rechaza.
    const repetida = {
      ...headers,
      'x-valle-timestamp': [
        String(headers['x-valle-timestamp']),
        String(headers['x-valle-timestamp']),
      ],
    };
    expect(() =>
      verifyOutboxSignature({ headers: repetida, rawBody, secret }),
    ).toThrow(OutboxSignatureError);

    const timestampNoIso = {
      ...headers,
      'x-valle-timestamp': String(Math.floor(Date.now() / 1000)),
    };
    expect(() =>
      verifyOutboxSignature({ headers: timestampNoIso, rawBody, secret }),
    ).toThrow(OutboxSignatureError);
  });

  it('rechaza firmas sin prefijo, no hexadecimales o de longitud equivocada', () => {
    const { headers, rawBody } = signedDelivery();
    const firma = String(headers['x-valle-signature']);

    const sinPrefijo = {
      ...headers,
      'x-valle-signature': firma.slice('sha256='.length),
    };
    expect(() =>
      verifyOutboxSignature({ headers: sinPrefijo, rawBody, secret }),
    ).toThrow(OutboxSignatureError);

    const noHex = {
      ...headers,
      'x-valle-signature': `sha256=${'z'.repeat(64)}`,
    };
    expect(() =>
      verifyOutboxSignature({ headers: noHex, rawBody, secret }),
    ).toThrow(OutboxSignatureError);

    const corta = { ...headers, 'x-valle-signature': firma.slice(0, -2) };
    expect(() =>
      verifyOutboxSignature({ headers: corta, rawBody, secret }),
    ).toThrow(OutboxSignatureError);
  });

  it('encuentra las cabeceras sin importar mayúsculas', () => {
    const { headers, rawBody } = signedDelivery();
    const capitalizadas: Record<string, string | string[] | undefined> = {
      'X-Valle-Timestamp': headers['x-valle-timestamp'],
      'X-Valle-Signature': headers['x-valle-signature'],
    };
    expect(() =>
      verifyOutboxSignature({ headers: capitalizadas, rawBody, secret }),
    ).not.toThrow();
  });
});
