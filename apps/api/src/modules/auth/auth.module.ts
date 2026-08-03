import { Global, Module } from '@nestjs/common';

/**
 * Frontera de autorización de Valle Design. La identidad first-party vive en
 * IdentityModule; los guards globales derivan organización, tenant, rol y
 * permisos únicamente de la sesión y membresía persistidas por el servidor.
 */
@Global()
@Module({
  imports: [],
  exports: [],
})
export class AuthModule {}
