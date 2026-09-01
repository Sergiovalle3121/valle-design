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
 *     commit);
 *   · el stage de runtime deja de copiar un artefacto que el servidor
 *     necesita para responder — el caso real que motivó esta regla: el
 *     Dockerfile del web copiaba `.next/standalone` y `.next/static` pero NO
 *     `apps/web/public`, así que la imagen arrancaba, pasaba el healthcheck
 *     (que sólo pide `/`) y devolvía 404 para el kernel WASM y los SVG de
 *     marca — un fallo silencioso, exactamente la clase que este archivo
 *     existe para atrapar.
 *
 * Uso:
 *   node scripts/deploy/validate-dockerfiles.mjs [--json]
 *   exit 1 si algún invariante se incumple.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSON_OUTPUT = process.argv.includes('--json');

/**
 * Copias que el stage de runtime DEBE contener. No es "el Dockerfile copia
 * algo": es "copia ESTO, desde AHÍ, hacia ALLÁ" — un artefacto que falta o
 * que aterriza en el destino equivocado dentro del árbol que Next.js
 * `standalone` espera produce el mismo 404 silencioso que un artefacto que
 * nunca se copió.
 */
export const REQUIRED_COPIES = {
  'apps/web/Dockerfile': [
    {
      id: 'copia:standalone',
      src: /apps\/web\/\.next\/standalone$/,
      dest: /^\.\/?$/,
      detail:
        '`.next/standalone` (servidor Next.js con su propio node_modules mínimo) no se copia al runtime',
    },
    {
      id: 'copia:static',
      src: /apps\/web\/\.next\/static$/,
      dest: /apps\/web\/\.next\/static\/?$/,
      detail:
        '`.next/static` (JS/CSS con hash) no se copia al runtime: standalone arranca pero sirve 404 para todo el bundle',
    },
    {
      id: 'copia:public',
      src: /apps\/web\/public$/,
      dest: /apps\/web\/public\/?$/,
      detail:
        '`apps/web/public` no se copia al runtime: standalone NO la incluye por sí solo (es un comportamiento documentado de Next.js, no un descuido de configuración), así que el kernel WASM, los SVG de marca y las capturas de producto responden 404 aunque el healthcheck de `/` pase',
    },
  ],
  'apps/api/Dockerfile': [
    {
      id: 'copia:node_modules',
      src: /\/app\/node_modules$/,
      dest: /node_modules\/?$/,
      detail: 'node_modules podado no se copia al runtime',
    },
    {
      id: 'copia:dist',
      src: /apps\/api\/dist$/,
      dest: /apps\/api\/dist\/?$/,
      detail: '`apps/api/dist` (compilado) no se copia al runtime',
    },
  ],
};

/** Dockerfiles gobernados por este gate y su puerto esperado. */
const TARGETS = [
  { path: 'apps/api/Dockerfile', name: 'API (NestJS)', expectedPort: 4000 },
  { path: 'apps/web/Dockerfile', name: 'Web (Next.js)', expectedPort: 3000 },
];

/**
 * Descompone una instrucción `COPY` en orígenes, destino y stage de origen.
 * Deliberadamente simple (split por espacio): las instrucciones que este
 * repositorio escribe no llevan rutas citadas con espacios, y una gramática
 * completa de Dockerfile es una dependencia que este gate no necesita.
 */
export function parseCopyInstruction(text) {
  const withoutKeyword = text.replace(/^COPY\s+/i, '');
  const tokens = withoutKeyword.split(/\s+/).filter(Boolean);
  const flags = tokens.filter((token) => token.startsWith('--'));
  const paths = tokens.filter((token) => !token.startsWith('--'));
  const dest = paths.length ? paths[paths.length - 1] : undefined;
  const srcs = paths.slice(0, -1);
  const fromFlag = flags.find((flag) => flag.startsWith('--from='));
  return {
    srcs,
    dest,
    from: fromFlag ? fromFlag.slice('--from='.length) : undefined,
  };
}

