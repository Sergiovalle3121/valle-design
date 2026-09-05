#!/usr/bin/env node
/**
 * GATE: el paquete de firma del encendido no puede afirmar más que su evidencia,
 * ni enumerar casos que el arnés no tiene.
 *
 * QUÉ PROBLEMA RESUELVE. `docs/cad/evidence/dwg-firma-encendido-20260904.md` es el
 * documento que el titular lee ANTES de encender `DWG_IMPORT_FLAG` y
 * `DWG_EXPORT_FLAG`. Un documento así falla siempre de las dos mismas maneras, y
 * las dos son silenciosas:
 *
 *   1. **Envejece.** Se escribe con las cifras del día que se redactó —«el writer
 *      regraba 284 de 327»— y seis semanas después el writer aprendió dos clases
 *      más y el documento sigue diciendo la cifra vieja. Nadie lo nota porque nada
 *      la compara con nada. La regla 4 de la campaña de cimientos lo prohíbe con
 *      todas sus letras: «ninguna cifra vive en dos lugares; los informes ENLAZAN,
 *      no copian; una cifra escrita a mano en un doc es un defecto aunque hoy
 *      coincida».
 *   2. **Miente sobre la lista de pasos.** El titular corre el ODA File Converter
 *      sobre los casos que el arnés define. Si el documento los copia a mano, el
 *      día que `CASES` crece el titular corre una lista incompleta, cree que
 *      terminó, y la evidencia queda con un hueco que ningún gate ve — que es
 *      EXACTAMENTE lo que le pasó a `dwg-oda-roundtrip.json`, committeado con
 *      cuatro casos mientras el arnés ya definía muchos más.
 *
 * CÓMO LO RESUELVE. El documento no escribe cifras: lleva BLOQUES GENERADOS,
 * delimitados por comentarios HTML, que este script produce a partir de los
 * artefactos de evidencia y de las fuentes del producto. `--check` los regenera y
 * exige igualdad exacta; `--write` los reescribe. Es el mismo reparto que ya usa
 * `scripts/cad/rubric.mjs --markdown --check` para la matriz competitiva.
 *
 * Y añade tres reglas que un bloque generado no puede dar por sí solo:
 *
 *   - **Los casos se DERIVAN.** Cualquier caso nombrado en la prosa —la forma
 *     `caso ‹nombre›` entre acentos graves— tiene que existir en `CASES`, y todo
 *     caso de `CASES` tiene que aparecer nombrado al menos una vez. Inventar uno
 *     y saltarse uno fallan los dos.
 *   - **Ninguna cifra de cobertura a mano.** Fuera de los bloques generados, un
 *     porcentaje, una fracción `N/M`, un «N de M» o un «N entidades/casos/clases…»
 *     es un defecto: esa cifra tiene un dueño y hay que enlazarlo.
 *   - **Las banderas siguen apagadas.** Si el documento se publica cuando alguna
 *     de las dos ya está encendida, deja de ser un paquete de firma y pasa a ser
 *     una justificación a posteriori. Este gate falla en ese caso.
 *
 * LO QUE ESTE GATE NO HACE. No enciende nada, no juzga si la evidencia ALCANZA
 * —eso es `check-oracle-evidence.mjs`, que sigue diciendo `false`— y no corre el
 * corpus: lee sólo artefactos committeados, así que da el mismo resultado en
 * cualquier máquina, con espejo del corpus o sin él.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CASES } from "./oda-roundtrip-cases.mjs";
import { casosExigidos, coberturaDelOraculo } from "./check-oracle-evidence.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const rel = (p) => path.relative(REPO_ROOT, p).split(path.sep).join("/");
const desde = (...partes) => path.join(REPO_ROOT, ...partes);

export const DOCUMENTO = desde(
  "docs",
  "cad",
  "evidence",
  "dwg-firma-encendido-20260904.md",
);

/** Los artefactos de los que sale cada cifra. Ninguno se corre: se leen. */
const EVIDENCIA = {
  reescritura: desde("docs", "cad", "evidence", "dwg-corpus-rewrite.json"),
  lectura: desde("docs", "cad", "evidence", "dwg-corpus-validation.json"),
  oraculo: desde("docs", "cad", "evidence", "dwg-oda-roundtrip.json"),
};

