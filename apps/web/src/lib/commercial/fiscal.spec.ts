import { strict as assert } from "node:assert";
import {
  cfdiUsesFor,
  fiscalIssuesFromError,
  issuanceNotice,
  keepCompatibleCfdiUse,
  localFiscalIssues,
  normalizeRfcInput,
  personTypeOf,
  regimesFor,
  taxProfileSummary,
  toFormValues,
  type SatTaxCatalogs,
  type TaxProfileView,
} from "./fiscal";

/**
 * Catálogos recortados: sólo lo necesario para ejercer las reglas. Los reales
 * los sirve la API desde el catálogo del SAT, y ésa es la fuente de verdad.
 */
const catalogs: SatTaxCatalogs = {
  taxRegimes: [
    { code: "601", name: "General de Ley Personas Morales", personTypes: ["moral"] },
    {
      code: "605",
      name: "Sueldos y Salarios e Ingresos Asimilados a Salarios",
      personTypes: ["fisica"],
    },
    {
      code: "612",
      name: "Personas Físicas con Actividades Empresariales y Profesionales",
      personTypes: ["fisica"],
    },
    {
      code: "626",
      name: "Régimen Simplificado de Confianza",
      personTypes: ["fisica", "moral"],
    },
  ],
  cfdiUses: [
    { code: "G03", name: "Gastos en general", taxRegimeCodes: ["601", "612", "626"] },
    {
      code: "S01",
      name: "Sin efectos fiscales",
      taxRegimeCodes: ["601", "605", "612", "626"],
    },
  ],
};

/* ── El RFC se escribe como la gente lo escribe ────────────────────────────── */
assert.equal(normalizeRfcInput(" vecj-880326-xx4 "), "VECJ880326XX4");
assert.equal(personTypeOf("VECJ880326XX4"), "fisica");
assert.equal(personTypeOf("ABC010101AB9"), "moral");
// A medio teclear NO se adivina un tipo: filtrar el desplegable de régimen
// mientras alguien escribe le escondería justo la opción que busca.
assert.equal(personTypeOf("VECJ88"), null);

/* ── El régimen se filtra por el tipo de persona ───────────────────────────── */
assert.deepEqual(
  regimesFor(catalogs, "moral").map((regime) => regime.code),
  ["601", "626"],
);
assert.deepEqual(
  regimesFor(catalogs, "fisica").map((regime) => regime.code),
  ["605", "612", "626"],
);
// Sin RFC completo se ofrecen todos: es mejor enseñar de más que esconder.
assert.equal(regimesFor(catalogs, null).length, catalogs.taxRegimes.length);

/* ── El uso del CFDI se filtra por el régimen ──────────────────────────────── */
// Un asalariado (605) NO puede deducir «Gastos en general». Ofrecérselo sería
// prepararle una factura que el SAT rechaza, y lo descubriría al facturar.
assert.deepEqual(
  cfdiUsesFor(catalogs, "605").map((use) => use.code),
  ["S01"],
);
assert.deepEqual(
  cfdiUsesFor(catalogs, "612").map((use) => use.code),
  ["G03", "S01"],
);
// Sin régimen elegido no se ofrece ningún uso: elegirlo antes es elegir a ciegas.
assert.deepEqual(cfdiUsesFor(catalogs, ""), []);

/* ── Cambiar de régimen OLVIDA un uso que deja de ser legal ────────────────── */
assert.equal(keepCompatibleCfdiUse(catalogs, "612", "G03"), "G03");
// 605 no admite G03: conservarlo dejaría un campo aparentemente relleno que el
// servidor va a rechazar, y con el desplegable sin esa opción a la vista.
assert.equal(keepCompatibleCfdiUse(catalogs, "605", "G03"), "");

/* ── La comprobación local ataja lo obvio, no sustituye al servidor ────────── */
const completo = {
  rfc: "VECJ880326XX4",
  legalName: "Arquitectos del Valle",
  taxRegimeCode: "612",
  cfdiUseCode: "G03",
  postalCode: "06700",
};
assert.deepEqual(localFiscalIssues(completo), {});
assert.deepEqual(Object.keys(localFiscalIssues({ ...completo, rfc: "VECJ88" })), [
  "rfc",
]);
assert.deepEqual(
  Object.keys(localFiscalIssues({ ...completo, postalCode: "670" })),
  ["postalCode"],
);
// Los cinco a la vez: descubrirlos de uno en uno es la forma más rápida de que
// alguien abandone el formulario justo antes de pagar.
assert.equal(
  Object.keys(
    localFiscalIssues({
      rfc: "",
      legalName: "",
      taxRegimeCode: "",
      cfdiUseCode: "",
      postalCode: "",
    }),
  ).length,
  5,
);

/* ── Los errores del servidor se atribuyen a SU campo ──────────────────────── */
assert.deepEqual(
  fiscalIssuesFromError({
    status: 400,
    code: "tax_profile_invalid",
    body: {
      code: "tax_profile_invalid",
      issues: [
        { field: "rfc", code: "rfc_date", message: "La fecha no existe." },
        { field: "inventado", code: "x", message: "no debe colarse" },
      ],
    },
  }),
  { rfc: "La fecha no existe." },
);
// Un error sin `issues` no inventa a quién culpar: mapa vacío y mensaje general.
assert.deepEqual(fiscalIssuesFromError(new Error("boom")), {});
assert.deepEqual(fiscalIssuesFromError(null), {});

/* ── LA PROMESA: la web no dice que timbra si no timbra ────────────────────── */
const manual = issuanceNotice({
  provider: "null",
  mode: "manual",
  available: false,
});
assert.match(manual, /Todavía no timbramos automáticamente/u);
assert.match(manual, /la emite nuestro equipo/u);
// Y no promete lo contrario por descuido.
assert.equal(/automáticamente con estos datos/u.test(manual), false);

const automatico = issuanceNotice({
  provider: "facturama",
  mode: "automatic",
  available: true,
});
assert.match(automatico, /se emite automáticamente/u);

/* ── Resumen y valores iniciales ───────────────────────────────────────────── */
const profile: TaxProfileView = {
  rfc: "VECJ880326XX4",
  personType: "fisica",
  legalName: "ARQUITECTOS DEL VALLE",
  taxRegimeCode: "612",
  cfdiUseCode: "G03",
  postalCode: "06700",
  updatedAt: "2026-08-17T10:00:00.000Z",
};
assert.match(taxProfileSummary(profile), /VECJ880326XX4/u);
assert.match(taxProfileSummary(profile), /Régimen 612/u);
assert.deepEqual(toFormValues(null), {
  rfc: "",
  legalName: "",
  taxRegimeCode: "",
  cfdiUseCode: "",
  postalCode: "",
});
assert.equal(toFormValues(profile).cfdiUseCode, "G03");

console.log(
  "fiscal: régimen filtrado por tipo de persona, uso de CFDI filtrado por régimen, errores por campo y ninguna promesa de timbrado que el producto no cumpla",
);
