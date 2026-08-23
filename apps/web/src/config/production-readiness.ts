/**
 * CIERRE DE PRODUCCIÓN — el manifiesto de marca por defecto nunca debe salir
 * a producción sin que alguien lo haya configurado.
 *
 * `resolveBrandManifest({})` (ver `packages/contracts/src/brand.ts`) responde
 * a un despliegue sin configurar con dominios `.invalid`: ni promete un
 * registro que no existe ni construye una URL con un dominio ajeno. Esa parte
 * ya está bien hecha. Lo que faltaba es que ALGUIEN se entere cuando esos
 * valores por defecto llegan a un arranque productivo real: hoy la web los
 * publica calladamente (`/privacy`, el sitemap, el cajetín de contacto) y el
 * primer síntoma visible sería un cliente escribiéndole a
 * `support@example.invalid` y recibiendo un rebote.
 *
 * Este módulo es PURO (sin I/O, sin `process.env` propio): recibe el
 * manifiesto ya resuelto y la URL de API ya leída, y devuelve una lista de
 * problemas. Quien lo llama decide qué hacer con ella — reventar el arranque,
 * imprimir un aviso, o (en desarrollo/test) ignorarla.
 */
import type { BrandManifest } from "@valle-design/contracts";

export interface ProductionConfigIssue {
  /** Nombre de la variable de entorno que el operador debe configurar. */
  field: string;
  /** Motivo en español, sin volcar el valor bruto salvo el host/dominio. */
  reason: string;
}

/**
 * Dominios reservados por RFC 2606/6761 (`.invalid`, `.test`, `.example`) o
 * de uso didáctico tan extendido (`example.com/.org/.net`) que ningún cliente
 * real los sirve. Si un manifiesto productivo apunta a uno de estos, es que
 * nadie lo configuró — nunca que un cliente real eligió ese dominio.
 */
const PLACEHOLDER_TLD_PATTERN = /\.(invalid|test|example|localhost)$/iu;
const PLACEHOLDER_DOMAIN_NAMES = new Set([
  "example.com",
  "example.org",
  "example.net",
  "localhost",
  "127.0.0.1",
]);

/**
 * Marcadores de plantilla que un `.env` copiado a medias puede dejar puestos
 * ("[RAZON_SOCIAL_PENDIENTE]", "TODO", "PENDIENTE"). No son un formato de
 * dominio ni de correo, así que se comprueban sobre el VALOR completo, antes
 * de intentar interpretarlo como URL o email.
 */
const TEMPLATE_TOKEN_PATTERN =
  /(^|[^a-zA-Z])(TODO|FIXME|PENDIENTE|PLACEHOLDER|XXX)([^a-zA-Z]|$)/iu;

function isTemplateToken(value: string): boolean {
  return TEMPLATE_TOKEN_PATTERN.test(value);
}

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function emailHost(value: string): string | null {
  const at = value.lastIndexOf("@");
  if (at === -1 || at === value.length - 1) return null;
  return value.slice(at + 1).trim().toLowerCase();
}

function isPlaceholderHost(host: string | null): boolean {
  if (!host) return true;
  return (
    PLACEHOLDER_TLD_PATTERN.test(host) || PLACEHOLDER_DOMAIN_NAMES.has(host)
  );
}

function pushIfEmpty(
  issues: ProductionConfigIssue[],
  field: string,
  value: string,
): boolean {
  if (value.trim().length === 0) {
    issues.push({ field, reason: "ausente" });
    return true;
  }
  return false;
}

function checkLegalEntity(
  issues: ProductionConfigIssue[],
  legalEntityName: string,
): void {
  const field = "BRAND_LEGAL_ENTITY";
  if (pushIfEmpty(issues, field, legalEntityName)) return;
  if (isTemplateToken(legalEntityName)) {
    issues.push({ field, reason: "marcador de plantilla sin completar" });
  }
}

function checkBrandEmail(
  issues: ProductionConfigIssue[],
  field: string,
  value: string,
): void {
  if (pushIfEmpty(issues, field, value)) return;
  if (isTemplateToken(value)) {
    issues.push({ field, reason: "marcador de plantilla sin completar" });
    return;
  }
  const host = emailHost(value.trim());
  if (isPlaceholderHost(host)) {
    issues.push({
      field,
      reason: `dominio de marcador de posición (${host ?? "correo sin @ válido"})`,
    });
  }
}

