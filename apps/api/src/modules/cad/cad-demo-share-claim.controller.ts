import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { REVIEW_LINK_TTL_MAX_MINUTES } from '../cad-documents/review-link-token';
import { reviewSessionResource } from './cad-review.controller';
import { CadReviewRepository } from './cad-review.repository';
import { CadDemoShareService } from './cad-demo-share.service';

/**
 * RECLAMAR: quien creó el enlace en la demostración, ya con cuenta y con el
 * documento que nació de su dibujo, convierte el enlace temporal en un review
 * link de ese documento. El destinatario conserva la misma URL.
 *
 * Archivo propio porque el gate del contrato (`check:cad-contract`) exige un
 * único `@Controller` por archivo. El documento se busca con el repositorio
 * TENANT-SCOPED de revisiones: un id de otra organización es 404.
 */
@Controller('v1/cad')
export class CadDemoShareClaimController {
  constructor(
    private readonly demoShares: CadDemoShareService,
    private readonly reviews: CadReviewRepository,
  ) {}

  @Post('documents/:documentId/demo-share-claims')
  @RequirePermissions('cad:review')
  async claim(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() body: { manageToken?: string },
  ) {
    const share = await this.demoShares.findForClaim(body?.manageToken);
    const session = await this.reviews.createSessionForExistingToken(
      documentId,
      share.tokenHash,
      { allowComments: true, shareLinkTtlMinutes: REVIEW_LINK_TTL_MAX_MINUTES },
    );
    await this.demoShares.completeClaim(share.id);
    return reviewSessionResource(session);
  }
}
