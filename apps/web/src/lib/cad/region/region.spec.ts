/**
 * El candado del módulo de región: cada aserción se hace sobre el RESULTADO
 * producido (el orden de una fecha, el separador de una cifra, a qué código
 * cae una cabecera `Accept-Language`), nunca sobre el nombre del locale — el
 * mismo criterio que exige `locale-es-mx.spec.ts` y por la misma razón: un
 * spec que sólo comparara literales `"es-MX"` pasaría con `es-AR`, que
 * formatea como España.
 */
import { strict as assert } from "node:assert";
import {
  DEFAULT_REGION_CODE,
  DEFAULT_REGION_PROFILE,
  REGION_PROFILES,
  getRegionProfile,
} from "./profiles";
import { formatRegionDate, formatRegionMagnitude } from "./format";
import { regionFromAcceptLanguage, resolveRegionCode } from "./resolve";

let checks = 0;
const check = (label: string, condition: boolean, detail?: string) => {
  assert.ok(condition, detail ? `${label} — ${detail}` : label);
  checks += 1;
};

// --- México es el arranque, no el techo: default explícito y declarado ----
{
  check("el código de región por defecto es México", DEFAULT_REGION_CODE === "MX");
  check(
    "el perfil por defecto ES el de México, no una coincidencia de nombre",
    DEFAULT_REGION_PROFILE === REGION_PROFILES.MX,
  );
  check(
    "un código desconocido cae al perfil de México, nunca lanza",
    getRegionProfile("zz").code === "MX",
  );
  check(
    "código ausente también cae a México",
    getRegionProfile(undefined).code === "MX",
  );
}

// --- Números: por resultado, no por el nombre del locale -------------------
{
  const mx = formatRegionMagnitude(1234.5678, REGION_PROFILES.MX);
  check("México: millares con coma y decimales con punto", mx === "1,234.5678", mx);

  // Doce mil, para que el separador de millares tenga algo que agrupar: a
  // cuatro cifras es-ES no agrupa (CLDR le pide un mínimo de dos dígitos
  // delante del separador), y el punto de millares no se vería aunque
  // estuviera bien resuelto.
  const es = formatRegionMagnitude(12345.5678, REGION_PROFILES.ES);
  check(
    "España: al revés — millares con punto y decimales con coma",
    /^12\.345,5678$/.test(es),
    es,
  );

  const us = formatRegionMagnitude(1234.5678, REGION_PROFILES.US);
  check(
    "Estados Unidos formatea el número IGUAL que México (no es la diferencia entre las dos)",
    us === mx,
    `MX="${mx}" US="${us}"`,
  );

  check("un entero no inventa decimales", formatRegionMagnitude(120) === "120");
  check("lo no finito se dice con una raya", formatRegionMagnitude(Number.NaN) === "—");
  check(
    "lo diminuto pasa a notación científica en vez de a cero",
    formatRegionMagnitude(1e-9).includes("e"),
  );
}

// --- Fechas: orden día/mes en México y España, mes/día en Estados Unidos --
{
  // 14 de septiembre de 2026, a mediodía UTC para que ninguna zona lo mueva.
  const date = new Date("2026-09-14T12:00:00Z");
  const opts: Intl.DateTimeFormatOptions = { timeZone: "UTC" };

  const mx = formatRegionDate(date, REGION_PROFILES.MX, opts);
  check("México: día antes que mes", mx.startsWith("14"), mx);
  check("México: no el orden americano", !mx.startsWith("9/"), mx);

  const es = formatRegionDate(date, REGION_PROFILES.ES, opts);
  check("España: también día antes que mes", es.startsWith("14"), es);

  const us = formatRegionDate(date, REGION_PROFILES.US, opts);
  check("Estados Unidos: mes antes que día", us.startsWith("9/"), us);
}

// --- Sistema de medida, papel y familia de norma declarados, no adivinados -
{
  check("México es métrico", REGION_PROFILES.MX.measurementSystem === "metric");
  check("México ofrece papel serie ISO A", REGION_PROFILES.MX.paperSeries === "ISO_A");
  check("El papel por defecto de México es A4", REGION_PROFILES.MX.defaultPaper === "A4");
  check(
    "La familia de acotación de México es ISO",
    REGION_PROFILES.MX.dimensionStandardFamily === "ISO",
  );

  check("Estados Unidos es imperial", REGION_PROFILES.US.measurementSystem === "imperial");
  check("Estados Unidos ofrece papel ANSI", REGION_PROFILES.US.paperSeries === "ANSI");
  check("El papel por defecto de Estados Unidos es letter", REGION_PROFILES.US.defaultPaper === "letter");
  check(
    "La familia de acotación de Estados Unidos es ASME",
    REGION_PROFILES.US.dimensionStandardFamily === "ASME",
  );
}

// --- Resolución: cookie guardada gana; sin ella, Accept-Language; si ninguna
//     resuelve, México — nunca Estados Unidos por defecto. -----------------
{
  check(
    "preferencia guardada 'es' resuelve a México, incluso con Accept-Language de EE. UU.",
    resolveRegionCode({ savedLocale: "es", acceptLanguage: "en-US" }) === "MX",
  );
  check(
    "sin preferencia guardada, Accept-Language exacto elige España",
    resolveRegionCode({ savedLocale: null, acceptLanguage: "es-ES,es;q=0.9,en;q=0.8" }) === "ES",
  );
  check(
    "sin preferencia guardada, Accept-Language exacto elige Estados Unidos",
    resolveRegionCode({ savedLocale: null, acceptLanguage: "en-US,en;q=0.9" }) === "US",
  );
  check(
    "un Accept-Language ambiguo (inglés sin país reconocido) NO cae a Estados Unidos",
    resolveRegionCode({ savedLocale: "en", acceptLanguage: "en-GB,en;q=0.9" }) === "MX",
  );
  check(
    "sin ninguna señal, el default es México",
    resolveRegionCode({ savedLocale: null, acceptLanguage: null }) === "MX",
  );
  check(
    "un país sin perfil (francés) cae a México, no lanza",
    resolveRegionCode({ savedLocale: null, acceptLanguage: "fr-FR,fr;q=0.9" }) === "MX",
  );
  check(
    "el peso q del navegador se respeta: el de mayor peso decide",
    regionFromAcceptLanguage("en-US;q=0.5,es-MX;q=0.9") === "MX",
  );
}

console.log(`✔ región configurable: ${checks} aserciones verdes`);
