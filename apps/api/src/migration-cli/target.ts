import { Client } from 'pg';

/**
 * Conexión de ESCRITURA a la BD DESIGN (destino). Toda columna JSON se escribe
 * con `$n::jsonb` + JSON.stringify explícito: node-pg convertiría un arreglo
 * JS a literal de array de PostgreSQL (no JSON) si se pasara crudo.
 */
export class TargetDb {
  private constructor(readonly client: Client) {}

  static async connect(url: string): Promise<TargetDb> {
    const client = new Client({ connectionString: url });
    await client.connect();
    return new TargetDb(client);
  }

  async close(): Promise<void> {
    await this.client.end();
  }

  /**
   * Fragmento WHERE del lane de tenant (NULL = lane sistema) usando parámetros
   * posicionales acumulados en `params`.
   */
  lane(column: string, tenantId: string | null, params: unknown[]): string {
    if (tenantId === null) return `${column} IS NULL`;
    params.push(tenantId);
    return `${column} = $${params.length}`;
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.client.query(sql, params);
    return result.rows as T[];
  }
}

/** Serialización JSON explícita para parámetros jsonb (null-safe). */
export function jsonParam(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}
