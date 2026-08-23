# syntax=docker/dockerfile:1.7
#
# Imagen del web de Valle Design (Next.js, salida `standalone`).
#
# Particularidad que decide todo lo demás: `NEXT_PUBLIC_API_URL` se INCORPORA
# AL BUNDLE durante el build. No es configuración de runtime; cambiarla en el
# proceso no reescribe el JavaScript ya emitido. Por eso llega como ARG y por
# eso una imagen de web es específica del origen de API al que apunta: la
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
COPY apps/web apps/web

# El origen PÚBLICO exacto de la API. No tiene default: un valor por omisión
# produciría una imagen que apunta a localhost y falla sólo en el navegador
# del cliente, que es el peor sitio para enterarse.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_OUTPUT=standalone
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN test -n "$NEXT_PUBLIC_API_URL" \
  || (echo "NEXT_PUBLIC_API_URL es obligatorio: se incrusta en el bundle." && exit 1)

RUN npm run build --workspace=@valle-design/contracts \
  && npm run build --workspace=@valle/design-sdk \
  && NODE_OPTIONS=--max-old-space-size=4096 npm run build --workspace=web

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
