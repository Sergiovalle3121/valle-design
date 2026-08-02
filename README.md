# Valle Design

**Valle Design** es el producto CAD profesional de la plataforma Valle: editor
2D/3D de planos de planta con documento canónico versionado (CAS optimista),
biblioteca de bloques, hojas de publicación (paper spaces → PDF), plano DXF de
fondo, exportación DXF R12 y copiloto NL→CAD / Vision→CAD sobre el motor CIDE.

Este repositorio nació por `git filter-repo` desde el monorepo
`valle-enterprise` (Fase 3 de la separación de productos): contiene SOLO los
órganos CAD puros, con historial y autoría preservados. La bitácora del split
vive en `docs/product-split/`.

## Estructura

```
apps/
  api/         API NestJS del producto (dominio cad-documents + superficie /v1/cad)
  web/         Frontend Next.js: el estudio CAD en /studio + suite E2E (goldens
               10-28, performance 10k/100k y full-stack real en e2e/real)
packages/
  contracts/   @axos/contracts: tipos compartidos + specs OpenAPI/AsyncAPI v1
  design-sdk/  @valle/design-sdk: tipos generados del spec + cliente fetch tipado
docs/          Arquitectura CAD, bitácoras de ejecución y del product split
.github/       CI propio (quality-gates, e2e full-stack, gitleaks, sbom)
```

## Arranque rápido

Requisitos: Node >= 20 (`.nvmrc`), Docker (o PostgreSQL 16 local).

```bash
# 1) Infraestructura local: PostgreSQL 16 + MinIO (MinIO es para los blobs S3
#    futuros; hoy los blobs CAD viven en la base — tabla design_blobs).
docker compose up -d

# 2) Dependencias (workspaces npm).
npm ci   # o npm install la primera vez (genera package-lock.json)

# 3) Variables de entorno.
cp .env.example .env   # y ajusta JWT_SECRET / DATABASE_URL si hace falta

# 4) Migraciones (5 CAD + 2 propias de Design sobre BD virgen).
cd apps/api
DATABASE_URL=postgres://valle:valle@localhost:5432/valle_design_dev npm run migration:run

# 5) Seed demo (tenant + proyecto + documento CAD válido) y desarrollo.
DATABASE_URL=postgres://valle:valle@localhost:5432/valle_design_dev npm run seed
DATABASE_URL=postgres://valle:valle@localhost:5432/valle_design_dev npm run dev
```

Sin `DATABASE_URL` el API cae a SQLite (`apps/api/dev.sqlite`, cero setup) —
útil para hacking rápido; las migraciones y `test:pg` exigen PostgreSQL.

Verificación:

```bash
cd apps/api
npm run typecheck        # tsc --noEmit
npm test                 # suite de unidad (harness sqlite)
TEST_DATABASE_URL=postgres://... npm run test:pg   # suites de concurrencia (PostgreSQL real)
npm run build && DATABASE_URL=postgres://... npm run smoke:bootstrap  # grafo DI compilado
```

## Arquitectura (breve)

- **Kernel CAD puro** (`apps/api/src/modules/cad-documents`): validación y
  almacenamiento del documento canónico (inline ≤ 1 MB o gzip → blob store),
  dominio del guardado con CAS + recibos de publicación server-managed,
  biblioteca de bloques, NL→CAD y Vision→CAD. El dominio sólo conoce PUERTOS
  neutrales (`ports/`).
- **Adaptadores propios de Design** (sustituyen a los enterprise del origen):
  - `design_blobs` (BlobStore content-addressed en BD, dedup por sha256, GC en
    dos barridos) ← puerto `CAD_BLOB_STORE`.
  - `design_audit_log` (bitácora server-owned) ← puerto `CAD_AUDIT_PUBLISHER`.
  - Entitlements por configuración (`ENTITLEMENTS_MODE`) ← puerto
    `ENTITLEMENT_CLIENT`; el cliente HTTP real de Platform llega en R-seguridad.
- **Superficie HTTP** (`modules/cad`): `/v1/cad/*` según la semántica de
  `packages/contracts/specs/design-api.v1.yaml` — proyectos, documentos
  (contenido inline y archivo gzip multipart con CAS), versiones,
  publicaciones, DXF de fondo, exportación DXF, bloques, intent/vision.
- **Tenancy**: `TenantScopedRepository` inyecta `WHERE tenant_id = <ctx>` en
  toda lectura; el contexto lo puebla `CadAuthGuard` (JWT de Platform) +
  `TenantInterceptor`.

## Relación con Platform (por contratos, nunca por imports)

Design consume Platform exclusivamente por CONTRATO:

- **Identidad**: valida los JWT de sesión emitidos por Platform con secreto
  compartido vía entorno (`JWT_SECRET`/`SESSION_SECRET`); permisos `cad:*`
  (con mapeo de transición `engineering:*` → `cad:*` de `@axos/contracts`).
- **Acceso comercial**: entitlement `design.cad`
  (`specs/platform-api.v1.yaml`); hoy impuesto por configuración, en
  R-seguridad por el cliente platform-api.
- **Eventos**: `specs/design-events.v1.yaml` define los `design.*.v1` que
  Design emitirá (publicador no-op hasta esa integración).

Los YAML de `packages/contracts/specs/` son la fuente; el SDK generado vive en
`packages/design-sdk` (R3) con un test de compatibilidad de contrato que rompe
si el YAML y `@axos/contracts` divergen.

## Licencia

Software propietario de Sergio Valle Zárate — ver `LICENSE`.
