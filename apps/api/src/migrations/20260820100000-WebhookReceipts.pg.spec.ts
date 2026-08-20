import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../common/testing/postgres-harness';
import { WebhookReceipt } from '../modules/outbox-receiver/entities/webhook-receipt.entity';
import { WebhookReceipts20260820100000 } from './20260820100000-WebhookReceipts';

/**
 * La barrera de idempotencia del receptor vive en el ESQUEMA: el único que
 * hace imposible aceptar dos veces la misma entrega, el CHECK de colas
 * conocidas y el de huella sha256 bien formada. Se prueban contra PostgreSQL
 * real porque lo que se mide es qué filas ACEPTA y cuáles rechaza, no qué SQL
 * se escribió — y el ciclo aplica→revierte→reaplica es la regla de la casa
 * para toda migración nueva.
 */
describePostgres('WebhookReceipts (esquema real)', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;

  async function run(direction: 'up' | 'down'): Promise<void> {
    const migration = new WebhookReceipts20260820100000();
    const runner = harness.dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET search_path TO "${harness.schema}"`);
      await migration[direction](runner);
    } finally {
      await runner.release();
    }
  }

  function insertReceipt(values: {
    queue?: string;
    idempotencyKey?: string;
    payloadHash?: string;
    outcome?: string;
  }): Promise<unknown> {
    return harness.dataSource.query(
      `INSERT INTO "${harness.schema}"."webhook_receipts"
         ("queue", "idempotency_key", "payload_hash", "outcome")
       VALUES ($1, $2, $3, $4)`,
      [
        values.queue ?? 'email',
        values.idempotencyKey ?? 'identity.verify-email:token-1',
        values.payloadHash ?? 'a'.repeat(64),
        values.outcome ?? 'email_sent',
      ],
    );
  }

  beforeAll(async () => {
    // El arnés sincroniza la ENTIDAD (con los nombres de índice que genera
    // TypeORM). Se tira la tabla entera para que sea el `up` de la MIGRACIÓN
    // el que cree lo que estas pruebas miden.
    harness = await createPostgresHarness([WebhookReceipt], {
      schemaPrefix: 'webhook_receipts_migration',
    });
    await harness.dataSource.query(
      `DROP TABLE IF EXISTS "${harness.schema}"."webhook_receipts"`,
    );
    await run('up');
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.dataSource.query(
      `TRUNCATE "${harness.schema}"."webhook_receipts" RESTART IDENTITY CASCADE`,
    );
  });

  it('acepta un recibo y hace IMPOSIBLE repetir su idempotency_key', async () => {
    await expect(insertReceipt({})).resolves.toBeDefined();
    // La barrera del receptor: la reentrega no entra, ni siquiera declarando
    // otra cola u otro outcome.
    await expect(
      insertReceipt({ queue: 'domain', outcome: 'domain_accepted' }),
    ).rejects.toMatchObject({ code: '23505' });
    // Otra clave sí, aunque el cuerpo (huella) sea idéntico.
    await expect(
      insertReceipt({ idempotencyKey: 'identity.verify-email:token-2' }),
    ).resolves.toBeDefined();
  });

  it('sólo acepta las colas que el receptor declara', async () => {
    await expect(
      insertReceipt({ queue: 'sms', idempotencyKey: 'clave-sms' }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      insertReceipt({ queue: 'domain', idempotencyKey: 'clave-domain' }),
    ).resolves.toBeDefined();
  });

  it('exige una huella sha256 bien formada', async () => {
    await expect(
      insertReceipt({ payloadHash: 'no-es-un-hash' }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      insertReceipt({ payloadHash: 'A'.repeat(64) }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('el down retira la tabla y el up la repone (aplica→revierte→reaplica)', async () => {
    await run('down');
    await expect(insertReceipt({})).rejects.toMatchObject({ code: '42P01' });

    await run('up');
    await expect(insertReceipt({})).resolves.toBeDefined();
    await expect(
      insertReceipt({ idempotencyKey: 'identity.verify-email:token-1' }),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