/** Las fuentes de PRODUCTO que el documento describe, leídas sin ejecutarlas. */
const FUENTES = {
  perfil: desde("apps", "web", "src", "lib", "cad", "dwg-native-reader.ts"),
  banderaImportacion: desde("apps", "web", "src", "lib", "cad", "dwg-interop-flag.ts"),
  banderaExportacion: desde("apps", "web", "src", "lib", "cad", "dwg-export-flag.ts"),
};

const leerTexto = (p) => fs.readFileSync(p, "utf8");
const leerJson = (p) => JSON.parse(leerTexto(p));

// ---------------------------------------------------------------------------
// Lectura de las fuentes de producto
//
// Por qué se PARSEA el fuente en vez de importarlo: son módulos TypeScript del
// bundle del navegador y este gate corre en Node sin transpilador. Parsear un
// `const` congelado es frágil sólo si el fuente cambia de forma — y si cambia de
// forma, este gate falla RUIDOSAMENTE en vez de callarse, que es lo que se
// quiere de un gate que vigila una bandera.
// ---------------------------------------------------------------------------

/** Las clases que el perfil de importación del producto deja pasar. */
export function perfilDeImportacion(src = leerTexto(FUENTES.perfil)) {
  const bloque = src.match(
    /BETA_PROFILE_ENTITY_KINDS\s*=\s*new Set<[^>]*>\(\[([\s\S]*?)\]\)/,
  );
  if (!bloque) {
    throw new Error(
      `check-firma-package: no se encuentra BETA_PROFILE_ENTITY_KINDS en ${rel(FUENTES.perfil)}`,
    );
  }
  return [...bloque[1].matchAll(/"([a-zA-Z0-9]+)"/g)].map((m) => m[1]);
}

/** El valor literal de una bandera `export const X: boolean = …;`. */
export function banderaDeclarada(src, nombre) {
  const m = src.match(new RegExp(`export const ${nombre}\\s*:\\s*boolean\\s*=\\s*(true|false)`));
  if (!m) throw new Error(`check-firma-package: no se encuentra la bandera ${nombre}`);
  return m[1] === "true";
}

/** Los campos de un `Object.freeze({ … })` exportado, en su orden de fuente. */
export function objetoCongelado(src, nombre) {
  const m = src.match(
    new RegExp(`export const ${nombre}[^=]*=\\s*Object\\.freeze\\(\\{([\\s\\S]*?)\\}\\)`),
  );
  if (!m) throw new Error(`check-firma-package: no se encuentra el objeto ${nombre}`);
  const campos = new Map();
  for (const linea of m[1].split("\n")) {
    const par = linea.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(true|false|-?\d+|"[^"]*")\s*,?\s*$/);
    if (par) campos.set(par[1], par[2].replace(/^"|"$/g, ""));
  }
  return campos;
}

const si = (v) => (v === "true" || v === true ? "sí" : "no");

// ---------------------------------------------------------------------------
// Los generadores. Uno por bloque; cada uno devuelve el CUERPO del bloque, sin
// sus delimitadores. Todos son puros respecto del disco: reciben lo que leen.
// ---------------------------------------------------------------------------

