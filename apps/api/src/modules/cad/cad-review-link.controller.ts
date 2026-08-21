import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ReviewLinkSurface } from '../auth/decorators/review-link-surface.decorator';
import {
  API_RATE_LIMITS,
  ApiRateLimitService,
} from '../identity/api-rate-limit.service';
import { CadDocumentsRepository } from './cad-documents.repository';
import { CadReviewRepository } from './cad-review.repository';
import {
  commentResource,
  reviewSessionResource,
} from './cad-review.controller';
import { CadDocumentsService } from '../cad-documents/cad-documents.service';
import type { ReviewAccessContext } from '../cad-documents/review-link.service';
import { CreateReviewLinkCommentDto } from './dto/cad.dto';

/**
 * Superficie del REVIEW LINK (`/v1/cad/review/*`): la única parte de la API
 * alcanzable con un token de review canjeado (header `X-Review-Token`, sin
 * sesión). El read-only lo impone el BACKEND, no el frontend:
 *
 * - CadAuthGuard canjea el token en CADA request (hash + expiración +
 *   revocación — cerrar la sesión mata el link de inmediato) y cuelga
 *   `req.reviewAccess`.
 * - PermissionsGuard responde `403 review_read_only` a CUALQUIER ruta fuera
 *   de estos handlers (@ReviewLinkSurface()): mutaciones de documentos,
 *   bloques, proyectos, DXF, publicaciones… todo, lo intente quien lo
 *   intente.
 * - El alcance de datos es EXACTAMENTE el documento de la sesión: el tenant
 *   sale de la fila de la sesión (scoping TypeORM normal) y cada método usa
 *   `access.documentId`/`access.sessionId` — nunca ids del cliente, salvo el
 *   `commentId` a resolver, verificado contra el hilo de la sesión.
 * - Comentar/resolver solo si la sesión lo permite (`allowComments`), si no
 *   → `403 review_comments_disabled`.
 */
@Controller('v1/cad/review')
export class CadReviewLinkController {
  constructor(
    private readonly documents: CadDocumentsRepository,
    private readonly reviews: CadReviewRepository,
    private readonly cadDocuments: CadDocumentsService,
    private readonly rateLimits: ApiRateLimitService,
  ) {}

  /**
   * CANJE: contexto de solo lectura limitado al documento de la sesión — el
   * documento canónico HIDRATADO (misma semántica que la apertura del autor),
   * la colocación del DXF de fondo y la sesión (sin token ni hash). El canje
   * queda auditado server-side (sin registrar el token).
   */
  @Get('context')
  @ReviewLinkSurface()
  async context(@Req() request: Request) {
    const access = requireReviewAccess(request);
    const session = await this.reviews.getSessionForAccess(access);
    const row = await this.documents.getDocument(access.documentId);
    await this.reviews.auditRedemption(access);
    return {
      session: reviewSessionResource(session),
      readOnly: true as const,
      document: {
        id: row.id,
        name: row.name,
        model: row.model,
        revision: row.revision,
        cadDocumentVersion: row.cadDocumentVersion ?? 0,
        layers: row.layers,
        cadDocument: row.cadDocument
          ? await this.cadDocuments.hydrateCadDocument(row.cadDocument)
          : null,
        dxf: this.cadDocuments.toDxfPlacement(row),
      },
    };
  }

  /** Hilo de comentarios de LA SESIÓN (no expone otros hilos del documento). */
  @Get('comments')
  @ReviewLinkSurface()
  async listComments(@Req() request: Request) {
    const access = requireReviewAccess(request);
    const rows = await this.reviews.listSessionComments(access);
    return { items: rows.map(commentResource) };
  }

  @Post('comments')
  @ReviewLinkSurface()
  async createComment(
    @Req() request: Request,
    @Body() dto: CreateReviewLinkCommentDto,
  ) {
    const access = requireReviewAccess(request);
    // La superficie anónima-con-token es la más expuesta de la API: el techo
    // por SESIÓN acota lo que un token filtrado puede inundar.
    await this.rateLimits.enforce(
      'cad.review.comment',
      [access.sessionId],
      API_RATE_LIMITS.reviewCommentsPerSession,
    );
    return commentResource(
      await this.reviews.createSessionComment(access, dto),
    );
  }

  @Post('comments/:commentId/resolve')
  @ReviewLinkSurface()
  async resolveComment(
    @Req() request: Request,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    const access = requireReviewAccess(request);
    return commentResource(
      await this.reviews.resolveSessionComment(access, commentId),
    );
  }
}

/**
 * El contexto de review lo puso CadAuthGuard al canjear el token. Una sesión
 * válido NO lo produce: esta superficie exige el token del link (los autores
 * tienen su propia superficie con RBAC real).
 */
function requireReviewAccess(request: Request): ReviewAccessContext {
  const access = (request as Request & { reviewAccess?: ReviewAccessContext })
    .reviewAccess;
  if (!access) {
    throw new UnauthorizedException({
      code: 'review_token_invalid',
      message:
        'Esta superficie requiere un review link válido (X-Review-Token).',
    });
  }
  return access;
}
