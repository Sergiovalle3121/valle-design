import { strict as assert } from "node:assert";
import type { BrandManifest } from "@valle-design/contracts";
import {
  assertProductionBrandConfig,
  assessProductionBrandConfig,
  formatProductionConfigIssues,
} from "./production-readiness";

/**
 * Manifiesto DEFAULT tal cual lo resuelve `resolveBrandManifest({})`: dominios
 * `.invalid`, sin URL de API. Es exactamente lo que un despliegue que olvidó
 * configurar NEXT_PUBLIC_BRAND_* seguiría publicando.
 */
const PLACEHOLDER_MANIFEST: BrandManifest = {
  brandName: "VALLE",
  legalEntityName: "Sergio Valle Enterprise Software",
  founderName: "Sergio Valle",
  descriptor: "Diseño arquitectónico",
  productNames: { design: "VALLE Design" },
  tagline: {
    en: "2D architectural design in the browser.",
    es: "Diseño arquitectónico 2D en el navegador.",
  },
  supportEmail: "support@example.invalid",
  salesEmail: "sales@example.invalid",
  privacyEmail: "privacy@example.invalid",
  websiteUrl: "https://example.invalid",
  copyright: "© 2026 Sergio Valle Enterprise Software",
  logoAssets: { mark: "/icon.svg", icon: "/icon.svg", iconDark: "/icon.svg" },
  trademarkStatus: "unregistered",
  trademarkSymbol: "",
};

/** Manifiesto realista, como lo dejaría un despliegue configurado a mano. */
const REAL_MANIFEST: BrandManifest = {
  ...PLACEHOLDER_MANIFEST,
  legalEntityName: "Sergio Valle Enterprise Software S.A.S. de C.V.",
  supportEmail: "soporte@valledesign.mx",
  salesEmail: "ventas@valledesign.mx",
  privacyEmail: "privacidad@valledesign.mx",
  websiteUrl: "https://valledesign.mx",
};

const REAL_API_URL = "https://api.valledesign.mx";

// ── Rojo: el manifiesto por defecto NO debe pasar en producción ────────────
{
  const issues = assessProductionBrandConfig({
    manifest: PLACEHOLDER_MANIFEST,
    apiUrl: "http://localhost:4000",
  });
  const fields = issues.map((issue) => issue.field).sort();
  assert.deepEqual(fields, [
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_BRAND_PRIVACY_EMAIL",
    "NEXT_PUBLIC_BRAND_SALES_EMAIL",
    "NEXT_PUBLIC_BRAND_SUPPORT_EMAIL",
    "NEXT_PUBLIC_BRAND_WEBSITE_URL",
  ]);
}

// ── Verde: un manifiesto configurado con dominios reales pasa limpio ───────
{
  const issues = assessProductionBrandConfig({
    manifest: REAL_MANIFEST,
    apiUrl: REAL_API_URL,
  });
  assert.deepEqual(issues, []);
}