/** Estado de las dos banderas y de sus gates, leído del fuente de producto. */
function bloqueBanderas() {
  const impSrc = leerTexto(FUENTES.banderaImportacion);
  const expSrc = leerTexto(FUENTES.banderaExportacion);
  const impGates = objetoCongelado(impSrc, "DWG_PROMOTION_GATES");
  const expGates = objetoCongelado(expSrc, "DWG_EXPORT_GATES");
  const perfilImp = impSrc.match(/profile:\s*"([A-Z0-9_]+)"/);
  const perfilExp = expSrc.match(/profile:\s*"([A-Z0-9_]+)"/);

  const filas = [
    "| Bandera | Valor hoy | Perfil autorizado | Fuente |",
    "| --- | --- | --- | --- |",
    `| \`DWG_IMPORT_FLAG\` | \`${banderaDeclarada(impSrc, "DWG_IMPORT_FLAG")}\` | \`${perfilImp?.[1] ?? "(sin perfil)"}\` | \`${rel(FUENTES.banderaImportacion)}\` |`,
    `| \`DWG_EXPORT_FLAG\` | \`${banderaDeclarada(expSrc, "DWG_EXPORT_FLAG")}\` | \`${perfilExp?.[1] ?? "(sin perfil)"}\` | \`${rel(FUENTES.banderaExportacion)}\` |`,
    "",
    "Encender la bandera no abre la puerta: las dos son condición NECESARIA y nunca",
    "suficiente, y la conjunción se evalúa contra estos gates declarados.",
    "",
    "| Gate de importación (`DWG_PROMOTION_GATES`) | Declarado |",
    "| --- | --- |",
  ];
  for (const [k, v] of impGates) filas.push(`| \`${k}\` | \`${v}\` |`);
  filas.push("", "| Gate de exportación (`DWG_EXPORT_GATES`) | Declarado |", "| --- | --- |");
  for (const [k, v] of expGates) filas.push(`| \`${k}\` | \`${v}\` |`);
  return filas.join("\n");
}

/** Los dos veredictos medidos, literales, y el corpus sobre el que se midieron. */
function bloqueVeredicto() {
  const rew = leerJson(EVIDENCIA.reescritura);
  const val = leerJson(EVIDENCIA.lectura);
  const corpus = rew.corpus ?? {};
  return [
    `**El lector, sobre material ajeno** — \`${rel(EVIDENCIA.lectura)}\`:`,
    "",
    `> ${val.veredicto}`,
    "",
    `**El writer, sobre el mismo material ajeno** — \`${rel(EVIDENCIA.reescritura)}\`:`,
    "",
    `> ${rew.veredicto}`,
    "",
    "**El corpus sobre el que se midieron las dos cosas**, fijado por su commit y el",
    "hash de su índice, no por su ruta en una máquina:",
    "",
    `- commit: \`${corpus.commit ?? "(sin fijar)"}\``,
    `- \`indexSha256\`: \`${corpus.indexSha256 ?? "(sin fijar)"}\``,
    `- transporte: \`${corpus.transporte ?? "(sin transporte)"}\``,
    `- bundles admitidos: ${(corpus.bundles ?? []).map((b) => `\`${b.id}\` (${b.version})`).join(", ")}`,
    "",
    "**El límite que las dos mediciones declaran de sí mismas**:",
    "",
    `> ${rew.limiteDeclarado}`,
  ].join("\n");
}

/**
 * La matriz de soporte por clase: qué viaja de entrada, qué deja pasar el perfil
 * del producto, qué viaja de salida y con qué límite. Las tres columnas salen de
 * sitios DISTINTOS a propósito —dos artefactos medidos y una fuente de producto—
 * porque el hueco interesante está justo entre ellas: una clase que el lector lee
 * y el perfil no admite es una pérdida del PRODUCTO, no del laboratorio.
 */
function bloqueMatriz() {
  const rew = leerJson(EVIDENCIA.reescritura);
  const val = leerJson(EVIDENCIA.lectura);
  const perfil = new Set(perfilDeImportacion());

  const clases = [
    ...new Set([...Object.keys(val.matrizEntidades ?? {}), ...Object.keys(rew.matrizPorClase ?? {})]),
  ].sort((a, b) => a.localeCompare(b, "es"));

  const filas = [
    "| Clase | Lectura (lab, material ajeno) | ¿En el perfil de importación? | Escritura (writer, material ajeno) | Anclada al DXF del oráculo | Límite declarado |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const clase of clases) {
    const l = val.matrizEntidades?.[clase];
    const w = rew.matrizPorClase?.[clase];
    const lectura = l
      ? `${l.leidoCorrecto}/${l.esperado}` +
        (l.geometriaDistinta || l.faltante || l.inesperado
          ? ` (distinta ${l.geometriaDistinta}, falta ${l.faltante}, sobra ${l.inesperado})`
          : "")
      : "—";
    const escritura = w ? `${w.estado} · ${w.escritas}/${w.vistas}` : "—";
    const anclada = w ? `${w.ancladasAlOraculo}/${w.declaradasPorOraculo}` : "—";
    const codigos = [
      ...new Set((w?.motivos ?? []).map((m) => (m.match(/^([A-Z_]+):/) ?? [, m])[1])),
    ];
    const limite = codigos.length > 0 ? codigos.map((c) => `\`${c}\``).join(", ") : "—";
    filas.push(
      `| \`${clase}\` | ${lectura} | ${perfil.has(clase) ? "sí" : "no"} | ${escritura} | ${anclada} | ${limite} |`,
    );
  }
  filas.push(
    "",
    "«¿En el perfil de importación?» sale de `BETA_PROFILE_ENTITY_KINDS` en",
    `\`${rel(FUENTES.perfil)}\`: un \`no\` con lectura completa es una clase que el`,
    "laboratorio SÍ decodifica y que el producto descarta a propósito, con su pérdida",
    "declarada — no un defecto del lector.",
  );
  return filas.join("\n");
}