/**
 * De la lista `required` (ver `REQUIRED_COPIES`), cuáles no tienen ninguna
 * instrucción `COPY` cuyo origen y destino casen sus patrones. Vacío
 * significa "el runtime copia todo lo que se declaró que necesita".
 */
export function missingRequiredCopies(copyEntries, required) {
  const parsed = copyEntries.map((entry) => parseCopyInstruction(entry.text));
  return required.filter(
    (req) =>
      !parsed.some(
        (p) =>
          p.dest !== undefined &&
          req.dest.test(p.dest) &&
          p.srcs.some((src) => req.src.test(src)),
      ),
  );
}

/**
 * ¿Hay, entre las COPY del stage de build, una que copie la FUENTE de
 * `packages/dwg-codec` (no sólo su `package.json`, ya copiado antes del
 * `npm ci` para que el workspace resuelva)? `entries` son instrucciones COPY
 * ya filtradas al stage que corresponda por quien llama.
 */
export function hasDwgCodecSourceCopy(entries) {
  return entries.some((entry) => {
    const { srcs, dest } = parseCopyInstruction(entry.text);
    return (
      dest !== undefined &&
      /packages\/dwg-codec\/?$/.test(dest) &&
      srcs.some((src) => /packages\/dwg-codec$/.test(src))
    );
  });
}

/**
 * Localiza el RUN que construye `@valle-design/dwg-codec` y el que construye
 * `web`, y si el primero corre ANTES del segundo (por número de línea; una
 * instrucción con continuaciones `\` reporta la línea donde EMPIEZA). Ambos
 * `undefined` o en el orden equivocado son el mismo defecto: `web` empaqueta
 * el worker de importación sin que el códec exista todavía compilado.
 */
export function dwgCodecBuildOrder(runEntries) {
  const webBuildRun = runEntries.find((entry) =>
    /npm\s+run\s+build\s+--workspace=web\b/.test(entry.text),
  );
  const dwgBuildRun = runEntries.find((entry) =>
    /npm\s+run\s+build\s+--workspace=@valle-design\/dwg-codec\b/.test(entry.text),
  );
  return {
    webBuildRun,
    dwgBuildRun,
    orderedCorrectly:
      Boolean(dwgBuildRun) && Boolean(webBuildRun) && dwgBuildRun.line < webBuildRun.line,
  };
}

/** Los flags de build que gobiernan la beta de importación DWG (ADR-0009). */
export const DWG_BUILD_FLAG_NAMES = [
  'NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA',
  'NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA',
  // Perfil 3D heredado PROPUESTO, ADR-0009 §9. Sin firma del titular: declarar
  // el ARG/ENV no habilita nada, pero su ausencia sí sería el mismo "módulo sin
  // consumidor" que esta campaña prohíbe.
  'NEXT_PUBLIC_DWG_3D_WIREFRAME_IMPORT_BETA',
  // Familia moderna AC1024/AC1027/AC1032, cableada y sin firma: misma
  // razón que la de arriba — declararla no habilita nada, no declararla
  // sería el 'módulo sin consumidor' que esta campaña prohíbe.
  'NEXT_PUBLIC_DWG_MODERN_IMPORT_BETA',
];

/**
 * De `DWG_BUILD_FLAG_NAMES`, cuáles NO están declarados como `ARG` Y
 * propagados como `ENV nombre=${nombre}` ANTES del build de `web` (si se
 * conoce esa línea). Un ARG sin su ENV nunca llega al proceso de Next.js: los
 * build-args de Docker sólo son visibles al `RUN` como variable de entorno si
 * alguna instrucción `ENV` los reenvía explícitamente.
 */
