#!/usr/bin/env node
/**
 * GATE: el booleano del oráculo no puede afirmar más que su evidencia.
 *
 * QUÉ PROBLEMA RESUELVE. `externalOracleVerified` es una de las condiciones
 * entre «laboratorio» y el botón «Exportar DWG» encendido, y hasta el 2026-09-02
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
 *     incompleta, algún caso no convertido, comparación distinta o ausencia de
 *     derechos, procedencia independiente y hash del comparador—.
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
import { createHash } from "node:crypto";
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
const SHA256 = /^[a-f0-9]{64}$/i;
const COMPARADOR_VERSION = "dwg-oda-roundtrip-v1";
const FUENTES_COMPARADOR = [
  "oda-roundtrip.mjs",
  "dxf-oracle.mjs",
  "oda-roundtrip-cases.mjs",
];
const texto = (valor) => typeof valor === "string" && valor.trim().length > 0;
const hash = (valor) => typeof valor === "string" && SHA256.test(valor);

/** Huella del código que compara el DXF, sus expectativas y el harness. */
export function comparadorEsperado() {
  const digest = createHash("sha256");
  for (const nombre of FUENTES_COMPARADOR) {
    digest.update(`${nombre}\0`);
    // Git puede materializar CRLF en Windows: la huella describe la fuente,
    // no la configuración local de saltos de línea del checkout.
    digest.update(fs.readFileSync(path.join(here, nombre), "utf8").replace(/\r\n/g, "\n"));
    digest.update("\0");
  }
  return { version: COMPARADOR_VERSION, sha256: digest.digest("hex") };
}

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
 * Una conversión técnica cuenta si el conversor AJENO convirtió el caso Y la
 * comparación campo a campo coincidió. Es un recuento histórico, NO permiso
 * para encender exportación. Convertir sin cotejar no prueba nada.
 */
