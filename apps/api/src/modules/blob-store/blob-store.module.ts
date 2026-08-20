import { Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DesignBlob } from './entities/design-blob.entity';
import { DatabaseBlobStore } from './design-blob.store';
import {
  describeBlobStore,
  globalS3HttpClient,
  missingS3Variables,
  resolveS3BlobStoreConfiguration,
  S3BlobStore,
  UnavailableS3BlobStore,
  type BlobStoreDescriptor,
} from './s3-blob.store';
import { provideTenantScopedRepository } from '../../common/tenant/tenant-scoped.repository';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

/** Token del almacenamiento de objetos: S3BlobStore o el adaptador no disponible. */
export const S3_BLOB_STORE = Symbol('S3_BLOB_STORE');
/** Token del modo publicado del almacenamiento. Se declara, no se adivina. */
export const BLOB_STORE_DESCRIPTOR = Symbol('BLOB_STORE_DESCRIPTOR');

/**
 * Almacenamiento binario PROPIO de Design (sustituye al módulo `documents` de
 * Enterprise para el puerto CAD_BLOB_STORE).
 *
 * DOS ADAPTADORES, UNA SELECCIÓN POR CONFIGURACIÓN. `DatabaseBlobStore`
 * (content-addressed sobre `design_blobs`, bytea) es el modo por defecto y el
 * único que este entorno ha ejecutado de verdad. `S3BlobStore` entra cuando
 * las cuatro variables `S3_BLOB_*` están COMPLETAS; si faltan, el token del
 * almacenamiento de objetos se satisface con `UnavailableS3BlobStore`, que
 * dice qué falta en vez de fingir una escritura.
 *
 * El modo se REGISTRA al arrancar. Un operador que abre la bitácora tras un
 * despliegue tiene que poder responder «¿dónde están los bytes de mis planos?»
 * sin leer código ni adivinar por la ausencia de un error.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DesignBlob])],
  providers: [
    provideTenantScopedRepository(DesignBlob, { strict: true }),
    DatabaseBlobStore,
    {
      provide: S3_BLOB_STORE,
      inject: [TenantContextService],
      useFactory: (tenantCtx: TenantContextService) => {
        // Una configuración a medias LANZA aquí (resolveS3BlobStoreConfiguration)
        // y el arranque falla: es deliberado. Un despliegue que cree escribir en
        // un bucket y no puede leerlo después pierde el plano del cliente, y ese
        // fallo aparecería con el archivo ya subido.
        const configuration = resolveS3BlobStoreConfiguration(process.env);
        return configuration
          ? new S3BlobStore(configuration, tenantCtx, globalS3HttpClient)
          : new UnavailableS3BlobStore(missingS3Variables(process.env));
      },
    },
    {
      provide: BLOB_STORE_DESCRIPTOR,
      useFactory: (): BlobStoreDescriptor => describeBlobStore(process.env),
    },
  ],
  exports: [DatabaseBlobStore, S3_BLOB_STORE, BLOB_STORE_DESCRIPTOR],
})
export class BlobStoreModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(BlobStoreModule.name);

  onApplicationBootstrap(): void {
    const descriptor = describeBlobStore(process.env);
    this.logger.log(
      `Almacenamiento de blobs CAD: modo=${descriptor.mode} adaptador=${descriptor.name} ` +
        `disponible=${descriptor.available}` +
        (descriptor.bucket ? ` bucket=${descriptor.bucket}` : '') +
        (descriptor.reason ? ` — ${descriptor.reason}` : ''),
    );
  }
}
