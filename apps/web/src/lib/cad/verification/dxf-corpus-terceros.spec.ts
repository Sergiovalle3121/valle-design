import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * CORPUS DE TERCEROS — LA PUERTA DE DERECHOS, NO LA DE GEOMETRÍA.
 *
 * `docs/cad/corpus/` guarda diecinueve DXF que este proyecto no escribió. La
 * regla del corte del 2026-08-22 dice que una fila cuya evidencia entera la
 * fabricó el propio proyecto no llega a su tope; este corpus existe para dejar
 * de fabricarla. Y un corpus ajeno sólo sirve si sus DERECHOS están escritos:
 * un archivo sin licencia clara vale menos que ninguno, porque parece
 * evidencia y es un pasivo.
 *
 * Esta suite no mide fidelidad —eso es otra suite—. Vigila la puerta:
 *
 *   1. Biyección árbol ↔ manifiesto. Nada entra por copiarlo al directorio y
 *      nada se declara sin estar. Un archivo que aparece sin pasar por el
 *      manifiesto es exactamente el fallo que la regla fail-closed impide.
 *   2. Bytes intactos: `sha256` y tamaño de cada archivo, recalculados aquí.
 *      Es lo único que distingue «material de terceros» de «material propio
 *      con nombre ajeno».
 *   3. Derechos: licencia permisiva identificada, su TEXTO descargado y
 *      hasheado, y el aviso de copyright del titular dentro de ese texto.
 *   4. Motivo por archivo. Un archivo sin motivo escrito es peso, no evidencia.
 *   5. Los límites, declarados a la vista: que no hay firma humana todavía y
 *      que nada de esto acredita compatibilidad con AutoCAD.
 *
 * Lo que NO comprueba, y hay que decirlo: que las licencias sean legalmente
 * suficientes. Eso es un dictamen humano y falta; la casilla existe y está
 * vacía, con su fecha, en `manifest.json`.
 */

const CORPUS = path.resolve(process.cwd(), "../../docs/cad/corpus");

/** SPDX que autorizan redistribuir conservando el aviso. Nada de copyleft. */
const LICENCIAS_ADMITIDAS = new Set(["MIT", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "CC0-1.0"]);

interface FuenteCorpus {
  id: string;
  repositorio: string;
  ref: string;
  descargadoEl: string;
  licencia: string;
  titular: string;
  avisoCopyright: string;
  licenciaUrl: string;
  licenciaArchivo: string;
  licenciaSha256: string;
  redistribucion: string;
  modificacion: string;
}
interface ArchivoCorpus {
  id: string;
  fuente: string;
  ruta: string;
  urlOrigen: string;
  sha256: string;
  bytes: number;
  porQue: string;
}
interface ManifiestoCorpus {
  esquemaVersion: string;
  actualizado: string;
  derechos: {
    dictamenAutomatico: string;
    firmaHumana: { firmadoPor: string; firmadoEl: string; nota: string };
    loQueNoSeAfirma: string;
  };
  fuentes: FuenteCorpus[];
  archivos: ArchivoCorpus[];
}

let comprobaciones = 0;
const ok = (condicion: boolean, mensaje: string) => {
  assert.ok(condicion, mensaje);
  comprobaciones += 1;
};

const manifiesto = JSON.parse(
  fs.readFileSync(path.join(CORPUS, "manifest.json"), "utf8"),
) as ManifiestoCorpus;

// --- 1. biyección árbol ↔ manifiesto ---------------------------------------
{
  const enElArbol: string[] = [];
  const raiz = path.join(CORPUS, "terceros");
  for (const fuente of fs.readdirSync(raiz).sort())
    for (const nombre of fs.readdirSync(path.join(raiz, fuente)).sort())
      enElArbol.push(`terceros/${fuente}/${nombre}`);

  const declaradas = manifiesto.archivos.map((archivo) => archivo.ruta).sort();
  const huerfanos = enElArbol.filter((ruta) => !declaradas.includes(ruta));
  ok(
    huerfanos.length === 0,
    `hay ${huerfanos.length} archivo(s) en el árbol sin declarar en el manifiesto: ${huerfanos.join(", ")}. ` +
      "Copiar un archivo al directorio NO lo admite: sin derechos escritos no entra.",
  );
  const fantasmas = declaradas.filter((ruta) => !enElArbol.includes(ruta));
  ok(fantasmas.length === 0, `el manifiesto declara archivos que no existen: ${fantasmas.join(", ")}`);
  ok(enElArbol.length === declaradas.length, "el conteo del árbol y el del manifiesto coinciden");
  ok(
    new Set(manifiesto.archivos.map((archivo) => archivo.id)).size === manifiesto.archivos.length,
    "los identificadores del corpus son únicos",
  );
}

// --- 2. bytes intactos ------------------------------------------------------
for (const archivo of manifiesto.archivos) {
  const bytes = fs.readFileSync(path.join(CORPUS, archivo.ruta));
  const sha = createHash("sha256").update(bytes).digest("hex");
  ok(
    sha === archivo.sha256,
    `${archivo.id}: el sha256 no cuadra (árbol ${sha.slice(0, 12)}…, manifiesto ${archivo.sha256.slice(0, 12)}…). ` +
      "Los bytes de un tercero no se editan: si cambiaron, dejó de ser material ajeno.",
  );
  ok(bytes.length === archivo.bytes, `${archivo.id}: el tamaño no cuadra (${bytes.length} ≠ ${archivo.bytes})`);
}

