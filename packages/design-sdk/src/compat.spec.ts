/**
 * TEST DE COMPATIBILIDAD DE CONTRATO (R3).
 *
 * Garantiza que el SDK generado desde `design-api.v1.yaml` y los contratos
 * tipados a mano de `@valle-design/contracts` (design-contracts.ts) describen el
 * MISMO producto:
 *
 *  1. NIVEL DE TIPOS (falla en `tsc`, antes de ejecutar nada): igualdad
 *     estructural de los tipos clave — códigos de error constantes, catálogo
 *     de permisos `cad:*`, el 409 CAS (`expected`/`current`), el puntero a
 *     blob del `CadDocumentEnvelope` y el token CAS.
 *  2. RUNTIME (node --test): el YAML fuente contiene el catálogo completo de
 *     códigos de error, permisos, el entitlement `design.cad` y los límites
 *     numéricos del documento canónico de `CAD_DOCUMENT_LIMITS`; los códigos
 *     de evento de `design-events.v1.yaml` casan con `DESIGN_EVENT_CODES`.
 *
 * Si alguien cambia el YAML o design-contracts.ts por separado, este spec es
 * el que rompe.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  CAD_DOCUMENT_LIMITS,
  CAD_PERMISSIONS,
  DESIGN_API_ERROR_CODES,
  DESIGN_CAD_ENTITLEMENT,
  DESIGN_EVENT_CODES,
  type CadDocumentVersionConflictDetails,
  type CadPermission,
  type CadDocumentVersionToken,
} from "@valle-design/contracts";
import type { components } from "./generated/design-api";
import { createDesignClient } from "./client";

type Schemas = components["schemas"];

/* ══════════════════ 1) Igualdad estructural a nivel de tipos ══════════════ */

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;

// Códigos constantes de error generados ∈ catálogo de @valle-design/contracts.
type GeneratedEntitlementCode = Schemas["EntitlementRequiredError"]["code"];
type GeneratedConflictCode = Schemas["CadDocumentVersionConflictError"]["code"];
type ContractsErrorCode = (typeof DESIGN_API_ERROR_CODES)[number];
type _entitlementCodeExact = Expect<
  Equal<GeneratedEntitlementCode, "entitlement_required">
>;
type _conflictCodeExact = Expect<
  Equal<GeneratedConflictCode, "cad_document_version_conflict">
>;
type _entitlementCodeInCatalog = Expect<
  Extends<GeneratedEntitlementCode, ContractsErrorCode>
>;
type _conflictCodeInCatalog = Expect<
  Extends<GeneratedConflictCode, ContractsErrorCode>
>;

// Permisos: el enum generado (requiredPermission del 403) == CAD_PERMISSIONS.
type GeneratedPermission = NonNullable<
  NonNullable<
    Schemas["EntitlementRequiredError"]["details"]
  >["requiredPermission"]
>;
type _permissionsMatch = Expect<Equal<GeneratedPermission, CadPermission>>;

// Entitlement del 403 == DESIGN_CAD_ENTITLEMENT ('design.cad').
type GeneratedEntitlement = NonNullable<
  NonNullable<Schemas["EntitlementRequiredError"]["details"]>["entitlement"]
>;
type _entitlementMatch = Expect<
  Extends<GeneratedEntitlement, typeof DESIGN_CAD_ENTITLEMENT>
>;

// 409 CAS: expected/current del cuerpo generado ≡ detalles de contracts.
type GeneratedConflictDetails = Pick<
  Schemas["CadDocumentVersionConflictError"],
  "expected" | "current"
>;
type _conflictShape = Expect<
  Equal<
    { expected: number; current: number },
    {
      expected: GeneratedConflictDetails["expected"];
      current: GeneratedConflictDetails["current"];
    }
  >
>;
type _conflictAssignable = Expect<
  Extends<GeneratedConflictDetails, CadDocumentVersionConflictDetails>
>;

