/**
 * Declaración local MÍNIMA del cliente `pg` — sólo la superficie que usa el
 * migration-cli (Client: connect/query/end). Existe para poder activar
 * `noImplicitAny` sin añadir `@types/pg` como dependencia nueva (la política
 * de esta campaña: dependencias sólo por seguridad). Si el CLI empieza a
 * usar más superficie de `pg`, amplíese aquí o adóptese `@types/pg` con su
 * revisión de licencia y SBOM.
 */
declare module 'pg' {
  export interface QueryResult {
    // Filas crudas de SQL arbitrario: tiparlas aquí sería inventar un esquema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: any[];
    rowCount: number | null;
  }
  export class Client {
    constructor(config?: { connectionString?: string });
    connect(): Promise<void>;
    query(text: string, values?: unknown[]): Promise<QueryResult>;
    end(): Promise<void>;
  }
}
