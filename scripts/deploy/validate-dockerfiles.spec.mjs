#!/usr/bin/env node
/**
 * Spec del gate de imagen reproducible — el hallazgo P0-D.
 *
 * `apps/web/Dockerfile` copiaba `.next/standalone` y `.next/static` al
 * runtime pero NO `apps/web/public`. La imagen construía, arrancaba y pasaba
 * el HEALTHCHECK (que sólo pide `/`) — y devolvía 404 para el kernel WASM
 * (`/wasm/valle-cad-kernel.wasm`) y los SVG de marca (`/brand/*.svg`) que la
 * página sí referencia. Nada en el pipeline anterior lo habría detectado.
 *
 * Esta spec prueba dos cosas por separado:
 *   1. contra un FIXTURE (el Dockerfile original, leído de HEAD vía git antes
 *      de este arreglo): `missingRequiredCopies` debe reportar la ausencia —
 *      es el rojo que reprodujo el hallazgo.
 *   2. contra el Dockerfile ACTUAL del repositorio: el gate completo pasa, y
 *      una serie de mutaciones adversariales (destino equivocado, copia sólo
 *      en el stage de build, patrón demasiado laxo) siguen fallando — para
 *      que una futura regresión no vuelva a colarse en silencio.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  instructions,
  missingRequiredCopies,
  parseCopyInstruction,
  REQUIRED_COPIES,
  validate,
  validateDockerignore,
} from './validate-dockerfiles.mjs';

const ROOT = join(import.meta.dirname, '..', '..');

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

/** Instrucciones COPY del stage de runtime de un Dockerfile en memoria. */
function runtimeCopies(source) {
  const instr = instructions(source);
  const froms = instr.filter((entry) => /^FROM\b/i.test(entry.text));
  const lastFromLine = froms.length ? froms[froms.length - 1].line : 0;
  return instr.filter(
    (entry) => /^COPY\b/i.test(entry.text) && entry.line > lastFromLine,
  );
}

// ─── parseCopyInstruction ────────────────────────────────────────────────────

{
  const { srcs, dest, from } = parseCopyInstruction(
    'COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public',
  );
  eq(srcs, ['/app/apps/web/public'], 'un solo origen se extrae completo');
  eq(dest, './apps/web/public', 'el último token no-flag es el destino');
  eq(from, 'build', '--from= se separa del resto de las flags');
}

{
  const { srcs, dest, from } = parseCopyInstruction(
    'COPY package.json package-lock.json ./',
  );
  eq(srcs, ['package.json', 'package-lock.json'], 'varios orígenes, un destino');
  eq(dest, './', 'destino "." se conserva tal cual');
  eq(from, undefined, 'sin --from= cuando la instrucción no lo lleva');
}

// ─── ROJO: el Dockerfile original (pre-arreglo) no copiaba public ───────────

{
  // HEAD ya contiene el arreglo en esta rama (se aplicó y se va a commitear
  // junto con esta spec), así que el fixture rojo es un texto INLINE, no un
  // `git show` — evita que la spec dependa de que HEAD siga sin el arreglo.
  const originalBuggySource = `
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN npm ci
COPY apps/web apps/web
RUN npm run build --workspace=web

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK CMD node -e "process.exit(0)"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/server.js"]
`;
  const missing = missingRequiredCopies(
    runtimeCopies(originalBuggySource),
    REQUIRED_COPIES['apps/web/Dockerfile'],
  );
  eq(
    missing.map((m) => m.id),
    ['copia:public'],
    'el Dockerfile pre-arreglo (sin COPY de apps/web/public) queda marcado como incompleto — este es el rojo del hallazgo P0-D',
  );
}

// ─── VERDE: el Dockerfile actual del repositorio copia todo lo requerido ───

{
  const webSource = readFileSync(join(ROOT, 'apps/web/Dockerfile'), 'utf8');
  const missing = missingRequiredCopies(
    runtimeCopies(webSource),
    REQUIRED_COPIES['apps/web/Dockerfile'],
  );
  eq(missing, [], 'el Dockerfile del web arreglado no reporta copias faltantes');
}

