import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, Subscription } from 'rxjs';
import { TenantContextService } from './tenant-context.service';
import { AuthenticatedUser } from '../types/authenticated-user.types';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    const ctx = {
      tenant_id: user?.tenant_id ?? null,
      organization_id: user?.organization_id ?? null,
      plant_id: user?.plant_id ?? null,
      user_email: user?.email ?? 'anonymous',
      role: user?.role ?? null,
      permissions: user?.permissions ?? null,
      scopes: user?.scopes ?? null,
    };

    // next.handle() is called inside run() so the entire async execution tree
    // (including TypeORM Promise chains) inherits this AsyncLocalStorage context.
    //
    // La suscripción interna se DEVUELVE como teardown. Sin esa línea, cuando
    // el consumidor se desuscribe —y eso es exactamente lo que hace Nest con un
    // `@Sse` cuando el cliente cierra el socket— sólo moría este envoltorio:
    // el observable del handler seguía vivo, su limpieza nunca corría y cada
    // stream cerrado dejaba un `setInterval` de latido y un oyente muerto que
    // se tragaba las señales de llamada en vez de dejarlas en el buzón. Es lo
    // que hacía que, tras una reconexión silenciosa del EventSource, la oferta
    // o la respuesta WebRTC se perdiera y los dos extremos se quedaran en
    // «Conectando…» sin un solo error en consola.
    return new Observable((subscriber) => {
      let inner: Subscription | undefined;
      this.tenantContext.run(ctx, () => {
        inner = next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
      return () => inner?.unsubscribe();
    });
  }
}
