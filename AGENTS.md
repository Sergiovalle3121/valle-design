# Valle Design agent guide

## Scope

This repository is the standalone Valle Design product: web CAD, API,
contracts, generated SDK, first-party identity, organizations, entitlements,
and the minimal commercial foundation required to operate the product. Do not
add runtime dependencies on Valle Platform, Valle Enterprise, AXOS OS, or
another product.

## Canonical commands

- Install: `npm ci` with the Node and npm versions declared by the repository.
- Verify: `npm run build`, `npm run typecheck`, `npm test`, and
  `npm run lint`.
- Non-mutating API lint: `npm run lint:check --workspace=valle-design-api`.
- CAD contracts: `npm run check:cad` and
  `npm test --workspace=@valle/design-sdk`.
- Supply chain: `npm run sbom && npm run check:licenses`.
- PostgreSQL and migrations must be tested with PostgreSQL 16, not only
  SQLite or TypeORM synchronization.
- Browser journeys must exercise the real API and PostgreSQL in Chromium and
  Firefox; mocked UI specs remain useful but are not release evidence.

## Product and security invariants

- The canonical external CAD surface is `/v1/cad/*`.
- Browser authentication uses opaque first-party cookies with
  `credentials: "include"` and CSRF protection for mutations. Normal bearer
  tokens must not be stored in `localStorage`.
- A session references an active organization only after verified membership.
  Roles and permissions are derived server-side. For the standalone release,
  `organization.id` is the tenant ID.
- Every tenant-owned query and blob is fail-closed and scoped in repositories.
  A missing tenant is never interpreted as global access.
- New documents use generated UUIDs and `/studio/[documentId]`; never create
  modern data with historical model/revision sentinels.
- No button, route, import option, pricing statement, security claim, or format
  claim may be shown unless the backing behavior is implemented and tested.

## Legacy boundary

`AXOS-CAD-STUDIO`, `UNIVERSAL`, `AXOS_DIM`, `AXOS_MLEADER`,
`AXOS_BLOCK`, and `engineering:*` are persisted compatibility values.
Keep them behind `legacy/` boundaries and never rewrite stored DXF XDATA
silently. Retirement requires a bidirectional reader, verified migration, and
dedicated tests.

## Delicate files

- OpenAPI YAML is authoritative; regenerate the SDK and verify the real Nest
  router whenever routes or schemas change.
- Treat `package-lock.json`, migrations, entities, CI, gitleaks configuration,
  LICENSE, notices, and CAD golden files as release gates.
- `Layout3DEditor.tsx` is a high-risk monolith. Extract characterized
  subsystems and reuse the canonical document model instead of creating a
  second CAD engine.

## Native/WASM gate

Do not introduce Rust, WASM, or a native kernel until profiling identifies a
pure geometry bottleneck, a prototype demonstrates a material measured
improvement, deterministic differential tests pass, memory is bounded, and a
worker-compatible TypeScript fallback remains available. Any such change also
requires an ADR, pinned toolchain, reproducible build, parity tests, SBOM and
license review, and published benchmarks with hardware and dataset metadata.
