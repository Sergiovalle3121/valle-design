# Valle Design

> [!IMPORTANT]
> Este repositorio es privado y confidencial. Valle Design es software
> propietario, comercial y cerrado. No se concede una licencia open source ni
> permiso de uso por el acceso al código. Consulte
> [NOTICE](NOTICE), [LICENSE](LICENSE) y la
> [política de contribuciones](docs/governance/PROPRIETARY_CONTRIBUTIONS.md).

Valle Design es un **sistema de diseño arquitectónico 2D** que corre en el
navegador. Es el dominio de AutoCAD (Autodesk): dibujo de precisión con capas,
bloques, cotas asociativas, referencias a objeto, espacio papel e intercambio
DXF. Ése es el producto con el que se compara y contra el que se mide su
comportamiento; lo que este repositorio no implementa se dice explícitamente en
vez de insinuarse.

Es un producto standalone: el repositorio contiene el frontend, la API, la
identidad first-party, organizaciones y membresías, el control de acceso
comercial local, los contratos OpenAPI y el SDK TypeScript. No necesita otro
producto Valle para registrar usuarios, iniciar sesión o autorizar el uso de
CAD.

El producto permite crear proyectos y documentos, editar un documento CAD
canónico, guardar con control de concurrencia CAS, consultar versiones,
publicar hojas, usar review links y comentarios, importar DXF de texto o JSON
canónico y exportar el subconjunto DXF implementado. Los documentos grandes se
envían como archivos gzip y se guardan en PostgreSQL mediante blobs
content-addressed. DWG no está disponible en el producto. El repositorio
contiene un laboratorio clean-room experimental y aislado con detección binaria
acotada y errores tipados; no decodifica una base de objetos y no está conectado
a UI, API, provider ni al documento canónico.

## Repositorio

```text
apps/
  api/         API NestJS, identidad, organizaciones, comercial y dominio CAD
  web/         Aplicación Next.js, estudio CAD, specs y Playwright E2E
packages/
  contracts/   Contratos compartidos y OpenAPI/AsyncAPI versionados
  design-sdk/  Cliente TypeScript generado desde OpenAPI
  dwg-codec/   Laboratorio clean-room experimental; no disponible en producto
docs/          ADR, guías operativas, evidencia y matriz de brechas
```

Las rutas públicas están bajo `/v1`: `/v1/auth/*`, `/v1/organizations*`,
`/v1/commercial/*` y `/v1/cad/*`. El archivo
`packages/contracts/specs/design-api.v1.yaml` es la fuente autoritativa del
contrato HTTP.

## Requisitos

- Node.js 20.x, como declara `.nvmrc` (el paquete exige al menos 20.9).
- npm 10; el lockfile fue generado con la versión indicada en `package.json`.
- PostgreSQL 16 para migraciones, pruebas de concurrencia y cualquier
  despliegue. SQLite existe únicamente como comodidad local de un solo proceso.
- Chromium y Firefox instalados por Playwright para la evidencia E2E completa.

## Arranque local

El archivo `.env.example` es una referencia; el proceso debe recibir las
variables desde el shell, un gestor de secretos o el runtime de despliegue.

```bash
docker compose up -d postgres
npm ci

export DATABASE_URL=postgres://valle:valle@localhost:5432/valle_design_dev
export SYNCHRONIZE=false
npm run migration:run --workspace=valle-design-api

# Inicia los workspaces de desarrollo.
npm run dev
```

El API escucha en `http://localhost:4000` y el web en
`http://localhost:3000` de forma predeterminada. Para que el web use otro
origen, define `NEXT_PUBLIC_API_URL` antes de iniciar o construir Next.js.

Para un recorrido local sin proveedor de correo, habilita únicamente el
harness no productivo con `IDENTITY_TEST_HARNESS=true` y una
`IDENTITY_TEST_HARNESS_KEY` de al menos 32 caracteres. La ruta
`/_development/email-outbox` exige esa clave, el recipient exacto y, para
correo de organización, el tenant exacto. El harness responde 404 en
producción y no debe exponerse en un entorno público.

