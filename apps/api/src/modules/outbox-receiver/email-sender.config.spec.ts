import {
  EmailSenderConfigurationError,
  resolveEmailSenderConfiguration,
} from './email-sender.config';

describe('resolveEmailSenderConfiguration', () => {
  const complete = {
    EMAIL_SENDER_PROVIDER: 'resend',
    EMAIL_SENDER_API_KEY: 're_123',
    EMAIL_SENDER_FROM: 'Valle Design <no-responder@design.example.test>',
    OUTBOX_EMAIL_LINK_BASE_URL: 'https://design.example.test',
  };

  it('sin ninguna variable devuelve null (adaptador nulo, nada finge enviar)', () => {
    expect(resolveEmailSenderConfiguration({})).toBeNull();
  });

  it('con las cuatro devuelve la configuración normalizada', () => {
    expect(
      resolveEmailSenderConfiguration({
        ...complete,
        OUTBOX_EMAIL_LINK_BASE_URL: 'https://design.example.test/app/',
      }),
    ).toEqual({
      provider: 'resend',
      apiKey: 're_123',
      from: 'Valle Design <no-responder@design.example.test>',
      // Sin barra final: las plantillas concatenan `path`, que empieza por /.
      linkBaseUrl: 'https://design.example.test/app',
    });
  });

  it('con una configuración PARCIAL tumba el arranque con mensaje accionable', () => {
    for (const missing of Object.keys(complete)) {
      const partial: NodeJS.ProcessEnv = { ...complete };
      delete partial[missing];
      expect(() => resolveEmailSenderConfiguration(partial)).toThrow(
        /obligatorias juntas/,
      );
    }
  });

  it('rechaza un proveedor sin adaptador implementado', () => {
    expect(() =>
      resolveEmailSenderConfiguration({
        ...complete,
        EMAIL_SENDER_PROVIDER: 'sendgrid',
      }),
    ).toThrow(EmailSenderConfigurationError);
  });

  it('rechaza un remitente que el proveedor descartaría', () => {
    expect(() =>
      resolveEmailSenderConfiguration({
        ...complete,
        EMAIL_SENDER_FROM: 'no-es-un-correo',
      }),
    ).toThrow(EmailSenderConfigurationError);
  });

  it('exige HTTPS en la base de enlaces salvo loopback fuera de producción', () => {
    expect(() =>
      resolveEmailSenderConfiguration({
        ...complete,
        NODE_ENV: 'production',
        OUTBOX_EMAIL_LINK_BASE_URL: 'http://design.example.test',
      }),
    ).toThrow(EmailSenderConfigurationError);

    expect(
      resolveEmailSenderConfiguration({
        ...complete,
        NODE_ENV: 'test',
        OUTBOX_EMAIL_LINK_BASE_URL: 'http://localhost:3000',
      }),
    ).toMatchObject({ linkBaseUrl: 'http://localhost:3000' });
  });

  it('rechaza credenciales, query o fragmento en la base de enlaces', () => {
    for (const url of [
      'https://user:pass@design.example.test',
      'https://design.example.test/?utm=x',
      'https://design.example.test/#seccion',
    ]) {
      expect(() =>
        resolveEmailSenderConfiguration({
          ...complete,
          OUTBOX_EMAIL_LINK_BASE_URL: url,
        }),
      ).toThrow(EmailSenderConfigurationError);
    }
  });
});