// CadDocumentEnvelope: la rama puntero conserva la forma persistida.
type GeneratedStorage = Schemas["CadDocumentBlobPointer"]["_storage"];
type _blobKind = Expect<Equal<GeneratedStorage["kind"], "document_blob">>;
type _blobEncoding = Expect<Equal<GeneratedStorage["encoding"], "gzip">>;
type _blobVersion = Expect<Equal<GeneratedStorage["version"], 1>>;
type _envelopeIsUnion = Expect<
  Equal<
    Schemas["CadDocumentEnvelope"],
    Schemas["CadDocumentInline"] | Schemas["CadDocumentBlobPointer"]
  >
>;

// Token CAS: entero plano en ambos lados.
type _versionToken = Expect<
  Equal<Schemas["CadDocumentVersionToken"], CadDocumentVersionToken>
>;

// Standalone: invitation secrets are write-only and never appear in the
// normal create response; tenant and permissions come from session context.
type _invitationResponseHasNoToken = Expect<
  Equal<Extract<keyof Schemas["OrganizationInvitationCreated"], "token">, never>
>;
type _sessionOrganizationIsNullable = Expect<
  Extends<null, Schemas["AuthSessionResponse"]["organization"]>
>;
type _commercialOrganizationIsServerDerived = Expect<
  Equal<
    Schemas["CommercialSubscriptionResponse"]["organizationId"],
    string | null
  >
>;

/* ═══════════════════════ 2) Aserciones de runtime ═════════════════════════ */

const specsDir = join(__dirname, "..", "..", "contracts", "specs");
const apiYaml = readFileSync(join(specsDir, "design-api.v1.yaml"), "utf8");
const eventsYaml = readFileSync(
  join(specsDir, "design-events.v1.yaml"),
  "utf8",
);

void test("todo código de error contractual aparece en design-api.v1.yaml", () => {
  for (const code of DESIGN_API_ERROR_CODES) {
    assert.ok(
      apiYaml.includes(code),
      `El código '${code}' de @valle-design/contracts no aparece en el spec v1`,
    );
  }
});

void test("los permisos cad:* del spec casan con CAD_PERMISSIONS", () => {
  const required = [
    ...apiYaml.matchAll(/x-required-permission:\s*'?([\w:]+)'?/g),
  ].map((match) => match[1]);
  assert.ok(required.length > 0, "el spec no declara x-required-permission");
  for (const permission of required) {
    assert.ok(
      (CAD_PERMISSIONS as readonly string[]).includes(permission),
      `El spec exige un permiso fuera del catálogo: ${permission}`,
    );
  }
  for (const permission of CAD_PERMISSIONS) {
    assert.ok(
      apiYaml.includes(permission),
      `El permiso '${permission}' del catálogo no aparece en el spec`,
    );
  }
});

void test("todos los endpoints CAD exigen el entitlement design.cad", () => {
  const entitlements = new Set(
    [...apiYaml.matchAll(/x-required-entitlement:\s*'?([\w.]+)'?/g)].map(
      (match) => match[1],
    ),
  );
  assert.deepEqual([...entitlements], [DESIGN_CAD_ENTITLEMENT]);
});

