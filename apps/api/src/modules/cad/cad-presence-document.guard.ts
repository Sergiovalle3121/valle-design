import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.types';
import { CadDocumentsRepository } from './cad-documents.repository';

/**
 * Verifica documento+tenant ANTES de que arranque la maquinaria SSE — un
 * guard, no la comprobación dentro del handler.
 *
 * ── Por qué no basta con comprobar dentro de `CadPresenceService.stream()` ──
 * NestJS confirma cabeceras SSE por un `setTimeout(0)` que corre casi de
 * inmediato tras la suscripción (ver `router-response-controller.js`,
 * comentario "Commit SSE headers on the next macrotask"), y sólo se salta ese
 * commit si el handler YA falló — algo que sólo pasa a tiempo para un error
 * SÍNCRONO o de puro microtask. Una consulta real a PostgreSQL cruza E/S de
 * verdad y pierde esa carrera casi siempre: verificado empíricamente aquí
 * (`cad-presence-tenant-isolation.pg.spec.ts` devolvía 200 en vez de 404 para
 * el documento de otro tenant antes de este guard). Los GUARDS, en cambio,
 * los espera el propio núcleo de Nest (`await fnCanActivate(...)`) ANTES de
 * construir la cadena de interceptores/SSE — sin carrera posible.
 *
 * ── Por qué lee `request.user` en vez de `TenantContextService` ────────────
 * Los guards corren ANTES de `TenantInterceptor` (que es quien abre el
 * `AsyncLocalStorage`), así que el tenant todavía no está en el ALS en este
 * punto del ciclo de vida. El tenant sale de `request.user` — que
 * `CadAuthGuard`, el PRIMER guard global, ya dejó puesto — y este guard abre
 * su PROPIO `tenantContext.run()` alrededor de la comprobación, exactamente
 * la misma forma en que `TenantInterceptor` lo hace más tarde para el resto
 * del request.
 */
@Injectable()
export class CadPresenceDocumentGuard implements CanActivate {
  constructor(
    private readonly documents: CadDocumentsRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const documentId = (request.params as Record<string, string>)?.documentId;
    if (!documentId) return true;

    const user = (request as Request & { user?: AuthenticatedUser }).user;
    await this.tenantContext.run(
      {
        tenant_id: user?.tenant_id ?? null,
        organization_id: user?.organization_id ?? null,
        plant_id: user?.plant_id ?? null,
        user_email: user?.email ?? 'anonymous',
        role: user?.role ?? null,
        permissions: user?.permissions ?? null,
        scopes: user?.scopes ?? null,
      },
      () => this.documents.getDocument(documentId),
    );
    return true;
  }
}
