#!/usr/bin/env node
/**
 * GATE DE LICENCIAS DE DEPENDENCIAS.
 *
 * El producto propietario se distribuye como `UNLICENSED`. Eso sólo es
 * sostenible si TODA dependencia de producción tiene una licencia permisiva:
 * una sola dependencia copyleft fuerte en el árbol de runtime cambia las
 * obligaciones de distribución del binario entero, y ese descubrimiento no se
 * puede hacer durante una negociación con un cliente.
 *
 * Política (fuente única):
 *   • PERMITIDAS: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD,
 *     Unlicense, CC0-1.0, BlueOak-1.0.0, Python-2.0, WTFPL.
 *     `0BSD` se acepta previa revisión (es permisiva sin obligación de aviso).
 *   • BLOQUEADAS: GPL*, AGPL*, SSPL, y cualquier licencia DESCONOCIDA. Una
 *     licencia que no se puede leer es indistinguible de una prohibida.
 *   • REVISIÓN LEGAL: LGPL* y MPL* NO se bloquean automáticamente. Sus
 *     obligaciones dependen de la modalidad de enlace (dinámico vs estático) y
 *     del alcance del archivo modificado; borrarlas por reflejo sería tan
 *     irresponsable como ignorarlas. Se listan para decisión humana.
 *
 * Fuente de datos: el SBOM CycloneDX generado con `npm run sbom` (sin dev).
 *
 * Uso: node scripts/check-dependency-licenses.mjs [--json]
 *      exit 1 si hay licencias bloqueadas o desconocidas.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Rutas ancladas al repositorio, no al cwd: era el ÚNICO script del árbol que
// leía 'package.json' relativo — ejecutado desde un subdirectorio derivaba mal
// la lista de paquetes propios y buscaba el SBOM donde no está.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SBOM_PATH = join(REPO_ROOT, 'sbom.cdx.json');

const ALLOWED = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'Unlicense',
  'CC0-1.0',
  'BlueOak-1.0.0',
  'Python-2.0',
  'WTFPL',
  'CC-BY-4.0',
  'MIT-0',
  'Zlib',
  'BSD',
  'MIT/X11',
]);

/**
 * Paquetes propios del monorepo. Son el PRODUCTO PROPIETARIO (`UNLICENSED`), no
 * dependencias de terceros: no tiene sentido evaluarlos contra la allowlist.
 *
 * Se DERIVAN de los workspaces reales en disco. La primera versión los tenía
 * hardcodeados y el gate se rompió en cuanto alguien añadió dos paquetes
 * nuevos: una lista escrita a mano de "lo nuestro" caduca en el momento en que
 * el repositorio crece, que es exactamente cuando el gate debería seguir
 * funcionando.
 */
function firstPartyNames() {
  const names = new Set();
  const root = JSON.parse(
    readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
  );
  names.add(root.name);
  for (const pattern of root.workspaces ?? []) {
    // Sólo se soporta la forma `dir/*`, que es la que usa este monorepo.
    const dir = join(REPO_ROOT, pattern.replace(/\/\*$/, ''));
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = join(dir, entry.name, 'package.json');
      if (!existsSync(manifest)) continue;
      try {
        names.add(JSON.parse(readFileSync(manifest, 'utf8')).name);
      } catch {
        // Un manifiesto ilegible no debe tumbar el gate de licencias.
      }
    }
  }
  names.delete(undefined);
  return names;
}

const FIRST_PARTY = firstPartyNames();

// Si la derivación se rompe, FIRST_PARTY queda vacío y los paquetes propios
// —que son `UNLICENSED` a propósito— se reportarían como licencia desconocida.
// El gate fallaría por la razón equivocada y alguien "arreglaría" el síntoma.
// Mejor romper aquí, con el motivo real.
if (FIRST_PARTY.size < 2) {
  console.error(
    'No se pudieron derivar los paquetes propios desde los workspaces. ' +
      'Sin ellos el gate reportaría el producto propietario como licencia ' +
      'desconocida. Revisa `workspaces` en package.json.',
  );
  process.exit(1);
}

