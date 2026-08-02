import { Client } from 'pg';
import type { SourceBlockRow, SourceLayoutRow } from './extract';

/**
 * Lector de la BD ENTERPRISE (origen). READ-ONLY ESTRUCTURAL, no por
 * convención:
 *
 * 1. La sesión fija `default_transaction_read_only = on` nada más conectar.
 * 2. Todo el trabajo corre dentro de UNA transacción
 *    `REPEATABLE READ READ ONLY`: cualquier INSERT/UPDATE/DELETE/DDL
 *    accidental muere con `cannot execute ... in a read-only transaction`
 *    (SQLSTATE 25006) — y además el export ve un snapshot CONSISTENTE de la
 *    base aunque haya escritores concurrentes.
 *
 * Operativamente se recomienda ADEMÁS un usuario de solo-SELECT en la URL
 * origen (ver docs/product-split/DATA-MIGRATION.md §read-only).
 */
export class SourceReader {
  private constructor(private readonly client: Client) {}

  static async connect(url: string): Promise<SourceReader> {
    const client = new Client({ connectionString: url });
    await client.connect();
    await client.query('SET default_transaction_read_only = on');
    await client.query(
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );
    return new SourceReader(client);
  }

  async close(): Promise<void> {
    try {
      await this.client.query('COMMIT');
    } finally {
      await this.client.end();
    }
  }

  private tenantFilter(
    column: string,
    tenants: string[] | null,
    params: unknown[],
  ): string {
    if (!tenants) return '';
    params.push(tenants);
    return ` AND ${column} = ANY($${params.length})`;
  }

  /** Layouts vivos (deleted_at IS NULL), con o sin documento canónico. */
  async readLayouts(tenants: string[] | null): Promise<SourceLayoutRow[]> {
    const params: unknown[] = [];
    const result = await this.client.query(
      `SELECT id, tenant_id, organization_id, plant_id, model, revision,
              footprint_w, footprint_h, unit, grid_size,
              approval_status, approved_by, approved_at, approval_note,
              dxf_data, dxf_name, dxf_offset_x, dxf_offset_y, dxf_scale,
              dxf_rotation, dxf_visible, dxf_opacity,
              connectors, assets, annotations, snapshots, cells, layers,
              cad_document, cad_document_version,
              created_at, updated_at, created_by
         FROM sf_line_layouts
        WHERE deleted_at IS NULL${this.tenantFilter('tenant_id', tenants, params)}
        ORDER BY tenant_id NULLS FIRST, model, revision, id`,
      params,
    );
    return result.rows as SourceLayoutRow[];
  }

  async readBlocks(tenants: string[] | null): Promise<SourceBlockRow[]> {
    const params: unknown[] = [];
    const result = await this.client.query(
      `SELECT id, tenant_id, organization_id, plant_id, name, assets,
              definition, version, created_at, updated_at, created_by
         FROM sf_cad_blocks
        WHERE deleted_at IS NULL${this.tenantFilter('tenant_id', tenants, params)}
        ORDER BY tenant_id NULLS FIRST, name, id`,
      params,
    );
    return result.rows as SourceBlockRow[];
  }

  /** Metadata de un blob por (tenant, blobKey) — sin bytes. */
  async readBlobHead(
    tenantId: string | null,
    blobKey: string,
  ): Promise<{ sha256: string; size: number } | null> {
    const result = await this.client.query(
      `SELECT sha256, size FROM doc_blobs
        WHERE blob_key = $1 AND tenant_id ${tenantId === null ? 'IS NULL' : '= $2'}`,
      tenantId === null ? [blobKey] : [blobKey, tenantId],
    );
    const row = result.rows[0] as { sha256: string; size: number } | undefined;
    return row ?? null;
  }

  /** Bytes de un blob por (tenant, blobKey). */
  async readBlobData(
    tenantId: string | null,
    blobKey: string,
  ): Promise<{ sha256: string; size: number; data: Buffer } | null> {
    const result = await this.client.query(
      `SELECT sha256, size, data FROM doc_blobs
        WHERE blob_key = $1 AND tenant_id ${tenantId === null ? 'IS NULL' : '= $2'}`,
      tenantId === null ? [blobKey] : [blobKey, tenantId],
    );
    const row = result.rows[0] as
      { sha256: string; size: number; data: Buffer } | undefined;
    return row ?? null;
  }

  /** Nombre de la base conectada (para el manifiesto, sin credenciales). */
  async databaseName(): Promise<string> {
    const result = await this.client.query('SELECT current_database() AS db');
    return String(result.rows[0]?.db ?? 'desconocida');
  }
}
