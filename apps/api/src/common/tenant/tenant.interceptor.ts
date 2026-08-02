import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';
import { AuthenticatedUser } from '../types/jwt.types';

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
    return new Observable((subscriber) => {
      this.tenantContext.run(ctx, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