// --- 3. derechos por fuente -------------------------------------------------
for (const fuente of manifiesto.fuentes) {
  ok(
    LICENCIAS_ADMITIDAS.has(fuente.licencia),
    `${fuente.id}: licencia «${fuente.licencia}» fuera de la lista permisiva. ` +
      "Copyleft y «source-available» no entran, sin excepción.",
  );
  const texto = fs.readFileSync(path.join(CORPUS, fuente.licenciaArchivo), "utf8");
  const sha = createHash("sha256").update(texto).digest("hex");
  ok(sha === fuente.licenciaSha256, `${fuente.id}: el texto de la licencia no coincide con su hash`);
  ok(
    texto.includes(fuente.avisoCopyright),
    `${fuente.id}: el aviso «${fuente.avisoCopyright}» no está en el texto de la licencia. ` +
      "Conservar el aviso es la única condición que MIT impone y es la que hay que poder demostrar.",
  );
  ok(fuente.titular.length > 0, `${fuente.id}: sin titular identificado`);
  ok(
    fuente.licenciaUrl.startsWith("https://raw.githubusercontent.com/"),
    `${fuente.id}: la licencia tiene que venir de una URL comprobable`,
  );
  ok(/^\d{4}-\d{2}-\d{2}$/u.test(fuente.descargadoEl), `${fuente.id}: fecha de descarga ausente o ilegible`);
  const suyos = manifiesto.archivos.filter((archivo) => archivo.fuente === fuente.id);
  ok(suyos.length > 0, `${fuente.id}: fuente declarada sin un solo archivo`);
}

// --- 4. motivo y procedencia por archivo ------------------------------------
for (const archivo of manifiesto.archivos) {
  ok(
    archivo.porQue.length >= 40,
    `${archivo.id}: sin motivo escrito. Un archivo que no prueba nada que otro no pruebe es peso, no evidencia.`,
  );
  ok(
    manifiesto.fuentes.some((fuente) => fuente.id === archivo.fuente),
    `${archivo.id}: apunta a una fuente «${archivo.fuente}» que no está declarada`,
  );
  ok(
    archivo.urlOrigen.startsWith("https://raw.githubusercontent.com/") && archivo.urlOrigen.endsWith(".dxf"),
    `${archivo.id}: sin URL de origen comprobable`,
  );
  ok(archivo.ruta === `terceros/${archivo.fuente}/${path.basename(archivo.ruta)}`, `${archivo.id}: ruta fuera de su fuente`);
}

// --- 5. los límites, escritos donde se leen ---------------------------------
{
  const { derechos } = manifiesto;
  ok(derechos.dictamenAutomatico.length > 80, "el dictamen automático de derechos tiene que estar escrito");
  ok(
    /AutoCAD/u.test(derechos.loQueNoSeAfirma),
    "el manifiesto tiene que decir explícitamente que esto NO acredita compatibilidad con AutoCAD",
  );
  // La firma humana es lo que la rúbrica pide como evidencia manual. Hoy no
  // está, y este spec lo mantiene VISIBLE en vez de dejar que se olvide: en
  // cuanto se firme, las dos casillas dejan de estar vacías a la vez.
  const firmado = derechos.firmaHumana.firmadoPor !== "" && derechos.firmaHumana.firmadoEl !== "";
  ok(
    firmado || derechos.firmaHumana.nota.includes("TODAVÍA NO"),
    "sin firma del titular, la casilla tiene que decir «TODAVÍA NO» y por qué; el silencio no vale",
  );
  if (firmado)
    ok(
      /^\d{4}-\d{2}-\d{2}$/u.test(derechos.firmaHumana.firmadoEl),
      "la firma del titular necesita fecha legible",
    );
}

// --- 6. la diversidad que justifica el corpus -------------------------------
{
  // Un corpus ajeno de un solo dialecto no prueba interoperabilidad: prueba
  // que se lee un dialecto. El `$ACADVER` lo declara el propio archivo.
  const dialectos = new Set<string>();
  for (const archivo of manifiesto.archivos) {
    const texto = fs.readFileSync(path.join(CORPUS, archivo.ruta), "latin1");
    const version = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d{4})/u.exec(texto)?.[1];
    if (version) dialectos.add(version);
  }
  ok(
    dialectos.size >= 4,
    `el corpus declara ${dialectos.size} dialecto(s) (${[...dialectos].sort().join(", ")}); hacen falta al menos 4`,
  );
  ok(
    manifiesto.fuentes.length >= 2,
    "un corpus «de terceros» con una sola fuente depende del criterio de una sola persona",
  );
}

console.log(
  `corpus de terceros: ${comprobaciones} comprobaciones · ${manifiesto.archivos.length} archivos ajenos ` +
    `de ${manifiesto.fuentes.length} fuentes, con licencia permisiva hasheada y bytes íntegros`,
);
console.log(
  "  · TODAVÍA NO (2026-09-04): falta la firma humana de derechos y falta material de despacho real; " +
    "nada de este corpus acredita compatibilidad con AutoCAD.",
);
