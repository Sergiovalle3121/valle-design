import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { IDENTITY_RATE_LIMIT_STORE } from './identity-rate-limit.store';
import type { IdentityRateLimitStore } from './identity-rate-limit.store';
import {
  createOpaqueRateLimitKey,
  CSRF_COOKIE,
  DEVELOPMENT_SESSION_COOKIE,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_TOKEN_LENGTH,
  MIN_PASSWORD_LENGTH,
  SECURE_SESSION_COOKIE,
  SESSION_COOKIE,
} from './identity-security';
import { totpUri } from './identity-mfa';
import { IdentityService } from './identity.service';

/**
 * El emisor que ve el usuario en su aplicación de autenticación.
 *
 * Configurable porque un despliegue con marca propia no puede llamarse igual
 * que el nuestro en la lista del teléfono de su cliente; con un valor por
 * defecto porque olvidarlo no puede dejar la entrada sin nombre. Se recorta a
 * lo que cabe en una línea de esa lista.
 */
const MFA_ISSUER = (
  process.env.IDENTITY_MFA_ISSUER?.trim() || 'Valle Design'
).slice(0, 48);

const MAX_COOKIE_HEADER_LENGTH = 8_192;
const MAX_COOKIE_VALUE_LENGTH = 1_024;
const MAX_COOKIE_PAIRS = 64;
const RATE_LIMIT_WINDOW_MS = 60_000;

export class LoginDto {
  @IsEmail()
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}

export class RegisterDto extends LoginDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DISPLAY_NAME_LENGTH)
  displayName?: string;
}

export class EmailDto {
  @IsEmail()
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;
}

export class TokenDto {
  @IsString()
  @MinLength(32)
  @MaxLength(MAX_TOKEN_LENGTH)
  token!: string;
}

/**
 * El código del segundo factor. `MaxLength(32)` y no 6 a propósito: un código de
 * respaldo mide once caracteres con su guion y la gente pega espacios al
 * copiar. La validación estricta la hace el servicio, que sabe distinguir un
 * TOTP de un código de respaldo; aquí sólo se corta lo absurdo.
 */
export class MfaCodeDto {
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code!: string;
}

/** El segundo acto del inicio de sesión: el desafío más el código. */
export class MfaLoginDto extends MfaCodeDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  challenge!: string;
}

/**
 * Desactivar el segundo factor o rehacer los códigos de respaldo exige la
 * CONTRASEÑA. Ver el porqué en `IdentityService.disableMfa`: una sesión abierta
 * en una máquina desatendida es justo el escenario contra el que sirve el
 * factor, así que estar dentro no puede bastar para quitarlo.
 */
export class PasswordConfirmationDto {
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class ResetDto extends TokenDto {
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}

export interface SessionCookiePolicy {
  name: string;
  secure: boolean;
  transportAllowed: boolean;
}

export function sessionCookiePolicy(
  environment: string | undefined,
  requestIsSecure: boolean,
): SessionCookiePolicy {
  if (environment === 'production') {
    return {
      name: SECURE_SESSION_COOKIE,
      secure: true,
      transportAllowed: requestIsSecure,
    };
  }

  return {
    name: DEVELOPMENT_SESSION_COOKIE,
    secure: false,
    transportAllowed: true,
  };
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

export function parseCookieHeader(
  header: string | undefined,
  name: string,
): string | undefined {
  if (
    !header ||
    header.length > MAX_COOKIE_HEADER_LENGTH ||
    !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u.test(name)
  ) {
    return undefined;
  }

  const pairs = header.split(';');
  if (pairs.length > MAX_COOKIE_PAIRS) {
    return undefined;
  }

  let found: string | undefined;
  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    if (separator < 1 || pair.slice(0, separator).trim() !== name) {
      continue;
    }

    // Duplicate cookie names are ambiguous and can indicate cookie tossing.
    if (found !== undefined) {
      return undefined;
    }

    let encodedValue = pair.slice(separator + 1).trim();
    if (encodedValue.startsWith('"') || encodedValue.endsWith('"')) {
      if (
        encodedValue.length < 2 ||
        !encodedValue.startsWith('"') ||
        !encodedValue.endsWith('"')
      ) {
        return undefined;
      }
      encodedValue = encodedValue.slice(1, -1);
    }
    if (encodedValue.length > MAX_COOKIE_VALUE_LENGTH) {
      return undefined;
    }

    try {
      const decoded = decodeURIComponent(encodedValue);
      if (
        decoded.length > MAX_COOKIE_VALUE_LENGTH ||
        containsControlCharacter(decoded)
      ) {
        return undefined;
      }
      found = decoded;
    } catch {
      return undefined;
    }
  }

  return found;
}

export function cookie(req: Request, name: string): string | undefined {
  return parseCookieHeader(req.headers.cookie, name);
}

@Controller('v1/auth')
export class IdentityController {
  constructor(
    private readonly identity: IdentityService,
    @Inject(IDENTITY_RATE_LIMIT_STORE)
    private readonly rateLimits: IdentityRateLimitStore,
  ) {}