En desarrollo, si no se define una conexión PostgreSQL, el API crea
`apps/api/dev.sqlite`. Ese camino usa sincronización automática, no prueba las
semánticas PostgreSQL del rate limiter, los leases del outbox ni las
migraciones y no debe usarse como evidencia de release.

## Primer recorrido

1. Registra una cuenta en `/register`.
2. Verifica el correo mediante el enlace entregado por el receptor de email.
3. Inicia sesión. El API emite una cookie de sesión opaca y una cookie CSRF;
   el cliente envía ambas con `credentials: "include"`.
4. Crea una organización. El usuario se convierte en `owner`, la sesión la
   activa y se crea un trial local con el entitlement `design.cad`.
5. Crea o importa un documento desde el dashboard y ábrelo en
   `/studio/[documentId]`.

El repositorio no incluye un proveedor de correo. En producción, el worker de
outbox entrega email y eventos a receptores webhook HTTPS firmados. El harness
de correo sólo existe para pruebas explícitas y está bloqueado en producción.

## Persistencia y ciclo de vida

- El navegador trabaja sobre un único `CadDocument` canónico.
- Guardado manual y autosave comparten una cola de un solo escritor para no
  competir por la misma versión CAS.
- Un conflicto devuelve `409`; se conserva el estado sucio y se debe recargar,
  comparar o resolver antes de reintentar. Nunca se fuerza el contador.
- Por encima de 1 MB, el cliente usa `/v1/cad/documents/:id/archive` con gzip.
  El servidor valida tamaño e integridad, guarda el blob por hash y publica la
  nueva versión de forma transaccional.
- Undo/redo mantiene estados canónicos inmutables con límites de entradas y de
  memoria; no es una segunda fuente de persistencia.
- La importación de DXF/JSON se analiza en un Web Worker, admite progreso y
  cancelación y aplica límites de tamaño y profundidad. Las advertencias de
  pérdida se presentan en lugar de fingir fidelidad.

## Verificación

```bash
npm run check:cad
npm run check:dwg
npm run typecheck
npm test
npm run lint
npm run build
npm run sbom
npm run check:licenses
```

Las pruebas PostgreSQL requieren una base real:

```bash
export TEST_DATABASE_URL=postgres://valle:valle@localhost:5432/valle_design_test
export REQUIRE_POSTGRES_TESTS=true
npm run test:pg --workspace=valle-design-api
```

La CI ejecuta contrato/SDK, build, typecheck, tests, lint, migraciones y
bootstrap sobre PostgreSQL 16, además del recorrido Playwright con API y base
reales en Chromium y Firefox. Los goldens con frontera HTTP simulada siguen
siendo pruebas útiles, pero no sustituyen el recorrido full-stack.

## Límites declarados

- No existe importación/exportación DWG productiva, modelador sólido B-rep,
  API de plugins AutoLISP/.NET, GIS ni paridad general con AutoCAD. Detectar
  una firma o mantener un laboratorio desconectado no cambia ese estado.
- DXF es un subconjunto de texto con manifiesto de pérdidas, no compatibilidad
  universal.
- El benchmark de 100k usa LOD y presupuestos amplios; no autoriza afirmar
  60 FPS, tiempo real ni detalle simultáneo para 100k entidades.
- Los blobs viven en PostgreSQL (`design_blobs`). MinIO de Compose está
  reservado y no participa en el runtime actual.
- La asistencia NL→CAD/Vision→CAD es opcional y devuelve
  `available: false` cuando CIDE no está configurado.

Consulta `PRODUCT.md`, `ARCHITECTURE.md`, `SECURITY.md`, `DEPLOYMENT.md` y la
matriz `docs/competitive/autocad-2027-gap-matrix.md` antes de publicar claims.

## Licencia

Software propietario; consulta `LICENSE` y `THIRD_PARTY_NOTICES.md`.
