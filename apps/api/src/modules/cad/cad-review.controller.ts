import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CadReviewRepository } from './cad-review.repository';
import type { CadReviewSession } from '../cad-documents/entities/cad-review-session.entity';
import type { CadComment } from '../cad-documents/entities/cad-comment.entity';
import {
  CreateCadCommentDto,
  CreateReviewSessionDto,
  ListCommentsQueryDto,
  ListReviewSessionsQueryDto,
} from './dto/cad.dto';

/**
 * Superficie de REVIEW del autor (`/v1/cad/*`, contrato design-api.v1.yaml,
 * tag `reviews`): sesiones de revisión y comentarios, con JWT + permiso
 * `cad:review` + entitlement design.cad (guards globales).
 *
 * Tokens SERVER-OWNED: la creación con `shareLink: true` genera el token, la
 * respuesta de creación es su ÚNICA aparición en claro y las listas solo
 * exponen `hasShareLink`. Cerrar la sesión revoca el link de inmediato
 * (revoked_at; el canje re-valida contra la fila en cada request).
 */
@Controller('v1/cad')
export class CadReviewController {
  constructor(private readonly reviews: CadReviewRepository) {}

  /* ─────────────────────────── Review sessions ───────────────────────────── */

  @Get('documents/:documentId/review-sessions')
  @RequirePermissions('cad:review')
  async listSessions(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query() query: ListReviewSessionsQueryDto,
  ) {
    const rows = await this.reviews.listSessions(documentId, query.status);
    return { items: rows.map(reviewSessionResource) };
  }

  @Post('documents/:documentId/review-sessions')
  @RequirePermissions('cad:review')
  async createSession(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: CreateReviewSessionDto,
  ) {
    const { session, shareToken } = await this.reviews.createSession(
      documentId,
      dto,
    );
    return {
      session: reviewSessionResource(session),
      // ÚNICA aparición del token en claro en toda la API (solo con shareLink).
      ...(shareToken ? { shareToken } : {}),
    };
  }

  @Post('review-sessions/:sessionId/close')
  @RequirePermissions('cad:review')
  async closeSession(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return reviewSessionResource(await this.reviews.closeSession(sessionId));
  }

  /* ───────────────────────────── Comentarios ─────────────────────────────── */

  @Get('documents/:documentId/comments')
  @RequirePermissions('cad:review')
  async listComments(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query() query: ListCommentsQueryDto,
  ) {
    const rows = await this.reviews.listComments(documentId, {
      reviewSessionId: query.reviewSessionId,
      // El DTO acota a 'true'|'false' (ver ListCommentsQueryDto).
      resolved:
        query.resolved === undefined ? undefined : query.resolved === 'true',
    });
    return { items: rows.map(commentResource) };
  }

  @Post('documents/:documentId/comments')
  @RequirePermissions('cad:review')
  async createComment(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: CreateCadCommentDto,
  ) {
    return commentResource(await this.reviews.createComment(documentId, dto));
  }

  @Post('comments/:commentId/resolve')
  @RequirePermissions('cad:review')
  async resolveComment(@Param('commentId', ParseUUIDPipe) commentId: string) {
    return commentResource(await this.reviews.resolveComment(commentId));
  }
}

/* ───────────────────────── Proyecciones de recurso ────────────────────────── */

/**
 * Proyección contractual de la sesión: expone `hasShareLink` y JAMÁS el token
 * ni su hash (CadReviewSession del spec).
 */
export function reviewSessionResource(row: CadReviewSession) {
  return {
    id: row.id,
    documentId: row.documentId,
    status: row.status,
    hasShareLink: !!row.tokenHash,
    allowComments: row.allowComments,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    closedAt: row.closedAt,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export function commentResource(row: CadComment) {
  return {
    id: row.id,
    documentId: row.documentId,
    reviewSessionId: row.reviewSessionId,
    author: row.author,
    body: row.body,
    anchor: row.anchor,
    resolved: row.resolved,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
