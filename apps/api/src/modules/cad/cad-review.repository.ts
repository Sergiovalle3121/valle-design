import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DataSource, type EntityManager, type FindOptionsWhere } from 'typeorm';
import {
  TenantScopedRepository,
  getTenantRepositoryToken,
} from '../../common/tenant/tenant-scoped.repository';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { CadDocument } from '../cad-documents/entities/cad-document.entity';
import { CadReviewSession } from '../cad-documents/entities/cad-review-session.entity';
import { CadComment } from '../cad-documents/entities/cad-comment.entity';
import {
  generateReviewLinkToken,
  resolveReviewLinkTtlMinutes,
} from '../cad-documents/review-link-token';
import type { ReviewAccessContext } from '../cad-documents/review-link.service';
import { CAD_AUDIT_PUBLISHER } from '../cad-documents/ports/cad-audit-publisher.port';
import type { CadAuditPublisher } from '../cad-documents/ports/cad-audit-publisher.port';
import { assertCadCommentAnchor } from './cad-comment-anchor';

/** Tope de sesiones ABIERTAS por documento (espejo de reviewLinks ≤ 20). */
export const MAX_OPEN_SESSIONS_PER_DOCUMENT = 20;
/** Tope de hilos de revisión por documento (contrato: máx. 500). */
export const MAX_COMMENTS_PER_DOCUMENT = 500;

export interface CreateReviewSessionInput {
  shareLink?: boolean;
  allowComments?: boolean;
  shareLinkTtlMinutes?: number;
}

export interface CreateCommentInput {
  body: string;
  anchor?: Record<string, unknown> | null;
  reviewSessionId?: string | null;
}

export interface CreatedReviewSession {
  session: CadReviewSession;
  /** Token en claro — SOLO en la respuesta de creación. Jamás se persiste. */
  shareToken?: string;
}

/**
 * Ciclo de vida de las review sessions y comentarios del contrato
 * design-api.v1 (Fase 5). Todas las lecturas/escrituras van por repositorios
 * TENANT-SCOPED (el tenant sale del contexto autenticado — sesión o token de
 * review canjeada — nunca del cliente).
 *
 * Semántica de tokens (server-owned):
 * - crear con `shareLink: true` GENERA el token (32 bytes aleatorios
 *   criptográficos), persiste SOLO su sha256 y devuelve el claro únicamente
 *   en esa respuesta, con `expiresAt` calculada server-side (TTL default 7
 *   días, acotado 5 min–90 días).
 * - cerrar la sesión estampa `closed_at` + `revoked_at`: el canje siguiente
 *   del token muere de inmediato (se re-valida contra la fila en CADA
 *   request).
 * - listar JAMÁS expone token ni hash: solo `hasShareLink`.
 */
