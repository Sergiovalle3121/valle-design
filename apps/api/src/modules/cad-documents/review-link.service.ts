import {
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CadReviewSession } from './entities/cad-review-session.entity';
import {
  hashReviewLinkToken,
  isPlausibleReviewToken,
} from './review-link-token';
import { DesignAuditLog } from '../audit-log/design-audit-log.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import type { TenantContext } from '../../common/tenant/tenant-context.service';

/** Header por el que viaja el token de review link (nunca en la URL). */
export const REVIEW_TOKEN_HEADER = 'x-review-token';

/**
 * Contexto de acceso por review link que CadAuthGuard cuelga del request
 * cuando la autenticación fue por token (no por JWT). PermissionsGuard lo usa
 * para imponer el read-only server-side: SOLO los endpoints marcados
 * @ReviewLinkSurface() son alcanzables; todo lo demás — cualquier mutación o
 * lectura fuera del documento de la sesión — es un 403 `review_read_only`.
 */
export interface ReviewAccessContext {
  sessionId: string;
  documentId: string;
  tenantId: string | null;
  allowComments: boolean;
  expiresAt: Date | null;
}

/**
 * Canje server-owned de review links: valida hash + expiración + revocación
 * en CADA request (el token no se intercambia por ninguna credencial derivada,
 * así que revocar la sesión lo mata de inmediato) y entrega la sesión viva.
 *
 * La búsqueda por `token_hash` es deliberadamente GLOBAL (repositorio plano,
 * no scoped): antes del canje no hay tenant en contexto — el tenant SALE de la
 * fila de la sesión y jamás del cliente. El índice único parcial hace el
 * lookup O(log n).
 */
@Injectable()
export class ReviewLinkService {
  private readonly logger = new Logger(ReviewLinkService.name);

  constructor(
    @InjectRepository(CadReviewSession)
    private readonly sessions: Repository<CadReviewSession>,
    private readonly tenantCtx: TenantContextService,
    @Optional() private readonly audit?: DesignAuditLog,
  ) {}

  /**
   * Valida el token en claro y devuelve la sesión viva, o lanza el 401
   * contractual. Denegaciones ATRIBUIBLES (sesión identificada: revocada,
   * cerrada o expirada) se auditan con el tenant de la sesión; un hash
   * desconocido NO escribe auditoría — no hay tenant al que atribuirlo y
   * sería amplificación de escritura para un atacante sin credenciales.
   * El token JAMÁS se registra (ni en claro ni su hash).
   */
  async redeem(rawToken: unknown): Promise<CadReviewSession> {
    if (!isPlausibleReviewToken(rawToken)) {
      throw invalidTokenError();
    }
    const tokenHash = hashReviewLinkToken(rawToken);
    const session = await this.sessions.findOne({ where: { tokenHash } });
    if (!session) {
      throw invalidTokenError();
    }
    if (session.revokedAt || session.status !== 'open') {
      await this.auditDenial(session, 'review_token_revoked');
      throw new UnauthorizedException({
        code: 'review_token_revoked',
        message: 'El review link fue revocado.',
      });
    }
    if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
      await this.auditDenial(session, 'review_token_expired');
      throw new UnauthorizedException({
        code: 'review_token_expired',
        message: 'El review link expiró.',
      });
    }
    return session;
  }

  toAccessContext(session: CadReviewSession): ReviewAccessContext {
    return {
      sessionId: session.id,
      documentId: session.documentId,
      tenantId: session.tenant_id,
      allowComments: session.allowComments,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Asiento de denegación con el TENANT DE LA SESIÓN estampado: el canje corre
   * antes del TenantInterceptor, así que el contexto ALS se abre aquí a mano.
   * Fail-soft — una bitácora caída nunca convierte el 401 en un 500.
   */
  private async auditDenial(
    session: CadReviewSession,
    reason: 'review_token_revoked' | 'review_token_expired',
  ): Promise<void> {
    if (!this.audit) return;
    const context: TenantContext = {
      tenant_id: session.tenant_id,
      organization_id: session.organization_id,
      plant_id: session.plant_id,
      user_email: `review-link:${session.id}`,
      role: null,
      permissions: null,
      scopes: null,
    };
    try {
      await this.tenantCtx.run(context, () =>
        this.audit!.record({
          action: 'cad_review_link_denied',
          referenceType: 'CAD_REVIEW_SESSION',
          referenceId: session.id,
          payload: { documentId: session.documentId, reason },
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Auditoría de denegación de review link omitida: ${(err as Error)?.message}`,
      );
    }
  }
}

function invalidTokenError(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'review_token_invalid',
    message: 'El review link no es válido.',
  });
}