  private async limit(
    scope: string,
    identifiers: readonly string[],
    max = 8,
  ): Promise<void> {
    const key = createOpaqueRateLimitKey(scope, identifiers);
    const decision = await this.rateLimits.consume(
      key,
      max,
      RATE_LIMIT_WINDOW_MS,
    );
    if (!decision.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Demasiados intentos; inténtalo más tarde.',
          retryAfterSeconds: Math.max(
            1,
            Math.ceil(decision.retryAfterMs / 1_000),
          ),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private getCookiePolicy(req: Request): SessionCookiePolicy {
    const policy = sessionCookiePolicy(
      process.env.NODE_ENV,
      req.secure === true,
    );
    if (!policy.transportAllowed) {
      throw new ServiceUnavailableException(
        'Las cookies de sesión de producción requieren HTTPS.',
      );
    }
    if (policy.name !== SESSION_COOKIE) {
      throw new ServiceUnavailableException(
        'La configuración de cookies cambió después del arranque.',
      );
    }
    return policy;
  }

  private setCookies(
    req: Request,
    res: Response,
    value: string,
    csrf: string,
  ): void {
    const policy = this.getCookiePolicy(req);
    res.cookie(policy.name, value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: policy.secure,
      path: '/',
      maxAge: 30 * 86_400_000,
    });
    res.cookie(CSRF_COOKIE, csrf, {
      httpOnly: false,
      sameSite: 'lax',
      secure: policy.secure,
      path: '/',
      maxAge: 30 * 86_400_000,
    });
  }

  private clearCookies(req: Request, res: Response): void {
    const policy = this.getCookiePolicy(req);
    const options = {
      path: '/',
      sameSite: 'lax' as const,
      secure: policy.secure,
    };
    res.clearCookie(policy.name, options);
    res.clearCookie(CSRF_COOKIE, options);
  }

  private async current(req: Request) {
    const auth = await this.identity.authenticate(cookie(req, SESSION_COOKIE));
    if (!auth) {
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }
    return auth;
  }

  private csrf(req: Request, sessionHash: string): void {
    const header = req.header('x-csrf-token');
    const cookieValue = cookie(req, CSRF_COOKIE);
    const cookieMatches = this.identity.tokensMatch(header, cookieValue);
    const sessionMatches = this.identity.tokenMatchesHash(
      header ?? '',
      sessionHash,
    );
    if (
      !header ||
      header.length > MAX_TOKEN_LENGTH ||
      !cookieValue ||
      !cookieMatches ||
      !sessionMatches
    ) {
      throw new BadRequestException({
        code: 'csrf_invalid',
        message: 'Token CSRF inválido.',
      });
    }
  }

  @Public()
  @Post('register')
  @HttpCode(202)
  async register(@Body() body: RegisterDto, @Req() req: Request) {
    await this.limit('register.ip', [req.ip || 'unknown']);
    return this.identity.register(body.email, body.password, body.displayName);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.getCookiePolicy(req);
    const normalizedEmail = this.identity.normalizeEmail(body.email);
    await this.limit('login.ip', [req.ip || 'unknown'], 40);
    await this.limit('login.account', [normalizedEmail]);
    const result = await this.identity.login(
      body.email,
      body.password,
      req.ip,
      req.header('user-agent'),
    );
    if (result.kind === 'mfa') {
      // Ni cookie ni sesión: la contraseña sola no abre nada en una cuenta con
      // segundo factor. El desafío viaja en el cuerpo porque no autentica —sólo
      // sirve para volver con el código— y una cookie habría invitado a
      // tratarlo como si autenticara.
      return {
        mfaRequired: true,
        challenge: result.challenge,
        expiresAt: result.expiresAt,
      };
    }
    this.setCookies(req, res, result.cookie, result.csrf);
    return {
      user: { id: result.user.id, email: result.user.email },
      expiresAt: result.session.expiresAt,
    };
  }

  /**
   * Segundo acto del inicio de sesión.
   *
   * Lleva su propio límite de peticiones y es más estrecho que el de la
   * contraseña: seis dígitos son un espacio de un millón, y sin techo un
   * atacante con el desafío en la mano lo recorre. Con diez intentos por minuto
   * y un desafío que se consume al primer uso, la fuerza bruta deja de ser un
   * camino.
   */
  @Public()
  @Post('login/mfa')
  @HttpCode(200)
  async loginMfa(
    @Body() body: MfaLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.getCookiePolicy(req);
    await this.limit('login-mfa.ip', [req.ip || 'unknown'], 10);
    const result = await this.identity.completeMfaLogin(
      body.challenge,
      body.code,
      req.ip,
      req.header('user-agent'),
    );
    if (!result) {
      throw new UnauthorizedException('Desafío inválido o expirado.');
    }
    this.setCookies(req, res, result.cookie, result.csrf);
    return {
      user: { id: result.user.id, email: result.user.email },
      expiresAt: result.session.expiresAt,
    };
  }

  @Public()
  @Get('session')
  async session(@Req() req: Request) {
    const { user, session } = await this.current(req);
    const organization = await this.identity.activeOrganizationContext(
      user.id,
      session.activeOrganizationId,
    );
    return {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: !!user.emailVerifiedAt,
      },
      session: { id: session.id, expiresAt: session.expiresAt },
      organization,
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const auth = await this.current(req);
    this.csrf(req, auth.session.csrfHash);
    await this.identity.revoke(auth.session.id, auth.user.id);
    this.clearCookies(req, res);
  }

  @Public()
  @Post('sessions/rotate')
  async rotate(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.getCookiePolicy(req);
    const auth = await this.current(req);
    this.csrf(req, auth.session.csrfHash);
    await this.identity.revoke(auth.session.id, auth.user.id);
    const next = await this.identity.createSession(
      auth.user,
      req.ip,
      req.header('user-agent'),
    );
    this.setCookies(req, res, next.cookie, next.csrf);
    return { expiresAt: next.session.expiresAt };
  }

  @Public()
  @Get('sessions')
  async sessions(@Req() req: Request) {
    const auth = await this.current(req);
    const sessions = await this.identity.listSessions(auth.user.id);
    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        current: session.id === auth.session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        userAgent: session.userAgent,
      })),
    };
  }

  @Public()
  @Delete('sessions/:sessionId')
  @HttpCode(204)
  async revokeSession(
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const auth = await this.current(req);
    this.csrf(req, auth.session.csrfHash);
    await this.identity.revoke(sessionId, auth.user.id);
    if (sessionId === auth.session.id) {
      this.clearCookies(req, res);
    }
  }

  @Public()
  @Post('sessions/revoke-all')
  @HttpCode(204)
  async revokeAll(@Req() req: Request): Promise<void> {
    const auth = await this.current(req);
    this.csrf(req, auth.session.csrfHash);
    await this.identity.revokeAll(auth.user.id, auth.session.id);
  }

  /* ═══ SEGUNDO FACTOR ════════════════════════════════════════════════════ */

  @Public()
  @Get('mfa')
  async mfa(@Req() req: Request) {
    const auth = await this.current(req);
    return this.identity.mfaStatus(auth.user.id);
  }

  /**
   * Empieza el alta. Devuelve el secreto y la URI del QR, y NADA más: los
   * códigos de respaldo se entregan al confirmar, no aquí, porque un alta que
   * se abandona a la mitad no debe dejar códigos válidos por ahí.
   */
  @Public()
  @Post('mfa/setup')
  @HttpCode(200)
  async mfaSetup(@Req() req: Request) {
    const auth = await this.current(req);
    this.csrf(req, auth.session.csrfHash);
    await this.limit('mfa-setup.account', [auth.user.id], 10);
    const secret = await this.identity.beginMfaEnrollment(auth.user.id);
    return {
      secret,
      uri: totpUri({
        issuer: MFA_ISSUER,
        account: auth.user.email,
        secretBase32: secret,
      }),
    };
  }

  @Public()
  @Post('mfa/activate')
  @HttpCode(200)
  async mfaActivate(@Body() body: MfaCodeDto, @Req() req: Request) {
    const auth = await this.current(req);
    this.csrf(req, auth.session.csrfHash);
    await this.limit('mfa-activate.account', [auth.user.id], 10);
    const codes = await this.identity.confirmMfaEnrollment(
      auth.user.id,
      body.code,
    );
    if (!codes) {
      throw new BadRequestException({
        code: 'mfa_code_invalid',
        message:
          'El código no coincide. Revisa que la hora de tu teléfono esté al día y vuelve a intentarlo.',
      });
    }
    // La ÚNICA vez que estos códigos salen del servidor. Se guardan en hash.
    return { enabled: true, backupCodes: codes };
  }

  @Public()
  @Post('mfa/disable')
  @HttpCode(200)
  async mfaDisable(@Body() body: PasswordConfirmationDto, @Req() req: Request) {
    const auth = await this.current(req);
    this.csrf(req, auth.session.csrfHash);
    await this.limit('mfa-disable.account', [auth.user.id], 5);
    if (!(await this.identity.disableMfa(auth.user.id, body.password))) {
      throw new UnauthorizedException('Contraseña incorrecta.');
    }
    return { enabled: false };
  }

  @Public()
  @Post('mfa/backup-codes')
  @HttpCode(200)
  async mfaBackupCodes(
    @Body() body: PasswordConfirmationDto,
    @Req() req: Request,
  ) {
    const auth = await this.current(req);
    this.csrf(req, auth.session.csrfHash);
    await this.limit('mfa-backup.account', [auth.user.id], 5);
    const codes = await this.identity.regenerateBackupCodes(
      auth.user.id,
      body.password,
    );
    if (!codes) {
      throw new UnauthorizedException(
        'Contraseña incorrecta o segundo factor no activo.',
      );
    }
    return { backupCodes: codes };
  }

  /**
   * ACTIVIDAD RECIENTE de la cuenta.
   *
   * Sale de la tabla de auditoría de identidad. Se devuelve la acción, la fecha
   * y un metadato acotado —el método y el agente de usuario— y NUNCA la
   * dirección IP: se persiste para investigar un abuso, pero mostrarla en una
   * página de cuenta la expone a cualquiera que se siente delante de una sesión
   * abierta, y no ayuda al usuario a decidir nada que el dispositivo no diga ya.
   */
  @Public()
  @Get('activity')
  async activity(@Req() req: Request) {
    const auth = await this.current(req);
    const events = await this.identity.recentActivity(auth.user.id);
    return {
      events: events.map((event) => ({
        id: event.id,
        action: event.action,
        createdAt: event.createdAt,
        method:
          typeof event.metadata?.method === 'string'
            ? event.metadata.method
            : null,
        userAgent:
          typeof event.metadata?.userAgent === 'string'
            ? event.metadata.userAgent
            : null,
      })),
    };
  }

  @Public()
  @Post('verify-email')
  async verify(@Body() body: TokenDto, @Req() req: Request) {
    await this.limit('verify-email.ip', [req.ip || 'unknown'], 10);
    if (!(await this.identity.verifyEmail(body.token))) {
      throw new BadRequestException('Token inválido o expirado.');
    }
    return { verified: true };
  }

  @Public()
  @Post('verify-email/resend')
  @HttpCode(202)
  async resend(@Body() body: EmailDto, @Req() req: Request) {
    const normalizedEmail = this.identity.normalizeEmail(body.email);
    await this.limit('verify-resend.ip', [req.ip || 'unknown'], 20);
    await this.limit('verify-resend.account', [normalizedEmail], 3);
    // Identical response whether the account exists.
    await this.identity.sendVerificationEmail(normalizedEmail);
    return { accepted: true };
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(202)
  async forgot(@Body() body: EmailDto, @Req() req: Request) {
    const normalizedEmail = this.identity.normalizeEmail(body.email);
    await this.limit('password-forgot.ip', [req.ip || 'unknown'], 20);
    await this.limit('password-forgot.account', [normalizedEmail], 3);
    await this.identity.sendPasswordResetEmail(normalizedEmail);
    return { accepted: true };
  }

  @Public()
  @Post('password/reset')
  async reset(@Body() body: ResetDto, @Req() req: Request) {
    await this.limit('password-reset.ip', [req.ip || 'unknown'], 5);
    if (!(await this.identity.resetPassword(body.token, body.password))) {
      throw new BadRequestException('Token inválido o expirado.');
    }
    return { reset: true };
  }
}
