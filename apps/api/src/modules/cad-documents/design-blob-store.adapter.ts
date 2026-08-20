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

/** Lo mínimo que la selección necesita saber del almacenamiento de objetos. */
export interface DescribableBlobStore extends CadBlobStore {
  descriptor(): { available: boolean };
}

/**
 * Elige dónde viven los bytes: bucket si está configurado, base si no.
 *
 * Vive aquí, y no dentro del `useFactory` del módulo, para que la REGLA se
 * pueda probar sin arrancar Nest ni PostgreSQL. Una decisión de este calibre
 * —dónde acaban los planos de un cliente— escondida en una lambda de la
 * configuración del módulo es exactamente el tipo de cosa que nadie prueba y
 * que un día resulta que estaba al revés.
 */
export function selectCadBlobStore(
  database: Pick<DatabaseBlobStore, 'put' | 'get'>,
  objects: DescribableBlobStore,
): CadBlobStore {
  return objects.descriptor().available
    ? objects
    : new DesignBlobStoreAdapter(database);
}
