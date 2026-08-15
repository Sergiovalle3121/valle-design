import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl SIN routing por segmento (patrón del origen): el idioma se
// resuelve desde la cookie en `src/i18n/request.ts`. El plugin sólo enlaza
// ese archivo de configuración.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

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
};

export default withNextIntl(nextConfig);
