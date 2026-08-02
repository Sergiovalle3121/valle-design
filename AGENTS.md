# Valle Design agent guide

## Scope

Work only in this repository. Valle Design is a standalone CAD product; do not
add runtime imports or mandatory authentication dependencies on Valle
Enterprise, Axos OS, or Valle Platform.

## Architecture and commands

- `apps/web`: Next.js/React product and CAD editor.
- `apps/api`: NestJS/TypeORM API; the canonical CAD surface is `/v1/cad/*`.
- `packages/contracts`: canonical OpenAPI and shared contracts.
- `packages/design-sdk`: generated typed client.
- Install with `npm ci`; validate with `npm run typecheck`, `npm run lint`,
  `npm test`, and `npm run build`.
- PostgreSQL checks are run from `apps/api` with `npm run test:pg` and
  `npm run smoke:migration`.

## Invariants

- New documents use generated UUIDs and `/studio/[documentId]`; never seed new
  data with the historical universal sentinels.
- Historical `AXOS-CAD-STUDIO`, `UNIVERSAL`, `AXOS_DIM`, `AXOS_MLEADER`,
  `AXOS_BLOCK`, and `engineering:*` mappings belong behind documented legacy
  compatibility boundaries. Never rewrite persisted DXF XDATA silently.
- Tenant-owned access is fail-closed and scoped in repositories, not from
  client-provided tenant IDs.
- Do not expose controls backed by deliberate 404 responses.
- `Layout3DEditor.tsx` is delicate: extract characterized subsystems rather
  than rewriting or creating a second CAD engine.
- Do not add native/WASM code until profiling identifies a pure geometry hot
  path (>=30%), a prototype is >=2x faster, deterministic differential tests
  pass, and a worker-compatible TypeScript fallback exists.
