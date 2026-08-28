/**
 * Cliente fetch FINO y tipado de la API v1 de Valle Design.
 *
 * - Los tipos provienen ÍNTEGROS de `src/generated/design-api.ts`, generado
 *   desde `packages/contracts/specs/design-api.v1.yaml` (npm run generate).
 * - Transporte real (corrección R3 del contrato): la API responde los cuerpos
 *   DIRECTOS descritos por el spec — sin sobre `ApiSuccessEnvelope`. Un error
 *   HTTP se convierte en `DesignApiError` con el cuerpo contractual
 *   (`code`/`details`/`requestId`; en el 409 CAS, `expected`/`current` al
 *   nivel superior).
 * - Las rutas externas reales usan `/v1/auth/*`, `/v1/organizations*`,
 *   `/v1/commercial/*` y `/v1/cad/*`; el cliente no remapea prefijos ni
 *   mantiene aliases implícitos.
 */

import type { components } from "./generated/design-api";

type Schemas = components["schemas"];

export type RegisterRequest = Schemas["RegisterRequest"];
export type LoginRequest = Schemas["LoginRequest"];
/**
 * La superficie de identidad vive en `identity.ts` desde que el segundo factor
 * la hizo crecer por encima del techo del gate del monolito. Sus tipos se
 * reexportan desde aquí para no romper a quien ya los importaba de `client`.
 */
import { createIdentitySurface } from "./identity";

export {
  createIdentitySurface,
  loginRequiresMfa,
  type IdentityTransport,
  type LoginOutcome,
  type LoginResponse,
  type MfaChallengeResponse,
} from "./identity";
export type AuthSessionResponse = Schemas["AuthSessionResponse"];
export type IdentitySession = Schemas["IdentitySession"];
export type IdentitySessionList = Schemas["IdentitySessionList"];
export type OrganizationCreate = Schemas["OrganizationCreate"];
export type OrganizationCreated = Schemas["OrganizationCreated"];
export type OrganizationList = Schemas["OrganizationList"];
export type OrganizationContext = Schemas["OrganizationContext"];
export type OrganizationMembership = Schemas["OrganizationMembership"];
export type OrganizationMembershipList = Schemas["OrganizationMembershipList"];
export type OrganizationInvitationCreate =
  Schemas["OrganizationInvitationCreate"];
export type OrganizationInvitationCreated =
  Schemas["OrganizationInvitationCreated"];
export type OrganizationInvitationAccepted =
  Schemas["OrganizationInvitationAccepted"];
export type CommercialSubscriptionResponse =
  Schemas["CommercialSubscriptionResponse"];
export type EffectiveEntitlementList = Schemas["EffectiveEntitlementList"];
export type SupportIncidentRequest = Schemas["SupportIncidentRequest"];
export type CommercialPlan = Schemas["CommercialPlan"];
export type CommercialPlanPrice = Schemas["CommercialPlanPrice"];
export type CommercialPlanList = Schemas["CommercialPlanList"];
export type CommercialCheckoutSessionCreate =
  Schemas["CommercialCheckoutSessionCreate"];
export type CommercialCheckoutSession = Schemas["CommercialCheckoutSession"];
export type CommercialInvoice = Schemas["CommercialInvoice"];
export type CommercialInvoiceList = Schemas["CommercialInvoiceList"];
export type CommercialCfdiReceipt = Schemas["CommercialCfdiReceipt"];
export type CommercialCfdiReceiptList = Schemas["CommercialCfdiReceiptList"];
export type CommercialSubscriptionCancellation =
  Schemas["CommercialSubscriptionCancellation"];
export type CommercialPendingPayment = Schemas["CommercialPendingPayment"];
export type PaymentMethod = Schemas["PaymentMethod"];
export type CommercialBillingPortalSession =
  Schemas["CommercialBillingPortalSession"];