/** Cuánto respalda hoy el oráculo externo, derivado del mismo cálculo del gate. */
function bloqueCobertura() {
  const reporte = fs.existsSync(EVIDENCIA.oraculo) ? leerJson(EVIDENCIA.oraculo) : { casos: [] };
  const { esperados, faltan, cubiertos } = coberturaDelOraculo(reporte);
  const filas = [
    `- artefacto: \`${rel(EVIDENCIA.oraculo)}\` (generado ${reporte.generadoEn ?? "(sin fecha)"})`,
    `- conversor: ${reporte.resumen?.lectoresExternosAutorizados?.map((l) => `${l.herramienta} ${l.version}`).join(", ") ?? "(ninguno)"}`,
    `- casos exigidos: ${esperados.length} · respaldados: ${cubiertos} · sin respaldo: ${faltan.length}`,
    "",
  ];
  if (faltan.length > 0) {
    filas.push("Sin respaldo del conversor ajeno, con su motivo:", "");
    for (const f of faltan) filas.push(`- \`${f.nombre}\` — ${f.motivo}`);
  } else {
    filas.push("Todos los casos exigidos están respaldados por el conversor ajeno.");
  }
  return filas.join("\n");
}

/**
 * Qué lleva cada caso, DEDUCIDO de su propia definición en el arnés. No hay un
 * campo «descripción» en `CASES` y no se le añade uno: una descripción escrita a
 * mano se separa del caso en cuanto alguien le añade una entidad.
 */
function loQueEjercita(caso) {
  const entidades = caso.options?.entities ?? [];
  const partes = [];
  const clases = [...new Set(entidades.map((e) => e.entity?.kind).filter(Boolean))].sort();
  partes.push(clases.length > 0 ? `entidades: ${clases.join(", ")}` : "sin entidades");
  const capas = caso.options?.layers ?? [];
  if (capas.length > 0) {
    const rasgos = [];
    if (capas.some((c) => c.linetypeName)) rasgos.push("con tipo de línea");
    if (capas.some((c) => c.frozen)) rasgos.push("congelada");
    if (capas.some((c) => c.locked)) rasgos.push("bloqueada");
    partes.push(`capas propias: ${capas.length}${rasgos.length ? ` (${rasgos.join(", ")})` : ""}`);
  }
  if ((caso.options?.linetypes ?? []).length > 0) partes.push("tabla de tipos de línea propia");
  if ((caso.options?.blocks ?? []).length > 0) partes.push(`bloques de usuario: ${caso.options.blocks.length}`);
  const conAtributos = entidades.filter((e) => (e.attributes ?? []).length > 0);
  if (conAtributos.length > 0)
    partes.push(`atributos en la inserción: ${conAtributos.reduce((n, e) => n + e.attributes.length, 0)}`);
  const enHoja = entidades.filter((e) => e.space === "paper");
  if (enHoja.length > 0) partes.push(`en espacio papel: ${enHoja.length}`);
  return partes.join(" · ");
}

