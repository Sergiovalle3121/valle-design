import { Global, Module } from '@nestjs/common';

/**
 * Autenticación de Design: verificación de los tokens emitidos por Platform
 * (secreto compartido vía entorno). Global para que los guards registrados
 * como APP_GUARD (CadAuthGuard + PermissionsGuard, en AppModule) resuelvan
 * JwtService desde el injector raíz.
 */
@Global()
@Module({
  imports: [],
  exports: [],
})
export class AuthModule {}
