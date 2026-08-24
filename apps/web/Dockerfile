# syntax=docker/dockerfile:1.7
#
# Imagen del web de Valle Design (Next.js, salida `standalone`).
#
# Particularidad que decide todo lo demás: TODA variable `NEXT_PUBLIC_*` se
# INCORPORA AL BUNDLE durante el build (`NEXT_PUBLIC_API_URL`, marca, enlaces
# comerciales, origen del sitio). No es configuración de runtime; cambiarla en
# el proceso no reescribe el JavaScript ya emitido. Por eso cada una llega como
# ARG y por eso una imagen de web es específica del entorno al que apunta: la
# misma imagen NO sirve para staging y producción.
#
# `output: "standalone"` se activa con NEXT_OUTPUT=standalone (opt-in en
# next.config.ts). Emite un servidor con SÓLO las dependencias que el grafo
# realmente usa, así que la imagen final no lleva `node_modules` del monorepo.

ARG NODE_VERSION=20

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 · build
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/design-sdk/package.json packages/design-sdk/
COPY packages/dwg-codec/package.json packages/dwg-codec/

RUN npm ci --no-audit --no-fund --ignore-scripts

COPY packages/contracts packages/contracts
COPY packages/design-sdk packages/design-sdk
COPY packages/dwg-codec packages/dwg-codec
COPY apps/web apps/web

# El origen PÚBLICO exacto de la API. No tiene default: un valor por omisión
# produciría una imagen que apunta a localhost y falla sólo en el navegador
# del cliente, que es el peor sitio para enterarse.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Enlaces comerciales de la superficie pública (`apps/web/src/config/commercial.ts`).
# Todos opcionales: cada uno cae a una página interna real si no se configura.
ARG NEXT_PUBLIC_SALES_URL
ARG NEXT_PUBLIC_DOCUMENTATION_URL
ARG NEXT_PUBLIC_PRICING_URL
ARG NEXT_PUBLIC_SUPPORT_URL
ARG NEXT_PUBLIC_STATUS_URL
ARG NEXT_PUBLIC_CONTACT_URL
ARG NEXT_PUBLIC_PRIVACY_URL
ARG NEXT_PUBLIC_TERMS_URL
ARG NEXT_PUBLIC_LICENSES_URL
ENV NEXT_PUBLIC_SALES_URL=${NEXT_PUBLIC_SALES_URL}
ENV NEXT_PUBLIC_DOCUMENTATION_URL=${NEXT_PUBLIC_DOCUMENTATION_URL}
ENV NEXT_PUBLIC_PRICING_URL=${NEXT_PUBLIC_PRICING_URL}
ENV NEXT_PUBLIC_SUPPORT_URL=${NEXT_PUBLIC_SUPPORT_URL}
ENV NEXT_PUBLIC_STATUS_URL=${NEXT_PUBLIC_STATUS_URL}
ENV NEXT_PUBLIC_CONTACT_URL=${NEXT_PUBLIC_CONTACT_URL}
ENV NEXT_PUBLIC_PRIVACY_URL=${NEXT_PUBLIC_PRIVACY_URL}
ENV NEXT_PUBLIC_TERMS_URL=${NEXT_PUBLIC_TERMS_URL}
ENV NEXT_PUBLIC_LICENSES_URL=${NEXT_PUBLIC_LICENSES_URL}

# Origen público del propio despliegue: lo leen el sitemap, `robots.txt` y las
# URLs canónicas (`apps/web/src/config/site-routes.ts`). Sin configurar cae al
# manifiesto de marca y, en última instancia, a `https://example.invalid`.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}