/** Los pasos EXACTOS que el titular corre en su máquina, y sobre qué casos. */
function bloquePasos() {
  const exigidos = casosExigidos();
  const filas = [
    "```sh",
    "# 1. El conversor con licencia del titular. En Windows, la ruta del .exe.",
    "export ODA_FILE_CONVERTER=/ruta/a/ODAFileConverter",
    "",
    "# 2. El clon local del repositorio de conformidad. Sin esto los gates DWG",
    "#    mienten por entorno (AGENTS.md, costumbres operativas).",
    "export VALLE_DWG_CORPUS_MIRROR=/ruta/al/repo/valle-design-dwg-conformance",
    "",
    "# 3. El arnés: escribe cada caso con el writer INTERNO y con la API PÚBLICA,",
    "#    los hace convertir a DXF por el conversor ajeno y coteja campo a campo.",
    "node scripts/dwg/oda-roundtrip.mjs",
    "",
    "# 4. El gate vuelve a contar. Con todo respaldado dice «LA EVIDENCIA YA ALCANZA».",
    "npm run check:dwg-oraculo",
    "",
    "# 5. Sólo entonces, el commit del encendido — la sección «El commit del",
    "#    encendido, exacto» de esta misma página lo escribe paso por paso.",
    "git add docs/cad/evidence/dwg-oda-roundtrip.json",
    "```",
    "",
    `El paso 3 escribe **${exigidos.length}** archivos: cada caso del arnés y su gemelo`,
    "`-publico` —el que produce `writeCanonicalDwg`, la API que el producto usaría—.",
    "Cotejar sólo el writer interno dejaría sin medir justamente el camino público, que",
    "es el que ADR-0009 §8.2 exige.",
    "",
    "| # | Caso | Qué ejercita |",
    "| --- | --- | --- |",
  ];
  CASES.forEach((caso, i) => {
    filas.push(`| ${i + 1} | caso \`${caso.name}\` (+ \`${caso.name}-publico\`) | ${loQueEjercita(caso)} |`);
  });
  return filas.join("\n");
}

export const GENERADORES = Object.freeze({
  banderas: bloqueBanderas,
  veredicto: bloqueVeredicto,
  "matriz-por-clase": bloqueMatriz,
  "cobertura-del-oraculo": bloqueCobertura,
  "pasos-del-titular": bloquePasos,
});

// ---------------------------------------------------------------------------
// Los bloques dentro del documento
// ---------------------------------------------------------------------------

const abre = (clave) =>
  `<!-- generado:${clave} · lo produce scripts/dwg/check-firma-package.mjs --write; no se edita a mano -->`;
const cierra = (clave) => `<!-- /generado:${clave} -->`;

/**
 * La forma de un bloque. El cuerpo se captura hasta el cierre INCLUYENDO su
 * salto final, que luego se recorta: así un bloque recién puesto y todavía
 * VACÍO —`abre` y `cierra` pegados— también casa, y `--write` puede llenarlo.
 * Con un `\n` obligatorio a cada lado del cuerpo, el bloque vacío no casaba y
 * `--write` decía «ya estaba al día» sobre un documento sin una sola cifra.
 */
const nuevoReBloque = () =>
  /<!-- generado:([a-z0-9-]+)[^>]*-->\n([\s\S]*?)<!-- \/generado:\1 -->/g;

/** Todos los bloques presentes, en orden, con su cuerpo exacto. */
export function bloquesDelDocumento(texto) {
  const encontrados = [];
  for (const m of texto.matchAll(nuevoReBloque())) {
    encontrados.push({
      clave: m[1],
      cuerpo: m[2].replace(/\n$/, ""),
      entero: m[0],
      indice: m.index,
    });
  }
  return encontrados;
}

/** Reescribe cada bloque con lo que su generador produce hoy. */
export function reescribirBloques(texto, generadores = GENERADORES) {
  return texto.replace(nuevoReBloque(), (entero, clave) => {
    const gen = generadores[clave];
    if (!gen) return entero;
    return `${abre(clave)}\n${gen()}\n${cierra(clave)}`;
  });
}

// ---------------------------------------------------------------------------
// Las reglas
// ---------------------------------------------------------------------------

