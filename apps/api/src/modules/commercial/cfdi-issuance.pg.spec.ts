import { randomUUID } from 'node:crypto';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import { User } from '../identity/entities/identity.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { Invoice, TaxProfile } from './entities/commercial.entities';
import { CfdiIssuanceService, GENERIC_RFC } from './cfdi-issuance.service';
import { NullCfdiProvider } from './adapters/null-cfdi.provider';
import { CfdiReceipt } from './entities/cfdi-receipt.entity';
import type {
  CfdiIssuanceRequest,
  CfdiIssuanceResult,
  CfdiProvider,
} from './ports/cfdi-provider.port';

/**
 * El ciclo fiscal completo, contra PostgreSQL real: pago→CFDI nominativo si
 * hay datos fiscales, pago→pool si no, pool→factura global del mes anterior,
 * y con el adaptador nulo todo queda `manual` sin fingir. Lo que arbitra la
 * idempotencia son los únicos parciales del esquema — por eso este spec no
 * tiene versión SQLite: correr dos veces y obtener UN efecto es exactamente
 * lo que se está probando.
 */

class RecordingCfdiProvider implements CfdiProvider {
  requests: CfdiIssuanceRequest[] = [];
  failNext = 0;

  descriptor() {
    return { name: 'grabadora', mode: 'automatic' as const, available: true };
  }

  issue(request: CfdiIssuanceRequest): Promise<CfdiIssuanceResult> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new Error('PAC caído (simulado)'));
    }
    this.requests.push(request);
    return Promise.resolve({
      kind: 'issued',
      uuid: `uuid-${this.requests.length}`,
      providerRef: `ref-${this.requests.length}`,
      xmlUrl: null,
      pdfUrl: null,
    });
  }
}

