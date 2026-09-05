#!/usr/bin/env node
/**
 * GATE: el booleano del oráculo no puede afirmar más que su evidencia.
 *
 * QUÉ PROBLEMA RESUELVE. `externalOracleVerified` es el ÚNICO booleano entre
 * «laboratorio» y el botón «Exportar DWG» encendido, y hasta el 2026-09-02
 * estaba escrito a mano en `apps/web/src/lib/cad/dwg-export-flag.ts` SIN
 * ninguna conexión con la evidencia que dice representar. Dos cosas malas a la
 * vez:
 *
 *   - Nadie podía saber, sin abrir el JSON y contar a mano, si el `false` era
 *     honesto o simplemente viejo. Lo era: la evidencia committeada cubría 4
 *     casos y el harness ya definía 16 (el 2026-09-02; el número crece con
 *     cada clase escribible nueva, y por eso NO se escribe a mano en ningún
 *     mensaje de este gate: se deriva de `CASES`).
 *   - Y un `true` escrito por descuido habría abierto la exportación sin que
 *     ningún gate se quejara. Un booleano que sólo se puede verificar leyéndolo
 *     no es una salvaguarda, es una nota.
 *
 * QUÉ HACE ESTE GATE. Deriva los casos que la evidencia DEBE cubrir de la
 * lista real de casos del harness —no de una copia que podría quedarse atrás—,
 * incluyendo el gemelo `-publico` de cada uno, que es lo que ADR-0009 §8.2
 * exige de verdad: el oráculo tiene que haber leído lo que escribe la API
 * PÚBLICA, no sólo el writer interno.
 *
 * Luego:
 *   - FALLA si el booleano dice `true` y la evidencia no lo respalda —cobertura
 *     incompleta, algún caso no convertido, o alguna comparación que no
 *     coincide—. Sobreafirmar deja de ser posible.
 *   - NO falla si el booleano dice `false`: un gate conservador nunca es
 *     peligroso. Pero dice EXACTAMENTE cuánto cubre la evidencia, qué casos
 *     faltan y qué comando los produce, para que dejar de estar parado sea una
 *     decisión informada y no una arqueología.
 *
 * POR QUÉ NO SE DERIVA EL BOOLEANO DIRECTAMENTE DEL JSON. Porque
 * `dwg-export-flag.ts` es código de producto y la evidencia vive en `docs/`:
 * importarla ataría el bundle del navegador a un artefacto de gobernanza. El
 * booleano se queda donde está y este gate lo mantiene honesto, que es el
 * mismo reparto que ya usan los demás gates del laboratorio.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CASES } from "./oda-roundtrip-cases.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const EVIDENCE = path.join(
  REPO_ROOT,
  "docs",
  "cad",
  "evidence",
  "dwg-oda-roundtrip.json",
);
const FLAG_FILE = path.join(
  REPO_ROOT,
  "apps",
  "web",
  "src",
  "lib",
  "cad",
  "dwg-export-flag.ts",
);

const w = (line) => process.stdout.write(`${line}\n`);

/**
 * Lo que la evidencia tiene que cubrir: cada caso del harness Y su gemelo
 * público. Se deriva de `CASES` en vez de listarse aquí porque una lista
 * gemela se quedaría atrás en silencio la próxima vez que el writer aprenda
 * una clase — que es exactamente lo que le pasó a la evidencia.
 *
 * SE EXPORTA a propósito. El paquete de firma del encendido
 * (`check-firma-package.mjs`) tiene que enumerar los mismos casos que este
 * gate exige, y una segunda derivación —aunque hoy diera el mismo resultado—
 * es la cifra viviendo en dos lugares que la regla 4 de la campaña prohíbe.
 * Aquí está la única.
 */
export function casosExigidos() {
  return CASES.flatMap((c) => [c.name, `${c.name}-publico`]);
}

/**
 * Cuánto de lo exigido respalda un reporte del oráculo, y qué falta con su
 * motivo. Devuelve datos, no texto: quien llama decide cómo los enseña.
 *
 * Un caso cuenta sólo si el conversor AJENO lo convirtió Y la comparación
 * campo a campo coincidió. Convertirlo sin cotejarlo no prueba nada: el
 * conversor podría estar escribiendo un DXF vacío.
 */
