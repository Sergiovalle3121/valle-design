# Almacenamiento de blobs CAD: migración a S3/MinIO y operación

## Dónde viven hoy los bytes de tus planos

En PostgreSQL, en la tabla `design_blobs`, columna `data` de tipo `bytea`, una
fila por contenido único (sha256) y por organización. **Ése es el modo por
defecto y el único que se ha ejecutado en producción.** El adaptador
S3/MinIO existe, está cableado y se selecciona por configuración, pero en el
entorno donde se escribió no había credenciales de S3 ni Docker para levantar
un MinIO: sus pruebas verifican la firma AWS SigV4 contra el ejemplo publicado
por AWS y el protocolo contra un cliente HTTP inyectado. **No hay una corrida
contra un bucket real.** Antes de moverte, léete la sección «Qué falta para
darlo por bueno».

## Por qué querrías mover los blobs a un bucket

- El respaldo de PostgreSQL deja de arrastrar gigabytes de dibujo. Un
  `pg_dump` que hoy tarda una hora por los planos vuelve a tardar minutos, y el
  tiempo de RESTAURACIÓN —el que importa el día malo— baja con él.
- Las conexiones del pool dejan de ocuparse moviendo binarios.
- El cliente que exige que sus archivos vivan en su propia infraestructura
  (requisito habitual en obra pública) puede apuntar a su MinIO.

Y por qué NO querrías: si tus documentos son pequeños y tu base cabe holgada en
el respaldo, mover los blobs añade un sistema más que puede fallar, con
credenciales que rotar y una consistencia que ya no es transaccional (ver
abajo). No es una mejora automática.

## Configuración

El adaptador se activa cuando las CUATRO variables obligatorias están
presentes. Una configuración a medias **hace fallar el arranque** a propósito:
un despliegue que cree escribir en un bucket y no puede leerlo después pierde
el plano del cliente, y el fallo aparecería con el archivo ya subido.

| Variable                       | Obligatoria | Descripción                                                                 |
| ------------------------------ | ----------- | --------------------------------------------------------------------------- |
| `S3_BLOB_ENDPOINT`             | sí          | Origen del servicio. HTTPS salvo `localhost`/`minio` fuera de producción.   |
| `S3_BLOB_BUCKET`               | sí          | Nombre del bucket (3-63 caracteres, minúsculas).                            |
| `S3_BLOB_ACCESS_KEY_ID`        | sí          | Clave de acceso.                                                            |
| `S3_BLOB_SECRET_ACCESS_KEY`    | sí          | Secreto.                                                                    |
| `S3_BLOB_REGION`               | no          | Por defecto `us-east-1` (MinIO la ignora, pero la firma la exige).          |
| `S3_BLOB_PREFIX`               | no          | Prefijo de clave, p. ej. `cad/`. Se normaliza con barra final.              |
| `S3_BLOB_SESSION_TOKEN`        | no          | Credenciales temporales.                                                    |
| `S3_BLOB_TIMEOUT_MS`           | no          | 1 000-300 000, por defecto 30 000.                                          |
| `S3_BLOB_FORCE_PATH_STYLE`     | no          | `true` por defecto (funciona en MinIO y AWS). `false` = bucket en el host.  |

Al arrancar, la aplicación **registra el modo** en la bitácora:

```
[BlobStoreModule] Almacenamiento de blobs CAD: modo=object-store adaptador=s3 disponible=true bucket=valle-planos
[BlobStoreModule] Almacenamiento de blobs CAD: modo=database-bytea adaptador=database disponible=false — Sin configuración de S3/MinIO: los blobs viven en PostgreSQL (design_blobs, bytea).
```

Si no sabes en qué modo está un despliegue, esa línea lo dice sin adivinar.

## Cómo se nombran los objetos

```
<prefijo><organizacionId>/<blobKey>
```

- **La organización va en la ruta**, no sólo en una comprobación de código. Sin
  ella, dos despachos con el mismo plano compartirían objeto y uno podría
  deducir que el otro tiene ese archivo. La deduplicación por contenido se
  conserva dentro de cada organización, que es donde tiene valor.
- **`blobKey` es el sha256** para todo lo que se escriba a partir de ahora: la
  subida es idempotente por construcción.
- **Los blobs heredados conservan su UUID.** Miles de documentos ya guardan ese
  identificador en su puntero `_storage`; renombrarlos a su hash sería una
  migración de datos con riesgo real a cambio de estética. La lectura no
  distingue: resuelve la clave que le den.

## Migración

### Paso 0 — plan, sin escribir nada

`migrateBlobsToObjectStore` con `dryRun: true` recorre `design_blobs`, decide
qué copiaría y no toca el bucket. Sirve para saber cuántos objetos y cuántos
gigabytes hay antes de empezar, y para comprobar que las credenciales leen.