export type SatTaxCatalogs = Schemas["SatTaxCatalogs"];
export type SatTaxRegime = Schemas["SatTaxRegime"];
export type SatCfdiUse = Schemas["SatCfdiUse"];
export type TaxPersonType = Schemas["TaxPersonType"];
export type TaxProfileSave = Schemas["TaxProfileSave"];
export type TaxProfileView = Schemas["TaxProfileView"];
export type TaxProfileResponse = Schemas["TaxProfileResponse"];
export type TaxProfileIssue = Schemas["TaxProfileIssue"];
export type CfdiIssuance = Schemas["CfdiIssuance"];
export type LegalDocumentId = Schemas["LegalDocumentId"];
export type LegalDocumentVersion = Schemas["LegalDocumentVersion"];
export type LegalDocumentList = Schemas["LegalDocumentList"];
export type LegalAcceptanceRecord = Schemas["LegalAcceptanceRecord"];
export type LegalAcceptanceList = Schemas["LegalAcceptanceList"];
export type LegalAcceptanceCreate = Schemas["LegalAcceptanceCreate"];
export type LegalAcceptanceConfirmed = Schemas["LegalAcceptanceConfirmed"];
export type CadSheetSet = Schemas["CadSheetSet"];
export type CadSheetSetSummary = Schemas["CadSheetSetSummary"];
export type CadSheetSetCreate = Schemas["CadSheetSetCreate"];
export type CadSheetSetSave = Schemas["CadSheetSetSave"];
export type CadSheetSetSheet = Schemas["CadSheetSetSheet"];
export type CadSheetNumbering = Schemas["CadSheetNumbering"];
export type CadProject = Schemas["CadProject"];
export type CadProjectCreate = Schemas["CadProjectCreate"];
export type CadProjectUpdate = Schemas["CadProjectUpdate"];
export type CadDocumentSummary = Schemas["CadDocumentSummary"];
export type CadDocumentCreate = Schemas["CadDocumentCreate"];
export type CadDocumentMetaUpdate = Schemas["CadDocumentMetaUpdate"];
export type CadDocumentResource = Schemas["CadDocumentResource"];
export type CadDocumentEnvelope = Schemas["CadDocumentEnvelope"];
export type CadDocumentInline = Schemas["CadDocumentInline"];
export type CadDocumentBlobPointer = Schemas["CadDocumentBlobPointer"];
export type CadDocumentSaveResult = Schemas["CadDocumentSaveResult"];
export type CadDocumentVersionSummary = Schemas["CadDocumentVersionSummary"];
export type CadDocumentVersionDetail = Schemas["CadDocumentVersionDetail"];
export type CadPublicationReceipt = Schemas["CadPublicationReceipt"];
export type CadPublicationCreate = Schemas["CadPublicationCreate"];
export type DxfBackground = Schemas["DxfBackground"];
export type DxfBackgroundUpload = Schemas["DxfBackgroundUpload"];
export type DxfPlacement = Schemas["DxfPlacement"];
export type DxfExport = Schemas["DxfExport"];
export type CadBlock = Schemas["CadBlock"];
export type CadBlockCreate = Schemas["CadBlockCreate"];
export type CadBlockUpdate = Schemas["CadBlockUpdate"];
export type CadReviewSession = Schemas["CadReviewSession"];
export type CadComment = Schemas["CadComment"];
export type CadCommentCreate = Schemas["CadCommentCreate"];
export type ReviewLinkContext = Schemas["ReviewLinkContext"];
export type ApiError = Schemas["ApiError"];
export type EntitlementRequiredError = Schemas["EntitlementRequiredError"];
export type CadDocumentVersionConflictError =
  Schemas["CadDocumentVersionConflictError"];
export type RateLimitedError = Schemas["RateLimitedError"];
export type CadIntentRequest = Schemas["CadIntentRequest"];
export type CadIntentResponse = Schemas["CadIntentResponse"];
export type CadVisionRequest = Schemas["CadVisionRequest"];
export type CadVisionResponse = Schemas["CadVisionResponse"];

export interface Page<T> {
  items: T[];
  total?: number;
}

export interface PageQuery {
  q?: string;
  limit?: number;
  offset?: number;
}

interface ResourceQuery extends PageQuery {
  status?: string;
  projectId?: string;
  model?: string;
  revision?: string;
}

/** Error HTTP de la API con el cuerpo contractual adjunto. */
export class DesignApiError extends Error {
  readonly status: number;
  readonly body: ApiError | null;
  /** Código contractual (`cad_*` / `entitlement_required`) si viajó. */
  readonly code: string | null;

  constructor(status: number, body: ApiError | null) {
    const message =
      (body &&
        (Array.isArray(body.message)
          ? body.message.join("; ")
          : body.message)) ||
      `Design API respondió ${status}`;
    super(message);
    this.name = "DesignApiError";
    this.status = status;
    this.body = body;
    this.code = typeof body?.code === "string" ? body.code : null;
  }

