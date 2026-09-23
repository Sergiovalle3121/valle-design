import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { CadDocument } from '../cad-documents/entities/cad-document.entity';
import { CadComment } from '../cad-documents/entities/cad-comment.entity';
import { CadReviewSession } from '../cad-documents/entities/cad-review-session.entity';
import { validateCadDocumentPayload } from '../cad-documents/cad-document-validation';
import { generateReviewLinkToken } from '../cad-documents/review-link-token';

/** Reserved namespace. No user or organization owns anonymous demo snapshots. */
export const CAD_DEMO_SHARE_TENANT = 'f784141b-4d43-4e7d-9d92-0f21d05a4ed8';
const DEMO_MARKER = 'anonymous-demo-share';
const MAX_SNAPSHOT_BYTES = 256 * 1024;
const SNAPSHOT_TTL_MS = 24 * 60 * 60_000;
const PURGE_INTERVAL_MS = 60 * 60_000;

@Injectable()
export class CadDemoShareService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CadDemoShareService.name);
  private purgeTimer: NodeJS.Timeout | null = null;

  constructor(private readonly database: DataSource) {}

  onModuleInit(): void {
    // Retention is enforced by redeem() even if this best-effort purge is late.
    void this.purgeExpired().catch((error: unknown) =>
      this.logger.warn(`No se pudieron purgar capturas demo: ${String(error)}`),
    );
    this.purgeTimer = setInterval(() => {
      void this.purgeExpired().catch((error: unknown) =>
        this.logger.warn(
          `No se pudieron purgar capturas demo: ${String(error)}`,
        ),
      );
    }, PURGE_INTERVAL_MS);
    this.purgeTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
  }

  async create(
    rawDocument: unknown,
  ): Promise<{ shareToken: string; expiresAt: string }> {
    // Check the serialized size before traversing an untrusted object in the
    // CAD validator. The route is limited further than the normal CAD API.
    const serialized = JSON.stringify(rawDocument);
    if (
      !serialized ||
      Buffer.byteLength(serialized, 'utf8') > MAX_SNAPSHOT_BYTES
    ) {
      throw new PayloadTooLargeException('La captura demo supera 256 KiB.');
    }
    const cadDocument = validateCadDocumentPayload(rawDocument);
    const expiresAt = new Date(Date.now() + SNAPSHOT_TTL_MS);
    const generated = generateReviewLinkToken();
    await this.database.transaction(async (manager) => {
      const document = await manager.getRepository(CadDocument).save({
        tenant_id: CAD_DEMO_SHARE_TENANT,
        organization_id: null,
        plant_id: null,
        created_by: DEMO_MARKER,
        projectId: null,
        name: 'Plano de demostración compartido',
        model: 'demo-share',
        revision: 'snapshot',
        cadDocument,
        cadDocumentVersion: 1,
        layers: null,
      });
      await manager.getRepository(CadReviewSession).save({
        tenant_id: CAD_DEMO_SHARE_TENANT,
        organization_id: null,
        plant_id: null,
        created_by: DEMO_MARKER,
        documentId: document.id,
        status: 'open',
        closedAt: null,
        tokenHash: generated.tokenHash,
        expiresAt,
        revokedAt: null,
        allowComments: false,
      });
    });
    return { shareToken: generated.token, expiresAt: expiresAt.toISOString() };
  }

  /** Delete only snapshots created by this endpoint, in small bounded batches. */
  async purgeExpired(now = new Date()): Promise<number> {
    let purged = 0;
    // At most 1,000 rows per run; the hourly pass catches later backlog.
    for (let batch = 0; batch < 10; batch += 1) {
      const sessions = await this.database
        .getRepository(CadReviewSession)
        .find({
          select: { id: true, documentId: true },
          where: {
            tenant_id: CAD_DEMO_SHARE_TENANT,
            created_by: DEMO_MARKER,
            expiresAt: LessThanOrEqual(now),
          },
          take: 100,
        });
      if (!sessions.length) break;
      await this.database.transaction(async (manager) => {
        for (const session of sessions) {
          await manager.getRepository(CadComment).delete({
            tenant_id: CAD_DEMO_SHARE_TENANT,
            reviewSessionId: session.id,
          });
          await manager.getRepository(CadReviewSession).delete({
            id: session.id,
            tenant_id: CAD_DEMO_SHARE_TENANT,
            created_by: DEMO_MARKER,
          });
          await manager.getRepository(CadDocument).delete({
            id: session.documentId,
            tenant_id: CAD_DEMO_SHARE_TENANT,
            created_by: DEMO_MARKER,
          });
        }
      });
      purged += sessions.length;
    }
    return purged;
  }
}
