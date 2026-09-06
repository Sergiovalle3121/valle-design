/**
 * ORÁCULO H contra `json-import.fuzzing`: `atheris` (Google, Apache-2.0), un
 * fuzzer de terceros guiado por cobertura, decide qué 500 documentos hostiles
 * prueba la importación de JSON canónico — y aquí se alimentan al importador
 * REAL de producción para exigir el mismo invariante que
 * `document-import-fuzz.ts` ya exige sobre SU corpus interno.
 *
 * ## Por qué hacía falta esto
 *
 * `docs/cad/evidence/independencia-por-fila.json` lo dice del criterio
 * `json-import.fuzzing`: el formato canónico lo define este proyecto, así que
 * ningún corpus AJENO de documentos válidos puede existir por construcción.
 * «La independencia posible aquí no es del MATERIAL sino del GENERADOR».
 * `document-import-fuzz.ts` (que este spec NO sustituye ni duplica) es un
 * fuzzer determinista y disciplinado, pero decide las mutaciones un PRNG y
 * una lista que escribió este proyecto. `atheris` decide las suyas con su
 * propio motor de cobertura (libFuzzer), sin conocer el formato de Valle
 * Design ni compartir una línea con `document-import-fuzz.ts`.
 *
 * **`hypothesis`, nombrada en `PROMPT_MAESTRO_FABLE.md`, es MPL-2.0 y
 * `CORPUS_POLICY.md` la prohíbe sin excepción.** `atheris` (Apache-2.0) es el
 * sustituto admisible; ver la petición de corrección en `F10-peticiones.md`.
 *
 * ## Qué hace este spec, exactamente
 *
 * Lee los 500 textos que `docs/cad/corpus/oraculos/censo-atheris.py` congeló
 * —generados por `atheris-fuzz-worker.py` guiándose por un CEBO de cobertura
 * que imita `assertSafeJson`, nunca el validador real— y los alimenta, uno a
 * uno, al PRODUCTO REAL: `validateImportFile` + `importDocumentText` de
 * `document-import.ts`, exactamente como hace `runCadImportFuzzPass` en
 * `document-import-fuzz.ts`. La clasificación usa el MISMO taxonomía
 * (`classifyCadImportError`, `CAD_IMPORT_OUTCOMES`), importada de ese módulo
 * y no reinventada, para que los resultados sean comparables.
 *
 * El invariante que se exige es el mismo que ya exige el fuzzer interno:
 * **ningún caso puede clasificar como «desconocido»** (un mensaje de error
 * que ninguna puerta previó) **ni lanzar algo que no sea un `Error`**. Un
 * documento generado por un tercero que rompe esa promesa es exactamente el
 * escenario para el que existe un fuzzer ajeno.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CAD_IMPORT_OUTCOMES, classifyCadImportError, type CadImportOutcome } from "../document-import-fuzz";
import { importDocumentText } from "../document-import";
import { validateImportFile } from "../document-import-validation";

const RAIZ = path.resolve(process.cwd(), "../..");
const ARTEFACTO = path.join(RAIZ, "docs/cad/corpus/oraculos/atheris-3.0.0.json");
const CENSO = path.join(RAIZ, "docs/cad/corpus/oraculos/censo-atheris.py");
const HERRAMIENTAS = path.join(RAIZ, "docs/cad/corpus/oraculos/HERRAMIENTAS.md");

let comprobaciones = 0;
const ok = (condicion: boolean, mensaje: string) => {
  assert.ok(condicion, mensaje);
  comprobaciones += 1;
};

interface CensoCandidato {
  sha256: string;
  texto: string;
  veredictoDelCebo: string;
}
interface CensoAtheris {
  herramienta: { nombre: string; version: string; licencia: string };
  configuracion: { runs: number; maxLen: number; libfuzzerSeed: number; semillasIniciales: string[] };
  candidatos: CensoCandidato[];
}

ok(fs.existsSync(ARTEFACTO), "falta el censo congelado de atheris: corre censo-atheris.py primero");
const censo = JSON.parse(fs.readFileSync(ARTEFACTO, "utf8")) as CensoAtheris;
ok(censo.herramienta.nombre === "atheris", "el censo congelado no dice atheris");
ok(censo.herramienta.licencia === "Apache-2.0", "el censo congelado declara otra licencia — atheris debe ser Apache-2.0, nunca MPL");
ok(censo.candidatos.length === 500, `el censo trae ${censo.candidatos.length} candidatos, se esperaban 500`);

const registro = fs.readFileSync(HERRAMIENTAS, "utf8");
ok(registro.includes("atheris"), "HERRAMIENTAS.md no registra atheris");
ok(
  !/^##\s+hypothesis/im.test(registro),
  "HERRAMIENTAS.md no debe tener una entrada de herramienta para hypothesis: es MPL-2.0, inadmisible " +
    "(mencionarla como motivo de la sustitución por atheris, en prosa, sí está permitido)",
);

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 1 · El invariante: cada candidato clasifica en algo CONOCIDO
// ─────────────────────────────────────────────────────────────────────────────

const histograma: Record<string, number> = {};
const desconocidos: { sha256: string; mensaje: string | null }[] = [];
const lanzamientosNoError: string[] = [];

function clasifica(texto: string): { outcome: CadImportOutcome; message: string | null } {
  try {
    validateImportFile("atheris-fuzz.json", new TextEncoder().encode(texto).byteLength);
    importDocumentText("atheris-fuzz.json", texto);
    return { outcome: "ok", message: null };
  } catch (error) {
    if (!(error instanceof Error)) {
      lanzamientosNoError.push(`${typeof error}: ${String(error)}`);
      return { outcome: "desconocido", message: String(error) };
    }
    return { outcome: classifyCadImportError(error.message), message: error.message };
  }
}

for (const candidato of censo.candidatos) {
  ok(
    candidato.sha256.length === 64,
    `candidato con sha256 mal formado: «${candidato.sha256}»`,
  );
  const resultado = clasifica(candidato.texto);
  histograma[resultado.outcome] = (histograma[resultado.outcome] ?? 0) + 1;
  if (resultado.outcome === "desconocido")
    desconocidos.push({ sha256: candidato.sha256, mensaje: resultado.message });
}

ok(
  desconocidos.length === 0,
  `${desconocidos.length} documento(s) generado(s) por atheris cayeron en la clase «desconocido» ` +
    `(ninguna puerta prevista los reconoce): ${desconocidos.slice(0, 3).map((d) => `${d.sha256.slice(0, 12)}… → ${d.mensaje}`).join(" | ")}`,
);
ok(
  lanzamientosNoError.length === 0,
  `${lanzamientosNoError.length} documento(s) de atheris lanzaron algo que no es un Error: ` +
    lanzamientosNoError.slice(0, 3).join(" | "),
);

// Todo lo que salió del histograma tiene que ser una clase que el propio
// producto declara (incluyendo "ok"), nunca una inventada por este spec.
for (const clase of Object.keys(histograma))
  ok(
    clase === "ok" || clase in CAD_IMPORT_OUTCOMES,
    `«${clase}» no es una clase declarada en CAD_IMPORT_OUTCOMES ni "ok"`,
  );

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 2 · Determinismo: los MISMOS 500 textos, clasificados otra vez
// ─────────────────────────────────────────────────────────────────────────────

let segundaPasadaIdentica = true;
for (const candidato of censo.candidatos) {
  const otraVez = clasifica(candidato.texto);
  const clase = otraVez.outcome;
  if (histograma[clase] === undefined) segundaPasadaIdentica = false;
}
ok(segundaPasadaIdentica, "la segunda pasada sobre el mismo corpus produjo clases que la primera no vio");

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 3 · Si `atheris` está en esta máquina, se vuelve a correr el censo
// ─────────────────────────────────────────────────────────────────────────────

function atherisDisponible(): boolean {
  const resultado = spawnSync("python3", ["-c", "import atheris"], { encoding: "utf8" });
  return resultado.status === 0;
}

const exigido = process.env.VALLE_ORACULO_ATHERIS === "1";
const hay = atherisDisponible();
if (exigido && !hay) {
  throw new Error(
    "VALLE_ORACULO_ATHERIS=1 exige reejecutar el censo y `atheris` no está en esta máquina. " +
      "Instálala con `pip install atheris==3.0.0` o quita la variable.",
  );
}
let reejecutado = false;
if (hay) {
  const destino = path.join(os.tmpdir(), "valle-censo-atheris-reejecutado.json");
  const corrida = spawnSync("python3", [CENSO, "--destino", destino], { cwd: RAIZ, encoding: "utf8", timeout: 60_000 });
  assert.ok(corrida.status === 0, `el censo de atheris no volvió a correr: ${corrida.stderr?.trim() ?? ""}`);
  const reejecucion = JSON.parse(fs.readFileSync(destino, "utf8")) as CensoAtheris;
  assert.ok(
    reejecucion.candidatos.length === censo.candidatos.length &&
      reejecucion.candidatos.every((c, i) => c.sha256 === censo.candidatos[i].sha256),
    "atheris con la misma semilla ya no reproduce el mismo corpus: revisa el diff antes de comprometer nada " +
      "(libFuzzer es determinista de un solo hilo; un cambio de versión de atheris puede romper esto)",
  );
  reejecutado = true;
} else {
  console.log("  · oráculo H (`atheris`): AUSENTE en esta máquina. El corpus se usa congelado.");
}

console.log(
  `json-import-atheris: ${comprobaciones} comprobaciones · 500 documentos generados por atheris (fuzzer de ` +
    `cobertura, Apache-2.0) alimentados al importador real · histograma: ${JSON.stringify(histograma)} · ` +
    `0 desconocidos, 0 lanzamientos no tipados · reejecutado: ${reejecutado}`,
);
