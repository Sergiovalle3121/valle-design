"use client";

import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactNode } from "react";

/**
 * Envoltura cliente de next-intl. Recibe `locale` + `messages` desde el layout
 * (server) y configura el manejo tolerante de claves ausentes:
 *
 * - `onError`: ignora MISSING_MESSAGE para no ensuciar la consola mientras la
 *   migración por zonas avanza (cumple "cero console.* nuevos").
 * - `getMessageFallback`: muestra el último segmento de la clave en lugar del
 *   path completo, evitando ver `namespace.x.y` en pantalla.
 *
 * `timeZone` fijo en UTC para que el formateo de fechas no difiera entre SSR y
 * cliente (evita warnings de hidratación).
 */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: AbstractIntlMessages;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone="UTC"
      onError={() => {
        // Silencio intencional: no registramos claves ausentes en consola.
      }}
      getMessageFallback={({ key }) => {
        const segments = key.split(".");
        return segments[segments.length - 1] ?? key;
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}
