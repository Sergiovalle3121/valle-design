# Valle Design agent guide

## Scope

Valle Design is a **general-purpose 2D CAD** that runs in the browser, **and a
direct-modelling 3D modeller**. It draws drawings of any kind: architectural,
mechanical, electrical, civil, MEP, furniture, land survey. Its domain — and its
competition — is AutoCAD by Autodesk: precision drafting with layers, blocks,
associative dimensions, object snaps, paper space and DXF exchange; in 3D the
comparison is SketchUp. Judge behaviour against how a professional drafting tool
actually behaves, not against a generic web app. What is not implemented is
stated plainly; it is never implied.

The 3D kernel is the **faceted** half-edge B-rep in `apps/web/src/lib/brep/`.
Exact 3D (true curved faces, analytic NURBS) is "not yet", with its reopening
condition written in ADR-0015. Direct modelling applies to `solid3d` entities
only: `wall` and `opening` stay parametric, because a wall that forgets its
thickness breaks the take-off, `FLATSHOT` and the opening cuts. Modelling volumes
does NOT make this BIM — `bim-claim-boundary.spec.ts` still holds.

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
- Product runtime imports DXF text, canonical JSON and shapefile within
  their declared limits, plus a narrow DWG **import-only** beta (AC1015
  always, AC1018 behind its own separate flag; model space 2D; profile
  `AC1015_MODELSPACE_2D_V3` — LINE/POINT/CIRCLE/ARC/LWPOLYLINE/TEXT/INSERT/
  ELLIPSE/SPLINE-scenario-1/MTEXT/DIMENSION/HATCH; ADR-0009 §6-bis/ter/
  quater/§7). Both DWG flags are off by default in public production; the
  single authorized runtime entry point is
  `apps/web/src/lib/cad/dwg-native-reader.ts`, enforced by
  `scripts/dwg/check-product-boundary.mjs`. Keep warnings and loss
  manifests visible. DWG remains unsupported for export, paper space,
  xrefs, versions beyond AC1015/AC1018, and any general/GA availability
  claim. The broader clean-room research under `packages/dwg-codec/`
  follows ADR-0007 and its scoped `AGENTS.md`; its presence never implies
  more product availability than the specific beta flags above authorize.

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

## Design system — the rule that was missing

`apps/web/src/app/globals.css` had 825 lines of a well-reasoned design system
and **zero consumers**: `bg-card` 0 uses, `bg-primary` 0, `text-muted-foreground`
0, `border-border` 0, `.type-display` 0, `var(--shadow-*)` 0. In their place:
659 arbitrary font sizes across thirteen values (7 px text shipped to users),
327 classes of an accent the CSS itself banned in writing, seven radii for the
same control and 329 hand-written buttons behind five incompatible constants.

This section exists so that does not happen again. A system nobody consumes is
not a system: it is documentation.

**The golden rule**

> No hex outside `globals.css`. No size outside the scale.

**Non-negotiables**

- Import primitives from `@/components/ui` — never hand-roll a button, input,
  select, modal, badge, tooltip, tab, skeleton or progress bar.
- Colour comes from tokens. State colours have **two** tokens and they are not
  interchangeable: `bg-success` fills, `text-success-ink` writes. The fill
  colour used as text measures 3.02:1 (green), 2.13:1 (amber) and 3.78:1 (red)
  on a white card — all below the 4.5:1 AA needs. Same for the brand:
  `bg-brand-strong` fills, `text-primary-ink` writes, and bare `--primary`
  (4.41:1) is **not** a button fill.
- Type comes from the scale: `type-display · title · heading · lead · body ·
  small · caption · micro · mono · eyebrow`. **11 px is a hard floor.**
- Elevation is `shadow-resting` / `-elevated` / `-floating`, named by intent.
  Reaching for `shadow-2xl` means leaving the system.
- Radius is `rounded-control` / `-card` / `-surface`. Three, by surface class.
- Respect `prefers-reduced-motion`. Both layers already exist and new animation
  inherits them; do not add a third mechanism.
- Spanish es-MX in new copy. No emoji in the UI.
- ACI drawing colours (`#ff0000`, `#00ffff`, …) and the categorical cell palette
  are **plan data, not brand**. Never tokenize them.

**Gates**

- `apps/web/src/components/ui/design-system.spec.ts` — seven rules, run by
  `npm run test`. The one that matters is not a prohibition: it asserts the
  tokens are **in use**. A gate that only forbids would bless the original
  state, which had zero loose hex and zero consumed tokens.
- `node scripts/brand/build-brand-assets.mjs --check` — the logo lives in one
  geometry (`components/brand/logo-geometry.ts`) that feeds `<Logo/>`, the seven
  SVGs, the favicon, the iOS icon and the social cards. It cannot drift.

