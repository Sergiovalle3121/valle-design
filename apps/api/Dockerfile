# syntax=docker/dockerfile:1.7
#
# Imagen de la API de Valle Design (NestJS 11 + TypeORM).
#
# El objetivo NO es "que arranque": es que la imagen desplegada en producción
# sea DERIVABLE de un commit. De ahí las tres decisiones que gobiernan este
# archivo:
#
#   1. `npm ci` contra el LOCKFILE versionado, nunca `npm install`. Un
#      `install` resuelve rangos en el momento del build: dos builds del mismo
#      commit pueden producir dos árboles de dependencias distintos, y
#      entonces el SBOM que se firma no describe lo que corre.
#   2. Multistage: el compilador, el árbol de desarrollo y el código fuente se
#      quedan en el stage de build. La imagen final lleva `dist/` y las
#      dependencias de producción — nada con lo que un atacante pueda
#      recompilar dentro del contenedor.
#   3. Usuario NO root y `dumb-init` como PID 1. Sin un init real, Node
#      hereda el PID 1 y NO recibe la semántica normal de señales: un
#      `docker stop` mata el proceso sin que el apagado ordenado
#      (drenar peticiones, cerrar el pool) llegue a ejecutarse.
#
# Los secretos NO viven aquí. Ni ARG ni ENV ni COPY de `.env`: todo llega por
# entorno en el arranque, desde el gestor de secretos del entorno. Un secreto
# en una capa queda en la imagen para siempre, aunque una capa posterior lo
# borre. `scripts/deploy/validate-dockerfiles.mjs` lo comprueba en CI.

# La versión de Node sale de .nvmrc (fuente única, la misma que usa CI). Si
# alguien la cambia allí y no aquí, el validador falla.
ARG NODE_VERSION=20
# Digest del manifest-list multi-arch de node:20-bookworm-slim: la etiqueta
# avanza con cada patch de Node y cada rebuild de Debian, así que dos builds
# del mismo commit daban imágenes distintas — lo contrario del principio de
# imagen DERIVABLE del commit que declara esta cabecera. Dependabot (docker)
# propone el digest nuevo cuando la base publica; la etiqueta se conserva al
# lado como documentación humana de qué es este digest.
ARG NODE_DIGEST=sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 · build — árbol completo (dev incluidas), compila y luego poda
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim@${NODE_DIGEST} AS build
WORKDIR /app

# Herramientas de compilación para dependencias nativas (@node-rs/argon2 trae
# binarios precompilados, pero un árbol sin prebuild no puede fallar en
# silencio dejando la imagen sin hashing de contraseñas).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Los manifiestos primero: mientras el lockfile no cambie, la capa de
# `npm ci` se reutiliza y el build sólo recompila el código.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/design-sdk/package.json packages/design-sdk/
COPY packages/dwg-codec/package.json packages/dwg-codec/

# `--ignore-scripts` en la instalación: los `prepare` de los workspaces
# compilan TypeScript que todavía no se ha copiado. La compilación es el paso
# explícito de abajo.
RUN npm ci --no-audit --no-fund --ignore-scripts

COPY packages/contracts packages/contracts
COPY packages/design-sdk packages/design-sdk
COPY apps/api apps/api

# contracts → design-sdk → api. Sin turbo: la imagen no necesita el grafo del
# monorepo entero, y una cadena explícita es auditable de un vistazo.
RUN npm run build --workspace=@valle-design/contracts \
  && npm run build --workspace=@valle/design-sdk \
  && npm run build --workspace=valle-design-api

# La poda deja EXACTAMENTE el árbol de producción del lockfile: mismo
# resolución, sin compilador, sin jest, sin better-sqlite3 (que es devDep — y
# producción prohíbe SQLite de todos modos, ver orm.options.ts).
RUN npm prune --omit=dev

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 · runtime — slim, sin compilador, sin fuentes, sin root
# ─────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim@${NODE_DIGEST} AS runtime

# `dumb-init` reenvía SIGTERM/SIGINT al hijo y cosecha zombies. Es la pieza
# que hace que el apagado ordenado de `main.ts` se ejecute de verdad.
RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000
# Sin esto, un `console.log` sobre un pipe lento puede perder líneas al
# apagar: Node bufferiza stdout no-TTY.
ENV NODE_OPTIONS=--enable-source-maps

WORKDIR /app

# `node` (uid 1000) ya existe en la imagen oficial. Se declara dueño en el
# COPY para no pagar un `chown -R` de otra capa entera.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=node:node /app/packages/design-sdk/dist ./packages/design-sdk/dist
COPY --from=build --chown=node:node /app/packages/design-sdk/package.json ./packages/design-sdk/package.json

USER node

EXPOSE 4000

# Liveness DEL CONTENEDOR: `/health` no toca la base a propósito. Si el
# healthcheck consultara PostgreSQL, un parpadeo de la base reiniciaría todas
# las réplicas a la vez y convertiría una degradación en una caída. La
# readiness (`/health/ready`, que sí mira base y migraciones) es cosa del
# balanceador, no del supervisor de contenedores.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/main.js"]
