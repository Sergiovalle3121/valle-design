/**
 * Conjuntos de planos del backend de mentira, en su propio módulo.
 *
 * Vive aparte de `cad-v1-backend.ts` por el presupuesto de tamaño —el mismo
 * motivo que sacó los hilos de comentario a `CadReviewCommentStore`—, y porque
 * es una tabla ENTERA distinta: el conjunto no vive dentro de un documento,
 * tiene su propio recurso y su propia versión, como el `.dst` de AutoCAD.
 *
 * Guarda además CADA PUT recibido. Un golden que quiera afirmar que renumerar
 * escribió de verdad tiene que poder mirar lo que el SERVIDOR vio, no lo que el
 * cliente cree que mandó.
 */
export interface CadSheetSetSaveRecord {
  sheetSetId: string;
  body: Record<string, unknown>;
}

export interface CadSheetSetReply {
  body: unknown;
  status: number;
}

export class CadSheetSetStore {
  private readonly rows = new Map<string, Record<string, unknown>>();
  /** Cada PUT recibido, en orden. Es la evidencia que mira un golden. */
  readonly saves: CadSheetSetSaveRecord[] = [];

  /** Siembra un conjunto ya existente en el servidor. */
  register(resource: Record<string, unknown>): void {
    this.rows.set(String(resource.id), structuredClone(resource));
  }

  /** El recurso tal y como está ahora, para inspeccionarlo desde un golden. */
  get(sheetSetId: string): Record<string, unknown> | null {
    const row = this.rows.get(sheetSetId);
    return row ? structuredClone(row) : null;
  }

  /**
   * Atiende `/v1/cad/sheet-sets/:id`. Devuelve `null` cuando la ruta no es
   * suya, para que el enrutador del backend siga probando.
   */
  handle(input: {
    path: string;
    method: string;
    body: () => Record<string, unknown>;
  }): CadSheetSetReply | null {
    const match = input.path.match(/^\/v1\/cad\/sheet-sets\/([^/]+)$/);
    if (!match) return null;
    const sheetSetId = match[1];
    const row = this.rows.get(sheetSetId);
    if (!row)
      return { body: { message: "Conjunto de planos no encontrado.", requestId: "e2e" }, status: 404 };
    if (input.method === "GET") return { body: structuredClone(row), status: 200 };
    if (input.method !== "PUT") return null;

    const dto = input.body();
    this.saves.push({ sheetSetId, body: dto });
    // El CAS es contractual: sin `expectedVersion` no se escribe, y con una
    // versión que no es la vigente se responde 409 con la actual. Aflojarlo
    // aquí dejaría pasar en los goldens justo lo que la API real rechaza.
    const expected = dto.expectedVersion;
    if (typeof expected !== "number")
      return { body: { message: "expectedVersion es obligatorio.", requestId: "e2e" }, status: 400 };
    if (expected !== row.version)
      return {
        body: {
          code: "sheet_set_version_conflict",
          message: "El conjunto cambió.",
          current: row.version,
          requestId: "e2e",
        },
        status: 409,
      };
    const { expectedVersion: _omit, ...rest } = dto;
    const saved = { ...row, ...rest, version: Number(row.version ?? 0) + 1 };
    this.rows.set(sheetSetId, saved);
    return { body: structuredClone(saved), status: 200 };
  }
}