void test("los límites del documento canónico casan con CAD_DOCUMENT_LIMITS", () => {
  const expectations: Array<[keyof typeof CAD_DOCUMENT_LIMITS, RegExp]> = [
    ["maxEntities", /entities:\s*\n\s*type: array\s*\n\s*maxItems: 100000/],
    ["maxBlocks", /blocks:\s*\n\s*type: array\s*\n\s*maxItems: 2000/],
    ["maxConstraints", /maxItems: 250000/],
    ["maxPaperSpaces", /paperSpaces:\s*\n\s*type: array\s*\n\s*maxItems: 500/],
    [
      "maxEmbeddedPublications",
      /publications:\s*\n\s*type: array\s*\n\s*maxItems: 1000\b/,
    ],
    ["maxCompressedUploadBytes", /maximum: 20971520/],
    ["maxArchiveBytes", /maximum: 33554432/],
  ];
  // El contrato CONGELADO, las 18 claves — no sólo las siete que aparecen en
  // el YAML. Con 7/18 congeladas, maxArchiveBytes bajó de 128 a 32 MiB en el
  // API y este spec siguió en verde mientras el contrato publicaba 128.
  // Desde 2026-08-30 el API importa CAD_DOCUMENT_LIMITS (una sola fuente);
  // esta tabla existe para que un cambio de límite sea SIEMPRE un cambio
  // visible y deliberado en el diff del SDK, nunca un efecto lateral.
  const limitValues: Record<keyof typeof CAD_DOCUMENT_LIMITS, number> = {
    minSchema: 1,
    maxSchema: 10,
    maxEntities: 100_000,
    maxBlocks: 2_000,
    maxConstraints: 250_000,
    maxPaperSpaces: 500,
    maxViewportsPerPaperSpace: 32,
    maxEmbeddedPublications: 1_000,
    maxCollaborationVersions: 12,
    maxReviewThreads: 500,
    maxReviewLinks: 20,
    maxCollaborationAuditEvents: 500,
    maxNestingDepth: 64,
    maxIdLength: 128,
    maxCommentBodyLength: 1_000,
    maxInlineBytes: 8_000_000,
    maxArchiveBytes: 32 * 1024 * 1024,
    maxCompressedUploadBytes: 20 * 1024 * 1024,
    blobThresholdBytes: 1_000_000,
  };
  for (const key of Object.keys(
    CAD_DOCUMENT_LIMITS,
  ) as (keyof typeof CAD_DOCUMENT_LIMITS)[]) {
    assert.equal(
      CAD_DOCUMENT_LIMITS[key],
      limitValues[key],
      `CAD_DOCUMENT_LIMITS.${String(key)} cambió respecto al contrato congelado`,
    );
  }
  for (const [key, pattern] of expectations) {
    assert.ok(
      pattern.test(apiYaml),
      `El límite ${String(key)} no aparece en el spec con el valor esperado`,
    );
  }
});

void test("los códigos de evento design.* casan con design-events.v1.yaml", () => {
  for (const code of DESIGN_EVENT_CODES) {
    assert.ok(
      eventsYaml.includes(code),
      `El evento '${code}' no aparece en design-events.v1.yaml`,
    );
  }
});

void test("review links server-owned: la sesión expone hasShareLink y jamás el token", () => {
  // Nivel de tipos: CadReviewSession NO tiene campos de token/hash; el token
  // en claro vive SOLO en la respuesta de creación (shareToken).
  type SessionKeys = keyof Schemas["CadReviewSession"];
  type _noTokenInSession = Expect<
    Equal<Extract<SessionKeys, "shareToken" | "token" | "tokenHash">, never>
  >;
  type _hasShareLink = Expect<
    Extends<Schemas["CadReviewSession"]["hasShareLink"], boolean>
  >;
  type _created = Expect<
    Extends<
      NonNullable<Schemas["CadReviewSessionCreated"]["shareToken"]>,
      string
    >
  >;
  // El canje responde readOnly: true CONSTANTE (el read-only es del backend).
  type _readOnly = Expect<
    Equal<Schemas["ReviewLinkContext"]["readOnly"], true>
  >;

  // Runtime: los códigos de error de review del catálogo viven en el spec
  // (los cubre también el test general del catálogo) y el canje viaja por
  // header, nunca por URL.
  assert.ok(apiYaml.includes("X-Review-Token"));
  assert.ok(apiYaml.includes("/v1/cad/review/context"));
  assert.ok(
    !/\/v1\/cad\/review\/\{token\}/.test(apiYaml),
    "el token no va en el path",
  );
});

