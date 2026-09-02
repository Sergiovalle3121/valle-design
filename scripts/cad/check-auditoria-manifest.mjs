#!/usr/bin/env node
/**
 * Trinquete de las pruebas de auditoría.
 *
 * ## Por qué existe
 *
 * `apps/web/e2e/auditoria/` está EXCLUIDA de la suite (`testIgnore` en
 * `playwright.config.ts`) porque sus pruebas están rojas a propósito: cada una
 * reproduce en el navegador un defecto confirmado y seguirá roja hasta que ese
 * defecto se arregle. Meterlas en la suite dejaría el veredicto en rojo
 * permanente, que es exactamente cómo se pierde un veredicto — cuando siempre
 * está rojo, deja de mirarse.
 *
 * Pero una carpeta de pruebas excluida se pudre EN SILENCIO, y esa es la misma
 * enfermedad: 47 suites del web vivían sin runner hasta que alguien las contó.
 * Así que la exclusión no viaja sola. Este gate exige tres cosas:
 *
 *  1. **Nada sin declarar.** Cada `.spec.ts` de la carpeta tiene que estar en
 *     `manifiesto.json` diciendo QUÉ defecto reproduce. Un archivo que aparece
 *     ahí sin entrada es una prueba que nadie sabe por qué está roja.
 *  2. **Nada declarado que no exista.** Una entrada sin archivo es un defecto
 *     que se dio por vivo cuando su prueba ya no está.
 *  3. **La lista SÓLO ENCOGE.** El `techo` es el número de pruebas pendientes
 *     de graduarse. Cuando un defecto se arregla, su prueba no se borra: se
 *     MUDA a `e2e/golden/` y pasa a defender el arreglo, y el techo baja con
 *     ella. Subirlo pide una auditoría nueva y su entrada en la bitácora.
 *
 * No comprueba que las pruebas fallen: eso lo dice correrlas, y algunas
 * (`00-arranque`, `planta`, `precision`) están en verde a propósito, marcadas
 * `impacto: "arnes"`, porque son el terreno y la prueba de que el recorrido
 * bueno sigue bueno mientras se arregla lo demás.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const carpeta = path.join(raiz, "apps/web/e2e/auditoria");
const rutaManifiesto = path.join(carpeta, "manifiesto.json");

const IMPACTOS = new Set([
  "bloquea_el_trabajo",
  "molesta_mucho",
  "molesta_poco",
  "arnes",
]);

const fallos = [];

let manifiesto;
try {
  manifiesto = JSON.parse(readFileSync(rutaManifiesto, "utf8"));
} catch (causa) {
  console.error(
    `Gate de auditoría: no se pudo leer ${path.relative(raiz, rutaManifiesto)} — ${causa.message}`,
  );
  process.exit(1);
}

const enDisco = readdirSync(carpeta)
  .filter((f) => f.endsWith(".spec.ts"))
  .sort();

const declaradas = Array.isArray(manifiesto.pruebas) ? manifiesto.pruebas : [];
const porArchivo = new Map();
for (const [i, entrada] of declaradas.entries()) {
  const prefijo = `manifiesto.json pruebas[${i}]`;
  if (typeof entrada?.archivo !== "string" || !entrada.archivo)
    fallos.push(`${prefijo}: falta "archivo"`);
  else if (porArchivo.has(entrada.archivo))
    fallos.push(`${prefijo}: "${entrada.archivo}" declarado dos veces`);
  else porArchivo.set(entrada.archivo, entrada);
  // El motivo es la razón de ser de la entrada: sin él, la exclusión vuelve a
  // ser silenciosa aunque el archivo esté listado.
  if (typeof entrada?.reproduce !== "string" || entrada.reproduce.trim().length < 20)
    fallos.push(
      `${prefijo}: "reproduce" tiene que decir QUÉ defecto reproduce, con frase entera`,
    );
  if (!IMPACTOS.has(entrada?.impacto))
    fallos.push(
      `${prefijo}: "impacto" debe ser uno de ${[...IMPACTOS].join(", ")}`,
    );
}

for (const archivo of enDisco)
  if (!porArchivo.has(archivo))
    fallos.push(
      `${archivo} está en e2e/auditoria/ y NO en el manifiesto: una prueba roja que nadie sabe por qué lo está. Declárela con su defecto.`,
    );

for (const archivo of porArchivo.keys())
  if (!enDisco.includes(archivo))
    fallos.push(
      `${archivo} está en el manifiesto y NO en disco: si se graduó a e2e/golden/, quítela de aquí y baje el techo.`,
    );

const techo = Number(manifiesto.techo);
if (!Number.isInteger(techo) || techo < 0)
  fallos.push('manifiesto.json: "techo" debe ser un entero no negativo');
else if (enDisco.length > techo)
  fallos.push(
    `Hay ${enDisco.length} pruebas de auditoría y el techo es ${techo}. Esta lista SÓLO ENCOGE: ` +
      "una prueba se va de aquí cuando su defecto se arregla y ella se muda a e2e/golden/. " +
      "Subir el techo pide una auditoría nueva y su entrada en docs/governance/assisted-development-log.json.",
  );
else if (enDisco.length < techo)
  fallos.push(
    `Hay ${enDisco.length} pruebas de auditoría y el techo sigue en ${techo}. ` +
      "Baje el techo a la cuenta real: un trinquete que no se aprieta no es un trinquete.",
  );

if (fallos.length > 0) {
  console.error("Gate de auditoría: FALLÓ");
  for (const f of fallos) console.error(`- ${f}`);
  process.exit(1);
}

const porImpacto = new Map();
for (const e of declaradas)
  porImpacto.set(e.impacto, (porImpacto.get(e.impacto) ?? 0) + 1);
const resumen = [...porImpacto.entries()]
  .sort()
  .map(([k, v]) => `${k}: ${v}`)
  .join(", ");
console.log(
  `Gate de auditoría: OK (${enDisco.length} pruebas declaradas, techo ${techo}; ${resumen})`,
);
