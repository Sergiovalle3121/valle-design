/**
 * ORÁCULO F contra `events.operational`: la biblioteca ESTÁNDAR de Python
 * (`hmac` + `hashlib`, sin instalar nada) verifica de forma independiente que
 * `X-Valle-Signature` es exactamente HMAC-SHA256 sobre
 * `${timestamp}.${rawBody}` — el contrato que documenta
 * `apps/api/src/modules/outbox-receiver/outbox-signature.ts` y que firma
 * `apps/api/src/modules/commercial/webhook-outbox.transport.ts`.
 *
 * ## Por qué hacía falta esto
 *
 * `docs/cad/evidence/independencia-por-fila.json` lo dice de la fila `events`:
 * «`webhook-replay-audit.json` lo produce este proyecto, con el emisor y el
 * receptor de este proyecto a los dos lados del cable». `outbox-signature.spec.ts`
 * ya prueba a fondo el verificador real, pero emisor y verificador comparten
 * lenguaje (TypeScript) y biblioteca de criptografía (`node:crypto`). Este
 * spec añade el ingrediente que faltaba: OTRA implementación del mismo
 * estándar HMAC-SHA256 (RFC 2104 / FIPS 180-4), en otro lenguaje, sin una
 * línea de código en común, hace la cuenta desde cero y llega al mismo sitio.
 *
 * ## Qué se ejercita, de verdad
 *
 * 1. Se construye una fixture DETERMINISTA (timestamp y secreto fijos, nunca
 *    aleatorios, para que el censo de Python sea reproducible byte a byte) con
 *    la MISMA forma de cuerpo que `webhook-outbox.transport.ts` produce para
 *    un evento de dominio, y se firma con la MISMA construcción que ese
 *    archivo documenta: `HMAC-SHA256(secreto, timestamp + "." + rawBody)`.
 * 2. El verificador REAL de producción, `verifyOutboxSignature`, importado sin
 *    modificarlo, confirma que acepta la firma genuina y rechaza la firma
 *    aplicada sobre un cuerpo alterado en un byte. Esto no es un test nuevo de
 *    ese módulo — ya lo cubre `outbox-signature.spec.ts` — es la prueba de que
 *    la fixture de este spec es fiel al contrato real, no una invención propia.
 * 3. La fixture se escribe al temporal del sistema y
 *    `docs/cad/corpus/oraculos/censo-hmac-stdlib.py` la lee, recalcula la
 *    firma con `hmac`/`hashlib` de la biblioteca estándar de Python — sin
 *    mirar la firma que trae la fixture hasta el final— y congela su dictamen.
 * 4. Este spec compara el dictamen congelado contra uno recién ejecutado (si
 *    Python está disponible) y exige que declare la firma genuina válida y la
 *    alterada inválida.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(process.cwd(), "../..");
const OUTBOX_SIGNATURE_TS = path.join(RAIZ, "apps/api/src/modules/outbox-receiver/outbox-signature.ts");
const CENSO = path.join(RAIZ, "docs/cad/corpus/oraculos/censo-hmac-stdlib.py");
const ARTEFACTO = path.join(RAIZ, "docs/cad/corpus/oraculos/hmac-stdlib.json");

let comprobaciones = 0;
const ok = (condicion: boolean, mensaje: string) => {
  assert.ok(condicion, mensaje);
  comprobaciones += 1;
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 1 · La fixture determinista, con la MISMA forma que produce el emisor real
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Secreto SOLO de esta fixture de evidencia: fijo para que el censo sea
 * reproducible, y de 44 caracteres para respetar `MIN_SECRET_LENGTH = 32` que
 * `webhook-outbox.transport.ts` exige. NUNCA es un secreto de producción.
 */
const FIXTURE_SECRET = "TEST-ONLY-fixture-secret-not-a-real-key-000";
ok(FIXTURE_SECRET.length >= 32, "el secreto de la fixture no cumple el mínimo que exige el transporte real");

