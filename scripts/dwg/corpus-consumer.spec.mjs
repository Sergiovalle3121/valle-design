#!/usr/bin/env node
/**
 * Spec del lado consumidor del corpus DWG.
 *
 * Lo que hay que probar aquí NO es que sepa descargar. Es que sepa NEGARSE. Un
 * verificador de hashes que en el camino feliz dice «ok» no vale nada: el valor
 * entero está en los gemelos tristes —hash cambiado, commit ausente, bundle con
 * una sola validación, archivo que viaja sin manifestar— y en que cada negativa
 * salga como error TIPADO y no como una lista corta que parece correcta.
 *
 * El transporte se inyecta en memoria para casi todo: así la spec prueba el
 * gate y no la red. El último caso monta un repositorio git de verdad en un
 * temporal, porque el contrato «bytes canónicos del blob, no del working tree»
 * sólo se puede demostrar contra git.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DwgCorpusGateError,
  createLocalMirrorTransport,
  fetchAdmittedCorpus,
  loadCorpusPin,
  resolveCorpusCredential,
  sha256,
} from "./corpus-consumer.mjs";

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
/** Ejecuta y exige el CÓDIGO tipado, no una frase. */
const failsWith = (code, run, message) => {
  try {
    run();
  } catch (error) {
    ok(error instanceof DwgCorpusGateError, `${message}: debe ser un error tipado del gate`);
    eq(error.code, code, message);
    return error;
  }
  assert.fail(`${message}: se esperaba ${code} y no falló`);
};

const COMMIT = "48eaab09c4c0eb93d5149852a979e274b1aaa1d0";

// --- transporte en memoria ---------------------------------------------------
function memoryTransport(files, { commit = COMMIT } = {}) {
  return {
    kind: "memory",
    origin: "memory://corpus",
    hasCommit: (target) => target === commit,
    readFile: (target, filePath) =>
      target === commit && files.has(filePath) ? Buffer.from(files.get(filePath)) : null,
    listFiles: (target, prefix) =>
      target === commit
        ? [...files.keys()].filter((key) => key.startsWith(prefix))
        : [],
  };
}

const encode = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

function buildCorpus({
  bundleId = "sergio-r2000-basico",
  mutateManifest = (m) => m,
  extraFiles = new Map(),
  mutateIndexEntry = (e) => e,
} = {}) {
  const fixture = Buffer.from("no son bytes DWG: la spec sólo verifica hashes", "utf8");
  const oracle = Buffer.from('{"entities":0}\n', "utf8");
  const manifest = mutateManifest({
    schemaVersion: "1.0.0",
    id: bundleId,
    status: "allowed",
    dwgVersion: "AC1015",
    rights: {
      origin: "sergio-original",
      owner: "Sergio Valle Zárate",
      tool: "herramienta-de-prueba",
      toolVersion: "1.0",
      outputRights: "propiedad del titular",
      redistribution: "sólo dentro del repositorio privado",
      attestationRef: "private-attestation:spec-0001",
      containsClientData: false,
    },
    sourceFactIds: ["ODA-ODS-DWG-5.4.1-PUBLIC:HEADER"],
    fixtures: [
      {
        id: "basico",
        path: "fixtures/basico.dwg",
        sha256: sha256(fixture),
        byteLength: fixture.length,
      },
    ],
    oracles: [
      {
        id: "basico-oracle",
        path: "oracles/basico.json",
        sha256: sha256(oracle),
        byteLength: oracle.length,
      },
    ],
    validations: [
      { validator: "oraculo-a", version: "1.0", result: "accepted", evidenceSha256: "a".repeat(64) },
      { validator: "oraculo-b", version: "2.0", result: "accepted", evidenceSha256: "b".repeat(64) },
    ],
    reviews: ["@sergio", "@revisor-dos"],
  });
  const manifestBytes = encode(manifest);
  const index = {
    schemaVersion: "1.0.0",
    updatedAt: "2026-08-19",
    bundles: [
      mutateIndexEntry({
        id: bundleId,
        manifestPath: `bundles/${bundleId}/manifest.json`,
        manifestSha256: sha256(manifestBytes),
      }),
    ],
  };
  const indexBytes = encode(index);
  const files = new Map([
    ["index.json", indexBytes],
    [`bundles/${bundleId}/manifest.json`, manifestBytes],
    [`bundles/${bundleId}/fixtures/basico.dwg`, fixture],
    [`bundles/${bundleId}/oracles/basico.json`, oracle],
    ...extraFiles,
  ]);
  return { files, indexSha256: sha256(indexBytes), bundleId };
}