export function missingDwgBuildFlags(allEntries, envEntries, webBuildRun) {
  const flagWired = (name) => {
    const argDeclared = allEntries.some((entry) =>
      new RegExp(`^ARG\\s+${name}\\b`).test(entry.text),
    );
    const envLine = envEntries.find((entry) =>
      new RegExp(`^ENV\\s+${name}=\\$\\{${name}\\}`).test(entry.text),
    );
    return (
      argDeclared && envLine !== undefined && (!webBuildRun || envLine.line < webBuildRun.line)
    );
  };
  return DWG_BUILD_FLAG_NAMES.filter((name) => !flagWired(name));
}

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
export function instructions(source) {
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

export function validate(target, nodeMajor) {
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
  const copies = directive('COPY');

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

  // ── 3b · digest fijado ───────────────────────────────────────────────────
  // `node:20-bookworm-slim` también es una etiqueta MÓVIL: avanza con cada
  // patch de Node y cada rebuild de Debian, así que dos builds del mismo
  // commit con un mes de diferencia producían imágenes distintas. Sólo el
  // digest hace a la base derivable del commit; Dependabot (docker) propone
  // el nuevo cuando upstream publica.
  const argDigest = /^\s*ARG\s+NODE_DIGEST\s*=\s*(sha256:[0-9a-f]{64})\s*$/im.exec(
    source,
  )?.[1];
  const undigested = nodeTags.filter((tag) => {
    const at = tag.indexOf('@');
    if (at === -1) return true;
    const digest = tag.slice(at + 1);
    const resolved = digest === '${NODE_DIGEST}' ? argDigest : digest;
    return !/^sha256:[0-9a-f]{64}$/.test(resolved ?? '');
  });
  check(
    'base-digest',
    undigested.length === 0,
    `base sin digest (${undigested.join(', ') || 'ninguna'}): la etiqueta avanza sola y la imagen deja de ser derivable del commit — fija @sha256:… (ARG NODE_DIGEST)`,
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

  // ── 9b · el runtime copia todos los artefactos que necesita ─────────────
  const runtimeCopies = copies.filter((entry) => entry.line > lastFromLine);
  const missingCopies = missingRequiredCopies(
    runtimeCopies,
    REQUIRED_COPIES[target.path] ?? [],
  );
  check(
    'copias-runtime',
    missingCopies.length === 0,
    missingCopies.map((m) => m.detail).join('; '),
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

  // ── 11 · el códec DWG se copia y se construye en el stage de build ────────
  // `document-import.worker.ts` importa dinámicamente `dwg-native-reader.ts`,
  // que importa estáticamente `@valle-design/dwg-codec`. Next.js resuelve ese
  // grafo en tiempo de BUILD para crear el chunk del worker, así que sin la
  // fuente copiada y `dist/`/`dist-cjs/` construidos el build de `web` falla
  // — el caso real que motivó este bloque (P1, campaña DWG producto).
  if (target.path === 'apps/web/Dockerfile') {
    const buildStageCopies = copies.filter((entry) => entry.line <= lastFromLine);
    check(
      'dwg-codec-copia-fuente',
      hasDwgCodecSourceCopy(buildStageCopies),
      '`packages/dwg-codec` (fuente, no sólo su package.json) no se copia al stage de build: sin `dist/`/`dist-cjs/` construidos el build de `web` falla con "Cannot find module" al empaquetar el worker de importación, sin importar el valor de los flags NEXT_PUBLIC_DWG_*',
    );

    const { webBuildRun, dwgBuildRun, orderedCorrectly } = dwgCodecBuildOrder(runs);
    check(
      'dwg-codec-build',
      orderedCorrectly,
      !dwgBuildRun
        ? 'no hay `RUN npm run build --workspace=@valle-design/dwg-codec`: el códec nunca se compila y el build de `web` falla al resolver el import dinámico del worker'
        : 'el build de `@valle-design/dwg-codec` no corre ANTES del build de `web`: `web` necesita `dist/`/`dist-cjs/` ya construidos cuando empaqueta el worker',
    );

    const missingFlags = missingDwgBuildFlags(instr, envs, webBuildRun);
    check(
      'dwg-flags-cableados',
      missingFlags.length === 0,
      `falta declarar (ARG) y propagar (ENV) antes del build de web: ${missingFlags.join(', ')} — sin las dos cosas, Next.js nunca ve la variable en tiempo de build y la beta queda inalcanzable aunque el códec ya esté compilado`,
    );
  }

  return { file: target.path, name: target.name, failures, checks };
}

export function validateDockerignore() {
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
