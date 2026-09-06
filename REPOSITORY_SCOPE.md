# Alcance del repositorio

## Dentro

Valle Design es un **CAD 2D general y universal** desplegable: frontend Next.js
(`apps/web`), API NestJS (`apps/api`), contratos OpenAPI/AsyncAPI y tipos
compartidos (`packages/contracts`), y cliente generado (`packages/design-sdk`).
Dibuja planos de cualquier disciplina —arquitectónico, mecánico, eléctrico,
civil, de instalaciones, de mobiliario, de terreno—; el contenido mexicano es su
fortaleza inicial, no su límite. Ver [`IDENTITY.md`](IDENTITY.md).

Su dominio comprobado incluye documento CAD canónico con CAS/versiones, bloques,
revisión, publicación PDF, fondo e import/export DXF y blobs en PostgreSQL.

## Fuera

**ERP, MES, planificación de plantas y gestión industrial no pertenecen aquí** y
no vuelven a entrar: nada de takt time, balanceo de líneas, órdenes de trabajo,
rutas de material, racks de almacén, transportadores ni montacargas. Un plano
_de_ una fábrica sí se dibuja —una nave industrial es una tipología de edificio—;
el software que _opera_ esa fábrica no existe en este repositorio. El gate
`scripts/cad/check-no-industrial-domain.mjs`, encadenado en `npm run check:cad`,
lo hace cumplir. Office y los datos industriales del producto de origen tampoco
pertenecen aquí.

Los blobs viven en PostgreSQL (`design_blobs`) por defecto (`.env.example` deja
`S3_BLOB_*` comentadas); con las `S3_BLOB_*` obligatorias completas —todas o
ninguna— el adaptador S3/MinIO de `apps/api/src/modules/blob-store` se
selecciona en runtime para el puerto `CAD_BLOB_STORE` (`selectCadBlobStore`), y
admite HTTP sólo contra un MinIO local fuera de producción, como el que levanta
`docker-compose.yml` (`http://localhost:9000`). Ese adaptador se prueba con
vectores SigV4 y un cliente HTTP inyectado; nunca se ha ejecutado contra un
MinIO ni un S3 reales —lo declara su propia cabecera—. Lo que falta es esa
corrida, no el código.

DWG tiene un códec propio (`packages/dwg-codec`) expuesto en el producto sólo
como beta de importación (ADR-0009 §6-bis, ampliada en §6-quater al perfil
`AC1015_MODELSPACE_2D_V3`; AC1018 desde §7), apagada por defecto tras
`NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA`
(y `NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA` para AC1018), con un único punto de
lectura autorizado (`apps/web/src/lib/cad/dwg-native-reader.ts`, gate
`scripts/dwg/check-product-boundary.mjs`). La exportación (§8) existe como
adaptador (`dwg-native-writer.ts`) pero está cerrada — `DWG_EXPORT_FLAG=false`,
sin botón ni consumidor de producto. Por el criterio de evidencia de abajo:
parcial.

El kernel Rust/WASM (`crates/valle-cad-kernel`, ADR-0003) lo consume por
defecto el worker de teselado del pipeline de render
(`apps/web/src/lib/cad/render/tessellate.worker.ts` →
`curve-kernel-tessellation.ts`), con el motor JavaScript como reserva mientras
el binario de `apps/web/public/wasm` no está caliente o no hay `Worker`; su
alcance es la teselación de arcos, círculos, elipses y splines, no un kernel
geométrico general. Por el criterio de evidencia de abajo sigue siendo
parcial: la fila «Kernel Rust/WASM» de
`docs/competitive/autocad-2027-gap-matrix.md` dice por qué.

## Criterio de evidencia

“Soportado” exige UI → motor → persistencia/interoperabilidad → prueba. Código
aislado, fixture moqueado, documento de ejecución o endpoint sin recorrido se
marca parcial; una intención o dependencia futura se marca ausente. La matriz
en `docs/competitive/autocad-2027-gap-matrix.md` aplica este criterio.

## Límites de datos

Los contratos versionados son la única frontera entre productos. La migración
enterprise→Design es una herramienta operativa, no permiso para reintroducir
tablas o módulos enterprise. Los identificadores `legacy/` se conservan por
compatibilidad de datos/archivo, no amplían el alcance.
