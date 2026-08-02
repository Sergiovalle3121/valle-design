import { BadRequestException, Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CSRF_COOKIE, IdentityService, SESSION_COOKIE } from './identity.service';

class CredentialsDto { @IsEmail() email!: string; @IsString() @MinLength(12) password!: string; @IsOptional() @IsString() displayName?: string; }
class EmailDto { @IsEmail() email!: string; }
class TokenDto { @IsString() token!: string; }
class ResetDto extends TokenDto { @IsString() @MinLength(12) password!: string; }

const attempts = new Map<string, { count: number; reset: number }>();
function cookie(req: Request, name: string): string | undefined {
  const item = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined;
}

@Controller('v1/auth')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}
  private limit(key: string, max = 8) {
    const now = Date.now(); const current = attempts.get(key);
    if (!current || current.reset < now) return attempts.set(key, { count: 1, reset: now + 60_000 });
    if (++current.count > max) throw new HttpException('Demasiados intentos; inténtalo más tarde.', HttpStatus.TOO_MANY_REQUESTS);
  }
  private setCookies(res: Response, value: string, csrf: string) {
    const secure = process.env.NODE_ENV === 'production';
    res.cookie(SESSION_COOKIE, value, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 30 * 86400_000 });
    res.cookie(CSRF_COOKIE, csrf, { httpOnly: false, sameSite: 'lax', secure, path: '/', maxAge: 30 * 86400_000 });
  }
  private clearCookies(res: Response) { res.clearCookie(SESSION_COOKIE, { path: '/' }); res.clearCookie(CSRF_COOKIE, { path: '/' }); }
  private async current(req: Request) { const auth = await this.identity.authenticate(cookie(req, SESSION_COOKIE)); if (!auth) throw new UnauthorizedException('Sesión inválida o expirada.'); return auth; }
  private csrf(req: Request, sessionHash: string) { const header = req.header('x-csrf-token'); if (!header || header !== cookie(req, CSRF_COOKIE) || this.identity.hashToken(header) !== sessionHash) throw new BadRequestException({ code: 'csrf_invalid', message: 'Token CSRF inválido.' }); }

  @Public() @Post('register') @HttpCode(202) register(@Body() body: CredentialsDto, @Req() req: Request) { this.limit(`register:${req.ip}`); return this.identity.register(body.email, body.password, body.displayName); }
  @Public() @Post('login') @HttpCode(200) async login(@Body() body: CredentialsDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) { this.limit(`login:${req.ip}:${body.email.toLowerCase()}`); const result = await this.identity.login(body.email, body.password, req.ip, req.header('user-agent')); this.setCookies(res, result.cookie, result.csrf); return { user: { id: result.user.id, email: result.user.email }, expiresAt: result.session.expiresAt }; }
  @Public() @Get('session') async session(@Req() req: Request) { const { user, session } = await this.current(req); return { user: { id: user.id, email: user.email, emailVerified: !!user.emailVerifiedAt }, session: { id: session.id, expiresAt: session.expiresAt } }; }
  @Public() @Post('logout') @HttpCode(204) async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { const auth = await this.current(req); this.csrf(req, auth.session.csrfHash); await this.identity.revoke(auth.session.id, auth.user.id); this.clearCookies(res); }
  @Public() @Post('sessions/rotate') async rotate(@Req() req: Request, @Res({ passthrough: true }) res: Response) { const auth = await this.current(req); this.csrf(req, auth.session.csrfHash); await this.identity.revoke(auth.session.id, auth.user.id); const next = await this.identity.createSession(auth.user, req.ip, req.header('user-agent')); this.setCookies(res, next.cookie, next.csrf); return { expiresAt: next.session.expiresAt }; }
  @Public() @Post('sessions/revoke-all') @HttpCode(204) async revokeAll(@Req() req: Request) { const auth = await this.current(req); this.csrf(req, auth.session.csrfHash); await this.identity.revokeAll(auth.user.id, auth.session.id); }
  @Public() @Post('verify-email') async verify(@Body() body: TokenDto) { const token = await this.identity.consumeToken(body.token, 'verify_email'); if (!token) throw new BadRequestException('Token inválido o expirado.'); await this.identity.verifyUser(token.subjectId); return { verified: true }; }
  @Public() @Post('verify-email/resend') @HttpCode(202) async resend(@Body() body: EmailDto, @Req() req: Request) { this.limit(`verify:${req.ip}:${body.email.toLowerCase()}`, 3); /* identical response whether the account exists */ return { accepted: true }; }
  @Public() @Post('password/forgot') @HttpCode(202) async forgot(@Body() body: EmailDto, @Req() req: Request) { this.limit(`reset:${req.ip}:${body.email.toLowerCase()}`, 3); return { accepted: true }; }
  @Public() @Post('password/reset') async reset(@Body() body: ResetDto) { const token = await this.identity.consumeToken(body.token, 'reset_password'); if (!token) throw new BadRequestException('Token inválido o expirado.'); await this.identity.resetCredential(token.subjectId, body.password); await this.identity.revokeAll(token.subjectId); return { reset: true }; }
}

export { cookie };