### Paso 1 — copiar

La copia **nunca borra el origen**. Por cada blob:

1. `HEAD` en destino: si ya está con el mismo tamaño, se salta (la migración es
   reanudable volviéndola a lanzar, sin restaurar ningún estado intermedio).
2. Lectura desde PostgreSQL y **verificación de integridad en origen**: tamaño
   y sha256 contra lo que declara la fila. Copiar un blob corrupto lo
   convertiría en corrupción permanente en dos sitios.
3. `PUT` bajo la clave original.
4. `HEAD` de confirmación: un `PUT` que devuelve 200 sobre un bucket con
   políticas o cuotas mal puestas puede no dejar el objeto. Sin esta
   comprobación se descubriría el día que alguien abra el plano.

Se detiene **ante el primer fallo**, no al final: un error de permisos afecta a
todos los blobs siguientes, y seguir acumula miles de fallos idénticos que
esconden el primero, que es el único que dice qué pasó.

### Paso 2 — conmutar

Definir las variables y reiniciar. Desde ese momento las escrituras nuevas van
al bucket y las lecturas también. **Las filas antiguas siguen en la base**: si
algo va mal, se quitan las variables, se reinicia y todo vuelve a leerse de
PostgreSQL. Ésa es la vuelta atrás, y sólo existe mientras no se ejecute el
paso 3.

### Paso 3 — retirar los bytes de la base (decisión aparte, más tarde)

No se hace en el mismo cambio ni el mismo día. Antes de vaciar `design_blobs`:

- que el respaldo del bucket exista y se haya probado una restauración;
- que hayan pasado al menos dos ciclos completos de respaldo con el modo objeto
  activo;
- que un muestreo aleatorio de documentos abra correctamente desde el bucket.

## Operación

### Qué vigilar

| Señal                                        | Qué significa                                                       | Qué hacer                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `S3BlobStoreError` con 403                    | Credenciales caducadas o política del bucket cambiada.               | Rotar credenciales. Las escrituras fallan **cerrado**: no se pierde el plano, el guardado devuelve error al usuario. |
| `S3BlobStoreError` con 404 en lectura         | Objeto ausente que la base sí referencia.                            | Comparar `design_blobs` con el bucket. Si el paso 3 no se ejecutó, los bytes siguen en la base. |
| `S3BlobStoreError` con 502 «no coincide con su hash» | Corrupción en el bucket o objeto sustituido.                 | Incidente serio: restaurar ese objeto del respaldo, auditar accesos al bucket. |
| Latencia de guardado por encima de lo normal  | Red al bucket, o bucket en otra región.                              | Ver `docs/cad/evidence/api-load-tests.json` para la referencia en modo base.  |
| Objetos en el bucket > filas en `design_blobs` | Huérfanos por transacción abortada (ver abajo). Es esperable.        | El barrido de recolección los retira; no es un incidente.                     |

### La transacción no cruza al bucket

`DatabaseBlobStore.put` participa en la transacción de quien llama: si el
guardado del documento falla, los bytes se van con el `ROLLBACK`. **S3 no tiene
transacciones.** Si la transacción del documento aborta después de un `PUT`
correcto, el objeto queda huérfano. No es una fuga silenciosa —al estar
direccionado por contenido, no lo referencia nadie y el recolector lo retira—,
pero explica por qué el bucket puede tener más objetos que filas la tabla, y un
operador tiene derecho a saberlo antes de abrir una incidencia.

### Respaldo

Activar el modo objeto **cambia dónde vive tu respaldo**. A partir de ese
momento, un `pg_dump` ya no contiene los planos: contiene punteros. El respaldo
del bucket (versionado de objetos, replicación entre regiones o copia
programada, según el proveedor) pasa a ser parte del plan de recuperación, y
una restauración de PostgreSQL sin el bucket correspondiente deja documentos
que no abren. Comprobarlo es el requisito del paso 3.

### Borrado y recolección

El recolector de dos barridos vive en PostgreSQL: la marca `gc_marked_at` es la
contabilidad y el bucket es sólo el destino. Por eso `S3BlobStore.delete` no
exige marca previa —a diferencia del adaptador de base de datos, que sí la
exige porque allí la fila ES el registro—.

## Qué falta para darlo por bueno

Lo que este repositorio **no** puede afirmar todavía, y necesita del dueño:

1. **Credenciales de un S3 o un MinIO** (pueden ser de un bucket de pruebas
   desechable) para ejecutar el adaptador de verdad contra un servicio real.
2. Una corrida de la migración sobre un volumen representativo, con sus
   tiempos, para poder publicarlos como se publicaron los de carga de la API.
3. Decidir si el producto ofrecerá bucket gestionado o exigirá el del cliente:
   cambia la política de respaldo y lo que se promete en el contrato.