# Manifiesto de marca (`packages/contracts/src/brand.ts`). El gate de más
# abajo exige un valor REAL (no un dominio `*.invalid`) para la URL del sitio
# y los tres correos — sus defaults son placeholders y el build revienta si
# quedan así. La razón social también la valida el gate, pero su default YA
# es un valor no vacío y sin marcador de plantilla, así que build-arg vacío
# no rompe el build (aunque sí conviene fijarla: el default es provisional).
# El resto (nombre, fundador, descriptor, taglines, copyright, estado
# marcario, logos, nombre de producto) es cosmético y tiene default seguro.
ARG NEXT_PUBLIC_BRAND_NAME
ARG NEXT_PUBLIC_BRAND_LEGAL_ENTITY
ARG NEXT_PUBLIC_BRAND_FOUNDER
ARG NEXT_PUBLIC_BRAND_DESCRIPTOR
ARG NEXT_PUBLIC_BRAND_TAGLINE_EN
ARG NEXT_PUBLIC_BRAND_TAGLINE_ES
ARG NEXT_PUBLIC_BRAND_SUPPORT_EMAIL
ARG NEXT_PUBLIC_BRAND_SALES_EMAIL
ARG NEXT_PUBLIC_BRAND_PRIVACY_EMAIL
ARG NEXT_PUBLIC_BRAND_WEBSITE_URL
ARG NEXT_PUBLIC_BRAND_COPYRIGHT
ARG NEXT_PUBLIC_BRAND_COPYRIGHT_YEAR
ARG NEXT_PUBLIC_BRAND_TRADEMARK_STATUS
ARG NEXT_PUBLIC_BRAND_TRADEMARK_SYMBOL
ARG NEXT_PUBLIC_BRAND_LOGO_MARK
ARG NEXT_PUBLIC_BRAND_LOGO_ICON
ARG NEXT_PUBLIC_BRAND_PRODUCT_NAME_DESIGN
ENV NEXT_PUBLIC_BRAND_NAME=${NEXT_PUBLIC_BRAND_NAME}
ENV NEXT_PUBLIC_BRAND_LEGAL_ENTITY=${NEXT_PUBLIC_BRAND_LEGAL_ENTITY}
ENV NEXT_PUBLIC_BRAND_FOUNDER=${NEXT_PUBLIC_BRAND_FOUNDER}
ENV NEXT_PUBLIC_BRAND_DESCRIPTOR=${NEXT_PUBLIC_BRAND_DESCRIPTOR}
ENV NEXT_PUBLIC_BRAND_TAGLINE_EN=${NEXT_PUBLIC_BRAND_TAGLINE_EN}
ENV NEXT_PUBLIC_BRAND_TAGLINE_ES=${NEXT_PUBLIC_BRAND_TAGLINE_ES}
ENV NEXT_PUBLIC_BRAND_SUPPORT_EMAIL=${NEXT_PUBLIC_BRAND_SUPPORT_EMAIL}
ENV NEXT_PUBLIC_BRAND_SALES_EMAIL=${NEXT_PUBLIC_BRAND_SALES_EMAIL}
ENV NEXT_PUBLIC_BRAND_PRIVACY_EMAIL=${NEXT_PUBLIC_BRAND_PRIVACY_EMAIL}
ENV NEXT_PUBLIC_BRAND_WEBSITE_URL=${NEXT_PUBLIC_BRAND_WEBSITE_URL}
ENV NEXT_PUBLIC_BRAND_COPYRIGHT=${NEXT_PUBLIC_BRAND_COPYRIGHT}
ENV NEXT_PUBLIC_BRAND_COPYRIGHT_YEAR=${NEXT_PUBLIC_BRAND_COPYRIGHT_YEAR}
ENV NEXT_PUBLIC_BRAND_TRADEMARK_STATUS=${NEXT_PUBLIC_BRAND_TRADEMARK_STATUS}
ENV NEXT_PUBLIC_BRAND_TRADEMARK_SYMBOL=${NEXT_PUBLIC_BRAND_TRADEMARK_SYMBOL}
ENV NEXT_PUBLIC_BRAND_LOGO_MARK=${NEXT_PUBLIC_BRAND_LOGO_MARK}
ENV NEXT_PUBLIC_BRAND_LOGO_ICON=${NEXT_PUBLIC_BRAND_LOGO_ICON}
ENV NEXT_PUBLIC_BRAND_PRODUCT_NAME_DESIGN=${NEXT_PUBLIC_BRAND_PRODUCT_NAME_DESIGN}

# Flags DWG beta (ADR-0009 §6-bis/ter/quater/§7), apagados por defecto a
# propósito: sin `default` en el ARG, un build que no las pasa deja la ENV
# vacía, y `isDwgNativeImportBetaEnabled`/`isDwgAc1018ImportBetaEnabled`
# (`document-import-client.ts`) comparan contra la cadena exacta "true" —
# vacío es "false". AC1018 exige ADEMÁS que la beta base esté encendida
# (`dwgAc1018BetaImportIsEnabled`, `dwg-interop-flag.ts`): pasar sólo esta
# variable no habilita nada por sí sola.
ARG NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA
ARG NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA
ENV NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA=${NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA}
ENV NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA=${NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA}

ENV NEXT_OUTPUT=standalone
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN test -n "$NEXT_PUBLIC_API_URL" \
  || (echo "NEXT_PUBLIC_API_URL es obligatorio: se incrusta en el bundle." && exit 1)

# El worker de importación (`document-import.worker.ts`) importa
# DINÁMICAMENTE `dwg-native-reader.ts`, que a su vez importa
# `@valle-design/dwg-codec` de forma estática. Next.js resuelve el grafo de
# módulos de un `import()` dinámico en tiempo de BUILD para crear su chunk,
# aunque la carga sea perezosa en runtime: sin este build, `dist/` y
# `dist-cjs/` no existen y `npm run build --workspace=web` falla con
# "Cannot find module" al empaquetar el worker — sin importar el valor de
# los flags NEXT_PUBLIC_DWG_* de arriba.
RUN npm run build --workspace=@valle-design/contracts \
  && npm run build --workspace=@valle/design-sdk \
  && npm run build --workspace=@valle-design/dwg-codec

# Gate de marca y contacto (`apps/web/scripts/check-production-config.mts`):
# con NODE_ENV=production ya fijado arriba, revienta el build si razón
# social, URL del sitio o los correos de marca siguen en su default de
# desarrollo (`*.invalid`) o llevan un marcador de plantilla sin completar.
# Corre ANTES del build de `web` para fallar rápido, sin gastar el build caro
# cuando la imagen de todos modos no se podría publicar.
RUN npm run check:production-config --workspace=web

RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build --workspace=web

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 · runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# `standalone` ya trae su propio node_modules mínimo y el server.js.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
# Los estáticos con hash NO viajan dentro de `standalone` (se sirven por CDN
# en muchos despliegues); sin esta copia el servidor arranca y devuelve 404
# para todo el JS de la página.
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
# `public/` TAMPOCO viaja dentro de `standalone` — es el mismo motivo que los
# estáticos con hash, documentado por Next.js para la salida `standalone`.
# Sin esta copia el servidor arranca y devuelve 404 para el kernel WASM
# (`/wasm/valle-cad-kernel.wasm`), los SVG de marca (`/brand/*.svg`, usados
# por el favicon y el manifiesto de la PWA) y las capturas de producto que
# sirve la landing. El destino replica la ruta relativa que ya usa
# `apps/web/.next/static` arriba, porque `server.js` (CMD, abajo) resuelve
# `public/` junto a sí mismo, es decir bajo `apps/web/`.
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/server.js"]