export function coberturaTecnicaDelOraculo(reporte) {
  const casos = Array.isArray(reporte?.casos)
    ? reporte.casos.filter((c) => c && typeof c === "object")
    : [];
  const porNombre = new Map(casos.map((c) => [c.nombre, c]));

  const aprobado = (nombre) => {
    const c = porNombre.get(nombre);
    if (!c) return { cubierto: false, motivo: "no está en el reporte" };
    if (c.oraculo?.consultado !== true)
      return { cubierto: false, motivo: "el oráculo no fue consultado" };
    if (c.oraculo?.convertido !== true)
      return { cubierto: false, motivo: "el oráculo no lo convirtió" };
    if (c.comparacion?.coincide !== true)
      return { cubierto: false, motivo: "la comparación campo a campo no coincide" };
    if (!Array.isArray(c.comparacion?.discrepancias) || c.comparacion.discrepancias.length !== 0)
      return { cubierto: false, motivo: "hay discrepancias sin resolver" };
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

/**
 * Atestación exigida para PROMOVER una conversión externa. El gate verifica
 * campos, hashes y vínculos internos; la fuente de derechos y la independencia
 * del proveedor siguen requiriendo revisión humana. En particular, «gratuito»
 * o «licencia propia» no prueban uso comercial ni permiso para redistribuir
 * el reporte y los artefactos convertidos.
 */
function problemaDeAcreditacion(reporte) {
  const derechos = reporte?.acreditacion?.derechos;
  if (
    !texto(derechos?.titular) ||
    !texto(derechos?.licencia) ||
    /^(?:unknown|desconocid[oa]?|noassertion|pendiente|gratis|gratuito|free)$/i.test(
      derechos.licencia.trim(),
    ) ||
    !texto(derechos?.fuente) ||
    !hash(derechos?.fuenteSha256) ||
    derechos?.usoComercialPermitido !== true ||
    derechos?.redistribucionDeResultadosPermitida !== true ||
    !texto(derechos?.revisadoPor) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(derechos?.revisadoEn ?? "")
  ) {
    return "faltan derechos explícitos de uso comercial y redistribución, con fuente y revisión humana";
  }
  if (reporte?.acreditacion?.version !== 1) {
    return "falta la versión de la acreditación de evidencia";
  }

  const validador = reporte?.acreditacion?.validador;
  if (
    !texto(validador?.herramienta) ||
    !texto(validador?.proveedor) ||
    !texto(validador?.version) ||
    !texto(validador?.origen) ||
    !hash(validador?.binarioSha256) ||
    validador?.independienteDeValle !== true ||
    validador?.herramienta !== reporte?.conversor?.herramienta ||
    validador?.version !== reporte?.conversor?.version ||
    validador?.binarioSha256 !== reporte?.conversor?.binarioSha256 ||
    reporte?.conversor?.exitCode !== 0 ||
    reporte?.conversor?.timeout !== false
  ) {
    return "falta procedencia del validador independiente, o no coincide con el conversor ejecutado";
  }

  const comparador = reporte?.acreditacion?.comparador;
  const actual = comparadorEsperado();
  if (
    comparador?.version !== actual.version ||
    comparador?.sha256 !== actual.sha256
  ) {
    return "falta versión/hash del comparador actual (el reporte puede ser anterior al código)";
  }
  if (reporte?.disponibilidadEnProducto !== false) {
    return "el reporte no conserva la frontera de exportación DWG apagada";
  }
  return null;
}

/** Cobertura admisible para `externalOracleVerified`, no mero éxito técnico. */
export function coberturaDelOraculo(reporte) {
  const tecnica = coberturaTecnicaDelOraculo(reporte);
  const problema = problemaDeAcreditacion(reporte);
  const casos = Array.isArray(reporte?.casos)
    ? reporte.casos.filter((c) => c && typeof c === "object")
    : [];
  const ocurrencias = new Map();
  for (const c of casos) ocurrencias.set(c?.nombre, (ocurrencias.get(c?.nombre) ?? 0) + 1);
  const porNombre = new Map(casos.map((c) => [c.nombre, c]));
  const motivosTecnicos = new Map(tecnica.faltan.map((f) => [f.nombre, f.motivo]));
  const validadorSha256 = reporte?.acreditacion?.validador?.binarioSha256;
  const comparador = reporte?.acreditacion?.comparador;

  const faltan = [];
  for (const nombre of tecnica.esperados) {
    const c = porNombre.get(nombre);
    let motivo = motivosTecnicos.get(nombre);
    if (!motivo && ocurrencias.get(nombre) !== 1) motivo = "nombre de caso duplicado";
    if (!motivo) motivo = problema;
    if (
      !motivo &&
      (!hash(c.dwgSha256) ||
        !hash(c.oraculo?.dxfSha256) ||
        c.oraculo?.validadorSha256 !== validadorSha256 ||
        c.comparacion?.dwgSha256 !== c.dwgSha256 ||
        c.comparacion?.dxfSha256 !== c.oraculo?.dxfSha256 ||
        c.comparacion?.comparadorVersion !== comparador.version ||
        c.comparacion?.comparadorSha256 !== comparador.sha256)
    ) {
      motivo = "los hashes DWG/DXF, validador o comparador no atan esta comparación";
    }
    if (motivo) faltan.push({ nombre, motivo });
  }
  return {
    esperados: tecnica.esperados,
    faltan,
    cubiertos: tecnica.esperados.length - faltan.length,
  };
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
  const tecnica = coberturaTecnicaDelOraculo(reporte);
  const { esperados, faltan, cubiertos } = coberturaDelOraculo(reporte);

  w(`check-oracle-evidence: evidencia de ${path.relative(REPO_ROOT, EVIDENCE)}`);
  w(`  generada            : ${reporte.generadoEn ?? "(sin fecha)"}`);
  w(`  casos exigidos      : ${esperados.length} (cada caso del harness y su gemelo -publico)`);
  w(`  conversiones cotejadas: ${tecnica.cubiertos}`);
  w(`  casos acreditados   : ${cubiertos}`);
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
    w(`  ✔ LA EVIDENCIA YA ALCANZA. Los ${esperados.length} casos tienen conversión,`);
    w("    cotejo y acreditación de derechos, validador y comparador.");
    w(`    Para superar ESTE gate: poner externalOracleVerified en true en`);
    w(`    ${path.relative(REPO_ROOT, FLAG_FILE)} y volver a correr este gate.`);
    return;
  }

  if (!declarado) {
    w("");
    w("  La exportación sigue cerrada: faltan casos convertidos/cotejados o");
    w("  acreditación explícita de derechos, procedencia y comparador. El arnés");
    w("  actual no emite aún esa acreditación: antes de usar un validador,");
    w("  verificar permisos; después registrar sus hashes, los hashes DWG/DXF");
    w("  por caso y la versión/hash del comparador junto con el resultado.");
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
