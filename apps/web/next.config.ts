import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl SIN routing por segmento (patrón del origen): el idioma se
// resuelve desde la cookie en `src/i18n/request.ts`. El plugin sólo enlaza
// ese archivo de configuración.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    // lucide-react se importa con decenas de iconos nombrados en el editor CAD:
    // optimizePackageImports hace tree-shaking de los imports nombrados.
    optimizePackageImports: ["lucide-react"],
  },
};

export default withNextIntl(nextConfig);
