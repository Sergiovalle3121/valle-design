import { cookies, headers } from "next/headers";
import { LEGACY_LOCALE_COOKIE, LOCALE_COOKIE } from "@/i18n/config";
import { getRegionProfile } from "./profiles";
import { resolveRegionCode } from "./resolve";
import type { RegionProfile } from "./types";

/**
 * Región resuelta en un Server Component, a partir de la cookie de idioma que
 * ya existe (`valle_locale`, con `axos_locale` como respaldo — identificadores
 * congelados, ver IDENTITY.md) y, si no hay preferencia guardada, de la
 * cabecera `Accept-Language` de la petición. La lógica de qué gana está en
 * `resolveRegionCode` (pura, probada aparte); esto sólo la conecta a Next.
 */
export async function getServerRegion(): Promise<RegionProfile> {
  const store = await cookies();
  const savedLocale =
    store.get(LOCALE_COOKIE)?.value ?? store.get(LEGACY_LOCALE_COOKIE)?.value ?? null;
  const acceptLanguage = (await headers()).get("accept-language");
  const code = resolveRegionCode({ savedLocale, acceptLanguage });
  return getRegionProfile(code);
}
