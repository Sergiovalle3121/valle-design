# Arquitectura comprobada

## Componentes

1. **Web:** Next.js/React y Three.js presentan `/studio`; módulos CAD TS
   implementan documento, comandos, render, precisión, DXF y recuperación.
2. **API:** NestJS expone salud y `/v1/cad/*`. `cad-documents` contiene dominio
   y puertos; `cad` adapta HTTP. TypeORM persiste en PostgreSQL o SQLite solo
   para desarrollo.
3. **Datos:** documentos pequeños inline; grandes como gzip content-addressed
   en `design_blobs`. Guardado CAS y versiones evitan sobrescritura silenciosa.
4. **Contratos:** YAML versionados → tipos/SDK. Eventos existen como contrato,
   pero el publicador comprobado es no-op.

## Flujo y confianza

Platform → Bearer JWT → `CadAuthGuard` → `TenantInterceptor` (ALS) → repositorio
tenant-scoped → PostgreSQL. Un review token se canjea server-side y toma tenant
de su sesión. CIDE es opcional y degrada a `available:false`. Entitlements en
producción usan `platform-api` por defecto y fallan cerrados.

## Invariantes

- Un documento canónico, un command bus y una semántica; las proyecciones son
  desechables.
- CAS gobierna mutaciones; recibos y auditoría son server-owned.
- DXF es interoperabilidad nativa limitada y con manifiesto de pérdidas; DWG
  requiere proveedor autorizado.
- QueryBuilders y transacciones no pueden eludir tenancy.
- Migraciones gobiernan producción; `synchronize=true` está prohibido allí.

## Deuda visible

El editor principal sigue monolítico, el blob store es BYTEA (MinIO no está
cableado), eventos/usage tienen adaptadores no-op y parte de los E2E goldens
intercepta red. No inferir producción completa de esos caminos.
