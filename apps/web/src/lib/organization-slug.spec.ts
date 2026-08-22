import { strict as assert } from "node:assert";
import {
  isValidOrganizationSlug,
  ORGANIZATION_SLUG_LIMITS,
  organizationSlugFromName,
  personalOrganizationName,
} from "./organization-slug";

/**
 * El identificador de organización dejó de ser un campo que el usuario teclea
 * y pasó a derivarse del nombre. Lo que se afirma aquí es que la derivación
 * produce SIEMPRE algo que la API acepta — porque el día que no lo haga, el
 * alta se rompe en el paso más caro del embudo y sin mensaje que lo explique.
 */

// ── Casos mexicanos reales: acentos, ñ, y el nombre compuesto ──────────────
const cases: ReadonlyArray<[string, string]> = [
  ["Estudio Valle", "estudio-valle"],
  ["Diseño Zúñiga", "diseno-zuniga"],
  ["Peña & Asociados", "pena-asociados"],
  ["ARQ. José Ramírez", "arq-jose-ramirez"],
  ["Taller  de   Arquitectura", "taller-de-arquitectura"],
  ["  Márgenes  ", "margenes"],
  ["Constructora 3B S.A. de C.V.", "constructora-3b-s-a-de-c-v"],
  ["Ingeniería/Instalaciones", "ingenieria-instalaciones"],
];

for (const [input, expected] of cases) {
  assert.equal(
    organizationSlugFromName(input),
    expected,
    `«${input}» debería derivar «${expected}»`,
  );
  assert.ok(
    isValidOrganizationSlug(organizationSlugFromName(input)),
    `«${input}» derivó un identificador que la API rechazaría`,
  );
}

// ── La ñ NO puede desaparecer ──────────────────────────────────────────────
// Sin la transliteración explícita, `NFD` parte la ñ y el filtro se comería la
// tilde dejando la n; el riesgo real es el contrario: que un filtro ingenuo
// produzca «pe-a». Se afirma el resultado, no el mecanismo.
assert.equal(organizationSlugFromName("Peña"), "pena");
assert.equal(organizationSlugFromName("ÑOÑO"), "nono");

// ── El recorte no deja un guion colgando ───────────────────────────────────
const long = organizationSlugFromName(`${"a".repeat(79)} bcd`);
assert.ok(long.length <= ORGANIZATION_SLUG_LIMITS.max);
assert.doesNotMatch(long, /-$/, "el recorte no puede dejar un guion final");
assert.ok(isValidOrganizationSlug(long));

// ── Un nombre sin una sola letra ni cifra no puede pasar por válido ────────
assert.equal(organizationSlugFromName("¿¡—…!?"), "");
assert.equal(isValidOrganizationSlug(""), false);
assert.equal(isValidOrganizationSlug("a"), false, "por debajo del mínimo");
assert.equal(isValidOrganizationSlug("-estudio"), false, "guion al inicio");
assert.equal(isValidOrganizationSlug("estudio-"), false, "guion al final");
assert.equal(isValidOrganizationSlug("Estudio"), false, "mayúsculas");

// ── La organización personal se deriva del correo ──────────────────────────
assert.equal(personalOrganizationName("sergio.valle@ejemplo.mx"), "Sergio Valle");
assert.equal(personalOrganizationName("jramirez@despacho.com"), "Jramirez");
assert.equal(personalOrganizationName("ana_lopez+cad@x.mx"), "Ana Lopez Cad");
// Sin correo, o con uno que no deja nada utilizable, cae a un nombre genérico
// en vez de a una cadena vacía que la API rechazaría en el peor momento.
assert.equal(personalOrganizationName(undefined), "Mi despacho");
assert.equal(personalOrganizationName("@ejemplo.mx"), "Mi despacho");
assert.equal(personalOrganizationName("a@x.mx"), "Mi despacho");
assert.ok(
  isValidOrganizationSlug(
    organizationSlugFromName(personalOrganizationName("sergio.valle@ejemplo.mx")),
  ),
  "el nombre personal debe derivar un identificador válido",
);

console.log(
  "organization-slug: derivación con acentos y ñ, recorte sin guion colgante y organización personal verificados",
);
