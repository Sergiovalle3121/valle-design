#!/usr/bin/env node
/**
 * GATE DE IMAGEN REPRODUCIBLE.
 *
 * Un Dockerfile no se puede "probar" con un test unitario y construirlo en CI
 * cuesta minutos de runner que este repo no tiene. Lo que SÍ se puede hacer,
 * gratis y en cada corrida, es comprobar los INVARIANTES que separan una
 * imagen desplegable de una que va a fallar en producción — y que fallan
 * silenciosamente, porque una imagen mal construida arranca igual:
 *
 *   · corre como root (una escalada dentro del contenedor es el host);
 *   · no fija NODE_ENV=production (Express, Nest y Next cambian de modo:
 *     stack traces al cliente, sin caché de vistas, dependencias de dev vivas);
 *   · no tiene HEALTHCHECK (el orquestador cree que un proceso colgado está
 *     sano y le sigue mandando tráfico);
 *   · usa `npm install` en vez de `npm ci` (dos builds del mismo commit
 *     producen árboles distintos: el SBOM firmado deja de describir lo que
 *     corre);
 *   · lleva un secreto embebido (una capa lo conserva para siempre, aunque
 *     una capa posterior lo borre);
 *   · usa una versión de Node distinta de .nvmrc (CI valida con una y
 *     producción ejecuta con otra: los fallos no se reproducen);
 *   · no es multistage (el compilador y las fuentes viajan a producción);
 *   · usa `latest` o una etiqueta móvil (la imagen deja de ser derivable del
 *     commit).
 *
 * Uso:
 *   node scripts/deploy/validate-dockerfiles.mjs [--json]
 *   exit 1 si algún invariante se incumple.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSON_OUTPUT = process.argv.includes('--json');

/** Dockerfiles gobernados por este gate y su puerto esperado. */
const TARGETS = [
  { path: 'apps/api/Dockerfile', name: 'API (NestJS)', expectedPort: 4000 },
  { path: 'apps/web/Dockerfile', name: 'Web (Next.js)', expectedPort: 3000 },
];

/**
 * Patrones de secreto embebido. Deliberadamente conservadores: buscan una
 * ASIGNACIÓN de valor literal a una clave sensible, no la mera aparición de
 * la palabra (un comentario que explica por qué NO hay secretos debe pasar).
 */
