import { EmailSendError } from '../ports/email-sender.port';
import { NullEmailSender } from './null-email.sender';
import { ResendEmailSender } from './resend-email.sender';

describe('ResendEmailSender', () => {
  const originalFetch = globalThis.fetch;

  const configuration = {
    provider: 'resend' as const,
    apiKey: 're_test_123',
    from: 'Valle Design <no-responder@design.example.test>',
    linkBaseUrl: 'https://design.example.test',
  };

  const request = {
    to: 'user@example.test',
    subject: 'Confirma tu correo — Valle Design',
    html: '<p>hola</p>',
    text: 'hola',
    idempotencyKey: 'identity.verify-email:token-1',
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('envía a POST /emails con Bearer, Idempotency-Key y el remitente configurado', async () => {
    const mockedFetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }),
    );
    globalThis.fetch = mockedFetch as typeof fetch;

    await new ResendEmailSender(configuration).send(request);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockedFetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.resend.com/emails');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer re_test_123');
    // La clave estable es la mitad proveedor de la deduplicación: sin ella la
    // ventana «enviado pero sin commit del recibo» duplicaría correo.
    expect(headers.get('idempotency-key')).toBe(
      'identity.verify-email:token-1',
    );
    expect(JSON.parse(String(init.body))).toEqual({
      from: configuration.from,
      to: ['user@example.test'],
      subject: request.subject,
      html: request.html,
      text: request.text,
    });
  });

  it('convierte un rechazo del proveedor en EmailSendError con su status', async () => {
    globalThis.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ message: 'nope' }), { status: 422 }),
    ) as typeof fetch;

    await expect(
      new ResendEmailSender(configuration).send(request),
    ).rejects.toMatchObject({ name: 'EmailSendError', status: 422 });
  });

  it('convierte un fallo de red en EmailSendError retryable sin detalles', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('fetch failed: ECONNREFUSED user@example.test');
    }) as typeof fetch;

    const error: unknown = await new ResendEmailSender(configuration)
      .send(request)
      .catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as EmailSendError).status).toBeNull();
    // El mensaje jamás repite lo que dijo la red: podría llevar destinatario.
    expect((error as EmailSendError).message).not.toContain('example.test');
  });
});

describe('NullEmailSender', () => {
  it('se declara indisponible y rechaza enviar en vez de fingir', async () => {
    const sender = new NullEmailSender();
    expect(sender.descriptor()).toEqual({ name: 'null', available: false });
    await expect(
      sender.send({
        to: 'user@example.test',
        subject: 'x',
        html: 'x',
        text: 'x',
        idempotencyKey: 'k',
      }),
    ).rejects.toThrow(/No hay proveedor de correo configurado/);
  });
});