  /** ¿Es el 409 CAS? Si sí, `expected`/`current` describen el conflicto. */
  isVersionConflict(): this is DesignApiError & {
    body: CadDocumentVersionConflictError;
  } {
    return this.code === "cad_document_version_conflict";
  }

  /**
   * ¿Es un 429 de `ApiRateLimitService`? Si sí, `retryAfterSeconds` dice
   * cuánto esperar. El techo es generoso a propósito (VD-RL-001): un
   * cliente correcto reintenta pasado ese plazo en vez de fallar.
   */
  isRateLimited(): this is DesignApiError & { body: RateLimitedError } {
    return this.code === "rate_limited";
  }
}

export interface DesignClientOptions {
  /** Origen de la API, p.ej. `https://design.api.example.com` (sin ruta). */
  baseUrl: string;
  /** CSRF token de doble envío para mutaciones first-party. */
  csrfToken?: string | (() => string | null | undefined);
  /** Política de cookies. Default: `include`. */
  credentials?: RequestCredentials;
  /** fetch alternativo (tests, polyfills). Default: globalThis.fetch. */
  fetch?: typeof fetch;
}

async function parseError(res: Response): Promise<DesignApiError> {
  let body: ApiError | null = null;
  try {
    body = (await res.json()) as ApiError;
  } catch {
    body = null;
  }
  return new DesignApiError(res.status, body);
}

