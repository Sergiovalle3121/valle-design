import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DesignBlob } from './entities/design-blob.entity';
import { DatabaseBlobStore } from './design-blob.store';
import { provideTenantScopedRepository } from '../../common/tenant/tenant-scoped.repository';

/**
 * Almacenamiento binario PROPIO de Design (sustituye al módulo `documents` de
 * Enterprise para el puerto CAD_BLOB_STORE). Content-addressed sobre la tabla
 * `design_blobs`; ver DatabaseBlobStore.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DesignBlob])],
  providers: [
    provideTenantScopedRepository(DesignBlob, { strict: true }),
    DatabaseBlobStore,
  ],
  exports: [DatabaseBlobStore],
})
export class BlobStoreModule {}