void test("el SDK generado está al día respecto de los tipos clave", () => {
  const generated = readFileSync(
    join(__dirname, "..", "src", "generated", "design-api.ts"),
    "utf8",
  );
  for (const marker of [
    'kind: "document_blob"',
    'code: "cad_document_version_conflict"',
    'code: "entitlement_required"',
    '"cad:view" | "cad:edit" | "cad:review" | "cad:publish" | "cad:admin"',
    "ReviewLinkContext",
    "hasShareLink",
    '"/v1/auth/session"',
    '"/v1/organizations/{organizationId}/memberships"',
    '"/v1/commercial/entitlements"',
    '"/v1/commercial/plans"',
    "CommercialPlanList",
    "OrganizationInvitationCreated",
    '"/v1/cad/documents"',
    '"/v1/cad/documents/{documentId}/provisional"',
    "interpretCadIntent",
    "vectorizeCadImage",
  ]) {
    assert.ok(
      generated.includes(marker),
      `El generado perdió el marcador estructural: ${marker} — corre npm run generate`,
    );
  }
});

void test("el SDK usa cookies first-party y CSRF en mutaciones", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "project-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const client = createDesignClient({
    baseUrl: "https://design.example.test",
    csrfToken: () => "csrf-test-token",
    fetch: fetchImpl,
  });

  await client.projects.list();
  await client.projects.create({ name: "Proyecto" });
  await client.documents.list({
    model: "AXOS-CAD-STUDIO",
    revision: "UNIVERSAL",
    limit: 1,
  });
  await client.identity.currentSession();
  await client.organizations.create({ name: "Design Norte", slug: "norte" });
  await client.commercial.entitlements();
  await client.organizations.invitations.create(
    "00000000-0000-4000-8000-000000000001",
    { email: "member@example.test", role: "viewer" },
  );
  await client.documents.discardProvisional(
    "00000000-0000-4000-8000-000000000002",
  );

  assert.equal(new URL(String(calls[0].input)).pathname, "/v1/cad/projects");
  assert.equal(calls[0].init?.credentials, "include");
  assert.equal(new Headers(calls[0].init?.headers).get("X-CSRF-Token"), null);
  assert.equal(calls[1].init?.credentials, "include");
  assert.equal(
    new Headers(calls[1].init?.headers).get("X-CSRF-Token"),
    "csrf-test-token",
  );
  assert.equal(new Headers(calls[1].init?.headers).get("Authorization"), null);
  const documentListUrl = new URL(String(calls[2].input));
  assert.equal(documentListUrl.pathname, "/v1/cad/documents");
  assert.equal(documentListUrl.searchParams.get("model"), "AXOS-CAD-STUDIO");
  assert.equal(documentListUrl.searchParams.get("revision"), "UNIVERSAL");
  assert.equal(documentListUrl.searchParams.get("limit"), "1");
  assert.equal(new URL(String(calls[3].input)).pathname, "/v1/auth/session");
  assert.equal(new Headers(calls[3].init?.headers).get("X-CSRF-Token"), null);
  assert.equal(new URL(String(calls[4].input)).pathname, "/v1/organizations");
  assert.equal(
    new Headers(calls[4].init?.headers).get("X-CSRF-Token"),
    "csrf-test-token",
  );
  assert.equal(
    new URL(String(calls[5].input)).pathname,
    "/v1/commercial/entitlements",
  );
  assert.equal(
    new URL(String(calls[6].input)).pathname,
    "/v1/organizations/00000000-0000-4000-8000-000000000001/invitations",
  );
  assert.equal(new Headers(calls[6].init?.headers).get("Authorization"), null);
  assert.equal(
    new URL(String(calls[7].input)).pathname,
    "/v1/cad/documents/00000000-0000-4000-8000-000000000002/provisional",
  );
  assert.equal(calls[7].init?.method, "DELETE");
  assert.equal(
    new Headers(calls[7].init?.headers).get("X-CSRF-Token"),
    "csrf-test-token",
  );
});

void test("el SDK lee valle_csrf automaticamente en navegador", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: `valle_csrf=${"c".repeat(43)}` },
  });
  let captured: RequestInit | undefined;
  try {
    const client = createDesignClient({
      baseUrl: "https://design.example.test",
      fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        captured = init;
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    });
    await client.identity.logout();
    assert.equal(
      new Headers(captured?.headers).get("X-CSRF-Token"),
      "c".repeat(43),
    );
    assert.equal(captured?.credentials, "include");
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else delete (globalThis as { document?: Document }).document;
  }
});
