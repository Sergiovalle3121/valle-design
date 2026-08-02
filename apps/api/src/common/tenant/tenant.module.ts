import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantContextService } from './tenant-context.service';
import { TenantInterceptor } from './tenant.interceptor';

/**
 * Módulo global de tenancy (copiado del origen, sin el bootstrap de modo
 * dedicado): expone TenantContextService y registra el TenantInterceptor que
 * puebla el AsyncLocalStorage desde `req.user` (poblado por CadAuthGuard).
 */
@Global()
@Module({
  providers: [
    TenantContextService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
  exports: [TenantContextService],
})
export class TenantModule {}