/** Quita los bloques generados: lo que queda es lo que una persona escribió. */
export function prosaDelDocumento(texto) {
  // Se sustituye por los MISMOS saltos de línea que ocupaba: el número de línea
  // que este gate reporta tiene que ser el del archivo, no el de un texto
  // recortado — quien lo lee va a abrir el documento en ese renglón.
  return texto.replace(nuevoReBloque(), (entero) =>
    "\n".repeat(entero.split("\n").length - 1),
  );
}

/**
 * Qué es «una cifra de cobertura escrita a mano». No es «cualquier número»: una
 * fecha, un número de ADR, `AC1015` o «16 MiB» son datos estables que no viven en
 * ningún artefacto de medición. Lo que se persigue es la forma de la AFIRMACIÓN
 * MEDIDA —un porcentaje, una fracción, un recuento de material— porque ésa sí
 * tiene dueño y envejece.
 */
export const FORMAS_DE_CIFRA = Object.freeze([
  { nombre: "porcentaje", re: /\d+(?:[.,]\d+)?\s*%/g },
  { nombre: "fracción N/M", re: /\b\d+\s*\/\s*\d+\b/g },
  { nombre: "«N de M»", re: /\b\d+\s+de\s+\d+\b/g },
  {
    nombre: "recuento de material medido",
    re: /\b\d+\s+(?:entidades?|casos?|clases?|fixtures?|bundles?|capas?|archivos?|discrepancias?|pruebas?|comprobaciones?)\b/gi,
  },
]);

export function cifrasEscritasAMano(texto) {
  const prosa = prosaDelDocumento(texto);
  const lineas = prosa.split("\n");
  const hallazgos = [];
  lineas.forEach((linea, i) => {
    for (const forma of FORMAS_DE_CIFRA) {
      for (const m of linea.matchAll(forma.re)) {
        hallazgos.push({ linea: i + 1, forma: forma.nombre, texto: m[0].trim() });
      }
    }
  });
  return hallazgos;
}

/**
 * Los casos que la prosa nombra. La forma es `caso ‹nombre›` con el nombre entre
 * acentos graves, y existe para que la comprobación sea EXACTA en vez de adivinar
 * qué token con guiones de un documento técnico pretendía ser un caso: en este
 * documento conviven `no-escribible`, `local-mirror` y `dwg-corpus-rewrite.json`,
 * y ninguno es un caso.
 */
