/**
 * ORÁCULO E contra `api-sdk.contract`: `openapi-spec-validator` (PyPI,
 * Apache-2.0) dictamina si `packages/contracts/specs/design-api.v1.yaml` es un
 * documento OpenAPI 3.1 válido según el ESQUEMA OFICIAL de la especificación
 * pública.
 *
 * ## Por qué hacía falta esto
 *
 * `docs/cad/evidence/independencia-por-fila.json` lo dice con estas palabras
 * sobre el criterio `api-sdk.contract`: «hoy el contrato lo valida
 * `scripts/cad/check-design-contract.mjs`, que es nuestro, contra el SDK que
 * generamos nosotros desde el mismo YAML». Es exactamente la evidencia
 * fabricada por casa que la regla del corte del 2026-08-22 no deja llegar al
 * tope de la fila `api-sdk`: quien escribe el contrato, quien lo valida y
 * quien genera el SDK contra él son la misma mano.
 *
 * `openapi-spec-validator` no comparte una línea de código con este
 * repositorio. Valida SINTAXIS contra el esquema oficial de OpenAPI 3.1 (que
 * incorpora JSON Schema 2020-12), publicado por la OpenAPI Initiative — no
 * contra ninguna regla que Valle Design haya escrito. No sustituye a
 * `check-design-contract.mjs`, que sigue siendo quien vigila las reglas de
 * NEGOCIO del contrato (nombres de recursos, seguridad declarada por ruta,
 * coherencia con el SDK generado); los dos oráculos verifican preguntas
 * distintas y ninguno hace el trabajo del otro.
 *
 * El dictamen está CONGELADO en
 * `docs/cad/corpus/oraculos/openapi-spec-validator-0.9.0.json` (generado por
 * `docs/cad/corpus/oraculos/censo-openapi.py`), anclado al sha256 de los bytes
 * del YAML. Este spec comprueba que el YAML de hoy sigue siendo el mismo que
 * el oráculo dictaminó y, si la herramienta está instalada en esta máquina,
 * vuelve a correrla y exige el mismo dictamen.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RAIZ = path.resolve(process.cwd(), "../..");
const CONTRATO = path.join(RAIZ, "packages/contracts/specs/design-api.v1.yaml");
const ARTEFACTO = path.join(RAIZ, "docs/cad/corpus/oraculos/openapi-spec-validator-0.9.0.json");
const CENSO = path.join(RAIZ, "docs/cad/corpus/oraculos/censo-openapi.py");
const HERRAMIENTAS = path.join(RAIZ, "docs/cad/corpus/oraculos/HERRAMIENTAS.md");
const LICENCIA = path.join(RAIZ, "docs/cad/corpus/oraculos/licencias/openapi-spec-validator-0.9.0-Apache-2.0.txt");

let comprobaciones = 0;
const ok = (condicion: boolean, mensaje: string) => {
  assert.ok(condicion, mensaje);
  comprobaciones += 1;
};

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

interface Censo {
  herramienta: { nombre: string; version: string; licencia: string; sha256Rueda: string; sha256Licencia: string };
  contrato: { ruta: string; sha256: string; bytes: number; openapiVersionDeclarada: string };
  dictamen: { valido: boolean; totalErrores: number; erroresCompletos: string[] };
}

ok(fs.existsSync(ARTEFACTO), "falta el censo congelado de openapi-spec-validator: corre censo-openapi.py");
const censo = JSON.parse(fs.readFileSync(ARTEFACTO, "utf8")) as Censo;

ok(censo.herramienta.nombre === "openapi-spec-validator", "el censo congelado no dice openapi-spec-validator");
ok(censo.herramienta.licencia === "Apache-2.0", "el censo congelado declara otra licencia");
ok(censo.contrato.ruta === "packages/contracts/specs/design-api.v1.yaml", "el censo describe otro contrato");

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 1 · El anclaje: la licencia y la rueda dicen lo mismo en dos sitios
// ─────────────────────────────────────────────────────────────────────────────

const registro = fs.readFileSync(HERRAMIENTAS, "utf8");
ok(registro.includes(censo.herramienta.sha256Rueda), "HERRAMIENTAS.md no registra el sha256 de la rueda de openapi-spec-validator");
ok(registro.includes(censo.herramienta.sha256Licencia), "HERRAMIENTAS.md no registra el sha256 de la licencia Apache-2.0");
ok(fs.existsSync(LICENCIA), "falta el texto de licencia de openapi-spec-validator descargado");
const licenciaTexto = fs.readFileSync(LICENCIA);
ok(sha256(licenciaTexto) === censo.herramienta.sha256Licencia, "el texto de licencia en el árbol no es el que declara el censo");
ok(licenciaTexto.toString("utf8").includes("Apache License"), "el texto guardado no es la Apache License");

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 2 · El ancla: el YAML de hoy es el que dictaminó el oráculo
// ─────────────────────────────────────────────────────────────────────────────

ok(fs.existsSync(CONTRATO), "no existe packages/contracts/specs/design-api.v1.yaml");
const contratoBytes = fs.readFileSync(CONTRATO);
ok(
  sha256(contratoBytes) === censo.contrato.sha256,
  "el contrato OpenAPI cambió desde que el oráculo lo dictaminó: reejecuta censo-openapi.py y vuelve a congelar el dictamen antes de creerte esta evidencia",
);
ok(contratoBytes.length === censo.contrato.bytes, "el tamaño del contrato no coincide con el que el censo midió");

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 3 · El dictamen: el oráculo dice que el contrato es OpenAPI 3.1 válido
// ─────────────────────────────────────────────────────────────────────────────

ok(
  censo.dictamen.valido && censo.dictamen.totalErrores === 0,
  `openapi-spec-validator encontró ${censo.dictamen.totalErrores} error(es) en el contrato: ` +
    censo.dictamen.erroresCompletos.slice(0, 3).join(" | "),
);

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 4 · Si `openapi-spec-validator` está en esta máquina, se vuelve a correr
// ─────────────────────────────────────────────────────────────────────────────

function herramientaDisponible(): boolean {
  const resultado = spawnSync(
    "python3",
    ["-c", "import openapi_spec_validator; print(openapi_spec_validator.__version__)"],
    { encoding: "utf8" },
  );
  return resultado.status === 0 && resultado.stdout.trim() === censo.herramienta.version;
}

const exigido = process.env.VALLE_ORACULO_OPENAPI === "1";
const hay = herramientaDisponible();
if (exigido && !hay) {
  throw new Error(
    "VALLE_ORACULO_OPENAPI=1 exige reejecutar el censo y `openapi-spec-validator` no está en esta " +
      "máquina. Instálala con `pip install openapi-spec-validator==0.9.0` o quita la variable.",
  );
}
let reejecutado = false;
if (hay) {
  const destino = path.join(os.tmpdir(), "valle-censo-openapi-reejecutado.json");
  const corrida = spawnSync("python3", [CENSO, "--destino", destino], { cwd: RAIZ, encoding: "utf8" });
  assert.ok(corrida.status === 0, `el censo de openapi-spec-validator no volvió a correr: ${corrida.stderr?.trim() ?? ""}`);
  const reejecucion = JSON.parse(fs.readFileSync(destino, "utf8")) as Censo;
  assert.ok(
    reejecucion.contrato.sha256 === censo.contrato.sha256 && reejecucion.dictamen.valido === censo.dictamen.valido,
    "el contrato cambió de dictamen al reejecutar openapi-spec-validator: revisa el diff antes de comprometer nada",
  );
  reejecutado = true;
} else {
  console.log(
    "  · oráculo E (`openapi-spec-validator` 0.9.0): AUSENTE en esta máquina. El dictamen se usa " +
      "congelado; se reejecuta con `pip install openapi-spec-validator==0.9.0`.",
  );
}

console.log(
  `api-sdk-openapi: ${comprobaciones} comprobaciones · design-api.v1.yaml (${censo.contrato.bytes} bytes, ` +
    `OpenAPI ${censo.contrato.openapiVersionDeclarada}) dictaminado VÁLIDO por openapi-spec-validator · reejecutado: ${reejecutado}`,
);
