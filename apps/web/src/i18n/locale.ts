"use server";

/**
 * Server Actions para leer/escribir la preferencia de idioma en la cookie.
 *
 * Escribir la cookie desde una Server Action provoca que Next re-renderice la
 * ruta actual con el nuevo idioma (sin recarga completa ni flash), respetando
 * SSR. El switch EN/ES llama a `setUserLocale`.
 */

import { cookies } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

/** Lee el idioma de la cookie (o el default si no existe / es inválido). */
export async function getUserLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
}

/** Persiste el idioma elegido por el usuario en la cookie. */
export async function setUserLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    // 1 año. La preferencia de idioma no es sensible.
    maxAge: 60 * 60 * 24 * 365,
  });
}
