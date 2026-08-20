import { EmailTemplateError, renderEmailTemplate } from './email-templates';

describe('renderEmailTemplate', () => {
  const base = 'https://design.example.test';
  const expiresAt = '2026-08-21T18:00:00.000Z';

  // El shape calca lo que encola identity.service.ts (enqueueIdentityEmail):
  // el token viaja suelto Y dentro de `path` como query ya codificada.
  const identityPayload = {
    token: 'tok_&<>"raro',
    path: `/verify-email?token=${encodeURIComponent('tok_&<>"raro')}`,
    expiresAt,
  };

  it('renderiza identity.verify-email con enlace ABSOLUTO y en español', () => {
    const rendered = renderEmailTemplate(
      'identity.verify-email',
      identityPayload,
      base,
    );
    expect(rendered.subject).toBe('Confirma tu correo — Valle Design');
    const expectedLink = `${base}${identityPayload.path}`;
    expect(rendered.text).toContain(expectedLink);
    // En HTML el enlace vive escapado como atributo (& → &amp;).
    expect(rendered.html).toContain(
      `href="${expectedLink.replace(/&/g, '&amp;')}"`,
    );
    expect(rendered.text).toContain('caduca');
    expect(rendered.text).toContain('hora del centro de México');
    expect(rendered.html).toContain('lang="es"');
  });

  it('renderiza identity.reset-password con su propio asunto y aviso', () => {
    const payload = {
      ...identityPayload,
      path: `/reset-password?token=abc`,
    };
    const rendered = renderEmailTemplate(
      'identity.reset-password',
      payload,
      base,
    );
    expect(rendered.subject).toBe('Restablece tu contraseña — Valle Design');
    expect(rendered.text).toContain(`${base}/reset-password?token=abc`);
    expect(rendered.text).toContain('tu contraseña actual sigue siendo válida');
  });

  it('renderiza organization.invitation con el código y SIN enlaces inventados', () => {
    // Shape de organizations.controller.ts:367-381.
    const rendered = renderEmailTemplate(
      'organization.invitation',
      {
        invitationId: 'b8b9d61e-58a7-4b3f-9f2f-1a2b3c4d5e6f',
        token: 'inv_token_123',
        organizationName: 'Despacho Río <script>alert(1)</script>',
      },
      base,
    );
    expect(rendered.subject).toContain('Despacho Río');
    expect(rendered.text).toContain('inv_token_123');
    expect(rendered.text).toContain(base);
    // No existe página de aceptación: el correo NO debe fabricar una ruta.
    expect(rendered.text).not.toContain('/invitations');
    expect(rendered.html).not.toContain('/invitations');
    // El nombre de la organización lo escribe un usuario: se escapa siempre.
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
  });

  it('renderiza commercial.renewal-reminder con fecha mexicana y enlace real', () => {
    // Shape de renewal-reminder.service.ts (runOnce → enqueue).
    const rendered = renderEmailTemplate(
      'commercial.renewal-reminder',
      {
        organizationName: 'Despacho Río <script>alert(1)</script>',
        planCode: 'individual',
        currentPeriodEnd: '2026-08-25T18:00:00.000Z',
      },
      base,
    );
    expect(rendered.subject).toBe('Tu suscripción vence pronto — Valle Design');
    // OXXO/SPEI: el correo dice POR QUÉ no se renueva sola.
    expect(rendered.text).toContain('no se renueva');
    expect(rendered.text).toContain('OXXO');
    expect(rendered.text).toContain('hora del centro de México');
    // El enlace apunta a la página de facturación que SÍ existe en el web.
    expect(rendered.text).toContain(`${base}/cuenta/facturacion`);
    expect(rendered.html).toContain(`href="${base}/cuenta/facturacion"`);
    // El código interno del plan no se le enseña al cliente.
    expect(rendered.text).not.toContain('individual');
    // El nombre de la organización lo escribe un usuario: se escapa siempre.
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
  });

  it('rechaza un recordatorio sin organización o con fecha inválida', () => {
    for (const payload of [
      null,
      {},
      { organizationName: 'Despacho', currentPeriodEnd: 'no-es-fecha' },
      { organizationName: 'Despacho' }, // sin currentPeriodEnd
      { currentPeriodEnd: '2026-08-25T18:00:00.000Z' }, // sin organización
    ]) {
      expect.hasAssertions();
      try {
        renderEmailTemplate('commercial.renewal-reminder', payload, base);
        throw new Error('debió rechazar el payload');
      } catch (error) {
        expect(error).toBeInstanceOf(EmailTemplateError);
        expect((error as EmailTemplateError).code).toBe('invalid_payload');
      }
    }
  });

  it('rechaza una plantilla desconocida con error tipado', () => {
    expect.assertions(2);
    try {
      renderEmailTemplate('marketing.navidad', {}, base);
    } catch (error) {
      expect(error).toBeInstanceOf(EmailTemplateError);
      expect((error as EmailTemplateError).code).toBe('unknown_template');
    }
  });

  it('rechaza payloads sin los campos que la plantilla usa', () => {
    for (const payload of [
      null,
      {},
      { path: '/verify-email', expiresAt: 'no-es-fecha' },
      { path: '/verify-email' }, // sin expiresAt
      { expiresAt }, // sin path
    ]) {
      expect.hasAssertions();
      try {
        renderEmailTemplate('identity.verify-email', payload, base);
        throw new Error('debió rechazar el payload');
      } catch (error) {
        expect(error).toBeInstanceOf(EmailTemplateError);
        expect((error as EmailTemplateError).code).toBe('invalid_payload');
      }
    }
  });

  it('rechaza rutas que sacarían el enlace del dominio propio', () => {
    for (const path of ['//evil.example/x', 'https://evil.example/x', 'x']) {
      try {
        renderEmailTemplate(
          'identity.verify-email',
          { ...identityPayload, path },
          base,
        );
        throw new Error('debió rechazar la ruta');
      } catch (error) {
        expect(error).toBeInstanceOf(EmailTemplateError);
        expect((error as EmailTemplateError).code).toBe('invalid_payload');
      }
    }
  });
});
