import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { getLocale, getMessages } from "next-intl/server";
import { I18nProvider } from "@/components/I18nProvider";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { DesignAuthProvider } from "@/contexts/DesignAuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { BRAND } from "@/config/brand";
import { SITE_URL } from "@/config/site-routes";

/**
 * TIPOGRAFÍA DE LA MARCA — `next/font` la sirve desde nuestro propio origen.
 *
 * `globals.css` lleva desde el primer día declarando `var(--font-inter)` y
 * `var(--font-jetbrains)` al frente de `--font-sans` y `--font-mono`… y nadie
 * las definía nunca. El resultado medido: la app se componía con Segoe UI en
 * Windows, San Francisco en Mac y Roboto en Android — tres productos distintos
 * con el mismo código, y ninguna posibilidad de afinar interletraje porque el
 * interletraje depende del tipo.
 *
 * · `variable` en vez de `className`: la fuente entra como variable CSS y la
 *   consume el sistema de tokens, no cada componente. Un cambio de tipo es un
 *   cambio en estas dos líneas.
 * · `display: "swap"`: el texto se lee desde el primer paint con el stack de
 *   respaldo y cambia al tipo real al llegar. Nunca hay pantalla en blanco.
 * · `subsets: ["latin"]`: es-MX necesita acentos, ñ y los signos de apertura;
 *   `latin` los trae y pesa una fracción de la fuente completa.
 * · `adjustFontFallback` (por defecto activo) sincroniza las métricas del
 *   respaldo con las de Inter, así que el cambio de tipo no mueve el layout.
 *
 * La mono NO es decorativa: la línea de comandos, las coordenadas del cursor y
 * las cifras de las tablas son datos que se comparan en columna. JetBrains Mono
 * trae `tnum` de serie y una cifra cero ranurada que distingue 0 de O — que en
 * un plano cotado no es un detalle.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});

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
    <html
      lang={locale}
      className={`h-full antialiased ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
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