describePostgres('CfdiIssuanceService (ciclo pago→CFDI, PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let harness: PostgresHarness;
  let provider: RecordingCfdiProvider;
  let service: CfdiIssuanceService;

  beforeAll(async () => {
    harness = await createPostgresHarness(
      [User, Organization, Invoice, TaxProfile, CfdiReceipt],
      { schemaPrefix: 'cfdi_cycle' },
    );
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
    provider = new RecordingCfdiProvider();
    service = new CfdiIssuanceService(harness.dataSource, provider);
  });

  async function seedOrganization(withProfile: boolean): Promise<string> {
    const userId = randomUUID();
    const organizationId = randomUUID();
    await harness.dataSource.query(
      `INSERT INTO "${harness.schema}"."identity_users" ("id", "email") VALUES ($1, $2)`,
      [userId, `owner-${organizationId.slice(0, 8)}@test.invalid`],
    );
    await harness.dataSource.query(
      `INSERT INTO "${harness.schema}"."organizations"
         ("id", "name", "slug", "ownerUserId")
       VALUES ($1, 'Despacho', $2, $3)`,
      [organizationId, `despacho-${organizationId.slice(0, 8)}`, userId],
    );
    if (withProfile) {
      await harness.dataSource.query(
        `INSERT INTO "${harness.schema}"."tax_profiles"
           ("organization_id", "tenant_id", "rfc", "person_type", "legal_name",
            "tax_regime_code", "cfdi_use_code", "postal_code")
         VALUES ($1, $1, 'VECJ880326XX4', 'fisica',
                 'Arquitectos del Valle', '612', 'G03', '06700')`,
        [organizationId],
      );
    }
    return organizationId;
  }

  async function seedPaidInvoice(
    organizationId: string,
    issuedAt: Date,
    amountCents = 99_900,
  ): Promise<string> {
    const rows = await harness.dataSource.query(
      `INSERT INTO "${harness.schema}"."invoices"
         ("organization_id", "tenant_id", "provider", "provider_invoice_id",
          "number", "amount_cents", "currency", "status", "issued_at")
       VALUES ($1, $1, 'stripe', $2, 'VD-0042', $3, 'MXN', 'paid', $4)
       RETURNING "id"`,
      [organizationId, `in_${randomUUID().slice(0, 8)}`, amountCents, issuedAt],
    );
    return rows[0].id;
  }

  function receiptsOf(): Promise<CfdiReceipt[]> {
    return harness.dataSource.getRepository(CfdiReceipt).find();
  }

  it('pago con datos fiscales → CFDI nominativo, UNA sola vez aunque corra dos', async () => {
    const organizationId = await seedOrganization(true);
    const invoiceId = await seedPaidInvoice(organizationId, new Date());

    const first = await service.runOnce(new Date());
    expect(first.discovered).toBe(1);
    expect(first.issued).toBe(1);

    // Segunda pasada (o segunda réplica): el único parcial la vuelve inocua.
    const second = await service.runOnce(new Date());
    expect(second.discovered).toBe(0);
    expect(second.issued).toBe(0);
    expect(provider.requests).toHaveLength(1);

    const [receipt] = await receiptsOf();
    expect(receipt).toMatchObject({
      invoiceId,
      kind: 'nominative',
      status: 'issued',
      uuid: 'uuid-1',
      providerRef: 'ref-1',
    });
    // El receptor sale del perfil fiscal capturado en checkout.
    expect(provider.requests[0].receiver.rfc).toBe('VECJ880326XX4');
    expect(provider.requests[0].concept).toContain('VD-0042');
  });

  it('una factura reembolsada no genera CFDI: no se factura dinero devuelto', async () => {
    const organizationId = await seedOrganization(true);
    const invoiceId = await seedPaidInvoice(organizationId, new Date());
    await harness.dataSource.query(
      `UPDATE "${harness.schema}"."invoices" SET "status" = 'refunded'
        WHERE "id" = $1`,
      [invoiceId],
    );
    const report = await service.runOnce(new Date());
    expect(report.discovered).toBe(0);
    expect(await receiptsOf()).toHaveLength(0);
  });

  it('sin datos fiscales → al pool de la factura global', async () => {
    const organizationId = await seedOrganization(false);
    await seedPaidInvoice(organizationId, new Date());

    const report = await service.runOnce(new Date());
    expect(report.pooled).toBe(1);
    expect(provider.requests).toHaveLength(0);
    const [receipt] = await receiptsOf();
    expect(receipt.status).toBe('pooled');
  });

  it('con el adaptador NULO todo queda `manual` con el motivo — nada se finge', async () => {
    const organizationId = await seedOrganization(true);
    await seedPaidInvoice(organizationId, new Date());
    const manualService = new CfdiIssuanceService(
      harness.dataSource,
      new NullCfdiProvider(),
    );

    const report = await manualService.runOnce(new Date());
    expect(report.manual).toBe(1);
    const [receipt] = await receiptsOf();
    expect(receipt.status).toBe('manual');
    expect(receipt.detail).toContain('PAC');
  });

  it('el rechazo del PAC reintenta con techo, no en bucle', async () => {
    const organizationId = await seedOrganization(true);
    await seedPaidInvoice(organizationId, new Date());
    provider.failNext = 1;

    const first = await service.runOnce(new Date());
    expect(first.failed).toBe(1);
    let [receipt] = await receiptsOf();
    expect(receipt).toMatchObject({ status: 'failed', attemptCount: 1 });

    // La siguiente pasada lo recoge y esta vez el PAC responde.
    const second = await service.runOnce(new Date());
    expect(second.issued).toBe(1);
    [receipt] = await receiptsOf();
    expect(receipt.status).toBe('issued');

    // Con los intentos agotados, se queda quieto para el operador.
    await harness.dataSource
      .getRepository(CfdiReceipt)
      .update(receipt.id, { status: 'failed', attemptCount: 5 });
    const third = await service.runOnce(new Date());
    expect(third.issued + third.failed).toBe(0);
  });

  it('la factura global del mes anterior: una sola, RFC genérico, pool enlazado', async () => {
    const organizationId = await seedOrganization(false);
    // Cobro del 15 del MES PASADO, sin datos fiscales.
    const now = new Date('2026-08-20T09:00:00Z');
    const lastMonth = new Date('2026-07-15T12:00:00Z');
    await seedPaidInvoice(organizationId, lastMonth, 50_000);
    await seedPaidInvoice(organizationId, lastMonth, 30_000);

    // Una sola pasada: descubre, agrupa en el pool y — con el mes ya
    // cerrado — timbra la global en el mismo tick.
    const report = await service.runOnce(now);
    expect(report.pooled).toBe(2);
    expect(report.globalIssued).toBe(true);

    const globalRequest = provider.requests.find(
      (request) => request.receiver.rfc === GENERIC_RFC,
    );
    expect(globalRequest).toBeDefined();
    expect(globalRequest!.amountCents).toBe(80_000);
    expect(globalRequest!.receiver.legalName).toBe('PUBLICO EN GENERAL');

    const receipts = await receiptsOf();
    const global = receipts.find((row) => row.kind === 'global');
    expect(global).toMatchObject({ status: 'issued', currency: 'MXN' });
    for (const pooled of receipts.filter((row) => row.kind === 'nominative')) {
      expect(pooled.status).toBe('pooled');
      expect(pooled.globalReceiptId).toBe(global!.id);
    }

    // Tercera pasada: el único (kind, period_start) impide una segunda global.
    const again = await service.runOnce(now);
    expect(again.globalIssued).toBe(false);
    expect(
      (await receiptsOf()).filter((row) => row.kind === 'global'),
    ).toHaveLength(1);
  });
});
