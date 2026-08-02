# Instrucciones para agentes — Valle Design

## Alcance exclusivo

Este repositorio contiene **solo Valle Design**: el editor CAD, su API, los
contratos `design-*` y el SDK generado. No añadir ERP, MES, Office, pricing,
usuarios, facturación ni código de Platform. La relación con Platform es por
JWT, HTTP y los YAML de `packages/contracts/specs/`; nunca por imports de otro
producto. Véase `REPOSITORY_SCOPE.md` antes de ampliar una superficie.

## Comandos canónicos (desde la raíz)

- Instalación reproducible: `npm ci` (Node de `.nvmrc`, npm 10).
- Gates: `npm run build`, `npm run typecheck`, `npm test`, `npm run lint`.
- Contratos: `npx -y @redocly/cli@1.34.3 lint packages/contracts/specs/design-api.v1.yaml` y `npm test --workspace=@valle/design-sdk`.
- Cadena de suministro: `npm run sbom && npm run check:licenses`.
- PostgreSQL: `npm run test:pg --workspace=valle-design-api` con
  `TEST_DATABASE_URL`; migraciones desde `apps/api` con `npm run migration:run`.
- Web E2E: `npm run e2e --workspace=web` (Chromium instalado).

No usar `lint` de API para una comprobación porque aplica `--fix`; usar
`npm run lint:check --workspace=valle-design-api`.

## Frontera `legacy/`

`packages/contracts/src/legacy/` no es código descartable. Sus centinelas,
XDATA y mapa RBAC son valores persistidos o emitidos fuera del repositorio.
No renombrarlos, moverlos ni “limpiar” sus goldens. Toda retirada debe cumplir
`docs/guides/legacy-migration.md`, incluir lector bidireccional y migración
verificada, y hacerse en un cambio dedicado. Las referencias históricas a
`apps/api/src/migrations/legacy/` en `docs/product-split/` describen el repo de
origen: esa cadena no existe ni se ejecuta aquí.

## Archivos delicados

- `packages/contracts/specs/*.yaml` y `packages/design-sdk/src/generated/*`:
  el YAML manda; regenerar el SDK y ejecutar compatibilidad.
- `package-lock.json`, migraciones y entidades: no editar artefactos o esquema
  sin gate de build, pruebas y migración desde base vacía.
- `apps/web/src/lib/cad/dxf-xdata-golden.spec.ts` y `apps/web/e2e/golden/`:
  evidencia contractual; no actualizar para ocultar una regresión.
- `apps/web/src/components/line-engineering/Layout3DEditor.tsx`: editor
  monolítico de alto riesgo; preferir kernel/adaptadores existentes.
- `.gitleaks.toml`, `.github/workflows/ci.yml`, `LICENSE` y avisos de terceros:
  son gates de seguridad/legal, no cosmética.

## Tenancy (obligatorio)

El tenant procede del JWT o de la fila del review link, nunca de body/query.
Usar `TenantScopedRepository` estricto para entidades con `tenant_id`; en
QueryBuilder aplicar explícitamente el scope y en transacciones usar
`withManager()`. Toda escritura debe estampar tenant y todo blob/deduplicación
queda dentro del tenant. No convertir ausencia de contexto en lectura global;
el único carril sin tenant es el carril de sistema deliberado y probado.
Cambios de persistencia multi-tenant requieren unit test y `test:pg` de
aislamiento/concurrencia.

## Gate obligatorio Rust/WASM

Hoy no existe `Cargo.toml`, fuente Rust ni módulo WASM: el kernel comprobado es
TypeScript. Ningún kernel Rust/WASM puede entrar solo como scaffold o claim.
Todo cambio que introduzca o modifique Rust/WASM **debe**, antes de merge:

1. justificar el límite y fallback en un ADR, sin crear un segundo documento,
   command bus, índice espacial o semántica CAD;
2. fijar toolchain/dependencias y pasar `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`, `cargo test --all-targets --all-features`;
3. construir el WASM reproduciblemente y ejecutar pruebas de paridad contra el
   kernel TypeScript, incluyendo golden DXF y determinismo serializado;
4. ejecutar todos los gates npm, E2E Chromium y la prueba de rendimiento 100k;
5. documentar memoria, tiempo, tamaño del bundle, CSP/COOP/COEP si aplica,
   fallback sin WASM, SBOM, licencias y análisis de supply chain.

Si cualquiera no existe o falla, el gate está rojo y no se fusiona.
