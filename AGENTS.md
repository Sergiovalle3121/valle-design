# Valle Design agent guide

## Scope

Valle Design is a **general-purpose 2D CAD** that runs in the browser. It draws
drawings of any kind: architectural, mechanical, electrical, civil, MEP,
furniture, land survey. Its domain — and its competition — is AutoCAD by
Autodesk: precision drafting with layers, blocks, associative dimensions, object
snaps, paper space and DXF exchange. Judge behaviour against how a professional
drafting tool actually behaves, not against a generic web app. What is not
implemented is stated plainly; it is never implied.

The Mexican content (templates, drafting standards, title blocks, Spanish
command vocabulary) is the product's opening strength, not its ceiling.

This repository is the complete standalone product: Next.js web app, NestJS
API, first-party identity, organizations and memberships, local subscriptions
and entitlements, CAD domain, OpenAPI contracts and generated SDK. Do not add a
runtime dependency on another product or identity service.

## Domain boundary — no industrial management

This repository is a general CAD. **Do not reintroduce ERP/MES/industrial
planning vocabulary or functionality.** No takt time, no line balancing, no work
orders, no material routes, no warehouse racks, no conveyors, no forklifts, no
plant flow optimisation. Drawing a factory _building_ is in scope — a nave
industrial is a building typology any architect draws. Running a factory is not.

**Every new feature must serve someone who is drawing a drawing.** If it serves
someone who is administering an industrial operation, it does not belong here.

`npm run check:cad` runs `scripts/cad/check-no-industrial-domain.mjs`, which
fails the build if that vocabulary comes back. Read `IDENTITY.md` before adding
a feature; it states what Valle Design is and, explicitly, what it is not.

## Canonical commands

- Install reproducibly: `npm ci`.
- CAD contracts, route boundaries and file-size budget: `npm run check:cad`.
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
- Product runtime imports only DXF text and canonical JSON within their
  declared limits. Keep warnings and loss manifests visible. DWG remains
  unsupported in UI, API and providers. Isolated clean-room research under
  `packages/dwg-codec/` follows ADR-0007 and its scoped `AGENTS.md`; its
  presence never implies product availability.

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
  `npm run check:cad` enforces this: a file not listed in
  `scripts/cad/monolith-budget.json` may not exceed 800 lines, a listed file may
  only shrink, and the monolith's `useState` count may only go down. When an
  extraction lands, run `node scripts/cad/check-monolith-budget.mjs --update` so
  the recorded budget keeps telling the truth.
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
