import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../../common/config/jwt-secret';

/**
 * Autenticación de Design: verificación de los tokens emitidos por Platform
 * (secreto compartido vía entorno). Global para que los guards registrados
 * como APP_GUARD (CadAuthGuard + PermissionsGuard, en AppModule) resuelvan
 * JwtService desde el injector raíz.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      // El secreto se resuelve al INICIALIZAR el módulo (no al importar el
      // archivo), así los tests pueden fijar JWT_SECRET antes de crear el app.
      useFactory: () => ({ secret: getJwtSecret() }),
    }),
  ],
  exports: [JwtModule],
})
export class AuthModule {}