{
  const apiSource = readFileSync(join(ROOT, 'apps/api/Dockerfile'), 'utf8');
  const missing = missingRequiredCopies(
    runtimeCopies(apiSource),
    REQUIRED_COPIES['apps/api/Dockerfile'],
  );
  eq(
    missing,
    [],
    'el Dockerfile de la API no tiene el mismo bug: ya copiaba node_modules y dist',
  );
}

// ─── Adversariales ───────────────────────────────────────────────────────────

{
  // Copia hacia el destino equivocado: standalone no sirve `public/` desde
  // la raíz del WORKDIR, sólo desde junto a `apps/web/server.js`.
  const wrongDest = `
FROM node:20-bookworm-slim AS build
FROM node:20-bookworm-slim AS runtime
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./public
`;
  const missing = missingRequiredCopies(
    runtimeCopies(wrongDest),
    REQUIRED_COPIES['apps/web/Dockerfile'],
  );
  ok(
    missing.some((m) => m.id === 'copia:public'),
    'una copia de public al destino equivocado (./public en vez de ./apps/web/public) sigue contando como faltante',
  );
}

{
  // Copia presente pero SÓLO en el stage de build: nunca llega al runtime.
  const onlyInBuildStage = `
FROM node:20-bookworm-slim AS build
COPY apps/web/public ./apps/web/public
FROM node:20-bookworm-slim AS runtime
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
`;
  const missing = missingRequiredCopies(
    runtimeCopies(onlyInBuildStage),
    REQUIRED_COPIES['apps/web/Dockerfile'],
  );
  ok(
    missing.some((m) => m.id === 'copia:public'),
    'una COPY que sólo existe en el stage de build (antes del último FROM) no cuenta: nunca llega a la imagen final',
  );
}

{
  // Un origen que sólo hace match por casualidad de substring, no de sufijo
  // de ruta (p.ej. "apps/web/public-old"), no debe satisfacer el requisito.
  const lookalikeSource = `
FROM node:20-bookworm-slim AS runtime
COPY --from=build --chown=node:node /app/apps/web/public-old ./apps/web/public
`;
  const missing = missingRequiredCopies(
    runtimeCopies(lookalikeSource),
    REQUIRED_COPIES['apps/web/Dockerfile'],
  );
  ok(
    missing.some((m) => m.id === 'copia:public'),
    'un origen "apps/web/public-old" no debe confundirse con "apps/web/public" (ancla $ al final del patrón)',
  );
}

// ─── Cada requisito declarado explica por qué (mismo hábito que otros gates) ─

for (const [dockerfile, required] of Object.entries(REQUIRED_COPIES)) {
  for (const req of required) {
    ok(
      typeof req.detail === 'string' && req.detail.length > 10,
      `${dockerfile} / ${req.id}: cada copia requerida explica su motivo`,
    );
    ok(
      req.src instanceof RegExp && req.dest instanceof RegExp,
      `${dockerfile} / ${req.id}: src y dest son patrones, no cadenas literales`,
    );
  }
}

// ─── Integración: el gate completo sobre los Dockerfiles reales del repo ────

{
  const nodeMajor = readFileSync(join(ROOT, '.nvmrc'), 'utf8')
    .trim()
    .replace(/^v/, '')
    .split('.')[0];

  const webResult = validate(
    { path: 'apps/web/Dockerfile', name: 'Web (Next.js)', expectedPort: 3000 },
    nodeMajor,
  );
  eq(
    webResult.failures,
    [],
    `apps/web/Dockerfile pasa el gate completo: ${JSON.stringify(webResult.failures)}`,
  );

  const apiResult = validate(
    { path: 'apps/api/Dockerfile', name: 'API (NestJS)', expectedPort: 4000 },
    nodeMajor,
  );
  eq(
    apiResult.failures,
    [],
    `apps/api/Dockerfile pasa el gate completo: ${JSON.stringify(apiResult.failures)}`,
  );

  const dockerignoreResult = validateDockerignore();
  eq(dockerignoreResult.failures, [], '.dockerignore pasa el gate completo');
}

console.log(`Spec del gate de imagen reproducible OK: ${checks} comprobaciones.`);