const SECRET_PATTERNS = [
  {
    kind: 'ENV/ARG con valor sensible',
    // ENV FOO_SECRET=valor  ·  ARG API_KEY="valor"
    regex:
      /^\s*(?:ENV|ARG)\s+([A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*)\s*=\s*(\S+)/i,
  },
  {
    kind: 'URL de conexión con credenciales',
    regex: /(?:postgres|postgresql|mysql|redis|amqp|mongodb):\/\/[^\s:/@]+:[^\s@]+@/i,
  },
  {
    kind: 'material criptográfico en claro',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    kind: 'copia de un archivo de entorno',
    regex: /^\s*COPY\s+(?:--\S+\s+)*(?:[^\s]*\/)?\.env(?:\.\S+)?\s/i,
  },
];

/** Valores que NO son un secreto aunque casen el patrón de asignación. */
const SECRET_PLACEHOLDERS = new Set([
  '""',
  "''",
  '${NEXT_PUBLIC_API_URL}',
]);

function readNvmrcMajor() {
  const raw = readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim();
  const major = raw.replace(/^v/, '').split('.')[0];
  if (!/^\d+$/.test(major)) {
    throw new Error(`.nvmrc no declara una versión mayor legible: "${raw}"`);
  }
  return major;
}

/** Líneas sin comentarios ni continuaciones: una instrucción por entrada. */
function instructions(source) {
  const out = [];
  const lines = source.split(/\r?\n/);
  let buffer = '';
  let startLine = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!buffer && /^\s*(#|$)/.test(line)) continue;
    if (!buffer) startLine = i + 1;
    if (/\\\s*$/.test(line)) {
      buffer += line.replace(/\\\s*$/, ' ');
      continue;
    }
    out.push({ line: startLine, text: (buffer + line).trim() });
    buffer = '';
  }
  if (buffer) out.push({ line: startLine, text: buffer.trim() });
  return out;
}

function validate(target, nodeMajor) {
  const absolute = join(ROOT, target.path);
  const failures = [];
  const checks = [];

  const fail = (id, detail) => failures.push({ id, detail });
  const check = (id, ok, detail) => {
    checks.push({ id, ok });
    if (!ok) fail(id, detail);
  };

  if (!existsSync(absolute)) {
    return {
      file: target.path,
      name: target.name,
      failures: [{ id: 'existe', detail: 'el Dockerfile no existe' }],
      checks: [{ id: 'existe', ok: false }],
    };
  }

  const source = readFileSync(absolute, 'utf8');
  const instr = instructions(source);
  const directive = (name) =>
    instr.filter((entry) =>
      new RegExp(`^${name}\\b`, 'i').test(entry.text),
    );

  const froms = directive('FROM');
  const users = directive('USER');
  const envs = directive('ENV');
  const runs = directive('RUN');

  // ── 1 · multistage ───────────────────────────────────────────────────────
  check(
    'multistage',
    froms.length >= 2,
    `sólo ${froms.length} FROM: sin un stage de runtime aparte, el compilador y las fuentes viajan a producción`,
  );

  // ── 2 · versión de Node atada a .nvmrc ───────────────────────────────────
  const nodeTags = froms
    .map((entry) => /node:([^\s]+)/i.exec(entry.text)?.[1])
    .filter(Boolean);
  const argNode = /^\s*ARG\s+NODE_VERSION\s*=\s*([^\s]+)/im.exec(source)?.[1];
  const declaredVersions = new Set(
    nodeTags.map((tag) =>
      tag.startsWith('${NODE_VERSION}') ? argNode : tag.split('-')[0],
    ),
  );
  check(
    'node-nvmrc',
    nodeTags.length > 0 &&
      [...declaredVersions].every(
        (v) => v !== undefined && String(v).split('.')[0] === nodeMajor,
      ),
    `las bases declaran Node ${[...declaredVersions].join(', ')} y .nvmrc pide ${nodeMajor}: CI validaría con una versión y producción ejecutaría con otra`,
  );

  // ── 3 · etiquetas inmutables ─────────────────────────────────────────────
  const movingTags = nodeTags.filter((tag) => /latest|^current/i.test(tag));
  check(
    'tag-inmutable',
    movingTags.length === 0,
    `etiqueta móvil ${movingTags.join(', ')}: la imagen deja de ser derivable del commit`,
  );

  // ── 4 · usuario no root en el stage final ────────────────────────────────
  const lastFromLine = froms.length ? froms[froms.length - 1].line : 0;
  const runtimeUser = users
    .filter((entry) => entry.line > lastFromLine)
    .map((entry) => entry.text.replace(/^USER\s+/i, '').trim())
    .pop();
  check(
    'no-root',
    Boolean(runtimeUser) && !/^(root|0)(:|$)/.test(runtimeUser ?? ''),
    runtimeUser
      ? `el stage final corre como "${runtimeUser}"`
      : 'el stage final no declara USER: corre como root, y una escalada dentro del contenedor alcanza el host',
  );

  // ── 5 · NODE_ENV=production en el runtime ────────────────────────────────
  const nodeEnv = envs
    .filter((entry) => entry.line > lastFromLine)
    .map((entry) => /NODE_ENV[=\s]+([^\s]+)/i.exec(entry.text)?.[1])
    .filter(Boolean)
    .pop();
  check(
    'node-env',
    nodeEnv === 'production',
    `NODE_ENV en el stage final es ${nodeEnv ?? '<sin declarar>'}: fuera de production el runtime filtra stack traces y desactiva optimizaciones`,
  );

  // ── 6 · HEALTHCHECK ──────────────────────────────────────────────────────
  check(
    'healthcheck',
    directive('HEALTHCHECK').length > 0,
    'sin HEALTHCHECK el orquestador considera sano un proceso colgado y le sigue enviando tráfico',
  );

  // ── 7 · instalación reproducible ─────────────────────────────────────────
  const usesCi = runs.some((entry) => /\bnpm\s+ci\b/.test(entry.text));
  const usesInstall = runs.some((entry) =>
    /\bnpm\s+(?:install|i)\b(?!\s*-g)/.test(entry.text),
  );
  check(
    'npm-ci',
    usesCi && !usesInstall,
    usesInstall
      ? '`npm install` resuelve rangos en tiempo de build: dos builds del mismo commit pueden diferir'
      : 'no hay `npm ci`: la instalación no está atada al lockfile',
  );

  // ── 8 · señales: init real como PID 1 ────────────────────────────────────
  const entrypoint = directive('ENTRYPOINT').map((e) => e.text).join(' ');
  check(
    'init-senales',
    /dumb-init|tini|--init/.test(entrypoint),
    'sin un init real como PID 1, Node no recibe la semántica normal de señales y el apagado ordenado nunca se ejecuta',
  );

  // ── 9 · puerto declarado ─────────────────────────────────────────────────
  const exposed = directive('EXPOSE')
    .map((e) => Number(/EXPOSE\s+(\d+)/i.exec(e.text)?.[1]))
    .filter((n) => Number.isFinite(n));
  check(
    'expose',
    exposed.includes(target.expectedPort),
    `EXPOSE ${exposed.join(', ') || '<ninguno>'} y se esperaba ${target.expectedPort}`,
  );

  // ── 10 · sin secretos embebidos ──────────────────────────────────────────
  const secretHits = [];
  for (const entry of instructions(source)) {
    for (const pattern of SECRET_PATTERNS) {
      const match = pattern.regex.exec(entry.text);
      if (!match) continue;
      const value = match[2];
      if (value !== undefined && SECRET_PLACEHOLDERS.has(value)) continue;
      // `ENV FOO_SECRET=${FOO_SECRET}` reenvía una variable, no la embebe.
      if (value !== undefined && /^"?\$\{?[A-Z0-9_]+\}?"?$/i.test(value)) {
        continue;
      }
      secretHits.push(`línea ${entry.line}: ${pattern.kind}`);
    }
  }
  check(
    'sin-secretos',
    secretHits.length === 0,
    `${secretHits.join('; ')} — una capa conserva el valor aunque otra lo borre`,
  );

  return { file: target.path, name: target.name, failures, checks };
}

function validateDockerignore() {
  const failures = [];
  const path = join(ROOT, '.dockerignore');
  if (!existsSync(path)) {
    return {
      file: '.dockerignore',
      name: 'Contexto de build',
      failures: [
        {
          id: 'existe',
          detail:
            'sin .dockerignore el contexto arrastra node_modules, .git y cualquier .env presente',
        },
      ],
      checks: [{ id: 'existe', ok: false }],
    };
  }
  const source = readFileSync(path, 'utf8');
  const entries = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const REQUIRED = [
    ['node_modules', /^\*?\*?\/?node_modules$/],
    ['.git', /^\.git$/],
    ['.env', /^\.env(\*|\.\*)?$/],
    ['dumps de base', /^\*\.(dump|sqlite)$/],
  ];
  const checks = [];
  for (const [label, regex] of REQUIRED) {
    const ok = entries.some((entry) => regex.test(entry));
    checks.push({ id: `ignora:${label}`, ok });
    if (!ok) {
      failures.push({
        id: `ignora:${label}`,
        detail: `el contexto no excluye ${label}`,
      });
    }
  }
  return {
    file: '.dockerignore',
    name: 'Contexto de build',
    failures,
    checks,
  };
}

function main() {
  const nodeMajor = readNvmrcMajor();
  const results = [
    ...TARGETS.map((target) => validate(target, nodeMajor)),
    validateDockerignore(),
  ];
  const failed = results.filter((r) => r.failures.length > 0);

  if (JSON_OUTPUT) {
    console.log(
      JSON.stringify({ nodeMajor, results, ok: failed.length === 0 }, null, 2),
    );
    process.exit(failed.length === 0 ? 0 : 1);
  }

  console.log(`Gate de imagen reproducible · Node ${nodeMajor} (.nvmrc)\n`);
  for (const result of results) {
    const ok = result.failures.length === 0;
    console.log(`${ok ? 'OK  ' : 'FALLA'} ${result.file} — ${result.name}`);
    for (const check of result.checks) {
      console.log(`      ${check.ok ? '·' : '✗'} ${check.id}`);
    }
    for (const failure of result.failures) {
      console.log(`      → ${failure.id}: ${failure.detail}`);
    }
  }

  const totalChecks = results.reduce((n, r) => n + r.checks.length, 0);
  if (failed.length) {
    console.error(
      `\n${failed.length} archivo(s) incumplen invariantes de despliegue.`,
    );
    process.exit(1);
  }
  console.log(
    `\n${totalChecks} invariantes verificados sobre ${results.length} archivos. Imagen reproducible.`,
  );
}

main();
