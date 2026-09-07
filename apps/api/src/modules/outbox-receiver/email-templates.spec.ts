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

  it('renderiza identity.new-sign-in — es un aviso de SEGURIDAD', () => {
    // Shape de identity.service.ts:543 (recordSignIn).
    const rendered = renderEmailTemplate(
      'identity.new-sign-in',
      {
        method: 'totp',
        at: '2026-09-05T12:00:00.000Z',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
      },
      base,
    );
    expect(rendered.subject).toContain('dispositivo nuevo');
    expect(rendered.text).toContain('código de tu aplicación de autenticación');
    expect(rendered.text).toContain('Mozilla/5.0');
    expect(rendered.text).toContain(`${base}/cuenta`);
    expect(rendered.text).toContain('cambia tu contraseña');
  });

  it('identity.new-sign-in acepta userAgent nulo y rechaza method desconocido', () => {
    const rendered = renderEmailTemplate(
      'identity.new-sign-in',
      { method: 'password', at: '2026-09-05T12:00:00.000Z', userAgent: null },
      base,
    );
    expect(rendered.text).toContain('No pudimos identificar el dispositivo');

    expect.assertions(3);
    try {
      renderEmailTemplate(
        'identity.new-sign-in',
        { method: 'huella', at: '2026-09-05T12:00:00.000Z' },
        base,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(EmailTemplateError);
      expect((error as EmailTemplateError).code).toBe('invalid_payload');
    }
  });

  it('renderiza commercial.trial-expiry sin amenazar y sin enseñar el planCode', () => {
    // Shape de trial-expiry-reminder.service.ts:147.
    const rendered = renderEmailTemplate(
      'commercial.trial-expiry',
      {
        organizationName: 'Despacho Río',
        planCode: 'individual',
        trialEndsAt: '2026-09-12T18:00:00.000Z',
        daysLeft: 1,
        readOnlyAfterExpiry: true,
      },
      base,
    );
    expect(rendered.subject).toContain('mañana');
    expect(rendered.text).toContain('Despacho Río');
    expect(rendered.text).toContain('tus planos siguen siendo tuyos');
    expect(rendered.text).toContain(`${base}/cuenta/facturacion`);
    expect(rendered.text).not.toContain('individual');
  });

  it('rechaza commercial.trial-expiry con daysLeft fuera de {7,1}', () => {
    expect.assertions(2);
    try {
      renderEmailTemplate(
        'commercial.trial-expiry',
        {
          organizationName: 'Despacho Río',
          trialEndsAt: '2026-09-12T18:00:00.000Z',
          daysLeft: 3,
          readOnlyAfterExpiry: true,
        },
        base,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(EmailTemplateError);
      expect((error as EmailTemplateError).code).toBe('invalid_payload');
    }
  });

  it('renderiza product.feedback — correo INTERNO, con contexto técnico', () => {
    // Shape de feedback.service.ts:111.
    const rendered = renderEmailTemplate(
      'product.feedback',
      {
        id: 'fb_1',
        kind: 'falla',
        message: 'El PLOT recorta mal la ventana gráfica',
        from: 'arq@example.test',
        organizationId: 'org_1',
        context: { ruta: '/studio/doc1', navegador: 'Chrome' },
      },
      base,
    );
    expect(rendered.subject).toContain('falla');
    expect(rendered.text).toContain('arq@example.test');
    expect(rendered.text).toContain('recorta mal la ventana gráfica');
    expect(rendered.text).toContain('ruta: /studio/doc1');
  });

  it('renderiza product.feedback sin organización ni contexto', () => {
    const rendered = renderEmailTemplate(
      'product.feedback',
      {
        id: 'fb_2',
        kind: 'duda',
        message: '¿Cómo exporto a PDF?',
        from: 'arq@example.test',
        organizationId: null,
        context: null,
      },
      base,
    );
    expect(rendered.text).toContain('sin organización');
  });

  it('renderiza support.incident con documento SÓLO si fue autorizado', () => {
    // Shape de support-incident.payload.ts.
    const autorizado = renderEmailTemplate(
      'support.incident',
      {
        summary: 'El editor se congeló al abrir un DXF grande',
        appVersion: '2026.09.1',
        userAgent: 'Mozilla/5.0',
        activeCommand: 'DXFIN',
        documentId: 'doc_123',
        documentAuthorized: true,
        reportedBy: 'user_1',
        organizationId: 'org_1',
        reportedAt: '2026-09-05T12:00:00.000Z',
        alcance: 'La persona autorizo EXPRESAMENTE revisar su documento.',
      },
      base,
    );
    expect(autorizado.text).toContain('doc_123');
    expect(autorizado.text).toContain('DXFIN');

    const sinAutorizar = renderEmailTemplate(
      'support.incident',
      {
        summary: 'No encuentro el comando LINE',
        appVersion: '2026.09.1',
        userAgent: 'Mozilla/5.0',
        activeCommand: null,
        documentId: null,
        documentAuthorized: false,
        reportedBy: 'user_2',
        organizationId: null,
        reportedAt: '2026-09-05T12:00:00.000Z',
        alcance: 'Reporte sin acceso al plano.',
      },
      base,
    );
    expect(sinAutorizar.text).toContain('no autorizado o no aplica');
    expect(sinAutorizar.text).not.toContain('doc_123');
  });

  it('rechaza una plantilla desconocida con error tipado', () => {
    expect.assertions(2);
    try {
      // Nombre que sigue la convención real (namespace.kebab-case) pero NO
      // existe en el árbol: ver la nota de coherencia en
      // email-template-coverage.spec.ts.
      renderEmailTemplate('marketing.newsletter-mensual', {}, base);
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