export function casosNombrados(texto) {
  return [...texto.matchAll(/\bcasos?\s+`([^`]+)`/g)].map((m) => m[1]);
}

export function revisarCasos(texto, nombresDelArnes = CASES.map((c) => c.name)) {
  const validos = new Set(nombresDelArnes.flatMap((n) => [n, `${n}-publico`]));
  const nombrados = casosNombrados(texto);
  const inventados = [...new Set(nombrados.filter((n) => !validos.has(n)))];
  const conjunto = new Set(nombrados.map((n) => n.replace(/-publico$/, "")));
  const omitidos = nombresDelArnes.filter((n) => !conjunto.has(n));
  return { nombrados, inventados, omitidos };
}

// ---------------------------------------------------------------------------
// El gate
// ---------------------------------------------------------------------------

const w = (linea) => process.stdout.write(`${linea}\n`);

/**
 * Un paquete de firma describe una decisión PENDIENTE. Publicado con la
 * decisión ya tomada deja de ser el documento que el titular lee antes de
 * firmar y pasa a ser la explicación de por qué se firmó — que es el orden
 * inverso, y el que ADR-0007 y ADR-0009 prohíben para estas dos banderas.
 */
export function revisarBanderas(fuenteImportacion, fuenteExportacion) {
  const problemas = [];
  if (banderaDeclarada(fuenteImportacion, "DWG_IMPORT_FLAG"))
    problemas.push(
      "DWG_IMPORT_FLAG ya está encendida: el paquete de firma dejó de describir una decisión pendiente",
    );
  if (banderaDeclarada(fuenteExportacion, "DWG_EXPORT_FLAG"))
    problemas.push(
      "DWG_EXPORT_FLAG ya está encendida: el paquete de firma dejó de describir una decisión pendiente",
    );
  return problemas;
}

export function revisarDocumento(texto) {
  const problemas = [];

  // 1. Los bloques generados, regenerados y comparados.
  const presentes = bloquesDelDocumento(texto);
  const clavesPresentes = presentes.map((b) => b.clave);
  for (const clave of Object.keys(GENERADORES)) {
    if (!clavesPresentes.includes(clave))
      problemas.push(`falta el bloque generado \`${clave}\`: el documento se saltó una sección medida`);
  }
  for (const bloque of presentes) {
    if (!GENERADORES[bloque.clave]) {
      problemas.push(`bloque generado \`${bloque.clave}\` sin generador: nadie puede verificarlo`);
      continue;
    }
    if (bloque.cuerpo !== GENERADORES[bloque.clave]()) {
      problemas.push(
        `el bloque \`${bloque.clave}\` no coincide con lo que su evidencia dice HOY (corre --write)`,
      );
    }
  }

  // 2. Los casos: derivados del arnés, ni inventados ni saltados.
  const casos = revisarCasos(texto);
  for (const n of casos.inventados)
    problemas.push(`el documento nombra el caso \`${n}\`, que NO existe en CASES`);
  for (const n of casos.omitidos)
    problemas.push(`el documento se salta el caso \`${n}\`, que SÍ existe en CASES`);

  // 3. Ninguna cifra de cobertura a mano fuera de los bloques.
  for (const h of cifrasEscritasAMano(texto))
    problemas.push(
      `cifra escrita a mano en la línea ${h.linea} (${h.forma}): «${h.texto}» — enlaza la evidencia`,
    );

  // 4. Las banderas siguen apagadas: si no, esto no es un paquete de firma.
  problemas.push(
    ...revisarBanderas(
      leerTexto(FUENTES.banderaImportacion),
      leerTexto(FUENTES.banderaExportacion),
    ),
  );

  return problemas;
}

function main(argv = process.argv.slice(2)) {
  if (!fs.existsSync(DOCUMENTO)) {
    process.stderr.write(`check-firma-package: no existe ${rel(DOCUMENTO)}\n`);
    process.exit(1);
  }
  const original = leerTexto(DOCUMENTO);

  if (argv.includes("--write")) {
    const nuevo = reescribirBloques(original);
    if (nuevo !== original) {
      fs.writeFileSync(DOCUMENTO, nuevo);
      w(`check-firma-package: ${rel(DOCUMENTO)} regenerado.`);
    } else {
      w(`check-firma-package: ${rel(DOCUMENTO)} ya estaba al día.`);
    }
    return;
  }

  const problemas = revisarDocumento(original);
  const bloques = bloquesDelDocumento(original).map((b) => b.clave);
  const casos = revisarCasos(original);

  w(`check-firma-package: ${rel(DOCUMENTO)}`);
  w(`  bloques generados   : ${bloques.join(", ")}`);
  w(`  casos derivados     : ${new Set(casos.nombrados.map((n) => n.replace(/-publico$/, ""))).size} de CASES`);
  w("  banderas            : DWG_IMPORT_FLAG y DWG_EXPORT_FLAG apagadas");

  if (problemas.length > 0) {
    process.stderr.write(`\ncheck-firma-package: ${problemas.length} problema(s).\n`);
    for (const p of problemas) process.stderr.write(`  - ${p}\n`);
    process.stderr.write(
      "\nSi las cifras cambiaron porque la evidencia cambió, la respuesta es\n" +
        "  node scripts/dwg/check-firma-package.mjs --write\n" +
        "y volver a leer el documento: puede que la prosa que las rodea ya no sea cierta.\n" +
        "Si lo que corriste fue `npm run format`, prettier realineó las tablas de los\n" +
        "bloques y el mismo --write las devuelve a la forma que el generador produce.\n",
    );
    process.exit(1);
  }

  w("");
  w("  ✔ El paquete de firma no afirma nada que su evidencia no sostenga.");
}

const invocadoDirectamente =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;
if (invocadoDirectamente) main();
