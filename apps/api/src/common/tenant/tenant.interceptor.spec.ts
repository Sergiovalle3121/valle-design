import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';
import { TenantInterceptor } from './tenant.interceptor';

/**
 * El interceptor de tenant envuelve TODOS los handlers (APP_INTERCEPTOR) en un
 * `Observable` propio. Para un `@Sse`, Nest se desuscribe de ese observable
 * cuando el cliente cierra el socket, y es la ÚNICA señal que recibe el
 * handler para limpiar (parar el latido, soltar al participante de la sala).
 * Si el envoltorio no reenvía la desuscripción hacia dentro, la limpieza no
 * corre nunca: el latido sigue, el oyente queda muerto y las señales de la
 * llamada se pierden en silencio. Esta prueba fija que la desuscripción
 * atraviesa el interceptor, y de paso que el contexto sigue llegando al
 * handler.
 */

function contextoHttp(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('TenantInterceptor', () => {
  it('la desuscripción del consumidor desmonta el observable del handler', () => {
    const tenantContext = new TenantContextService();
    const interceptor = new TenantInterceptor(tenantContext);
    let desmontado = false;
    let latidos = 0;
    const handler: CallHandler = {
      handle: () =>
        new Observable((subscriber) => {
          const latido = setInterval(() => {
            latidos += 1;
            subscriber.next({ type: 'ping' });
          }, 5);
          return () => {
            clearInterval(latido);
            desmontado = true;
          };
        }),
    };

    const recibidos: unknown[] = [];
    const suscripcion = interceptor
      .intercept(contextoHttp(undefined), handler)
      .subscribe((valor) => recibidos.push(valor));

    expect(desmontado).toBe(false);
    suscripcion.unsubscribe();

    expect(desmontado).toBe(true);
    const latidosAlCerrar = latidos;
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // Sin teardown el intervalo seguía latiendo en el vacío.
        expect(latidos).toBe(latidosAlCerrar);
        resolve();
      }, 30);
    });
  });

  it('el handler ve el contexto del tenant y sus valores llegan al consumidor', () => {
    const tenantContext = new TenantContextService();
    const interceptor = new TenantInterceptor(tenantContext);
    const user = {
      tenant_id: 'org-1',
      organization_id: 'org-1',
      plant_id: null,
      email: 'sergio@ejemplo.mx',
      role: 'owner',
      permissions: [],
      scopes: null,
    };
    const handler: CallHandler = {
      handle: () =>
        new Observable((subscriber) => {
          subscriber.next(tenantContext.get()?.tenant_id ?? null);
          subscriber.complete();
        }),
    };

    const recibidos: unknown[] = [];
    let completado = false;
    interceptor.intercept(contextoHttp(user), handler).subscribe({
      next: (valor) => recibidos.push(valor),
      complete: () => {
        completado = true;
      },
    });

    expect(recibidos).toEqual(['org-1']);
    expect(completado).toBe(true);
  });
});
