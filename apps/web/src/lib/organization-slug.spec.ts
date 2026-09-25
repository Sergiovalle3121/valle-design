import { strict as assert } from "node:assert";
import {
  createOrganizationWithFreeSlug,
  isOrganizationSlugTaken,
  isValidOrganizationSlug,
  ORGANIZATION_SLUG_LIMITS,
  ORGANIZATION_SLUG_TAKEN_MESSAGE,
  organizationSlugFromName,
  organizationSlugWithSuffix,
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

// ── El identificador ya lo usa otro despacho ───────────────────────────────
// `juan@gmail.com` y `juan@hotmail.com` derivan el mismo «juan»: el segundo
// alta no puede quedarse en «El slug ya está en uso.».
function takenError(): Error {
  return Object.assign(new Error("El slug ya está en uso."), { status: 400 });
}
assert.equal(isOrganizationSlugTaken(takenError()), true);
assert.equal(
  isOrganizationSlugTaken(Object.assign(new Error("El slug ya está en uso."), { status: 409 })),
  false,
  "sólo el 400 de la API es el choque de identificador",
);
assert.equal(isOrganizationSlugTaken(new Error("sin red")), false);

const suffixed = organizationSlugWithSuffix("juan", () => 0.5);
assert.match(suffixed, /^juan-[a-z0-9]{4}$/u);
assert.ok(isValidOrganizationSlug(suffixed), "el identificador desempatado sigue siendo válido");
const suffixedLong = organizationSlugWithSuffix("a".repeat(ORGANIZATION_SLUG_LIMITS.max), () => 0.1);
assert.ok(
  suffixedLong.length <= ORGANIZATION_SLUG_LIMITS.max && isValidOrganizationSlug(suffixedLong),
  "cabe en el máximo",
);

void (async () => {
  // Derivado y ocupado: se desempata solo y el alta sigue.
  const tried: string[] = [];
  const created = await createOrganizationWithFreeSlug(
    { name: "Juan", slug: "juan" },
    async (body) => {
      tried.push(body.slug);
      if (body.slug === "juan") throw takenError();
      return body;
    },
    () => 0.25,
  );
  assert.equal(tried[0], "juan");
  assert.equal(tried.length, 2);
  assert.match(created.slug, /^juan-[a-z0-9]{4}$/u);
  assert.equal(created.name, "Juan", "el nombre visible no cambia");

  // Escrito a mano: no se toca, se explica.
  await assert.rejects(
    createOrganizationWithFreeSlug({ name: "Estudio", slug: "estudio", custom: true }, async () => {
      throw takenError();
    }),
    new RegExp(ORGANIZATION_SLUG_TAKEN_MESSAGE.slice(0, 30)),
  );

  // Cualquier otro error pasa tal cual, sin reintentos.
  let calls = 0;
  await assert.rejects(
    createOrganizationWithFreeSlug({ name: "X", slug: "xx" }, async () => {
      calls += 1;
      throw new Error("sin red");
    }),
    /sin red/u,
  );
  assert.equal(calls, 1);

  // Y no reintenta para siempre.
  let attempts = 0;
  await assert.rejects(
    createOrganizationWithFreeSlug({ name: "Y", slug: "yy" }, async () => {
      attempts += 1;
      throw takenError();
    }),
    /en uso/u,
  );
  assert.equal(attempts, 4);

  console.log(
    "organization-slug: derivación con acentos y ñ, recorte sin guion colgante, organización personal y desempate de identificadores verificados",
  );
})().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