const basePin = {
  schemaVersion: "1.0.0",
  repository: "https://github.com/Sergiovalle3121/valle-design-dwg-conformance.git",
  commit: COMMIT,
  indexPath: "index.json",
  indexSha256: "0".repeat(64),
  credentialEnv: "VALLE_DWG_CORPUS_TOKEN",
  credentialScopeEnv: "VALLE_DWG_CORPUS_TOKEN_SCOPE",
  requiredCredentialScope: "contents:read",
  mirrorEnv: "VALLE_DWG_CORPUS_MIRROR",
  maxIndexBytes: 1_048_576,
  maxManifestBytes: 1_048_576,
  maxArtifactBytes: 536_870_912,
  maxTotalBytes: 2_147_483_648,
};
const pinFor = (indexSha256, overrides = {}) => ({ ...basePin, indexSha256, ...overrides });

// --- 1. el pin del repositorio es real y fija commit Y hash -----------------
const realPin = loadCorpusPin();
ok(/^[0-9a-f]{40}$/.test(realPin.commit), "el pin del repositorio fija un commit de 40 hex");
ok(/^[0-9a-f]{64}$/.test(realPin.indexSha256), "el pin del repositorio fija el SHA-256 del índice");
eq(realPin.requiredCredentialScope, "contents:read", "el alcance exigido es sólo lectura");

// --- 2. índice VACÍO: estado válido, no error --------------------------------
const emptyIndexBytes = encode({ schemaVersion: "1.0.0", updatedAt: "2026-08-09", bundles: [] });
const emptyPin = pinFor(sha256(emptyIndexBytes));
const emptyReport = fetchAdmittedCorpus({
  pin: emptyPin,
  transport: memoryTransport(new Map([["index.json", emptyIndexBytes]])),
});
eq(emptyReport.status, "verified", "un índice vacío VERIFICA");
eq(emptyReport.admittedBundleCount, 0, "cero bundles admitidos");
eq(emptyReport.bundles, [], "y la lista está vacía, no ausente");
eq(emptyReport.indexSha256, emptyPin.indexSha256, "el informe declara el hash que verificó");

// --- 3. camino feliz: un bundle completo se admite ---------------------------
const happy = buildCorpus();
const happyReport = fetchAdmittedCorpus({
  pin: pinFor(happy.indexSha256),
  transport: memoryTransport(happy.files),
});
eq(happyReport.admittedBundleCount, 1, "un bundle correcto se admite");
eq(happyReport.bundles[0].id, happy.bundleId, "con su id");
eq(happyReport.bundles[0].independentValidations, 2, "y sus dos validaciones independientes");
eq(happyReport.bundles[0].fixtureCount, 1, "un fixture verificado");
eq(happyReport.bundles[0].oracleCount, 1, "un oracle verificado");

// --- 4. los gemelos tristes: cada negativa con su código ---------------------
failsWith(
  "CORPUS_INDEX_HASH_MISMATCH",
  () =>
    fetchAdmittedCorpus({
      pin: pinFor("f".repeat(64)),
      transport: memoryTransport(happy.files),
    }),
  "un índice que no coincide con el hash fijado no entrega bundles",
);

failsWith(
  "CORPUS_COMMIT_UNRESOLVED",
  () =>
    fetchAdmittedCorpus({
      pin: pinFor(happy.indexSha256, { commit: "1".repeat(40) }),
      transport: memoryTransport(happy.files),
    }),
  "un commit que el origen no tiene no se resuelve a otra cosa",
);

const tampered = buildCorpus();
tampered.files.set(
  `bundles/${tampered.bundleId}/fixtures/basico.dwg`,
  Buffer.from("bytes distintos de los que se revisaron", "utf8"),
);
failsWith(
  "CORPUS_ARTIFACT_SIZE_MISMATCH",
  () =>
    fetchAdmittedCorpus({
      pin: pinFor(tampered.indexSha256),
      transport: memoryTransport(tampered.files),
    }),
  "un fixture con otro tamaño se rechaza antes de mirar su contenido",
);

