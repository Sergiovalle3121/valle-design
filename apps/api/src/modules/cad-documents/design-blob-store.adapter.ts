/**
 * Adaptador Design del puerto CadBlobStore (sustituye al adaptador enterprise
 * que envolvía el DOCUMENT_BLOB_STORE del módulo documents).
 *
 * Wrappea el DatabaseBlobStore propio (`design_blobs`) — único lugar (junto
 * con el wiring del módulo) donde cad-documents conoce el módulo blob-store.
 * El dominio CAD sigue hablando únicamente con el puerto neutral.
 */
import type { DatabaseBlobStore } from '../blob-store/design-blob.store';
import type { EntityManager } from 'typeorm';
import type {
  CadBlobPutResult,
  CadBlobStore,
} from './ports/cad-blob-store.port';

export class DesignBlobStoreAdapter implements CadBlobStore {
  /** Sólo se exige el subconjunto que el puerto delega (put/get). */
  constructor(private readonly inner: Pick<DatabaseBlobStore, 'put' | 'get'>) {}

  put(
    data: Buffer,
    sha256: string,
    transaction?: unknown,
  ): Promise<CadBlobPutResult> {
    return transaction === undefined
      ? this.inner.put(data, sha256)
      : this.inner.put(data, sha256, transaction as EntityManager);
  }

  get(blobKey: string): Promise<Buffer> {
    return this.inner.get(blobKey);
  }
}
