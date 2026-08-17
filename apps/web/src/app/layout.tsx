import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getLocale, getMessages } from "next-intl/server";
import { I18nProvider } from "@/components/I18nProvider";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { DesignAuthProvider } from "@/contexts/DesignAuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { BRAND } from "@/config/brand";
import { SITE_URL } from "@/config/site-routes";

/**
 * Metadata: TODA la identidad sale del manifiesto de marca (config/brand).
 *
 * `metadataBase` es lo que convierte los canonical y las URLs de Open Graph de
 * cada página en absolutas. Sin él, Next emite rutas relativas y avisa en cada
 * build; con un dominio escrito a mano, el día que cambie el despliegue todas
 * las páginas apuntarían al sitio equivocado. Sale de la misma configuración
 * que alimenta el sitemap, así que las tres cosas no pueden discrepar.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: BRAND.productNames.design,
    template: `%s · ${BRAND.productNames.design}`,
  },
  description: BRAND.tagline.es,
  applicationName: BRAND.productNames.design,
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
};

/**
 * Anti-flash (patrón del origen): fija la clase `.dark` en <html> ANTES del
 * primer paint, leyendo la preferencia guardada (`valle_theme`) o la del
 * sistema. El ThemeProvider sólo re-sincroniza después.
 */
const themeInitScript = `(function(){try{var s=localStorage.getItem('valle_theme')||localStorage.getItem('axos_theme');var d=s==='dark'||((!s||s==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Idioma resuelto por next-intl desde la cookie (SSR-safe, patrón del origen).
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <DesignAuthProvider>
              <ToastProvider>{children}</ToastProvider>
            </DesignAuthProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
