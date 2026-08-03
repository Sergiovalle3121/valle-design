# Valle Design agent guide

## Scope

This repository is the complete standalone Valle Design product: Next.js web
app, NestJS API, first-party identity, organizations and memberships, local
subscriptions and entitlements, CAD domain, OpenAPI contracts and generated
SDK. Do not add a runtime dependency on another product or identity service.

## Canonical commands

- Install reproducibly: `npm ci`.
- CAD contracts and route boundaries: `npm run check:cad`.
- Core gates: `npm run build`, `npm run typecheck`, `npm test`, `npm run lint`.
- Non-mutating API lint: `npm run lint:check --workspace=valle-design-api`.
- Generated SDK: `npm test --workspace=@valle/design-sdk`.
- Supply chain: `npm run sbom && npm run check:licenses`.
- PostgreSQL tests: set `TEST_DATABASE_URL` and
  `REQUIRE_POSTGRES_TESTS=true`, then run
  `npm run test:pg --workspace=valle-design-api`.
- Validate migrations and the compiled bootstrap against PostgreSQL 16.
- Release E2E must use the real API and PostgreSQL in Chromium and Firefox.
  Mock-backed goldens are characterization, not full-stack evidence.

## Identity and authorization invariants

- Browser authentication uses opaque first-party session cookies. Never put a
  normal session token, password, verification token, reset token or invitation
  token in `localStorage`, logs or analytics.
- Production uses the Secure `__Host-valle_session` HttpOnly cookie over HTTPS.
  Mutations require the `valle_csrf` cookie and matching `X-CSRF-Token` header.
- A session may activate an organization only after a current membership is
  verified server-side. Never trust a tenant, organization, role, permission or
  entitlement supplied by the browser.
- `organization.id` is the tenant ID for this standalone release. Every
  tenant-owned query, transaction, blob and event must fail closed when that
  value is missing or mismatched.
- Roles are `owner`, `admin`, `member` and `viewer`; permissions are derived by
  the server. CAD access also requires a local, effective `design.cad`
  entitlement. Expired trials and inactive subscription states deny access.
- Identity rate limits must be shared and atomic in PostgreSQL in production.
  Email/reset/invitation messages are transactional outbox records, never raw
  tokens in ordinary API responses.

## CAD and storage invariants

- The canonical external CAD surface is `/v1/cad/*`; all standalone public
  routes are under `/v1`.
- OpenAPI YAML is authoritative. Regenerate the SDK and verify byte equality
  plus the real Nest router after any contract change.
- One canonical `CadDocument` and one command/history path own semantics.
  Projections, scene objects and indexes are disposable.
- CAS governs document mutations. Manual save and autosave must use the same
  serialization queue; a `409` is resolved, never overwritten by inventing a
  version.
- Large documents use the archive/gzip path and the same transactional CAS.
  Blob insertion, version creation, usage and domain outbox publication must
  not leave partial state.
- New documents use generated UUIDs and `/studio/[documentId]`. Historical
  model/revision sentinels are lookup-only compatibility values.
- Import only DXF text and canonical JSON within their declared limits. Keep
  warnings and loss manifests visible. DWG is unsupported.

## Outbox invariants

- Production requires the PostgreSQL worker and signed HTTPS webhook transport.
  Delivery is at-least-once: leases, retry/backoff and dead-letter state protect
  progress, while receivers deduplicate the stable `Idempotency-Key`.
- Verify `X-Valle-Signature` over `timestamp + "." + rawBody`, enforce timestamp
  freshness and compare in constant time. Do not log bodies, recipients,
  tokens, tenant IDs, provider responses or idempotency keys.
- SQLite cannot provide the multi-worker lease semantics and must not run the
  dispatcher.

## Legacy boundary

`AXOS-CAD-STUDIO`, `UNIVERSAL`, `AXOS_DIM`, `AXOS_MLEADER`, `AXOS_BLOCK` and
`engineering:*` are persisted compatibility values. Keep them behind `legacy/`
boundaries and never silently rewrite stored identifiers or DXF XDATA. Removal
requires a bidirectional reader, verified migration, rollback and dedicated
tests.

## Delicate files

- Treat `package-lock.json`, migrations, entities, CI, `.gitleaks.toml`,
  `LICENSE`, notices, OpenAPI, generated SDK and CAD golden/corpus files as
  release gates.
- `Layout3DEditor.tsx` is a high-risk monolith. Prefer characterized extraction
  into the existing canonical lifecycle and kernel over adding another engine.
- Preserve unrelated working-tree changes. Do not rewrite generated files by
  hand when their generator is available.
- No button, import format, price, security statement or compatibility claim
  may be shown unless the backing behavior and relevant boundary are tested.

## Native/WASM entry gate

Do not introduce Rust, WASM or a native kernel until profiling identifies a
specific TypeScript bottleneck, a prototype shows a material measured gain,
deterministic differential tests pass, memory is bounded and a worker-compatible
TypeScript fallback remains. Such a change also requires an ADR, pinned
toolchain, reproducible build, parity/goldens, browser benchmarks with hardware
metadata, SBOM and license review.
