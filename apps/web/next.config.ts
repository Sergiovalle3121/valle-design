import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl SIN routing por segmento (patrón del origen): el idioma se
// resuelve desde la cookie en `src/i18n/request.ts`. El plugin sólo enlaza
// ese archivo de configuración.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Cabeceras de seguridad del FRONTEND (COMMERCIAL-RC1, Fase 4). Las sirve el
 * propio servidor de Next — producción, `next start` de E2E y desarrollo por
 * igual — para no depender de que un proxy delante las ponga.
 *
 * La CSP es COMPATIBLE con cómo este producto funciona de verdad, no la más
 * estricta imaginable, y cada permiso tiene su porqué:
 *  - `script-src 'unsafe-inline'`: el runtime inline de Next (sin nonces en
 *    App Router estático). `'wasm-unsafe-eval'` porque el repo compila un
 *    kernel WASM (`scripts/wasm/`) cuyo enchufe está previsto.
 *  - `style-src 'unsafe-inline'`: styled-jsx/Tailwind inyectan estilos inline.
 *  - `img-src data: blob:`: exportar PNG y las miniaturas del editor usan
 *    object-URLs; los iconos van inline.
 *  - `connect-src *`: la API vive en OTRO origen configurable por despliegue
 *    (`NEXT_PUBLIC_API_URL` se inlinea en build); fijarlo aquí a un host
 *    concreto rompería cualquier build reutilizado en staging. El dato
 *    sensible no es a dónde conecta el cliente sino qué scripts corren — y
 *    esos sí quedan restringidos a 'self'.
 *  - `worker-src blob:`: el teselado corre en workers creados desde blobs.
 *  - `frame-ancestors 'none'`: nadie embebe el editor (anti-clickjacking).
 * HSTS sólo tiene efecto sobre HTTPS; en local el navegador la ignora.
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src *",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // `camera`/`microphone`/`display-capture` en `(self)`: la barra de
    // llamada (`components/cad/calls/CallBar.tsx`) los usa de verdad —
    // getUserMedia/getDisplayMedia. Con `()` (vacío, el default de antes de
    // esta función) el navegador bloquea la petición ANTES de que llegue a
    // pedir permiso: no es un 403, es "Permissions policy violation" en la
    // consola y `getUserMedia` responde `NotFoundError` en vez de un error
    // de permiso legible — así se descubrió, con dos navegadores reales
    // intentando llamarse. `(self)` sigue prohibiéndolo a cualquier origen
    // embebido (no hay ninguno: `frame-ancestors 'none'` arriba).
    value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
  // Salida `standalone` SÓLO cuando el build la pide (apps/web/Dockerfile).
  // Es opt-in a propósito: `standalone` cambia el artefacto emitido —
  // `.next/standalone/server.js` con su propio node_modules mínimo— y el
  // `next dev`, `next start` y Playwright del repo esperan la salida normal.
  // Atarla a una variable deja el desarrollo intacto y hace la imagen
  // reproducible desde el mismo commit.
  // La raíz de trazado la infiere Next desde el lockfile: sólo hay uno, en la
  // raíz del monorepo, así que `standalone` recoge las dependencias del
  // workspace sin configuración extra.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  experimental: {
    // lucide-react se importa con decenas de iconos nombrados en el editor CAD:
    // optimizePackageImports hace tree-shaking de los imports nombrados.
    optimizePackageImports: ["lucide-react"],
  },
  /**
   * REACT COMPILER — TRAS FLAG, APAGADO POR DEFECTO.
   *
   * El compilador memoiza solo, lo que sobre un editor con 140 `useState` y
   * 128 `useCallback` a mano suena a la mejora obvia. La evaluación medida
   * está en `docs/history/execution/CAMPANA_FRONTEND_20260829.md`; el veredicto vive
   * ahí y no en un comentario, para que quien lo encienda vea los números
   * antes que la opinión.
   *
   * Se enciende con `VALLE_REACT_COMPILER=1` en el build. Nunca por defecto:
   * el ESLint del propio compilador cuenta hoy 164 avisos `react-hooks/refs`
   * y 9 `set-state-in-effect` en `apps/web`, y cada uno es un punto donde el
   * compilador se desactiva para ese componente o —peor— memoiza algo que el
   * código muta por debajo.
   *
   * Va en el NIVEL SUPERIOR y no bajo `experimental`: en Next 16 la opción
   * salió de experimental (`ExperimentalConfig` ya no la declara y el
   * typecheck lo dice a la cara). Es el tipo de detalle que una guía de
   * internet desactualizada convierte en media hora de build roto.
   */
  reactCompiler: process.env.VALLE_REACT_COMPILER === "1",
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Las fuentes llevan hash de contenido en el nombre (las emite
      // scripts/design/subset-fonts.py), así que la URL cambia cuando el
      // archivo cambia: cache inmutable de un año sin riesgo de servir una
      // cara vieja. Sin esto, /public se sirve sin max-age y cada visita
      // revalida ~350 KB que no cambian nunca.
      {
        source: "/fonts/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