// ── Adversarial: dominios "example.com" son placeholder aunque no sean .invalid
{
  const issues = assessProductionBrandConfig({
    manifest: { ...REAL_MANIFEST, websiteUrl: "https://example.com" },
    apiUrl: REAL_API_URL,
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.field, "NEXT_PUBLIC_BRAND_WEBSITE_URL");
}

// ── Adversarial: un SUBDOMINIO de un dominio placeholder también lo es ─────
// (hallazgo real de campaña: "https://api.example.com" — el fallback que
// tenía .github/workflows/release.yml antes de este cambio — no coincidía
// con el hostname exacto "example.com" y se colaba como si fuera un dominio
// real. api.example.com/sub.example.org/etc. deben rechazarse igual.)
{
  const issues = assessProductionBrandConfig({
    manifest: REAL_MANIFEST,
    apiUrl: "https://api.example.com",
  });
  assert.deepEqual(
    issues.map((i) => i.field),
    ["NEXT_PUBLIC_API_URL"],
  );
  assert.match(issues[0]!.reason, /marcador de posición/u);
}
{
  const issues = assessProductionBrandConfig({
    manifest: { ...REAL_MANIFEST, supportEmail: "soporte@mail.example.org" },
    apiUrl: REAL_API_URL,
  });
  assert.deepEqual(
    issues.map((i) => i.field),
    ["NEXT_PUBLIC_BRAND_SUPPORT_EMAIL"],
  );
}
// ── Control: un dominio real que SÓLO CONTIENE la palabra "example" en otra
// posición (no como sufijo de dominio reservado) no debe dispararse.
{
  const issues = assessProductionBrandConfig({
    manifest: REAL_MANIFEST,
    apiUrl: "https://api.example-consulting.mx",
  });
  assert.deepEqual(issues, []);
}

// ── Adversarial: razón social en blanco (espacios) cuenta como ausente ─────
{
  const issues = assessProductionBrandConfig({
    manifest: { ...REAL_MANIFEST, legalEntityName: "   " },
    apiUrl: REAL_API_URL,
  });
  assert.deepEqual(
    issues.map((i) => i.field),
    ["BRAND_LEGAL_ENTITY"],
  );
}

// ── Adversarial: NEXT_PUBLIC_API_URL apuntando a localhost en producción ───
{
  const issues = assessProductionBrandConfig({
    manifest: REAL_MANIFEST,
    apiUrl: "http://localhost:4000",
  });
  assert.deepEqual(
    issues.map((i) => i.field),
    ["NEXT_PUBLIC_API_URL"],
  );
  assert.match(issues[0]!.reason, /localhost/u);
}

// ── Adversarial: NEXT_PUBLIC_API_URL sobre http (no https) en producción ──
{
  const issues = assessProductionBrandConfig({
    manifest: REAL_MANIFEST,
    apiUrl: "http://api.valledesign.mx",
  });
  assert.deepEqual(
    issues.map((i) => i.field),
    ["NEXT_PUBLIC_API_URL"],
  );
  assert.match(issues[0]!.reason, /https/u);
}

// ── Adversarial: NEXT_PUBLIC_API_URL en un dominio placeholder no local ────
{
  const issues = assessProductionBrandConfig({
    manifest: REAL_MANIFEST,
    apiUrl: "https://api.example.invalid",
  });
  assert.deepEqual(
    issues.map((i) => i.field),
    ["NEXT_PUBLIC_API_URL"],
  );
  assert.match(issues[0]!.reason, /marcador de posición/u);
}

// ── Adversarial: token de plantilla ("TODO"/"PENDIENTE") cuela como placeholder
{
  const issues = assessProductionBrandConfig({
    manifest: {
      ...REAL_MANIFEST,
      legalEntityName: "[RAZON_SOCIAL_PENDIENTE]",
    },
    apiUrl: REAL_API_URL,
  });
  assert.deepEqual(
    issues.map((i) => i.field),
    ["BRAND_LEGAL_ENTITY"],
  );
}

// ── assertProductionBrandConfig: sólo revienta en NODE_ENV=production ──────
{
  assert.doesNotThrow(() =>
    assertProductionBrandConfig(
      { manifest: PLACEHOLDER_MANIFEST, apiUrl: undefined },
      "development",
    ),
  );
  assert.doesNotThrow(() =>
    assertProductionBrandConfig(
      { manifest: PLACEHOLDER_MANIFEST, apiUrl: undefined },
      "test",
    ),
  );
  assert.throws(
    () =>
      assertProductionBrandConfig(
        { manifest: PLACEHOLDER_MANIFEST, apiUrl: undefined },
        "production",
      ),
    /NEXT_PUBLIC_BRAND_WEBSITE_URL/u,
  );
  assert.doesNotThrow(() =>
    assertProductionBrandConfig(
      { manifest: REAL_MANIFEST, apiUrl: REAL_API_URL },
      "production",
    ),
  );
}

// ── El mensaje formateado nombra cada campo y su motivo, sin volcar el valor
// bruto (evita que un `.invalid` termine repetido en un log como si fuera
// dato sensible; aquí no lo es, pero el hábito es el mismo que exige SECURITY.md).
{
  const message = formatProductionConfigIssues([
    { field: "NEXT_PUBLIC_BRAND_WEBSITE_URL", reason: "dominio de marcador de posición (example.invalid)" },
  ]);
  assert.match(message, /NEXT_PUBLIC_BRAND_WEBSITE_URL/u);
  assert.match(message, /marcador de posición/u);
}

console.log(
  "production-readiness: el manifiesto de marca por defecto (.invalid, localhost) revienta en producción y uno configurado con dominios reales pasa limpio",
);
