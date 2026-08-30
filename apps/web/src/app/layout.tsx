import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./fonts.css";
import { getLocale, getMessages } from "next-intl/server";
import { I18nProvider } from "@/components/I18nProvider";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { DesignAuthProvider } from "@/contexts/DesignAuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { BRAND } from "@/config/brand";
import { PRELOAD_FONTS } from "@/config/fonts-generated";
import { SITE_URL } from "@/config/site-routes";

/**
 * TIPOGRAFÍA DE LA MARCA — autohospedada y bajo control directo.
 *
 * `globals.css` compone todo con `var(--font-inter)`, `var(--font-jetbrains)`
 * y `var(--font-space-grotesk)`. Esas variables las define `./fonts.css`, que
 * GENERA `scripts/design/subset-fonts.py`: subconjuntos woff2 con el
 * inventario real de codepoints del producto (es-MX, GD&T ⌒ ⌖ ⏤ ⏥, griego de
 * ingeniería, flechas, matemáticos), ejes variables intactos, servidos desde
 * `public/fonts/` con hash de contenido en el nombre y cache inmutable
 * (next.config.ts). Los originales completos siguen en `src/fonts/` como
 * fuente canónica de regeneración; el gate `check:fonts` exige ambos, prohíbe
 * que vuelva una cara completa y pone techo de peso a lo servido.
 *
 * POR QUÉ NO `next/font` (lección medida, campaña de sitio 2026-08-29): las
 * cinco caras precargadas pesaban 1 486 KB y el móvil medía 73-75 con 95 % de
 * render delay en el LCP. `next/font` decide el preload POR LLAMADA, así que
 * no puede precargar la romana de Inter sin precargar también su itálica; el
 * desdoble en dos llamadas emite el archivo duplicado (sufijo `.p.`) con el
 * @font-face consumido apuntando al que no se precarga — descarga doble. Y
 * separar la itálica en otra familia haría que el font-matching sintetizara
 * oblicuas en el MText del estudio. El @font-face manual da lo que un CAD
 * exige: romana e itálica en la MISMA familia, y precarga QUIRÚRGICA de las
 * dos caras del primer viewport (Inter romana, Space Grotesk) — las demás
 * llegan a demanda con `font-display: swap` y métricas de fallback
 * sincronizadas con Arial (mismos valores que calculaba next/font), así el
 * primer pintado no espera a nadie y el swap no mueve el layout.
 *
 * La mono NO es decorativa: la línea de comandos, las coordenadas del cursor y
 * las cifras de las tablas son datos que se comparan en columna. JetBrains Mono
 * conserva `tnum` y la cifra cero ranurada en el subconjunto — y PIERDE las
 * ligaduras de código a propósito: quien teclea `->` en la línea de comandos
 * tiene que ver `->`, no una flecha.
 */

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
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        {/* Las dos caras del primer viewport, antes de que el CSS las pida.
            `crossOrigin` es obligatorio: las fuentes se piden en modo CORS y
            sin él el navegador descarta la precarga y descarga dos veces. */}
        {PRELOAD_FONTS.map((href) => (
          <link
            key={href}
            rel="preload"
            href={href}
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        ))}
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
