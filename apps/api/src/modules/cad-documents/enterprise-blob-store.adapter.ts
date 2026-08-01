/**
 * Adaptador enterprise del puerto CadBlobStore (WP2c).
 *
 * Wrappea el `DOCUMENT_BLOB_STORE` del módulo documents — único lugar (junto
 * con el wiring del módulo) donde cad-documents conoce ese símbolo. Vive en
 * este módulo POR AHORA: en Fase 3 el repo Design lo sustituye por su propio
 * almacenamiento sin tocar el dominio.
 */
import type { DocumentBlobStore } from '../documents/blob/document-blob-store';
import type {
  CadBlobPutResult,
  CadBlobStore,
} from './ports/cad-blob-store.port';

export class EnterpriseBlobStoreAdapter implements CadBlobStore {
  /** Sólo se exige el subconjunto que el puerto delega (put/get). */
  constructor(private readonly inner: Pick<DocumentBlobStore, 'put' | 'get'>) {}

  put(data: Buffer, sha256: string): Promise<CadBlobPutResult> {
    return this.inner.put(data, sha256);
  }

  get(blobKey: string): Promise<Buffer> {
    return this.inner.get(blobKey);
  }
}