**If a token is missing**, add it to `globals.css` with the reasoning beside it
and consume it from there. Never a loose value in a component. Full reference:
`docs/design/DESIGN_SYSTEM.md` and `docs/design/BRAND.md`.

## Native/WASM entry gate

Do not introduce Rust, WASM or a native kernel until profiling identifies a
specific TypeScript bottleneck, a prototype shows a material measured gain,
deterministic differential tests pass, memory is bounded and a worker-compatible
TypeScript fallback remains. Such a change also requires an ADR, pinned
toolchain, reproducible build, parity/goldens, browser benchmarks with hardware
metadata, SBOM and license review.

## Las reglas de la campaña de cimientos (2026-08-22)

Cuatro reglas que quedaron cableadas en gates; violarlas no es una opinión,
es un rojo.

1. **Ningún módulo cuenta por existir.** Una capacidad puntúa en la rúbrica
   sólo si su flujo está conectado y probado; un subsistema sin importador
   fuera de sí mismo no está implementado (regla vieja) y una fila con toda
   la evidencia FABRICADA POR EL PROYECTO no puede llegar a su tope (regla
   nueva: retiene 1 punto hasta tener oráculo externo, material de terceros o
   usuario real).
2. **Ningún comando responde éxito sin efecto verificado.**
   `check:command-integrity` ejecuta los ~192 comandos del registro real y
   prohíbe el «hecho» vacío y el silencio ante entrada sustantiva. Un comando
   nuevo o termina con efecto, o declara su límite («no está disponible en
   esta versión»), o se exenta con razón escrita en
   `scripts/cad/command-integrity-exemptions.json`.
3. **Ninguna capacidad se anuncia sin evidencia del límite.** Toda afirmación
   pública lleva su frontera al lado (README «Límites declarados»,
   CAPABILITIES con columna de límites, manifiesto de pérdidas que viaja con
   el archivo). Lo que falta se marca «todavía no», nunca «nunca» y nunca en
   silencio.
4. **Ninguna cifra vive en dos lugares.** El estado del producto lo computa
   `node scripts/cad/rubric.mjs` (dos denominadores: HOY y DESTINO) y la
   matriz se REGENERA de él; los informes ENLAZAN, no copian. Una cifra
   escrita a mano en un doc es un defecto aunque hoy coincida.

Y tres costumbres operativas que las campañas paralelas pagaron caro:

- Antes de tocar un archivo caliente, mira si otra sesión lo tiene sin
  commitear (`git status` del checkout principal); las zonas de roce se
  anotan en la bitácora de campaña ANTES de editar.
- Los gates se corren sobre el árbol QUIETO (committeado); un gate corrido a
  media edición produce rojos falsos que cuestan más que esperar.
- `VALLE_DWG_CORPUS_MIRROR` apunta al clon local de
  `valle-design-dwg-conformance` o los gates DWG mienten por entorno.

## La regla que la campaña de cierre de ramas del 2026-08-24 dejó escrita

74 ramas remotas vivas, 4 PR abiertos sin dueño claro: no fue un accidente,
fue el efecto de sesiones paralelas que abrían una rama y la dejaban ahí. La
regla, para toda sesión futura (ver `CONTRIBUTING.md` "Política de ramas" y
`scripts/branch-audit.mjs`, que la vigila cada semana):

**Al terminar una campaña, cierre su propia rama en la MISMA sesión —
fusionada o borrada. Dejar la rama abierta es dejar el trabajo a medias**,
aunque el código en sí esté terminado y probado. Una rama sin dueño activo
que nadie cierra es exactamente el tipo de ruido que le costó un día entero
de campaña dedicada a limpiar. Si el cambio es pequeño y autocontenido,
sáltese la rama: los seis gates locales verdes bastan para empujar directo a
`main` (ver `ownerMergeProtocol` en
`docs/governance/repository-protection-baseline.json`).

Misma lógica para la bitácora de una campaña larga (el diario de ejecución
día a día en `docs/execution/<NOMBRE>.md`): es estado vivo mientras la
campaña corre, pero en cuanto su informe de cierre se publica deja de
describir "lo que está pasando" y pasa a describir "lo que pasó". **Archívela
a `docs/history/execution/` en el mismo commit que publica el informe de
cierre** — no en una campaña de limpieza aparte después (ver
`docs/history/README.md`). El `INFORME_*` de cierre NO se archiva: se queda
en `docs/execution/` a propósito, porque es evidencia medida, no un plan
vencido. Un `docs/` que acumula diarios de campañas ya cerradas junto a los
documentos que sí describen el estado actual es el mismo desorden que las
ramas sin cerrar, sólo que en documentación en vez de en git.