const sameSize = buildCorpus();
const original = sameSize.files.get(`bundles/${sameSize.bundleId}/fixtures/basico.dwg`);
sameSize.files.set(
  `bundles/${sameSize.bundleId}/fixtures/basico.dwg`,
  Buffer.from("X".repeat(original.length), "utf8"),
);
failsWith(
  "CORPUS_ARTIFACT_HASH_MISMATCH",
  () =>
    fetchAdmittedCorpus({
      pin: pinFor(sameSize.indexSha256),
      transport: memoryTransport(sameSize.files),
    }),
  "un fixture del mismo tamaño y distinto contenido tampoco pasa",
);

const oneValidator = buildCorpus({
  mutateManifest: (manifest) => ({
    ...manifest,
    validations: [
      { validator: "valle-reader", version: "1.0", result: "accepted", evidenceSha256: "a".repeat(64) },
      { validator: "valle-reader", version: "1.0", result: "accepted", evidenceSha256: "c".repeat(64) },
    ],
  }),
});
failsWith(
  "CORPUS_MANIFEST_INVALID",
  () =>
    fetchAdmittedCorpus({
      pin: pinFor(oneValidator.indexSha256),
      transport: memoryTransport(oneValidator.files),
    }),
  "el reader de Valle dos veces NO son dos oráculos independientes",
);

const clientData = buildCorpus({
  mutateManifest: (manifest) => ({
    ...manifest,
    rights: { ...manifest.rights, containsClientData: true },
  }),
});
failsWith(
  "CORPUS_MANIFEST_INVALID",
  () =>
    fetchAdmittedCorpus({
      pin: pinFor(clientData.indexSha256),
      transport: memoryTransport(clientData.files),
    }),
  "un bundle que admite datos de clientes no entra",
);

const escaping = buildCorpus({
  mutateManifest: (manifest) => ({
    ...manifest,
    fixtures: [{ ...manifest.fixtures[0], path: "fixtures/../../../etc/passwd" }],
  }),
});
failsWith(
  "CORPUS_ARTIFACT_PATH_UNSAFE",
  () =>
    fetchAdmittedCorpus({
      pin: pinFor(escaping.indexSha256),
      transport: memoryTransport(escaping.files),
    }),
  "una ruta que se sale del bundle se rechaza",
);

const stowaway = buildCorpus({
  extraFiles: new Map([
    ["bundles/sergio-r2000-basico/fixtures/polizon.dwg", Buffer.from("sin derechos", "utf8")],
  ]),
});
failsWith(
  "CORPUS_BUNDLE_NOT_ADMITTED",
  () =>
    fetchAdmittedCorpus({
      pin: pinFor(stowaway.indexSha256),
      transport: memoryTransport(stowaway.files),
    }),
  "un archivo que viaja sin manifestar delata bytes sin derechos declarados",
);

const overBudget = buildCorpus();
failsWith(
  "CORPUS_BUDGET_EXCEEDED",
  () =>
    fetchAdmittedCorpus({
      pin: pinFor(overBudget.indexSha256, { maxIndexBytes: 4 }),
      transport: memoryTransport(overBudget.files),
    }),
  "el presupuesto de bytes se cobra antes de parsear nada",
);

// --- 4b. enmienda 2026-08-20: origen tool-converted-original -----------------
const toolConverted = buildCorpus({
  mutateManifest: (manifest) => ({
    ...manifest,
    rights: {
      ...manifest.rights,
      origin: "tool-converted-original",
      tool: "ODA File Converter",
      toolVersion: "27.1",
      toolRegistryRef: "docs/TOOLS.md#oda-file-converter-27.1",
    },
    reviews: ["@sergiovalle3121"],
  }),
});
const toolConvertedReport = fetchAdmittedCorpus({
  pin: pinFor(toolConverted.indexSha256),
  transport: memoryTransport(toolConverted.files),
});
eq(
  toolConvertedReport.admittedBundleCount,
  1,
  "tool-converted-original con revisor-propietario y herramienta registrada se admite",
);
eq(
  toolConvertedReport.bundles[0].rightsOrigin,
  "tool-converted-original",
  "y declara su origen",
);

const toolWithoutRegistry = buildCorpus({
  mutateManifest: (manifest) => ({
    ...manifest,
    rights: { ...manifest.rights, origin: "tool-converted-original" },
    reviews: ["@sergiovalle3121"],
  }),
});
failsWith(
  "CORPUS_MANIFEST_INVALID",
  () =>
    fetchAdmittedCorpus({
      pin: pinFor(toolWithoutRegistry.indexSha256),
      transport: memoryTransport(toolWithoutRegistry.files),
    }),
  "tool-converted-original sin registro de herramienta no entra",
);