export function createDesignClient(options: DesignClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch;

  /** Construye una URL desde la ruta canónica literal del contrato. */
  const resource = (apiPath: string, query?: ResourceQuery): string => {
    const declaredPrefix =
      // Las dos rutas raíz del contrato. Se listan aparte porque la
      // comprobación de familia usa la barra final, y `/v1/feedback` a secas
      // —el listado del operador— no la lleva.
      apiPath === "/v1/organizations" ||
      apiPath === "/v1/feedback" ||
      [
        "/v1/auth/",
        "/v1/organizations/",
        "/v1/commercial/",
        "/v1/legal/",
        "/v1/cad/",
        "/v1/support/",
        "/v1/feedback/",
      ].some((prefix) => apiPath.startsWith(prefix));
    if (!declaredPrefix) {
      throw new TypeError(`Ruta Design v1 no declarada: ${apiPath}`);
    }
    const url = new URL(`${baseUrl}${apiPath}`);
    if (query) {
      if (query.q !== undefined) url.searchParams.set("q", query.q);
      if (query.limit !== undefined)
        url.searchParams.set("limit", String(query.limit));
      if (query.offset !== undefined)
        url.searchParams.set("offset", String(query.offset));
      if (query.status !== undefined)
        url.searchParams.set("status", query.status);
      if (query.projectId !== undefined)
        url.searchParams.set("projectId", query.projectId);
      if (query.model !== undefined) url.searchParams.set("model", query.model);
      if (query.revision !== undefined)
        url.searchParams.set("revision", query.revision);
    }
    return url.toString();
  };

  async function call<T>(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const requestHeaders = new Headers(headers);
    if (body !== undefined && !isForm) {
      requestHeaders.set("Content-Type", "application/json");
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      !requestHeaders.has("X-Review-Token")
    ) {
      const configuredCsrf =
        typeof options.csrfToken === "function"
          ? options.csrfToken()
          : options.csrfToken;
      const csrf = configuredCsrf ?? browserCsrfToken();
      if (csrf) requestHeaders.set("X-CSRF-Token", csrf);
    }
    const res = await fetchImpl(url, {
      method,
      headers: requestHeaders,
      credentials: options.credentials ?? "include",
      body:
        body === undefined
          ? undefined
          : isForm
            ? (body as FormData)
            : JSON.stringify(body),
    });
    if (!res.ok) throw await parseError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    identity: createIdentitySurface({ call, resource }),

    /**
     * EL CENTRO DE COMENTARIOS.
     *
     * Separado de `support`, que manda un correo y se olvida. Esto GUARDA: el
     * comentario tiene estado y su autor lo ve. `all` y `setStatus` son del
     * operador del producto y devuelven 403 a cualquier otro.
     */
    feedback: {
      create: (input: Schemas["FeedbackRequest"]) =>
        call<Schemas["FeedbackEntry"]>("POST", resource("/v1/feedback"), input),
      mine: () =>
        call<Schemas["FeedbackList"]>("GET", resource("/v1/feedback/mine")),
      all: (filtro: { status?: string; kind?: string } = {}) => {
        const query = new URLSearchParams();
        if (filtro.status) query.set("status", filtro.status);
        if (filtro.kind) query.set("kind", filtro.kind);
        const sufijo = query.toString();
        return call<Schemas["FeedbackAdminList"]>(
          "GET",
          `${resource("/v1/feedback")}${sufijo ? `?${sufijo}` : ""}`,
        );
      },
      setStatus: (feedbackId: string, status: string) =>
        call<Schemas["FeedbackEntry"]>(
          "PATCH",
          resource(`/v1/feedback/${feedbackId}`),
          { status },
        ),
    },

    organizations: {
      list: () => call<OrganizationList>("GET", resource("/v1/organizations")),
      create: (input: OrganizationCreate) =>
        call<OrganizationCreated>("POST", resource("/v1/organizations"), input),
      activate: (organizationId: string) =>
        call<OrganizationContext>(
          "POST",
          resource("/v1/organizations/active"),
          { organizationId },
        ),
      memberships: (organizationId: string) =>
        call<OrganizationMembershipList>(
          "GET",
          resource(`/v1/organizations/${organizationId}/memberships`),
        ),
      invitations: {
        create: (organizationId: string, input: OrganizationInvitationCreate) =>
          call<OrganizationInvitationCreated>(
            "POST",
            resource(`/v1/organizations/${organizationId}/invitations`),
            input,
          ),
        accept: (token: string) =>
          call<OrganizationInvitationAccepted>(
            "POST",
            resource("/v1/organizations/invitations/accept"),
            { token },
          ),
      },
    },

    commercial: {
      subscription: () =>
        call<CommercialSubscriptionResponse>(
          "GET",
          resource("/v1/commercial/subscription"),
        ),
      entitlements: () =>
        call<EffectiveEntitlementList>(
          "GET",
          resource("/v1/commercial/entitlements"),
        ),
      /**
       * Catálogo publicado: planes activos con sus precios activos. `checkout`
       * dice cómo se cobra hoy (`external` = fuera del producto, vía
       * upgrade-intents); una pasarela real ampliará ese enum.
       */
      plans: () =>
        call<CommercialPlanList>("GET", resource("/v1/commercial/plans")),
      /**
       * Abre una compra autoservicio (owner/admin). Con `checkout: hosted`,
       * `url` es la página de pago del proveedor. Con el proveedor nulo
       * responde 409 `checkout_unavailable` y el intent queda registrado: ese
       * despliegue cobra por fuera.
       */
      createCheckoutSession: (input: CommercialCheckoutSessionCreate) =>
        call<CommercialCheckoutSession>(
          "POST",
          resource("/v1/commercial/checkout-sessions"),
          input,
        ),
      /** Historial de facturas de la organización activa (owner/admin). */
      invoices: () =>
        call<CommercialInvoiceList>("GET", resource("/v1/commercial/invoices")),
      /** Rastro fiscal: qué CFDI cubre cada cobro (owner/admin). */
      cfdiReceipts: () =>
        call<CommercialCfdiReceiptList>("GET", resource("/v1/commercial/cfdi")),
      /**
       * URL de descarga del XML/PDF de un CFDI timbrado. La descarga es una
       * navegación con cookie de sesión (adjunto binario), no un fetch JSON.
       */
      cfdiFileUrl: (receiptId: string, format: "pdf" | "xml") =>
        resource(
          `/v1/commercial/cfdi/${encodeURIComponent(receiptId)}/files/${format}`,
        ),
      /**
       * Baja a fin de período (owner). No corta el acceso: lo comprado sigue
       * vigente hasta `currentPeriodEnd`.
       */
      cancelSubscription: () =>
        call<CommercialSubscriptionCancellation>(
          "POST",
          resource("/v1/commercial/subscription/cancel"),
        ),
      /**
       * Portal del proveedor para que el cliente arregle su medio de pago sin
       * pasar por soporte (owner/admin). La URL caduca: se usa y se olvida.
       */
      billingPortalSession: () =>
        call<CommercialBillingPortalSession>(
          "POST",
          resource("/v1/commercial/billing-portal-sessions"),
        ),
      /**
       * Catalogos del SAT (regimen fiscal y uso de CFDI). Publico y cacheable:
       * el formulario fiscal aparece en el alta, antes de que exista
       * organizacion activa.
       */
      taxCatalogs: () =>
        call<SatTaxCatalogs>(
          "GET",
          resource("/v1/commercial/public/tax-catalogs"),
        ),
      /** Datos fiscales CFDI 4.0 de la organizacion activa (owner/admin). */
      taxProfile: () =>
        call<TaxProfileResponse>("GET", resource("/v1/commercial/tax-profile")),
      /**
       * Captura o sustituye los datos fiscales. Los cinco campos van juntos
       * porque juntos se validan; un 400 `tax_profile_invalid` trae TODOS los
       * campos mal en `issues`.
       */
      saveTaxProfile: (input: TaxProfileSave) =>
        call<TaxProfileResponse>(
          "PUT",
          resource("/v1/commercial/tax-profile"),
          input,
        ),
    },

    /**
     * Documentos legales versionados y registro de aceptacion. `documents` es
     * PUBLICO (sin sesion); `acceptances` exige sesion y organizacion activa,
     * igual que el resto de `/v1/commercial/*`.
     */
    legal: {
      documents: () =>
        call<LegalDocumentList>("GET", resource("/v1/legal/documents")),
      acceptances: {
        list: () =>
          call<LegalAcceptanceList>("GET", resource("/v1/legal/acceptances")),
        accept: (input: LegalAcceptanceCreate) =>
          call<LegalAcceptanceConfirmed>(
            "POST",
            resource("/v1/legal/acceptances"),
            input,
          ),
      },
    },

    support: {
      /**
       * El botón «algo salió mal» del estudio. Devuelve 202: el reporte queda
       * encolado en el outbox, no entregado — prometer entrega aquí sería
       * afirmar algo que el proveedor de correo decide después.
       */
      report: (input: SupportIncidentRequest) =>
        call<Schemas["AcceptedResponse"]>(
          "POST",
          resource("/v1/support/incidents"),
          input,
        ),
    },

    projects: {
      list: (query?: PageQuery & { status?: string }) =>
        call<Page<CadProject>>("GET", resource("/v1/cad/projects", query)),
      create: (input: CadProjectCreate) =>
        call<CadProject>("POST", resource("/v1/cad/projects"), input),
      get: (projectId: string) =>
        call<CadProject>("GET", resource(`/v1/cad/projects/${projectId}`)),
      update: (projectId: string, patch: CadProjectUpdate) =>
        call<CadProject>(
          "PATCH",
          resource(`/v1/cad/projects/${projectId}`),
          patch,
        ),
      archive: (projectId: string) =>
        call<CadProject>("DELETE", resource(`/v1/cad/projects/${projectId}`)),
    },

    /**
     * Conjuntos de planos — el `.dst` de AutoCAD.
     *
     * `save` manda SIEMPRE `expectedVersion`: reordenar un conjunto reescribe
     * el número de casi todas sus hojas, así que un guardado sin CAS no pierde
     * un campo, pierde la numeración entera de quien llegó antes. Un 409 se
     * resuelve recargando, jamás reintentando con la versión nueva a ciegas.
     */
    sheetSets: {
      list: (query?: PageQuery & { projectId?: string }) =>
        call<Page<CadSheetSetSummary>>(
          "GET",
          resource("/v1/cad/sheet-sets", query),
        ),
      create: (input: CadSheetSetCreate) =>
        call<CadSheetSet>("POST", resource("/v1/cad/sheet-sets"), input),
      get: (sheetSetId: string) =>
        call<CadSheetSet>("GET", resource(`/v1/cad/sheet-sets/${sheetSetId}`)),
      save: (sheetSetId: string, input: CadSheetSetSave) =>
        call<CadSheetSet>(
          "PUT",
          resource(`/v1/cad/sheet-sets/${sheetSetId}`),
          input,
        ),
      remove: (sheetSetId: string) =>
        call<void>("DELETE", resource(`/v1/cad/sheet-sets/${sheetSetId}`)),
    },

    documents: {
      list: (
        query?: PageQuery & {
          projectId?: string;
          model?: string;
          revision?: string;
        },
      ) =>
        call<Page<CadDocumentSummary>>(
          "GET",
          resource("/v1/cad/documents", query),
        ),
      create: (input: CadDocumentCreate) =>
        call<CadDocumentSummary>("POST", resource("/v1/cad/documents"), input),
      /**
       * Apertura HIDRATADA (R3): `cadDocument` llega SIEMPRE completo
       * (inline) aunque se persista como puntero a blob; incluye además la
       * colocación del DXF de fondo (`dxf`) o null.
       */
      open: (documentId: string) =>
        call<CadDocumentResource>(
          "GET",
          resource(`/v1/cad/documents/${documentId}`),
        ),
      updateMeta: (documentId: string, patch: CadDocumentMetaUpdate) =>
        call<CadDocumentSummary>(
          "PATCH",
          resource(`/v1/cad/documents/${documentId}`),
          patch,
        ),
      archive: (documentId: string) =>
        call<void>("DELETE", resource(`/v1/cad/documents/${documentId}`)),
      /**
       * Rollback de importación: sólo el actor creador puede descartar su
       * fila todavía vacía (versión 0). No requiere ni reemplaza cad:admin.
       */
      discardProvisional: (documentId: string) =>
        call<void>(
          "DELETE",
          resource(`/v1/cad/documents/${documentId}/provisional`),
        ),
      /** Guardado inline con CAS optimista (409 tipado vía DesignApiError). */
      saveContent: (
        documentId: string,
        cadDocument: CadDocumentInline,
        expectedCadDocumentVersion: number,
      ) =>
        call<CadDocumentSaveResult>(
          "PUT",
          resource(`/v1/cad/documents/${documentId}/content`),
          { cadDocument, expectedCadDocumentVersion },
        ),
      /** Guardado de documento grande: gzip multipart (campo `file` + `payload`). */
      saveArchive: (
        documentId: string,
        gzippedDocument: Blob,
        expectedCadDocumentVersion: number,
      ) => {
        const form = new FormData();
        form.append("payload", JSON.stringify({ expectedCadDocumentVersion }));
        form.append("file", gzippedDocument, "cad-document.json.gz");
        return call<CadDocumentSaveResult>(
          "PUT",
          resource(`/v1/cad/documents/${documentId}/archive`),
          form,
        );
      },
      versions: {
        list: (documentId: string, query?: PageQuery) =>
          call<Page<CadDocumentVersionSummary>>(
            "GET",
            resource(`/v1/cad/documents/${documentId}/versions`, query),
          ),
        get: (documentId: string, version: number) =>
          call<CadDocumentVersionDetail>(
            "GET",
            resource(`/v1/cad/documents/${documentId}/versions/${version}`),
          ),
      },
      publications: {
        list: (documentId: string) =>
          call<Page<CadPublicationReceipt>>(
            "GET",
            resource(`/v1/cad/documents/${documentId}/publications`),
          ),
        /** El recibo contractual + el nuevo token CAS (declararlo al guardar). */
        record: (documentId: string, input: CadPublicationCreate) =>
          call<CadPublicationReceipt & { cadDocumentVersion: number }>(
            "POST",
            resource(`/v1/cad/documents/${documentId}/publications`),
            input,
          ),
      },
      dxf: {
        get: (documentId: string) =>
          call<DxfBackground>(
            "GET",
            resource(`/v1/cad/documents/${documentId}/dxf`),
          ),
        put: (documentId: string, input: DxfBackgroundUpload) =>
          call<DxfBackground>(
            "PUT",
            resource(`/v1/cad/documents/${documentId}/dxf`),
            input,
          ),
        remove: (documentId: string) =>
          call<void>("DELETE", resource(`/v1/cad/documents/${documentId}/dxf`)),
        export: (documentId: string) =>
          call<DxfExport>(
            "GET",
            resource(`/v1/cad/documents/${documentId}/export/dxf`),
          ),
      },
    },

    /**
     * Review sessions y comentarios del AUTOR (Fase 5). Tokens server-owned:
     * `create` con `shareLink: true` devuelve `shareToken` UNA sola vez;
     * las listas solo exponen `hasShareLink`; `close` revoca el link de
     * inmediato (`revokedAt`).
     */
    reviews: {
      list: (documentId: string, query?: { status?: "open" | "closed" }) => {
        const url = new URL(
          resource(`/v1/cad/documents/${documentId}/review-sessions`),
        );
        if (query?.status) url.searchParams.set("status", query.status);
        return call<{ items: CadReviewSession[] }>("GET", url.toString());
      },
      create: (
        documentId: string,
        input?: {
          shareLink?: boolean;
          allowComments?: boolean;
          shareLinkTtlMinutes?: number;
        },
      ) =>
        call<{ session: CadReviewSession; shareToken?: string }>(
          "POST",
          resource(`/v1/cad/documents/${documentId}/review-sessions`),
          input ?? {},
        ),
      close: (sessionId: string) =>
        call<CadReviewSession>(
          "POST",
          resource(`/v1/cad/review-sessions/${sessionId}/close`),
        ),
      comments: {
        list: (
          documentId: string,
          query?: { reviewSessionId?: string; resolved?: boolean },
        ) => {
          const url = new URL(
            resource(`/v1/cad/documents/${documentId}/comments`),
          );
          if (query?.reviewSessionId)
            url.searchParams.set("reviewSessionId", query.reviewSessionId);
          if (query?.resolved !== undefined)
            url.searchParams.set("resolved", String(query.resolved));
          return call<{ items: CadComment[] }>("GET", url.toString());
        },
        create: (documentId: string, input: CadCommentCreate) =>
          call<CadComment>(
            "POST",
            resource(`/v1/cad/documents/${documentId}/comments`),
            input,
          ),
        resolve: (commentId: string) =>
          call<CadComment>(
            "POST",
            resource(`/v1/cad/comments/${commentId}/resolve`),
          ),
      },
    },

    /**
     * Superficie del REVIEW LINK (invitado, sin cookie de sesión): autenticada por el
     * token server-owned en el header `X-Review-Token`. Contexto de SOLO
     * LECTURA limitado al documento de la sesión — cualquier otra ruta con
     * ese contexto responde `403 review_read_only` (impuesto por backend).
     */
    reviewLink: (shareToken: string) => {
      const headers = { "X-Review-Token": shareToken };
      return {
        context: () =>
          call<ReviewLinkContext>(
            "GET",
            resource("/v1/cad/review/context"),
            undefined,
            headers,
          ),
        comments: {
          list: () =>
            call<{ items: CadComment[] }>(
              "GET",
              resource("/v1/cad/review/comments"),
              undefined,
              headers,
            ),
          create: (input: {
            body: string;
            anchor?: Record<string, unknown> | null;
          }) =>
            call<CadComment>(
              "POST",
              resource("/v1/cad/review/comments"),
              input,
              headers,
            ),
          resolve: (commentId: string) =>
            call<CadComment>(
              "POST",
              resource(`/v1/cad/review/comments/${commentId}/resolve`),
              undefined,
              headers,
            ),
        },
      };
    },

    assistance: {
      interpretIntent: (documentId: string, input: CadIntentRequest) =>
        call<CadIntentResponse>(
          "POST",
          resource(`/v1/cad/documents/${documentId}/intent`),
          input,
        ),
      vectorizeImage: (input: CadVisionRequest) =>
        call<CadVisionResponse>("POST", resource("/v1/cad/vision"), input),
    },

    blocks: {
      list: (query?: PageQuery) =>
        call<Page<CadBlock>>("GET", resource("/v1/cad/blocks", query)),
      create: (input: CadBlockCreate) =>
        call<CadBlock>("POST", resource("/v1/cad/blocks"), input),
      get: (blockId: string) =>
        call<CadBlock>("GET", resource(`/v1/cad/blocks/${blockId}`)),
      update: (blockId: string, patch: CadBlockUpdate) =>
        call<CadBlock>("PATCH", resource(`/v1/cad/blocks/${blockId}`), patch),
      remove: (blockId: string) =>
        call<void>("DELETE", resource(`/v1/cad/blocks/${blockId}`)),
    },
  };
}

function browserCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const matches = document.cookie
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair.startsWith("valle_csrf="));
  if (matches.length !== 1) return null;
  try {
    const value = decodeURIComponent(matches[0].slice("valle_csrf=".length));
    return value.length >= 32 && value.length <= 256 ? value : null;
  } catch {
    return null;
  }
}

export type DesignClient = ReturnType<typeof createDesignClient>;
