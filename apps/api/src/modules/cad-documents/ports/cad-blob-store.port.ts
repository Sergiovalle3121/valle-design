/**
 * Puerto neutral de almacenamiento binario del CAD (WP2c).
 *
 * Modela 1:1 lo que `CadDocumentsService` usa hoy del blob store de documents
 * (los call sites de `storeCadDocument`/`hydrateCadDocument`): `put` devuelve
 * el manifiesto (blobKey + sha256 + size) que el dominio verifica contra el
 * archivo gzip que subió, y `get` devuelve los bytes tal cual (el adaptador
 * lanza si el blob no existe — el dominio nunca recibe null). En el repo
 * Design (Fase 3) los adaptadores enterprise se sustituyen por una
 * implementación propia sin tocar el dominio.
 */

/** Manifiesto que el almacenamiento confirma tras aceptar los bytes. */
export interface CadBlobPutResult {
  blobKey: string;
  sha256: string;
  size: number;
}

export interface CadBlobStore {
  /** Persiste los bytes y confirma el manifiesto (integridad verificable). */
  put(
    data: Buffer,
    sha256: string,
    transaction?: unknown,
  ): Promise<CadBlobPutResult>;
  /** Recupera los bytes por clave; lanza si el blob no existe. */
  get(blobKey: string): Promise<Buffer>;
}

/** Token de inyección del puerto (opcional en CadDocumentsService). */
export const CAD_BLOB_STORE = Symbol('CAD_BLOB_STORE');
