import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EmailTemplateError, renderEmailTemplate } from './email-templates';

/**
 * El gate que T-17 pedía: la lista cerrada de `email-templates.ts` no se
 * puede mantener sincronizada a mano — ya se desincronizó una vez, en
 * silencio, y cuatro correos (uno de SEGURIDAD) se descartaban con `200` sin
 * que ninguna prueba lo notara, porque las dos específicas de "plantilla
 * desconocida" usaban un nombre inventado, nunca uno real del árbol.
 *
 * Esta prueba no confía en una lista escrita a mano tampoco: RECORRE el
 * código fuente de la API buscando cada sitio que encola un correo —
 * `template: 'x'`, `template: CONSTANTE` y el envoltorio posicional
 * `enqueueIdentityEmail(...)` de identity.service.ts— y exige que
 * `renderEmailTemplate` tenga un `case` para cada nombre encontrado. Un
 * módulo nuevo que encole una plantilla nueva sin su renderizador rompe este
 * spec, no lo esquiva.
 */
describe('cobertura de plantillas de correo (T-17)', () => {
  const apiSrcRoot = join(__dirname, '..', '..');

  function listSourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const full = join(dir, entry);
      const info = statSync(full);
      if (info.isDirectory()) {
        listSourceFiles(full, out);
      } else if (
        entry.endsWith('.ts') &&
        !entry.endsWith('.spec.ts') &&
        !entry.endsWith('.d.ts')
      ) {
        out.push(full);
      }
    }
    return out;
  }

  function findEnqueuedTemplateNames(source: string): Set<string> {
    const found = new Set<string>();

    // Constantes exportadas cuyo valor es el nombre de una plantilla, p.ej.
    // `export const FEEDBACK_TEMPLATE = 'product.feedback';`.
    const constValues = new Map<string, string>();
    for (const match of source.matchAll(
      /const\s+([A-Z][A-Z0-9_]*)\s*(?::\s*string)?\s*=\s*'([a-z0-9][a-z0-9_.-]*)'/g,
    )) {
      constValues.set(match[1], match[2]);
    }

    // `template: 'literal'` — la mayoría de los sitios de encolado.
    for (const match of source.matchAll(
      /\btemplate:\s*'([a-z0-9][a-z0-9_.-]*)'/g,
    )) {
      found.add(match[1]);
    }

    // `template: CONSTANTE` — resuelto contra las constantes de arriba.
    for (const match of source.matchAll(/\btemplate:\s*([A-Z][A-Z0-9_]*)\b/g)) {
      const resolved = constValues.get(match[1]);
      if (resolved) found.add(resolved);
    }

    // Los dos envoltorios posicionales de identity.service.ts:
    // `issueIdentityEmailToken(user, 'verify_email', ttl, 'identity.x', '/ruta')`
    // y, por debajo, `enqueueIdentityEmail(manager, user, token, raw,
    // 'identity.x', '/ruta')`. El nombre de plantilla es el literal con
    // FORMA `namespace.algo` (con un punto); los demás literales posicionales
    // (`'verify_email'`, `'/verify-email'`) no tienen esa forma.
    for (const match of source.matchAll(
      /(?:issueIdentityEmailToken|enqueueIdentityEmail)\(([\s\S]*?)\)/g,
    )) {
      for (const literal of match[1].matchAll(/'([a-z0-9][a-z0-9_.-]*)'/g)) {
        if (/^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/.test(literal[1])) {
          found.add(literal[1]);
        }
      }
    }

    return found;
  }

  it('recorre el árbol y exige renderizador para cada plantilla que se encola', () => {
    const files = listSourceFiles(apiSrcRoot);
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    const enqueued = findEnqueuedTemplateNames(source);

    // Salvaguarda contra un cambio en el escaneo que dejara de encontrar
    // nada: hoy el árbol encola ocho nombres reales.
    expect(enqueued.size).toBeGreaterThanOrEqual(8);
    expect(enqueued).toEqual(
      new Set([
        'identity.verify-email',
        'identity.reset-password',
        'identity.new-sign-in',
        'organization.invitation',
        'commercial.renewal-reminder',
        'commercial.trial-expiry',
        'product.feedback',
        'support.incident',
      ]),
    );

    const sinRenderizador: string[] = [];
    for (const template of enqueued) {
      try {
        // Un payload vacío basta: lo único que nos importa es distinguir
        // `unknown_template` (el hueco que este gate cierra) de
        // `invalid_payload` (la plantilla EXISTE, sólo rechaza este payload).
        renderEmailTemplate(template, {}, 'https://design.example.test');
      } catch (error) {
        if (
          error instanceof EmailTemplateError &&
          error.code === 'unknown_template'
        ) {
          sinRenderizador.push(template);
        }
      }
    }
    expect(sinRenderizador).toEqual([]);
  });
});
