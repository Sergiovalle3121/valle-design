import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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
 * · AUTOHOSPEDADAS con `next/font/local` (campaña de cimientos): antes
 *   `next/font/google` descargaba de Google EN TIEMPO DE BUILD — sin salida a
 *   internet, o con Google caído, el producto no compilaba. Un producto
 *   comercial no puede depender de un tercero para compilar. Los archivos
 *   viven en `src/fonts/` (OFL 1.1, ver su LICENSE.txt) y se descargaron una
 *   sola vez; el gate `check:fonts` impide que `next/font/google` regrese.
 * · `adjustFontFallback: "Arial"`/`"Times New Roman"` sincroniza las métricas
 *   del respaldo, así que el cambio de tipo no mueve el layout.
 *
 * La mono NO es decorativa: la línea de comandos, las coordenadas del cursor y
 * las cifras de las tablas son datos que se comparan en columna. JetBrains Mono
 * trae `tnum` de serie y una cifra cero ranurada que distingue 0 de O — que en
 * un plano cotado no es un detalle.
 */
const inter = localFont({
  src: [
    { path: "../fonts/InterVariable.woff2", style: "normal", weight: "100 900" },
    { path: "../fonts/InterVariable-Italic.woff2", style: "italic", weight: "100 900" },
  ],
  display: "swap",
  variable: "--font-inter",
  adjustFontFallback: "Arial",
});

/**
 * LA DISPLAY DE LA MARCA (campaña de firma propia, 2026-08-28).
 *
 * Space Grotesk es la hermana PROPORCIONAL de una monoespaciada, así que el
 * titular y la cota comparten esqueleto: la marca pasa a tener una sola voz
 * tipográfica en dos anchos en vez de dos tipos sin parentesco. Se carga con
 * el mismo mecanismo que las otras dos —`next/font/local`, archivo versionado,
 * cero dependencia de Google en tiempo de build— y sólo la consumen los tres
 * escalones de titular de `globals.css`.
 *
 * `adjustFontFallback: "Arial"` sincroniza las métricas del respaldo: mientras
 * la variable llega, el titular ya ocupa el sitio que va a ocupar, así que la
 * portada no da el salto de layout que delata una fuente mal cargada.
 */
const spaceGrotesk = localFont({
  src: [
    { path: "../fonts/SpaceGrotesk-wght.ttf", style: "normal", weight: "300 700" },
  ],
  display: "swap",
  variable: "--font-space-grotesk",
  adjustFontFallback: "Arial",
});

const jetbrainsMono = localFont({
  src: [
    { path: "../fonts/JetBrainsMono-wght.ttf", style: "normal", weight: "100 800" },
    { path: "../fonts/JetBrainsMono-Italic-wght.ttf", style: "italic", weight: "100 800" },
  ],
  display: "swap",
  variable: "--font-jetbrains",
  adjustFontFallback: "Arial",
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
  /**
   * ICONOS Y MANIFIESTO — declarados, no deducidos.
   *
   * Next ya inyecta `<link rel="icon">` por convención al encontrar
   * `icon.tsx` y `apple-icon.tsx`, pero el SVG de `public/brand/` no lo
   * descubre solo, y es el que sirve un icono nítido a cualquier resolución.
   * Se enumeran los tres para que el navegador elija, en vez de conformarse.
   */
  icons: {
    icon: [
      { url: "/icon", sizes: "32x32", type: "image/png" },
      { url: "/brand/isotipo-oscuro.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
  manifest: "/manifest.webmanifest",
};

/**
 * `themeColor` pinta la barra del navegador en móvil. Va POR TEMA: con un solo
 * valor, la barra queda índigo sobre una app en blanco —que es lo que había— y
 * el teléfono muestra una franja de color que no pertenece a nada. Con los dos,
 * la barra continúa el fondo de la página y la app parece ocupar la pantalla
 * entera. Los valores son los tokens `--background` claro y oscuro resueltos.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0b0b" },
  ],
  colorScheme: "dark light",
};

/**
 * Anti-flash: fija la clase `.dark` en <html> ANTES del primer paint, leyendo
 * la preferencia guardada (`valle_theme`). El ThemeProvider sólo re-sincroniza
 * después.
 *
 * EL DEFAULT ES OSCURO desde la campaña de firma propia. Antes, sin preferencia
 * guardada, la app seguía a `prefers-color-scheme`, y como la mayoría de los
 * equipos vienen en claro de fábrica, la primera impresión del producto era la
 * cara que MENOS lo representa. Un CAD se dibuja sobre fondo oscuro; ésa es la
 * convención del oficio y ahora también la puerta de entrada.
 *
 * Sigue habiendo tres opciones y «seguir al sistema» sigue existiendo: lo que
 * cambia es que ahora se PIDE en el conmutador en vez de ser el silencio. Una
 * preferencia guardada —incluida `system`— manda siempre sobre este default, y
 * la clave antigua `axos_theme` se sigue leyendo para no reiniciarle el tema a
 * quien ya visitó el producto.
 */
const themeInitScript = `(function(){try{var s=localStorage.getItem('valle_theme')||localStorage.getItem('axos_theme');var d=s==='dark'||(!s)||(s==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){var r2=document.documentElement;r2.classList.add('dark');r2.style.colorScheme='dark';}})();`;

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
      className={`h-full antialiased ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
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