function checkBrandUrl(
  issues: ProductionConfigIssue[],
  field: string,
  value: string,
): void {
  if (pushIfEmpty(issues, field, value)) return;
  if (isTemplateToken(value)) {
    issues.push({ field, reason: "marcador de plantilla sin completar" });
    return;
  }
  const host = hostnameOf(value.trim());
  if (isPlaceholderHost(host)) {
    issues.push({
      field,
      reason: `dominio de marcador de posición (${host ?? "URL inválida"})`,
    });
  }
}

/**
 * `NEXT_PUBLIC_API_URL` no viene del manifiesto de marca (vive en
 * `apps/web/src/config/commercial.ts` indirectamente y, sobre todo, se
 * INCRUSTA en el bundle en `apps/web/Dockerfile` como `ARG`). Se valida aparte
 * porque sus reglas son distintas: no basta con "no ser example.invalid", en
 * producción tiene que ser HTTPS y no puede seguir apuntando a `localhost` —
 * el valor de desarrollo por defecto en `.env.example`.
 */
function checkApiUrl(
  issues: ProductionConfigIssue[],
  apiUrl: string | undefined,
): void {
  const field = "NEXT_PUBLIC_API_URL";
  const value = (apiUrl ?? "").trim();
  if (value.length === 0) {
    issues.push({ field, reason: "ausente" });
    return;
  }
  const host = hostnameOf(value);
  if (!host) {
    issues.push({ field, reason: "no es una URL válida" });
    return;
  }
  if (host === "localhost" || host === "127.0.0.1") {
    issues.push({
      field,
      reason: `apunta a localhost en producción (${host})`,
    });
    return;
  }
  if (isPlaceholderHost(host)) {
    issues.push({
      field,
      reason: `dominio de marcador de posición (${host})`,
    });
    return;
  }
  if (!value.toLowerCase().startsWith("https://")) {
    issues.push({ field, reason: "debe usar https en producción" });
  }
}

export interface ProductionBrandConfigInput {
  manifest: BrandManifest;
  apiUrl: string | undefined;
}

/**
 * Evalúa el manifiesto YA RESUELTO contra las reglas de producción. No lee
 * `process.env`: quien llama decide de dónde sale `manifest` (normalmente
 * `resolveBrandManifest` sobre las `NEXT_PUBLIC_BRAND_*` reales) y `apiUrl`
 * (`process.env.NEXT_PUBLIC_API_URL`).
 */
export function assessProductionBrandConfig(
  input: ProductionBrandConfigInput,
): ProductionConfigIssue[] {
  const issues: ProductionConfigIssue[] = [];
  checkLegalEntity(issues, input.manifest.legalEntityName);
  checkBrandUrl(issues, "NEXT_PUBLIC_BRAND_WEBSITE_URL", input.manifest.websiteUrl);
  checkBrandEmail(issues, "NEXT_PUBLIC_BRAND_SUPPORT_EMAIL", input.manifest.supportEmail);
  checkBrandEmail(issues, "NEXT_PUBLIC_BRAND_SALES_EMAIL", input.manifest.salesEmail);
  checkBrandEmail(issues, "NEXT_PUBLIC_BRAND_PRIVACY_EMAIL", input.manifest.privacyEmail);
  checkApiUrl(issues, input.apiUrl);
  return issues;
}

export function formatProductionConfigIssues(
  issues: readonly ProductionConfigIssue[],
): string {
  const lines = issues.map((issue) => `  · ${issue.field}: ${issue.reason}`);
  return (
    "Configuración de producción incompleta o con valores de plantilla. " +
    "Un despliegue público no puede publicar marca, contacto o API de ejemplo:\n" +
    lines.join("\n")
  );
}

/**
 * Compuerta de arranque. `nodeEnv` se pasa explícito (nunca lee
 * `process.env.NODE_ENV` por su cuenta) para que sea trivial de probar y para
 * que el mismo código sirva tanto desde una spec como desde el script de
 * verificación de build (`scripts/check-production-config.mts`).
 *
 * En `development` y `test` NO revienta: un manifiesto a medio configurar es
 * exactamente el estado normal de una máquina de desarrollo.
 */
export function assertProductionBrandConfig(
  input: ProductionBrandConfigInput,
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== "production") return;
  const issues = assessProductionBrandConfig(input);
  if (issues.length === 0) return;
  throw new Error(formatProductionConfigIssues(issues));
}