const singleReviewerClassic = buildCorpus({
  mutateManifest: (manifest) => ({ ...manifest, reviews: ["@sergio"] }),
});
failsWith(
  "CORPUS_MANIFEST_INVALID",
  () =>
    fetchAdmittedCorpus({
      pin: pinFor(singleReviewerClassic.indexSha256),
      transport: memoryTransport(singleReviewerClassic.files),
    }),
  "sergio-original con un solo revisor sigue exigiendo el segundo humano",
);

const duplicatedReviewerByCase = buildCorpus({
  mutateManifest: (manifest) => ({ ...manifest, reviews: ["@sergio", "@SERGIO"] }),
});
failsWith(
  "CORPUS_MANIFEST_INVALID",
  () =>
    fetchAdmittedCorpus({
      pin: pinFor(duplicatedReviewerByCase.indexSha256),
      transport: memoryTransport(duplicatedReviewerByCase.files),
    }),
  "el titular con otra capitalización no cuenta como segundo revisor",
);

// --- 5. credenciales de mínimo alcance ---------------------------------------
const noCredential = resolveCorpusCredential(basePin, {});
eq(noCredential.present, false, "sin token no se inventa una credencial");
eq(noCredential.secret, null, "y no hay secreto que filtrar");

failsWith(
  "CORPUS_CREDENTIAL_SCOPE_INVALID",
  () => resolveCorpusCredential(basePin, { VALLE_DWG_CORPUS_TOKEN: "t0ken" }),
  "un token sin alcance declarado se rechaza",
);
failsWith(
  "CORPUS_CREDENTIAL_SCOPE_INVALID",
  () =>
    resolveCorpusCredential(basePin, {
      VALLE_DWG_CORPUS_TOKEN: "t0ken",
      VALLE_DWG_CORPUS_TOKEN_SCOPE: "repo",
    }),
  "un token de alcance amplio se rechaza aunque funcione",
);
const scoped = resolveCorpusCredential(basePin, {
  VALLE_DWG_CORPUS_TOKEN: "t0ken",
  VALLE_DWG_CORPUS_TOKEN_SCOPE: "contents:read",
});
eq(scoped.present, true, "sólo el alcance de lectura se acepta");
ok(
  !JSON.stringify({ ...scoped, secret: undefined }).includes("t0ken"),
  "el informe imprimible del gate no arrastra el secreto",
);

// --- 6. transporte real: bytes canónicos del blob, no del working tree -------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "valle-dwg-corpus-"));
const git = (...args) =>
  execFileSync("git", ["-C", tmp, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_AUTHOR_NAME: "spec", GIT_AUTHOR_EMAIL: "spec@valle.local", GIT_COMMITTER_NAME: "spec", GIT_COMMITTER_EMAIL: "spec@valle.local" },
  });
git("init", "--quiet");
git("config", "core.autocrlf", "false");
fs.writeFileSync(path.join(tmp, "index.json"), emptyIndexBytes);
git("add", "index.json");
git("commit", "--quiet", "-m", "corpus vacio");
const realCommit = git("rev-parse", "HEAD").trim();

const mirrorReport = fetchAdmittedCorpus({
  pin: pinFor(sha256(emptyIndexBytes), { commit: realCommit }),
  transport: createLocalMirrorTransport(tmp),
});
eq(mirrorReport.status, "verified", "el espejo local verifica el índice vacío");
eq(mirrorReport.admittedBundleCount, 0, "y sigue diciendo cero bundles");

// El working tree se ensucia; el gate NO debe verlo: lee el objeto del commit.
fs.writeFileSync(path.join(tmp, "index.json"), encode({ schemaVersion: "1.0.0", updatedAt: "2026-01-01", bundles: [{ id: "falso", manifestPath: "bundles/falso/manifest.json", manifestSha256: "0".repeat(64) }] }));
const afterDirty = fetchAdmittedCorpus({
  pin: pinFor(sha256(emptyIndexBytes), { commit: realCommit }),
  transport: createLocalMirrorTransport(tmp),
});
eq(afterDirty.admittedBundleCount, 0, "un working tree sucio no inyecta bundles: se lee el commit fijado");
fs.rmSync(tmp, { recursive: true, force: true });

console.log(
  `corpus-consumer: ${checks} comprobaciones · índice vacío válido · commit y hash fijados · fallo cerrado tipado`,
);
