#!/usr/bin/env node
/**
 * GATE DE ARRANQUE PRODUCTIVO — variables de marca y contacto.
 *
 * `NEXT_PUBLIC_*` se INCRUSTA en el bundle DURANTE `next build`
 * (`apps/web/Dockerfile` ya hace exactamente esto para
 * `NEXT_PUBLIC_API_URL`: `RUN test -n "$NEXT_PUBLIC_API_URL" || ...`). Por eso
 * este script se ejecuta en ese mismo momento — el build — y no contra un
 * proceso ya arrancado: para cuando el servidor está de pie, el valor ya está
 * congelado en el JavaScript que se sirve al navegador, y comprobar
 * `process.env` ahí no dice nada sobre lo que el cliente recibió.
 *
 * Uso, igual que `test -n` en el Dockerfile:
 *   npm run check:production-config --workspace=web
 *
 * HALLAZGO DE CAMPAÑA (léase antes de asumir que esto ya corre en el
 * pipeline): `apps/web/Dockerfile` sólo declara `ARG NEXT_PUBLIC_API_URL`.
 * Ninguna otra `NEXT_PUBLIC_*` (marca, contacto, enlaces comerciales) se pasa
 * como `--build-arg` ni se reenvía a `ENV` antes de `npm run build`. Eso
 * significa que, HOY, TODA imagen de producción incrusta los valores por
 * defecto de `DEFAULT_BRAND_MANIFEST`
 * (`packages/contracts/src/brand.ts`: `support@example.invalid`,
 * `https://example.invalid`…) sin importar lo que el operador configure fuera
 * del build — porque nunca llega al proceso de build. Este script, corrido
 * ahora mismo con el Dockerfile actual, FALLA siempre por esa razón exacta:
 * es el gate detectando el hueco, no un falso positivo. Conectarlo
 * (`ARG`/`ENV` por cada `NEXT_PUBLIC_BRAND_*` y `NEXT_PUBLIC_*_URL`, más esta
 * llamada como paso `RUN`) es trabajo de Dockerfile y queda fuera de este
 * frente — ver el informe de campaña.
 */
// `require` explícito, no `import { resolveBrandManifest }`: el `dist/index.js`
// publicado de `@valle-design/contracts` reexporta `brand.ts` con
// `__exportStar` (patrón `export *` de TypeScript compilado a CommonJS), y ni
// el import nombrado ni el de espacio de nombres lo resuelven bajo el loader
// ESM nativo de Node — `cjs-module-lexer` no detecta el reexport dinámico, y
// el propio Node tampoco expone las claves reexportadas sobre el objeto de
// espacio de nombres. `createRequire` carga el mismo CommonJS que ya usa
// `next build` (vía su bundler) y evita el problema por completo: es lo mismo
// que hace `apps/web/scripts/run-specs.mjs` para resolver `tsx/cli`.
import { createRequire } from "node:module";
import type { BrandEnv } from "@valle-design/contracts";
const require = createRequire(import.meta.url);
const contracts = require("@valle-design/contracts") as {
  resolveBrandManifest: (env: BrandEnv) => import("@valle-design/contracts").BrandManifest;
};
const { resolveBrandManifest } = contracts;
import {
  assertProductionBrandConfig,
  formatProductionConfigIssues,
  assessProductionBrandConfig,
} from "../src/config/production-readiness";

function publicEnvFromProcess(env: NodeJS.ProcessEnv): BrandEnv {
  return {
    BRAND_NAME: env.NEXT_PUBLIC_BRAND_NAME,
    BRAND_LEGAL_ENTITY: env.NEXT_PUBLIC_BRAND_LEGAL_ENTITY,
    BRAND_FOUNDER: env.NEXT_PUBLIC_BRAND_FOUNDER,
    BRAND_DESCRIPTOR: env.NEXT_PUBLIC_BRAND_DESCRIPTOR,
    BRAND_TAGLINE_EN: env.NEXT_PUBLIC_BRAND_TAGLINE_EN,
    BRAND_TAGLINE_ES: env.NEXT_PUBLIC_BRAND_TAGLINE_ES,
    BRAND_SUPPORT_EMAIL: env.NEXT_PUBLIC_BRAND_SUPPORT_EMAIL,
    BRAND_SALES_EMAIL: env.NEXT_PUBLIC_BRAND_SALES_EMAIL,
    BRAND_PRIVACY_EMAIL: env.NEXT_PUBLIC_BRAND_PRIVACY_EMAIL,
    BRAND_WEBSITE_URL: env.NEXT_PUBLIC_BRAND_WEBSITE_URL,
    BRAND_COPYRIGHT: env.NEXT_PUBLIC_BRAND_COPYRIGHT,
    BRAND_COPYRIGHT_YEAR: env.NEXT_PUBLIC_BRAND_COPYRIGHT_YEAR,
    BRAND_TRADEMARK_STATUS: env.NEXT_PUBLIC_BRAND_TRADEMARK_STATUS,
    BRAND_TRADEMARK_SYMBOL: env.NEXT_PUBLIC_BRAND_TRADEMARK_SYMBOL,
    BRAND_LOGO_MARK: env.NEXT_PUBLIC_BRAND_LOGO_MARK,
    BRAND_LOGO_ICON: env.NEXT_PUBLIC_BRAND_LOGO_ICON,
    BRAND_PRODUCT_NAME_DESIGN: env.NEXT_PUBLIC_BRAND_PRODUCT_NAME_DESIGN,
  };
}

const nodeEnv = process.env.NODE_ENV;
const manifest = resolveBrandManifest(publicEnvFromProcess(process.env));
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

if (nodeEnv !== "production") {
  console.log(
    `check:production-config — NODE_ENV=${nodeEnv ?? "(sin definir)"}: no es un build productivo, no se exige marca real.`,
  );
  const issues = assessProductionBrandConfig({ manifest, apiUrl });
  if (issues.length > 0) {
    console.log(
      "  (informativo, no bloquea fuera de producción)\n" +
        formatProductionConfigIssues(issues),
    );
  }
  process.exit(0);
}

try {
  assertProductionBrandConfig({ manifest, apiUrl }, nodeEnv);
  console.log(
    "check:production-config — OK: marca, contacto y NEXT_PUBLIC_API_URL configurados con valores reales.",
  );
  process.exit(0);
} catch (error) {
  console.error(String((error as Error).message));
  process.exit(1);
}
