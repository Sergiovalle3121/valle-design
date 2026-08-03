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
import { IdentityService } from './identity.service';

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
