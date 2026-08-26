#!/usr/bin/env node
/**
 * CANDADO DE INMUTABILIDAD del texto legal (COMMERCIAL-RC1, Fase 5).
 *
 * La regla que protege: **una versión legal publicada nunca se edita**.
 * Cambiar la prosa de `/terms` o `/privacy` exige publicar una versión nueva
 * en el registro del API. Sin este gate la regla era prosa; con él, es un
 * rojo de CI:
 *
 *   1. La entrada VIGENTE de cada documento en
 *      `apps/api/src/modules/legal/legal-documents.ts` lleva `contentHash`
 *      (SHA-256 del archivo fuente de la página) — se recalcula aquí y debe
 *      coincidir byte a byte.
 *   2. El espejo de presentación del web
 *      (`apps/web/src/lib/legal/legal-versions.ts`) declara la MISMA versión
 *      y fecha que el registro del API: la página no puede imprimir una
 *      versión que el servidor no reconozca.
 *   3. Cada página nombra su versión (usa `legalVersionLine`), de modo que el
 *      lector ve versión y fecha junto al texto.
 *
 * No ejecuta TypeScript: extrae los campos por forma del fuente. La forma la
 * fija este propio gate — si el registro cambia de sintaxis, el gate falla en
 * vez de aprobar en silencio (todo error de extracción es un fallo).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');

const failures = [];

const registrySource = read('apps/api/src/modules/legal/legal-documents.ts');
const mirrorSource = read('apps/web/src/lib/legal/legal-versions.ts');

/** Primera entrada (= vigente, contrato de `currentLegalDocument`) por doc. */
function currentEntry(documento) {
  const pattern = new RegExp(
    `\\{\\s*documento:\\s*'${documento}',\\s*version:\\s*'([0-9-]+)',\\s*publicadoEn:\\s*'([0-9-]+)',\\s*url:\\s*'([^']+)',\\s*requiereAceptacion:\\s*(true|false),\\s*contentHash:\\s*\\n?\\s*'([0-9a-f]{64})',`,
    'u',
  );
  const match = registrySource.match(pattern);
  if (!match) {
    failures.push(
      `registro: no se encontró la entrada vigente de "${documento}" con contentHash — ` +
        'la versión vigente debe llevar el candado.',
    );
    return null;
  }
  return {
    version: match[1],
    publicadoEn: match[2],
    url: match[3],
    contentHash: match[5],
  };
}

function mirrorEntry(documento) {
  const pattern = new RegExp(
    `${documento}:\\s*\\{\\s*version:\\s*"([0-9-]+)",\\s*publicadoEn:\\s*"([0-9-]+)"`,
    'u',
  );
  const match = mirrorSource.match(pattern);
  if (!match) {
    failures.push(`espejo web: falta la entrada de "${documento}".`);
    return null;
  }
  return { version: match[1], publicadoEn: match[2] };
}

const PAGE_BY_DOCUMENT = {
  terms: 'apps/web/src/app/terms/page.tsx',
  privacy: 'apps/web/src/app/privacy/page.tsx',
};

for (const documento of ['terms', 'privacy']) {
  const registry = currentEntry(documento);
  const mirror = mirrorEntry(documento);
  if (!registry || !mirror) continue;

  const pagePath = PAGE_BY_DOCUMENT[documento];
  const pageSource = read(pagePath);
  const actualHash = createHash('sha256')
    .update(readFileSync(path.join(root, pagePath)))
    .digest('hex');

  if (actualHash !== registry.contentHash) {
    failures.push(
      `${documento}: el texto de ${pagePath} cambió (sha256 ${actualHash.slice(0, 12)}…) ` +
        `pero el registro sigue candado a ${registry.contentHash.slice(0, 12)}… — ` +
        'publica una versión NUEVA en legal-documents.ts (entrada nueva al frente, ' +
        'con fecha y hash nuevos) y actualiza legal-versions.ts; una versión ' +
        'publicada nunca se edita.',
    );
  }
  if (mirror.version !== registry.version) {
    failures.push(
      `${documento}: la página imprime versión ${mirror.version} pero el registro ` +
        `del API dice ${registry.version} — deben coincidir.`,
    );
  }
  if (mirror.publicadoEn !== registry.publicadoEn) {
    failures.push(
      `${documento}: fecha de publicación ${mirror.publicadoEn} (web) ≠ ` +
        `${registry.publicadoEn} (API).`,
    );
  }
  if (!pageSource.includes(`legalVersionLine("${documento}")`)) {
    failures.push(
      `${documento}: la página ${pagePath} no imprime su versión ` +
        `(falta legalVersionLine("${documento}")).`,
    );
  }
}

if (failures.length) {
  console.error('Candado legal: FALLÓ');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  'Candado legal OK: versión vigente de terms y privacy con hash íntegro, ' +
    'versión visible en página y espejo web/API coincidente.',
);