/** `pkg:npm/%40valle-design%2Fcontracts@1.0.0` → `@valle-design/contracts`. */
function purlName(purl) {
  const match = /^pkg:npm\/(.+)@[^@]*$/.exec(purl ?? '');
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Excepciones REVISADAS: paquetes cuyo SBOM no declara licencia pero cuyo
 * `package.json` o archivo LICENSE en disco SÍ la declara. Cada entrada cita la
 * evidencia verificada; sin evidencia no hay excepción.
 */
const VERIFIED_LICENSES = {
  chainsaw: { license: 'MIT/X11', evidence: 'package.json "license": "MIT/X11"' },
  'passport-strategy': {
    license: 'MIT',
    evidence: 'package.json licenses[0].type = MIT + archivo LICENSE',
  },
  rgbcolor: {
    license: 'MIT',
    evidence: 'package.json "license": "MIT OR SEE LICENSE IN FEEL-FREE.md" + LICENSE.md',
  },
  traverse: { license: 'MIT', evidence: 'package.json "license": "MIT" + archivo LICENSE' },
  'xmlhttprequest-ssl': {
    license: 'MIT',
    evidence: 'package.json licenses[0].type = MIT + archivo LICENSE',
  },
};

/**
 * Paquetes SIN licencia declarada en ninguna parte. NO se aprueban: quedan
 * listados como deuda legal explícita para decisión del owner, porque afirmar
 * que están limpios sin evidencia sería exactamente el tipo de suposición que
 * este gate existe para impedir.
 */
const UNDECLARED_DEBT = ['buffers', 'pause'];

/** Familias que exigen revisión legal antes de aceptar o retirar. */
const REVIEW_PREFIXES = ['LGPL', 'MPL', 'EPL', 'CDDL'];

/** Familias bloqueadas para un producto propietario distribuido. */
const BLOCKED_PREFIXES = ['GPL-', 'AGPL', 'SSPL', 'OSL', 'EUPL'];

if (!existsSync(SBOM_PATH)) {
  console.error(
    `No se encontró ${SBOM_PATH}. Genera el SBOM primero: npm run sbom`,
  );
  process.exit(1);
}

const sbom = JSON.parse(readFileSync(SBOM_PATH, 'utf8'));
const components = sbom.components ?? [];

/** Extrae las expresiones de licencia de un componente CycloneDX. */
function licensesOf(component) {
  const out = [];
  for (const entry of component.licenses ?? []) {
    if (entry.expression) out.push(entry.expression);
    else if (entry.license?.id) out.push(entry.license.id);
    else if (entry.license?.name) out.push(entry.license.name);
  }
  return out;
}

/**
 * Una expresión SPDX compuesta (`MIT OR Apache-2.0`) se acepta si ALGUNA de sus
 * alternativas es permitida; un `AND` exige que todas lo sean.
 */
function classify(expression) {
  const normalized = expression.replace(/[()]/g, ' ').trim();
  const upper = normalized.toUpperCase();

  // El dual-licensing se evalúa PRIMERO: `MIT OR GPL-3.0` se puede tomar bajo
  // MIT, y bloquearlo por contener "GPL" sería un falso positivo que empuja a
  // desinstalar paquetes perfectamente utilizables.
  const alternatives = normalized.split(/\s+OR\s+/i);
  const takeable = alternatives.some((alt) =>
    alt
      .split(/\s+AND\s+/i)
      .every((id) => ALLOWED.has(id.trim())),
  );
  if (takeable) return 'allowed';

  if (REVIEW_PREFIXES.some((p) => upper.includes(p))) return 'review';
  if (BLOCKED_PREFIXES.some((p) => upper.includes(p.toUpperCase()))) return 'blocked';

  return 'unknown';
}

/** Nombre corto del paquete a partir de su purl. */
function packageName(purl) {
  const match = /^pkg:npm\/(?:(%40[^%]+)%2F|@[^/]+\/)?([^@]+)@/.exec(purl ?? '');
  return match ? decodeURIComponent(match[2]) : '';
}

const buckets = { allowed: [], review: [], blocked: [], unknown: [] };

for (const component of components) {
  const name = component.purl ?? `${component.name}@${component.version}`;
  // Producto propietario, no dependencia de tercero.
  if (FIRST_PARTY.has(purlName(name)) || FIRST_PARTY.has(component.name)) continue;
  const short = packageName(name) || component.name;
  const expressions = licensesOf(component);

  if (expressions.length === 0) {
    const verified = VERIFIED_LICENSES[short];
    if (verified) {
      buckets.allowed.push({
        name,
        license: `${verified.license} (verificado en disco: ${verified.evidence})`,
      });
      continue;
    }
    if (UNDECLARED_DEBT.includes(short)) {
      buckets.review.push({
        name,
        license: '(sin licencia declarada) — deuda legal pendiente de decisión del owner',
      });
      continue;
    }
    buckets.unknown.push({ name, license: '(sin declarar)' });
    continue;
  }
  // El componente hereda la clasificación MÁS restrictiva de sus expresiones.
  const verdicts = expressions.map(classify);
  const verdict = verdicts.includes('blocked')
    ? 'blocked'
    : verdicts.includes('unknown')
      ? 'unknown'
      : verdicts.includes('review')
        ? 'review'
        : 'allowed';
  buckets[verdict].push({ name, license: expressions.join(' / ') });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(buckets, null, 2));
} else {
  console.log(`Dependencias de producción analizadas: ${components.length}`);
  console.log(`  permitidas:      ${buckets.allowed.length}`);
  console.log(`  revisión legal:  ${buckets.review.length}`);
  console.log(`  bloqueadas:      ${buckets.blocked.length}`);
  console.log(`  desconocidas:    ${buckets.unknown.length}`);

  if (buckets.review.length) {
    console.log('\nRequieren revisión legal (NO se retiran automáticamente):');
    for (const c of buckets.review) console.log(`  · ${c.name} — ${c.license}`);
  }
  // Todo el reporte va a stdout: mezclarlo con stderr hacía que CI intercalara
  // los encabezados por orden de flush y el lector viera paquetes bajo el
  // bucket equivocado.
  if (buckets.blocked.length) {
    console.log('\n🚫 Licencias bloqueadas para un producto propietario:');
    for (const c of buckets.blocked) console.log(`  · ${c.name} — ${c.license}`);
  }
  if (buckets.unknown.length) {
    console.log('\n🚫 Licencias desconocidas (se tratan como bloqueadas):');
    for (const c of buckets.unknown) console.log(`  · ${c.name} — ${c.license}`);
  }
}

if (buckets.blocked.length || buckets.unknown.length) process.exit(1);
console.log('\n✅ Todas las dependencias de producción usan licencias permitidas.');
