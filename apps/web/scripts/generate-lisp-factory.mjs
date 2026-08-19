#!/usr/bin/env node
/**
 * Empaqueta las rutinas `.lsp` de fábrica en un módulo TypeScript.
 *
 * ## Por qué hay un paso de generación y no un `import` del `.lsp`
 *
 * Las rutinas tienen que ser FICHEROS `.lsp` de verdad: se abren con un editor
 * de texto, se copian al despacho, se comparan con las que el estudio ya tenía y
 * se editan sin recompilar nada. Un `.lsp` metido dentro de una plantilla de
 * TypeScript deja de ser eso.
 *
 * Pero el navegador no lee ficheros del disco, y hacer que el empaquetador
 * importe texto crudo ata el producto a una configuración concreta de bundler
 * —que cambia entre versiones y entre entornos de prueba—. Así que se genera un
 * módulo, y `factory.spec.ts` vuelve a leer los `.lsp` y falla si el módulo no
 * coincide byte a byte. La copia no puede envejecer en silencio.
 *
 *     node scripts/generate-lisp-factory.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const factoryDir = path.join(here, "..", "src", "lib", "lisp", "factory");
const target = path.join(factoryDir, "factory-library.ts");

/** Orden ALFABÉTICO, que es el mismo con el que la biblioteca autocarga. */
const files = fs
  .readdirSync(factoryDir)
  .filter((name) => name.endsWith(".lsp"))
  .sort();

if (files.length === 0) {
  console.error("No hay ficheros .lsp que empaquetar en", factoryDir);
  process.exit(1);
}

/** Texto normalizado a LF: un CRLF de Windows cambiaría la huella del fichero. */
function read(name) {
  return fs.readFileSync(path.join(factoryDir, name), "utf8").replaceAll("\r\n", "\n");
}

const entries = files
  .map((name) => {
    const source = read(name);
    const escaped = source.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
    return `  {\n    name: ${JSON.stringify(name)},\n    source: \`${escaped}\`,\n  },`;
  })
  .join("\n");

const header = `/**
 * Las rutinas de FÁBRICA, empaquetadas.
 *
 * GENERADO por \`scripts/generate-lisp-factory.mjs\` a partir de los ficheros
 * \`.lsp\` de esta carpeta. No se edita a mano: se edita el \`.lsp\` y se vuelve a
 * generar. \`factory.spec.ts\` compara los dos y falla si divergen.
 *
 * ## Qué son y por qué vienen puestas
 *
 * Un despacho que estrena un CAD no tiene todavía su biblioteca de rutinas, y
 * «se pueden cargar rutinas» no es una razón para cambiar de programa: la razón
 * es que el primer día ya haya algo que le ahorre una tarde. Estas cuatro
 * resuelven encargos que un arquitecto mexicano reconoce sin que nadie se los
 * explique: el cuadro de áreas, la tabla de puertas y ventanas, el recuento de
 * bloques y la numeración de ejes.
 *
 * Vienen además como CÓDIGO LEGIBLE y no como comandos nativos a propósito: son
 * la plantilla con la que un despacho adapta las suyas. Si esto corre, las suyas
 * corren.
 */
export interface CadLispFactoryRoutine {
  name: string;
  source: string;
}

/** Las rutinas de fábrica, en el mismo orden alfabético en que autocargan. */
export const CAD_LISP_FACTORY_ROUTINES: readonly CadLispFactoryRoutine[] = [
${entries}
];
`;

fs.writeFileSync(target, header, "utf8");
console.log(`factory-library.ts regenerado con ${files.length} rutinas: ${files.join(", ")}`);
