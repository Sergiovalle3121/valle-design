/**
 * EL HISTORIAL CAS DEL DOCUMENTO, en el fake de `/v1/cad/*`.
 *
 * La API real guarda una fila en `cad_document_versions` por cada guardado y
 * la sirve HIDRATADA (R3) en `GET …/versions/:n`. Este helper le da al fixture
 * la misma memoria: `record` se llama al sembrar un documento con versión y en
 * cada `PUT …/content` aceptado; `routes` contesta la lista (de más nueva a
 * más vieja, como el servidor) y el detalle con el documento completo.
 *
 * Vive aparte porque `cad-v1-backend.ts` está a pocas líneas de su techo y
 * sólo puede encoger.
 */

export interface CadV1VersionRow {
  version: number;
  createdAt: string;
  createdBy: string;
  document: Record<string, unknown>;
}

export class CadV1VersionStore {
  private readonly rows = new Map<string, CadV1VersionRow[]>();
  private tick = 0;

  record(documentId: string, version: number, document: Record<string, unknown> | null): void {
    if (!document || version < 1) return;
    const list = this.rows.get(documentId) ?? [];
    this.tick += 1;
    list.push({
      version,
      createdAt: new Date(Date.UTC(2026, 8, 6, 10, 0, this.tick)).toISOString(),
      createdBy: "arquitecta@despacho.mx",
      document: structuredClone(document),
    });
    this.rows.set(documentId, list);
  }

  /** Lo que el servidor VIO para ese documento, de más vieja a más nueva. */
  of(documentId: string): readonly CadV1VersionRow[] {
    return this.rows.get(documentId) ?? [];
  }

  /** Los documentos con historial, en orden de primer guardado. */
  documents(): string[] {
    return [...this.rows.keys()];
  }

  routes(input: {
    documentId: string;
    rest: string;
    method: string;
  }): { status: number; body: unknown } | null {
    const { documentId, rest, method } = input;
    if (method !== "GET") return null;
    const summary = (row: CadV1VersionRow) => ({
      documentId,
      version: row.version,
      sha256: null,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    });
    if (rest === "versions") {
      const items = [...this.of(documentId)].sort((a, b) => b.version - a.version).map(summary);
      return { status: 200, body: { items, total: items.length } };
    }
    const match = rest.match(/^versions\/(\d+)$/);
    if (!match) return null;
    const row = this.of(documentId).find((candidate) => candidate.version === Number(match[1]));
    if (!row) return { status: 404, body: { message: "Versión CAS no encontrada.", requestId: "e2e" } };
    return { status: 200, body: { ...summary(row), cadDocument: structuredClone(row.document) } };
  }
}