@Injectable()
export class CadReviewRepository {
  constructor(
    @Inject(getTenantRepositoryToken(CadDocument))
    private readonly documents: TenantScopedRepository<CadDocument>,
    @Inject(getTenantRepositoryToken(CadReviewSession))
    private readonly sessions: TenantScopedRepository<CadReviewSession>,
    @Inject(getTenantRepositoryToken(CadComment))
    private readonly comments: TenantScopedRepository<CadComment>,
    private readonly tenantCtx: TenantContextService,
    @Optional()
    @Inject(CAD_AUDIT_PUBLISHER)
    private readonly audit?: CadAuditPublisher,
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  /* ─────────────────────────── Review sessions ───────────────────────────── */

  async listSessions(
    documentId: string,
    status?: 'open' | 'closed',
  ): Promise<CadReviewSession[]> {
    await this.getDocument(documentId);
    const where: FindOptionsWhere<CadReviewSession> = { documentId };
    if (status) where.status = status;
    return this.sessions.find({
      where,
      order: { created_at: 'DESC' },
      take: 200,
    });
  }

  async createSession(
    documentId: string,
    input: CreateReviewSessionInput,
  ): Promise<CreatedReviewSession> {
    const wantsLink = input.shareLink === true;
    const generated = wantsLink ? generateReviewLinkToken() : null;
    const expiresAt = wantsLink
      ? new Date(
          Date.now() +
            resolveReviewLinkTtlMinutes(input.shareLinkTtlMinutes) * 60_000,
        )
      : null;

    const saved = await this.withDocumentWriteLock(
      documentId,
      async (manager) => {
        const document = await this.getDocument(documentId, manager);
        const sessions = this.sessions.withManager(manager);
        const openCount = await sessions.count({
          where: { documentId, status: 'open' },
        });
        if (openCount >= MAX_OPEN_SESSIONS_PER_DOCUMENT) {
          throw new BadRequestException(
            `Máximo ${MAX_OPEN_SESSIONS_PER_DOCUMENT} sesiones de revisión abiertas por documento. Cierra alguna antes de abrir otra.`,
          );
        }

        const row = sessions.create({
          documentId,
          status: 'open',
          closedAt: null,
          tokenHash: generated?.tokenHash ?? null,
          expiresAt,
          revokedAt: null,
          allowComments: input.allowComments !== false,
          created_by: this.actor(),
        });
        row.plant_id = document.plant_id;
        row.organization_id = document.organization_id;
        return sessions.save(row);
      },
    );

    // Auditoría server-owned: la CREACIÓN del link queda asentada SIN el
    // token (ni claro ni hash) — solo el hecho y su ventana de vigencia.
    await this.recordAudit(
      'cad_review_session_created',
      'CAD_REVIEW_SESSION',
      saved.id,
      {
        documentId,
        hasShareLink: wantsLink,
        allowComments: saved.allowComments,
        expiresAt: expiresAt?.toISOString() ?? null,
      },
    );
    return { session: saved, shareToken: generated?.token };
  }

  async closeSession(sessionId: string): Promise<CadReviewSession> {
    const row = await this.sessions.findOne({ where: { id: sessionId } });
    if (!row) throw new NotFoundException('Sesión de revisión no encontrada.');
    if (row.status === 'closed') {
      throw new ConflictException({
        code: 'review_session_closed',
        message: 'La sesión de revisión ya estaba cerrada.',
      });
    }
    const now = new Date();
    row.status = 'closed';
    row.closedAt = now;
    // Revocación del link (si lo hay): el siguiente canje muere de inmediato
    // porque cada request re-valida contra esta fila.
    if (row.tokenHash) row.revokedAt = now;
    const saved = await this.sessions.save(row);
    await this.recordAudit(
      'cad_review_session_closed',
      'CAD_REVIEW_SESSION',
      saved.id,
      { documentId: saved.documentId, hadShareLink: !!saved.tokenHash },
    );
    return saved;
  }

  /** Sesión del contexto de review canjeado (para la proyección del canje). */
  async getSessionForAccess(
    access: ReviewAccessContext,
  ): Promise<CadReviewSession> {
    const row = await this.sessions.findOne({
      where: { id: access.sessionId },
    });
    if (!row) throw new NotFoundException('Sesión de revisión no encontrada.');
    return row;
  }

  /* ───────────────────────────── Comentarios ─────────────────────────────── */

  async listComments(
    documentId: string,
    filter: { reviewSessionId?: string; resolved?: boolean } = {},
  ): Promise<CadComment[]> {
    await this.getDocument(documentId);
    const where: FindOptionsWhere<CadComment> = { documentId };
    if (filter.reviewSessionId) where.reviewSessionId = filter.reviewSessionId;
    if (filter.resolved !== undefined) where.resolved = filter.resolved;
    return this.comments.find({
      where,
      order: { created_at: 'ASC' },
      take: MAX_COMMENTS_PER_DOCUMENT,
    });
  }

  async createComment(
    documentId: string,
    input: CreateCommentInput,
  ): Promise<CadComment> {
    return this.insertComment(documentId, input.reviewSessionId ?? null, input);
  }

  async resolveComment(commentId: string): Promise<CadComment> {
    const row = await this.comments.findOne({ where: { id: commentId } });
    if (!row) throw new NotFoundException('Comentario no encontrado.');
    return this.markResolved(row);
  }

  /* ─────────────── Comentarios desde el contexto de review link ──────────── */

  async listSessionComments(
    access: ReviewAccessContext,
  ): Promise<CadComment[]> {
    // Solo el hilo de SU sesión: los comentarios internos del documento (de
    // otras sesiones o directos) no se exponen al invitado.
    return this.comments.find({
      where: {
        documentId: access.documentId,
        reviewSessionId: access.sessionId,
      },
      order: { created_at: 'ASC' },
      take: MAX_COMMENTS_PER_DOCUMENT,
    });
  }

  async createSessionComment(
    access: ReviewAccessContext,
    input: { body: string; anchor?: Record<string, unknown> | null },
  ): Promise<CadComment> {
    this.requireCommentsAllowed(access);
    return this.insertComment(access.documentId, access.sessionId, input);
  }

  async resolveSessionComment(
    access: ReviewAccessContext,
    commentId: string,
  ): Promise<CadComment> {
    this.requireCommentsAllowed(access);
    const row = await this.comments.findOne({ where: { id: commentId } });
    // Fuera del hilo de la sesión el comentario "no existe" para el invitado.
    if (!row || row.reviewSessionId !== access.sessionId) {
      throw new NotFoundException('Comentario no encontrado.');
    }
    return this.markResolved(row);
  }

  /** Canje auditado del review link (asiento server-owned, sin token). */
  async auditRedemption(access: ReviewAccessContext): Promise<void> {
    await this.recordAudit(
      'cad_review_link_redeemed',
      'CAD_REVIEW_SESSION',
      access.sessionId,
      { documentId: access.documentId },
    );
  }

  /* ─────────────────────────────── Interno ───────────────────────────────── */

  private requireCommentsAllowed(access: ReviewAccessContext): void {
    if (!access.allowComments) {
      throw new ForbiddenException({
        code: 'review_comments_disabled',
        message: 'Esta sesión de revisión no admite comentarios.',
      });
    }
  }

  private async insertComment(
    documentId: string,
    reviewSessionId: string | null,
    input: { body: string; anchor?: Record<string, unknown> | null },
  ): Promise<CadComment> {
    const body = input.body?.trim();
    if (!body) {
      throw new BadRequestException('El comentario no puede estar vacío.');
    }
    const anchor = assertCadCommentAnchor(input.anchor);
    const saved = await this.withDocumentWriteLock(
      documentId,
      async (manager) => {
        const document = await this.getDocument(documentId, manager);
        const sessions = this.sessions.withManager(manager);
        const comments = this.comments.withManager(manager);
        if (reviewSessionId) {
          const session = await sessions.findOne({
            where: { id: reviewSessionId },
          });
          if (!session || session.documentId !== documentId) {
            throw new NotFoundException(
              'La sesión de revisión no existe para este documento.',
            );
          }
          if (session.status !== 'open') {
            throw new BadRequestException({
              code: 'review_session_closed',
              message:
                'La sesión de revisión está cerrada; no admite comentarios.',
            });
          }
        }
        const count = await comments.count({ where: { documentId } });
        if (count >= MAX_COMMENTS_PER_DOCUMENT) {
          throw new BadRequestException(
            `Máximo ${MAX_COMMENTS_PER_DOCUMENT} comentarios por documento.`,
          );
        }
        const row = comments.create({
          documentId,
          reviewSessionId,
          author: this.actor() ?? 'anonymous',
          body: body.slice(0, 1000),
          anchor,
          resolved: false,
          created_by: this.actor(),
        });
        row.plant_id = document.plant_id;
        row.organization_id = document.organization_id;
        return comments.save(row);
      },
    );
    await this.recordAudit('cad_comment_created', 'CAD_COMMENT', saved.id, {
      documentId,
      reviewSessionId,
      anchored: !!saved.anchor,
    });
    return saved;
  }

  private async markResolved(row: CadComment): Promise<CadComment> {
    if (row.resolved) return row; // Idempotente: resolver dos veces es 200.
    row.resolved = true;
    const saved = await this.comments.save(row);
    await this.recordAudit('cad_comment_resolved', 'CAD_COMMENT', saved.id, {
      documentId: saved.documentId,
      reviewSessionId: saved.reviewSessionId,
    });
    return saved;
  }

  private async getDocument(
    documentId: string,
    manager?: EntityManager,
  ): Promise<CadDocument> {
    const row = await this.documents
      .withManager(manager)
      .findOne({ where: { id: documentId } });
    if (!row) throw new NotFoundException('Documento CAD no encontrado.');
    return row;
  }

  /**
   * Serializa exclusivamente las altas de review del mismo tenant/documento.
   * El lock dura la transacción; count + insert forman así una sola decisión
   * atómica en PostgreSQL. En SQLite la transacción conserva la semántica
   * funcional; el advisory lock se omite porque ese motor serializa escrituras.
   */
  private async withDocumentWriteLock<T>(
    documentId: string,
    operation: (manager?: EntityManager) => Promise<T>,
  ): Promise<T> {
    const tenantId = this.tenantCtx.requireTenantId(
      'crear una sesión o comentario CAD',
    );
    if (!this.dataSource) return operation();

    return this.dataSource.transaction(async (manager) => {
      if (this.dataSource?.options.type === 'postgres') {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`cad-review-capacity:${tenantId}:${documentId}`],
        );
      }
      return operation(manager);
    });
  }

  private actor(): string | null {
    return this.tenantCtx.get()?.user_email ?? null;
  }

  /** Asiento de auditoría vía puerto neutral; el adaptador es fail-soft. */
  private async recordAudit(
    action: string,
    referenceType: string,
    referenceId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit?.record({
      action,
      referenceType,
      referenceId,
      actorName: this.actor() ?? undefined,
      metadata,
    });
  }
}