/** Fijo a propósito: un timestamp que cambiara en cada corrida rompería la comparación byte a byte con el censo congelado. */
const FIXTURE_TIMESTAMP = "2026-09-06T00:00:00.000Z";

/**
 * La MISMA forma de cuerpo que `webhook-outbox.transport.ts` serializa para
 * `queue: "domain"`: `id, queue, organizationId, tenantId, idempotencyKey,
 * attemptCount, type, aggregateId, payload`. Los valores son deterministas y
 * de laboratorio; la forma es la real.
 */
const FIXTURE_BODY = JSON.stringify({
  id: "9f2e6a10-2b1a-4b0e-9c9a-000000000001",
  queue: "domain",
  organizationId: "00000000-0000-4000-8000-000000000002",
  tenantId: "00000000-0000-4000-8000-000000000002",
  idempotencyKey: "evt-000000000000000000000000000003",
  attemptCount: 1,
  type: "design.document.saved",
  aggregateId: "00000000-0000-4000-8000-000000000004",
  payload: { documentId: "00000000-0000-4000-8000-000000000004", version: 7 },
});

/** Un byte cambiado (7 → 8) en `version`: misma longitud, mismo JSON válido, contenido distinto. */
const FIXTURE_TAMPERED_BODY = FIXTURE_BODY.replace('"version":7', '"version":8');
ok(FIXTURE_TAMPERED_BODY !== FIXTURE_BODY && FIXTURE_TAMPERED_BODY.length === FIXTURE_BODY.length, "el cuerpo alterado no difiere exactamente en un byte");

function firmaHmacSha256(secreto: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secreto).update(`${timestamp}.${rawBody}`).digest("hex");
}

const firmaGenuina = firmaHmacSha256(FIXTURE_SECRET, FIXTURE_TIMESTAMP, FIXTURE_BODY);
const SIGNATURE_HEADER_VALUE = `sha256=${firmaGenuina}`;

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 2 · El verificador REAL de producción confirma que la fixture es fiel
// ─────────────────────────────────────────────────────────────────────────────

