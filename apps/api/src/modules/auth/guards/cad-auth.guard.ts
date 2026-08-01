import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type {
  AuthenticatedUser,
  JwtPayload,
} from '../../../common/types/jwt.types';

/**
 * Autenticación server-side de Design (adaptación del JwtAuthGuard+JwtStrategy
 * del origen, sin passport): valida el Bearer JWT emitido por PLATFORM con el
 * secreto compartido vía entorno (JWT_SECRET/SESSION_SECRET — consumo por
 * contrato, no import de código) y puebla `req.user` con la identidad del
 * token. El TenantInterceptor la vierte después en TenantContextService.
 *
 * DIFERENCIA DELIBERADA con el origen: Design NO tiene registro de usuarios
 * propio — la identidad ES el token (Platform revoca acortando expiración o
 * rotando el secreto). Los endpoints @Public() (health) pasan sin token.
 */
@Injectable()
export class CadAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Falta el bearer token.');
    }

    let payload: JwtPayload & { [claim: string]: unknown };
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('El token es inválido o expiró.');
    }
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('El token no contiene una identidad.');
    }

    const user: AuthenticatedUser = {
      userId: String(payload.sub),
      email: String(payload.email),
      role: typeof payload.role === 'string' ? payload.role : '',
      tenant_id: payload.tenant_id ?? null,
      organization_id: payload.organization_id ?? null,
      plant_id: payload.plant_id ?? null,
      permissions: Array.isArray(payload.permissions)
        ? payload.permissions.map(String)
        : null,
      scopes:
        payload.scopes && typeof payload.scopes === 'object'
          ? payload.scopes
          : null,
    };
    (request as Request & { user: AuthenticatedUser }).user = user;
    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers?.authorization;
    if (typeof header !== 'string') return null;
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
  }
}