export function coberturaDelOraculo(reporte) {
  const casos = Array.isArray(reporte?.casos) ? reporte.casos : [];
  const porNombre = new Map(casos.map((c) => [c.nombre, c]));

  const aprobado = (nombre) => {
    const c = porNombre.get(nombre);
    if (!c) return { cubierto: false, motivo: "no está en el reporte" };
    if (c.oraculo?.convertido !== true)
      return { cubierto: false, motivo: "el oráculo no lo convirtió" };
    if (c.comparacion?.coincide !== true)
      return { cubierto: false, motivo: "la comparación campo a campo no coincide" };
    return { cubierto: true };
  };

  const esperados = casosExigidos();
  const faltan = [];
  for (const nombre of esperados) {
    const r = aprobado(nombre);
    if (!r.cubierto) faltan.push({ nombre, motivo: r.motivo });
  }
  return { esperados, faltan, cubiertos: esperados.length - faltan.length };
}

/** El valor que declara el producto, leído del fuente sin ejecutarlo. */
export function leerBooleanoDelProducto() {
  const src = fs.readFileSync(FLAG_FILE, "utf8");
  const match = src.match(/externalOracleVerified:\s*(true|false)/);
  if (!match) {
    process.stderr.write(
      `check-oracle-evidence: no se encuentra externalOracleVerified en ${path.relative(REPO_ROOT, FLAG_FILE)}\n`,
    );
    process.exit(1);
  }
  return match[1] === "true";
}

function main() {
  const declarado = leerBooleanoDelProducto();

  if (!fs.existsSync(EVIDENCE)) {
    if (declarado) {
      process.stderr.write(
        "check-oracle-evidence: el producto declara externalOracleVerified=true y NO existe el reporte del oráculo.\n",
      );
      process.exit(1);
    }
    w("check-oracle-evidence: sin reporte del oráculo y el producto no afirma nada. Coherente.");
    return;
  }

  const reporte = JSON.parse(fs.readFileSync(EVIDENCE, "utf8"));
  const { esperados, faltan, cubiertos } = coberturaDelOraculo(reporte);

  w(`check-oracle-evidence: evidencia de ${path.relative(REPO_ROOT, EVIDENCE)}`);
  w(`  generada            : ${reporte.generadoEn ?? "(sin fecha)"}`);
  w(`  casos exigidos      : ${esperados.length} (cada caso del harness y su gemelo -publico)`);
  w(`  casos respaldados   : ${cubiertos}`);
  w(`  producto declara    : externalOracleVerified = ${declarado}`);

  if (faltan.length > 0) {
    w(`  SIN RESPALDO (${faltan.length}):`);
    for (const f of faltan) w(`    - ${f.nombre} (${f.motivo})`);
  }

  // SOBREAFIRMAR ES IMPOSIBLE: si el producto dice que sí y la evidencia no lo
  // sostiene, esto es rojo. Es la mitad que protege al usuario.
  if (declarado && faltan.length > 0) {
    process.stderr.write(
      `\ncheck-oracle-evidence: el producto declara externalOracleVerified=true pero ${faltan.length} de ${esperados.length} casos no están respaldados por el oráculo.\n` +
        "Vuelve a correr el harness y committea el reporte, o devuelve el booleano a false.\n",
    );
    process.exit(1);
  }

  // INFRAAFIRMAR NO ES PELIGROSO, pero sí es información: si la evidencia YA
  // alcanza, decirlo con todas las letras es lo que convierte «llevamos meses
  // parados» en «queda un commit».
  if (!declarado && faltan.length === 0) {
    w("");
    w(`  ✔ LA EVIDENCIA YA ALCANZA. Los ${esperados.length} casos están respaldados por el lector`);
    w("    ajeno y el producto sigue declarando false por conservadurismo.");
    w(`    Para abrir la exportación: poner externalOracleVerified en true en`);
    w(`    ${path.relative(REPO_ROOT, FLAG_FILE)} y volver a correr este gate.`);
    return;
  }

  if (!declarado) {
    w("");
    w("  La exportación sigue cerrada, y con razón: la evidencia no cubre todos");
    w("  los casos. Para producirla, en una máquina con ODA File Converter:");
    w("");
    w("    export ODA_FILE_CONVERTER=/ruta/a/ODAFileConverter   # o .exe en Windows");
    w("    export VALLE_DWG_CORPUS_MIRROR=/ruta/al/repo/de/conformidad");
    w("    node scripts/dwg/oda-roundtrip.mjs");
    w("    git add docs/cad/evidence/dwg-oda-roundtrip.json && git commit");
    w("");
    w(`  El harness escribe los ${esperados.length} casos, los hace convertir y coteja el DXF`);
    w("  campo a campo. Ninguna prueba propia puede sustituirlo: nuestro lector");
    w("  acepta lo que nuestro writer escriba.");
    return;
  }

  w("");
  w("  ✔ El producto afirma lo que la evidencia sostiene.");
}

// Corre como gate sólo cuando se le invoca directamente: importarlo para
// reutilizar `casosExigidos` no debe ejecutar nada ni escribir en stdout.
const invocadoDirectamente =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;
if (invocadoDirectamente) main();