void (async () => {
ok(fs.existsSync(OUTBOX_SIGNATURE_TS), "no se encuentra apps/api/src/modules/outbox-receiver/outbox-signature.ts");
const outboxSignature = (await import(pathToFileURL(OUTBOX_SIGNATURE_TS).href)) as typeof import(
  "../../../../../../apps/api/src/modules/outbox-receiver/outbox-signature"
);

outboxSignature.verifyOutboxSignature({
  headers: {
    [outboxSignature.OUTBOX_TIMESTAMP_HEADER]: FIXTURE_TIMESTAMP,
    [outboxSignature.OUTBOX_SIGNATURE_HEADER]: SIGNATURE_HEADER_VALUE,
  },
  rawBody: Buffer.from(FIXTURE_BODY, "utf8"),
  secret: FIXTURE_SECRET,
  now: new Date(FIXTURE_TIMESTAMP),
});
comprobaciones += 1; // no lanzó: el verificador real aceptó la fixture genuina

let rechazoDelVerificadorReal = false;
try {
  outboxSignature.verifyOutboxSignature({
    headers: {
      [outboxSignature.OUTBOX_TIMESTAMP_HEADER]: FIXTURE_TIMESTAMP,
      [outboxSignature.OUTBOX_SIGNATURE_HEADER]: SIGNATURE_HEADER_VALUE,
    },
    rawBody: Buffer.from(FIXTURE_TAMPERED_BODY, "utf8"),
    secret: FIXTURE_SECRET,
    now: new Date(FIXTURE_TIMESTAMP),
  });
} catch (error) {
  rechazoDelVerificadorReal = error instanceof outboxSignature.OutboxSignatureError;
}
ok(rechazoDelVerificadorReal, "el verificador real de producción NO rechazó la firma aplicada sobre el cuerpo alterado");

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 3 · Python, con SU biblioteca estándar, verifica la misma fixture
// ─────────────────────────────────────────────────────────────────────────────

const fixturePath = path.join(os.tmpdir(), "valle-hmac-oracle-fixture.json");
fs.writeFileSync(
  fixturePath,
  JSON.stringify(
    {
      timestamp: FIXTURE_TIMESTAMP,
      secret: FIXTURE_SECRET,
      rawBody: FIXTURE_BODY,
      tamperedBody: FIXTURE_TAMPERED_BODY,
      signature: SIGNATURE_HEADER_VALUE,
    },
    null,
    2,
  ),
  "utf8",
);

interface CensoHmac {
  herramienta: { nombre: string; licencia: string };
  fixture: { timestamp: string; secretLength: number; rawBodyBytes: number };
  casoGenuino: { coincide: boolean };
  casoAlterado: { coincide: boolean };
  dictamen: { valido: boolean; criterio: string };
}

ok(fs.existsSync(ARTEFACTO), "falta el censo congelado de hmac-stdlib: corre censo-hmac-stdlib.py --fixture primero");
const censo = JSON.parse(fs.readFileSync(ARTEFACTO, "utf8")) as CensoHmac;

ok(censo.fixture.timestamp === FIXTURE_TIMESTAMP, "el censo congelado describe otra fixture (timestamp distinto)");
ok(censo.fixture.secretLength === FIXTURE_SECRET.length, "el censo congelado describe otra fixture (longitud de secreto distinta)");
ok(
  censo.fixture.rawBodyBytes === Buffer.byteLength(FIXTURE_BODY, "utf8"),
  "el censo congelado describe otra fixture (tamaño de cuerpo distinto): la fixture de este spec cambió sin regenerar el censo",
);
ok(censo.casoGenuino.coincide === true, "el censo congelado dice que Python NO validó la firma genuina");
ok(censo.casoAlterado.coincide === false, "el censo congelado dice que Python SÍ validó la firma sobre el cuerpo alterado: no protegería nada");
ok(censo.dictamen.valido === true, "el dictamen congelado de Python no es válido");

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 4 · Si `python3` está disponible, se vuelve a correr el censo
// ─────────────────────────────────────────────────────────────────────────────

function python3Disponible(): boolean {
  const resultado = spawnSync("python3", ["--version"], { encoding: "utf8" });
  return resultado.status === 0;
}

const exigido = process.env.VALLE_ORACULO_HMAC === "1";
const hay = python3Disponible();
if (exigido && !hay) {
  throw new Error("VALLE_ORACULO_HMAC=1 exige reejecutar el censo y no hay `python3` en esta máquina.");
}
let reejecutado = false;
if (hay) {
  const destino = path.join(os.tmpdir(), "valle-censo-hmac-reejecutado.json");
  const corrida = spawnSync("python3", [CENSO, "--fixture", fixturePath, "--destino", destino], {
    cwd: RAIZ,
    encoding: "utf8",
  });
  assert.ok(corrida.status === 0, `el censo de hmac-stdlib no volvió a correr: ${corrida.stderr?.trim() ?? ""}`);
  const reejecucion = JSON.parse(fs.readFileSync(destino, "utf8")) as CensoHmac;
  assert.ok(
    reejecucion.casoGenuino.coincide === censo.casoGenuino.coincide &&
      reejecucion.casoAlterado.coincide === censo.casoAlterado.coincide &&
      reejecucion.dictamen.valido === censo.dictamen.valido,
    "el dictamen de Python cambió al reejecutarlo sobre la misma fixture: revisa el diff antes de comprometer nada",
  );
  reejecutado = true;
} else {
  console.log("  · oráculo F (Python hmac/hashlib): `python3` no está en esta máquina. El dictamen se usa congelado.");
}

console.log(
  `events-hmac: ${comprobaciones} comprobaciones · verificador real de producción acepta la fixture genuina y ` +
    `rechaza la alterada · Python (biblioteca estándar) dictamina lo mismo de forma independiente · reejecutado: ${reejecutado}`,
);
})();
