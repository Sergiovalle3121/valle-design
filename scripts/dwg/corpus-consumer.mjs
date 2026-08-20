/**
 * Lado CONSUMIDOR del corpus de conformidad DWG.
 *
 * POR QUÉ EXISTE. El repositorio hermano privado de conformidad ya tiene la
 * maquinaria legal —cuarentena, derechos, doble revisión humana, gate propio,
 * bundles inmutables— y su README promete que `valle-design` descargará
 * únicamente bundles ADMITIDOS «fijando el commit/hash esperado». Esa promesa
 * no tenía ni una línea de código de este lado. Un contrato que sólo existe en
 * la prosa de un README se rompe el día que alguien tiene prisa: se clona a
 * mano, se copia un fixture, y de pronto el corpus «independiente» es lo que
 * había en el disco de quien lo bajó.
 *
 * LO QUE ESTE MÓDULO GARANTIZA. Nada entra sin que el commit COINCIDA con el
 * pin y el contenido COINCIDA con su SHA-256:
 *
 * - el commit se fija en `corpus-pin.json`, nunca se resuelve una rama;
 * - `index.json` se lee del OBJETO de ese commit y se compara con el hash del
 *   pin (bytes canónicos del blob, no del working tree: así el resultado no
 *   depende de la conversión de fin de línea de cada máquina);
 * - cada manifest se compara con el `manifestSha256` que declara el índice;
 * - cada fixture y cada oracle se comparan con su `sha256` y su `byteLength`;
 * - el manifest debe seguir siendo `allowed`, sin datos de clientes, con dos
 *   revisores humanos distintos —o, bajo la enmienda 2026-08-20 del repo
 *   hermano, un revisor-propietario si el origen es `tool-converted-original`
 *   con su herramienta registrada— y DOS VALIDACIONES INDEPENDIENTES —la
 *   frase que gobierna la promoción en `CORPUS_POLICY.md`: el reader y el
 *   writer de Valle nunca son el único oráculo.
 *
 * FALLA CERRADO significa error TIPADO con código, nunca un resultado a medias
 * que parezca correcto: no hay «se descargaron 3 de 4», no hay bundle sin
 * verificar en la lista, no hay `catch` que devuelva `[]` como si el origen
 * hubiera dicho que no hay nada.
 *
 * CERO BUNDLES ES UN ESTADO VÁLIDO. Hoy el índice está vacío a propósito, y un
 * índice vacío verificado no es un fallo: es la respuesta correcta mientras el
 * dueño no haya firmado derechos sobre ningún dibujo. Confundir «no hay nada
 * admitido» con «algo se rompió» empujaría a apagar el gate para que CI pase.
 *
 * SIN DEPENDENCIAS RUNTIME y sin tocar el laboratorio: este módulo mueve
 * metadata y hashes, jamás interpreta un byte de DWG.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../..");
export const DEFAULT_PIN_FILE = path.join(here, "corpus-pin.json");

const SHA256_RE = /^[0-9a-f]{64}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const BUNDLE_ID_RE = /^[a-z0-9][a-z0-9.-]{0,127}$/;
const ADMITTED_DWG_VERSIONS = Object.freeze([
  "AC1009",
  "AC1012",
  "AC1014",
  "AC1015",
  "AC1018",
  "AC1021",
  "AC1024",
  "AC1027",
  "AC1032",
]);
const ADMITTED_ORIGINS = Object.freeze([
  "sergio-original",
  "donated-original",
  "licensed-third-party",
  "tool-converted-original",
]);
const TOOL_REGISTRY_REF_RE = /^docs\/TOOLS\.md#[a-z0-9][a-z0-9.-]{0,127}$/;

/**
 * El único error que este módulo lanza hacia fuera.
 *
 * Lleva `code` porque el llamador tiene que poder distinguir «el origen no
 * está configurado» de «el hash no cuadra» SIN leer un mensaje en prosa. Un
 * gate que discrimina por `error.message` se rompe al traducir una frase.
 */
export class DwgCorpusGateError extends Error {
  constructor(code, message, detail = {}) {
    super(`corpus DWG [${code}]: ${message}`);
    this.name = "DwgCorpusGateError";
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, message, detail) => {
  throw new DwgCorpusGateError(code, message, detail);
};

/** SHA-256 hexadecimal de un buffer de bytes. */
export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// ---------------------------------------------------------------------------
// Pin: commit Y hash, los dos o ninguno
// ---------------------------------------------------------------------------

/**
 * Lee y VALIDA el pin. Un pin ilegible o incompleto no degrada a «bajemos lo
 * que haya en main»: sin pin no hay descarga, punto.
 */
export function loadCorpusPin(file = DEFAULT_PIN_FILE) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    fail("CORPUS_PIN_UNREADABLE", `no se puede leer ${path.basename(file)}`, {
      file,
      cause: error?.message,
    });
  }
  let pin;
  try {
    pin = JSON.parse(raw);
  } catch {
    fail("CORPUS_PIN_INVALID", "el pin no es JSON válido", { file });
  }
  if (pin?.schemaVersion !== "1.0.0")
    fail("CORPUS_PIN_INVALID", "schemaVersion desconocida", {
      schemaVersion: pin?.schemaVersion,
    });
  if (typeof pin.repository !== "string" || !pin.repository.startsWith("https://"))
    fail("CORPUS_PIN_INVALID", "el origen debe ser una URL https explícita");
  if (!COMMIT_RE.test(pin.commit ?? ""))
    fail("CORPUS_PIN_INVALID", "el pin debe fijar un commit de 40 hex, no una rama");
  if (!SHA256_RE.test(pin.indexSha256 ?? ""))
    fail("CORPUS_PIN_INVALID", "el pin debe fijar el SHA-256 del índice");
  if (pin.indexPath !== "index.json")
    fail("CORPUS_PIN_INVALID", "el índice admitido es index.json");
  for (const key of [
    "maxIndexBytes",
    "maxManifestBytes",
    "maxArtifactBytes",
    "maxTotalBytes",
  ]) {
    if (!Number.isSafeInteger(pin[key]) || pin[key] <= 0)
      fail("CORPUS_PIN_INVALID", `el presupuesto ${key} no es un entero positivo`);
  }
  return Object.freeze({ ...pin });
}

// ---------------------------------------------------------------------------
// Credenciales de mínimo alcance
// ---------------------------------------------------------------------------

/**
 * Resuelve la credencial de lectura, o declara honestamente que no hay.
 *
 * MÍNIMO ALCANCE, y se comprueba: el proceso debe DECLARAR el alcance del token
 * en su propia variable y ese alcance debe ser exactamente el de lectura de
 * contenidos. Un token de escritura o de organización entero se rechaza aquí,
 * antes de tocar la red. No podemos inspeccionar los permisos reales de un
 * token sin gastarlos, pero sí podemos negarnos a usar uno que su dueño no se
 * atreve a describir.
 *
 * El VALOR nunca vuelve al llamador dentro de un objeto imprimible: se entrega
 * en `secret` y el resto del módulo sólo lo pasa por ENTORNO al proceso hijo,
 * jamás por `argv` —la línea de comandos de un proceso la lee cualquiera en la
 * misma máquina— ni por ningún log.
 */
export function resolveCorpusCredential(pin, env = process.env) {
  const token = env[pin.credentialEnv];
  const scope = env[pin.credentialScopeEnv];
  if (!token) return Object.freeze({ present: false, scope: null, secret: null });
  if (scope !== pin.requiredCredentialScope) {
    fail(
      "CORPUS_CREDENTIAL_SCOPE_INVALID",
      `${pin.credentialEnv} está presente pero ${pin.credentialScopeEnv} no declara "${pin.requiredCredentialScope}"`,
      { declaredScope: scope ?? null, requiredScope: pin.requiredCredentialScope },
    );
  }
  return Object.freeze({ present: true, scope, secret: token });
}

// ---------------------------------------------------------------------------
// Transportes: leen OBJETOS de un commit, nunca el working tree
// ---------------------------------------------------------------------------

/**
 * Transporte contra un clon local ya existente (mirror).
 *
 * Lee con `git cat-file` los bytes CANÓNICOS del blob en el commit fijado. No
 * mira el working tree a propósito: un checkout con `core.autocrlf` distinto
 * daría otro SHA-256 y el gate fallaría por una diferencia de plataforma en
 * vez de por una diferencia real de contenido.
 */
export function createLocalMirrorTransport(directory) {
  const git = (args, options = {}) =>
    execFileSync("git", ["-C", directory, ...args], {
      encoding: "buffer",
      maxBuffer: 1024 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
  return {
    kind: "local-mirror",
    origin: directory,
    hasCommit(commit) {
      try {
        git(["cat-file", "-e", `${commit}^{commit}`]);
        return true;
      } catch {
        return false;
      }
    },
    readFile(commit, filePath) {
      try {
        return git(["cat-file", "blob", `${commit}:${filePath}`]);
      } catch {
        return null;
      }
    },
    listFiles(commit, prefix) {
      try {
        const out = git([
          "ls-tree",
          "-r",
          "--name-only",
          commit,
          "--",
          prefix,
        ]).toString("utf8");
        return out.split("\n").map((line) => line.trim()).filter(Boolean);
      } catch {
        return [];
      }
    },
  };
}

/**
 * Transporte real de descarga: clon bare superficial DEL COMMIT FIJADO.
 *
 * `git fetch --depth=1 origin <commit>` trae exactamente ese objeto y nada
 * más: ni ramas, ni historia, ni los bundles rechazados que pudieran haber
 * pasado por el repositorio. La credencial viaja por `GIT_CONFIG_*`, que son
 * variables de entorno del hijo, y no por `argv`.
 */
export function createGitFetchTransport({ repository, commit, credential, cacheDir }) {
  const dir = cacheDir ?? path.join(REPO_ROOT, ".cache", "dwg-corpus");
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  if (credential?.present) {
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.extraHeader";
    env.GIT_CONFIG_VALUE_0 = `Authorization: Bearer ${credential.secret}`;
  }
  const git = (args) =>
    execFileSync("git", ["-C", dir, ...args], {
      encoding: "buffer",
      env,
      maxBuffer: 1024 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });

  let prepared = false;
  const prepare = () => {
    if (prepared) return;
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(path.join(dir, "HEAD"))) {
      execFileSync("git", ["init", "--bare", "--quiet", dir], { env, stdio: "ignore" });
    }
    try {
      git(["fetch", "--depth=1", "--no-tags", "--quiet", repository, commit]);
    } catch (error) {
      fail("CORPUS_TRANSPORT_FAILED", "el fetch del commit fijado no completó", {
        repository,
        commit,
        cause: String(error?.message ?? error).slice(0, 300),
      });
    }
    prepared = true;
  };

  const mirror = createLocalMirrorTransport(dir);
  return {
    kind: "git-fetch",
    origin: repository,
    hasCommit(target) {
      prepare();
      return mirror.hasCommit(target);
    },
    readFile(target, filePath) {
      prepare();
      return mirror.readFile(target, filePath);
    },
    listFiles(target, prefix) {
      prepare();
      return mirror.listFiles(target, prefix);
    },
  };
}

// ---------------------------------------------------------------------------
// El gate
// ---------------------------------------------------------------------------

function portableBundlePath(value, bundleId, prefix) {
  if (
    typeof value !== "string" ||
    value.includes("\\") ||
    value.startsWith("/") ||
    !value.startsWith(`${prefix}/`) ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    fail("CORPUS_ARTIFACT_PATH_UNSAFE", "un artefacto declara una ruta no portable", {
      bundleId,
      declaredPath: typeof value === "string" ? value : null,
    });
  }
  return `bundles/${bundleId}/${value}`;
}

/**
 * Comprueba las invariantes de ADMISIÓN del manifest.
 *
 * No es una copia decorativa del gate del repositorio hermano: es la mitad
 * consumidora del mismo contrato. Si el hermano se relajara, este lado seguiría
 * negándose. Dos gates que se verifican mutuamente valen más que uno solo.
 */
function assertAdmittedManifest(manifest, bundleId) {
  const bad = (message, detail) =>
    fail("CORPUS_MANIFEST_INVALID", message, { bundleId, ...detail });

  if (manifest?.schemaVersion !== "1.0.0") bad("schemaVersion desconocida");
  if (manifest.id !== bundleId) bad("el manifest no se llama como su bundle");
  if (manifest.status !== "allowed") bad("el bundle no está admitido");
  if (!ADMITTED_DWG_VERSIONS.includes(manifest.dwgVersion))
    bad("versión DWG fuera del conjunto admitido", { dwgVersion: manifest.dwgVersion });
  if (!ADMITTED_ORIGINS.includes(manifest.rights?.origin))
    bad("origen de derechos no admitido", { origin: manifest.rights?.origin });
  if (manifest.rights?.containsClientData !== false)
    bad("el manifest no descarta datos de clientes");
  if (
    typeof manifest.rights?.attestationRef !== "string" ||
    !manifest.rights.attestationRef.startsWith("private-attestation:")
  )
    bad("falta la referencia privada del acuerdo de derechos");
  if (!Array.isArray(manifest.sourceFactIds) || manifest.sourceFactIds.length === 0)
    bad("el bundle no declara los hechos de fuente que lo justifican");
  // Enmienda 2026-08-20 de CORPUS_POLICY.md (repo hermano): el origen
  // tool-converted-original admite UN revisor-propietario porque lo respaldan
  // dos validaciones automáticas independientes Y la herramienta registrada
  // (toolRegistryRef obligatorio). Cualquier otro origen sigue exigiendo dos
  // revisores humanos distintos.
  const reviewers = Array.isArray(manifest.reviews)
    ? new Set(
        manifest.reviews.map((handle) =>
          typeof handle === "string" ? handle.toLowerCase() : handle,
        ),
      )
    : new Set();
  if (manifest.rights?.origin === "tool-converted-original") {
    if (reviewers.size < 1)
      bad("la admisión tool-converted-original exige al menos el revisor-propietario");
    if (!TOOL_REGISTRY_REF_RE.test(manifest.rights?.toolRegistryRef ?? ""))
      bad("un bundle tool-converted-original no referencia su registro de herramienta");
  } else if (reviewers.size < 2) {
    bad("la admisión exige dos revisores humanos distintos");
  }

  // La frase de CORPUS_POLICY.md, hecha código: el reader y el writer Valle
  // nunca son el único oráculo. Dos validaciones INDEPENDIENTES —validador y
  // versión distintos— y las dos con resultado `accepted`.
  if (!Array.isArray(manifest.validations) || manifest.validations.length < 2)
    bad("la promoción exige dos validaciones independientes");
  const validators = new Set();
  for (const validation of manifest.validations) {
    if (validation?.result !== "accepted")
      bad("una validación no está aceptada", { validator: validation?.validator });
    if (!SHA256_RE.test(validation?.evidenceSha256 ?? ""))
      bad("una validación no fija el hash de su evidencia");
    validators.add(`${validation.validator} ${validation.version}`);
  }
  if (validators.size < 2) bad("las dos validaciones no son independientes");
}

function parseJsonBytes(bytes, code, detail) {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    fail(code, "el contenido descargado no es JSON válido", detail);
  }
}

/**
 * Descarga y verifica los bundles ADMITIDOS del commit fijado.
 *
 * Devuelve un informe completo o lanza. Nunca devuelve una lista parcial: si un
 * solo hash no cuadra, no hay corpus.
 */
export function fetchAdmittedCorpus({ pin, transport }) {
  if (!transport.hasCommit(pin.commit)) {
    fail("CORPUS_COMMIT_UNRESOLVED", "el commit fijado no existe en el origen", {
      commit: pin.commit,
      origin: transport.origin,
    });
  }

  const indexBytes = transport.readFile(pin.commit, pin.indexPath);
  if (!indexBytes)
    fail("CORPUS_INDEX_INVALID", "el commit fijado no contiene index.json", {
      commit: pin.commit,
    });
  if (indexBytes.length > pin.maxIndexBytes)
    fail("CORPUS_BUDGET_EXCEEDED", "el índice supera su presupuesto de bytes", {
      byteLength: indexBytes.length,
      limit: pin.maxIndexBytes,
    });

  const actualIndexSha256 = sha256(indexBytes);
  if (actualIndexSha256 !== pin.indexSha256) {
    // El caso que justifica todo el módulo: el commit puede existir y el
    // contenido no ser el que se revisó. Fallo cerrado, sin bundles.
    fail("CORPUS_INDEX_HASH_MISMATCH", "el índice no coincide con el hash fijado", {
      expected: pin.indexSha256,
      actual: actualIndexSha256,
    });
  }

  const index = parseJsonBytes(indexBytes, "CORPUS_INDEX_INVALID", {
    file: pin.indexPath,
  });
  if (index?.schemaVersion !== "1.0.0" || !Array.isArray(index.bundles))
    fail("CORPUS_INDEX_INVALID", "el índice no tiene la forma esperada");

  let totalBytes = indexBytes.length;
  const seenIds = new Set();
  const bundles = [];

  for (const entry of index.bundles) {
    if (!BUNDLE_ID_RE.test(entry?.id ?? ""))
      fail("CORPUS_INDEX_INVALID", "id de bundle inválido", { id: entry?.id ?? null });
    if (seenIds.has(entry.id))
      fail("CORPUS_INDEX_INVALID", "id de bundle duplicado", { id: entry.id });
    seenIds.add(entry.id);
    if (entry.manifestPath !== `bundles/${entry.id}/manifest.json`)
      fail("CORPUS_INDEX_INVALID", "el manifest no vive donde su id manda", {
        id: entry.id,
      });
    if (!SHA256_RE.test(entry.manifestSha256 ?? ""))
      fail("CORPUS_INDEX_INVALID", "el índice no fija el hash del manifest", {
        id: entry.id,
      });

    const manifestBytes = transport.readFile(pin.commit, entry.manifestPath);
    if (!manifestBytes)
      fail("CORPUS_MANIFEST_INVALID", "el manifest declarado no existe", {
        bundleId: entry.id,
      });
    if (manifestBytes.length > pin.maxManifestBytes)
      fail("CORPUS_BUDGET_EXCEEDED", "el manifest supera su presupuesto", {
        bundleId: entry.id,
      });
    const manifestSha256 = sha256(manifestBytes);
    if (manifestSha256 !== entry.manifestSha256)
      fail("CORPUS_MANIFEST_HASH_MISMATCH", "el manifest no coincide con su hash", {
        bundleId: entry.id,
        expected: entry.manifestSha256,
        actual: manifestSha256,
      });

    const manifest = parseJsonBytes(manifestBytes, "CORPUS_MANIFEST_INVALID", {
      bundleId: entry.id,
    });
    assertAdmittedManifest(manifest, entry.id);

    const artifacts = [];
    for (const [prefix, list] of [
      ["fixtures", manifest.fixtures],
      ["oracles", manifest.oracles],
    ]) {
      if (!Array.isArray(list) || list.length === 0)
        fail("CORPUS_MANIFEST_INVALID", `el bundle no declara ${prefix}`, {
          bundleId: entry.id,
        });
      for (const artifact of list) {
        const repoPath = portableBundlePath(artifact?.path, entry.id, prefix);
        if (!SHA256_RE.test(artifact?.sha256 ?? ""))
          fail("CORPUS_MANIFEST_INVALID", "un artefacto no declara su SHA-256", {
            bundleId: entry.id,
            declaredPath: artifact?.path ?? null,
          });
        if (
          !Number.isSafeInteger(artifact?.byteLength) ||
          artifact.byteLength < 1 ||
          artifact.byteLength > pin.maxArtifactBytes
        )
          fail("CORPUS_MANIFEST_INVALID", "un artefacto declara un tamaño inválido", {
            bundleId: entry.id,
            declaredPath: artifact?.path ?? null,
          });

        const bytes = transport.readFile(pin.commit, repoPath);
        if (!bytes)
          fail("CORPUS_ARTIFACT_HASH_MISMATCH", "un artefacto declarado no existe", {
            bundleId: entry.id,
            declaredPath: artifact.path,
          });
        if (bytes.length !== artifact.byteLength)
          fail("CORPUS_ARTIFACT_SIZE_MISMATCH", "el tamaño real no es el declarado", {
            bundleId: entry.id,
            declaredPath: artifact.path,
            expected: artifact.byteLength,
            actual: bytes.length,
          });
        const digest = sha256(bytes);
        if (digest !== artifact.sha256)
          fail("CORPUS_ARTIFACT_HASH_MISMATCH", "el artefacto no coincide con su hash", {
            bundleId: entry.id,
            declaredPath: artifact.path,
            expected: artifact.sha256,
            actual: digest,
          });

        totalBytes += bytes.length;
        if (totalBytes > pin.maxTotalBytes)
          fail("CORPUS_BUDGET_EXCEEDED", "el corpus supera el presupuesto total", {
            totalBytes,
            limit: pin.maxTotalBytes,
          });
        artifacts.push({ kind: prefix, id: artifact.id, path: repoPath, sha256: digest });
      }
    }

    // Un archivo que viaja en el bundle pero no está en el manifest es
    // exactamente lo que la política prohíbe: bytes sin derechos declarados.
    const declared = new Set(["manifest.json", ...artifacts.map((a) => a.path)]);
    declared.add(entry.manifestPath);
    for (const filePath of transport.listFiles(pin.commit, `bundles/${entry.id}/`)) {
      if (!declared.has(filePath))
        fail("CORPUS_BUNDLE_NOT_ADMITTED", "el bundle lleva un archivo sin manifestar", {
          bundleId: entry.id,
          unmanifested: filePath,
        });
    }

    bundles.push(
      Object.freeze({
        id: entry.id,
        dwgVersion: manifest.dwgVersion,
        manifestSha256,
        rightsOrigin: manifest.rights.origin,
        sourceFactIds: [...manifest.sourceFactIds],
        reviewers: [...new Set(manifest.reviews)],
        independentValidations: new Set(
          manifest.validations.map((v) => `${v.validator} ${v.version}`),
        ).size,
        fixtureCount: artifacts.filter((a) => a.kind === "fixtures").length,
        oracleCount: artifacts.filter((a) => a.kind === "oracles").length,
        artifacts,
      }),
    );
  }

  return Object.freeze({
    status: "verified",
    origin: transport.origin,
    transport: transport.kind,
    commit: pin.commit,
    indexSha256: actualIndexSha256,
    updatedAt: typeof index.updatedAt === "string" ? index.updatedAt : null,
    admittedBundleCount: bundles.length,
    totalBytes,
    bundles,
  });
}

/**
 * Elige transporte según lo que el entorno OFREZCA, y dice la verdad cuando no
 * ofrece nada.
 *
 * `status:"unavailable"` no es un fallo: es «este proceso no tenía por dónde
 * bajar el corpus». La diferencia con un fallo importa porque `check:dwg` corre
 * en máquinas sin credencial y sin espejo, y un gate que revienta ahí acabaría
 * desactivado. Lo que NO puede pasar —y por eso `admittedBundleCount` es 0
 * explícito— es que un corpus no descargado se cuente como corpus verificado.
 */
export function resolveCorpusSource({ pin, env = process.env, cacheDir } = {}) {
  const credential = resolveCorpusCredential(pin, env);
  const mirror = env[pin.mirrorEnv];
  if (mirror) {
    if (!fs.existsSync(path.join(mirror, ".git")) && !fs.existsSync(path.join(mirror, "HEAD"))) {
      fail("CORPUS_TRANSPORT_FAILED", `${pin.mirrorEnv} no apunta a un repositorio git`, {
        mirror,
      });
    }
    return { credential, transport: createLocalMirrorTransport(mirror) };
  }
  if (credential.present) {
    return {
      credential,
      transport: createGitFetchTransport({
        repository: pin.repository,
        commit: pin.commit,
        credential,
        cacheDir,
      }),
    };
  }
  return { credential, transport: null };
}

/** Informe honesto de «no había origen»: cero bundles, y consta por qué. */
export function unavailableCorpusReport(pin, credential) {
  return Object.freeze({
    status: "unavailable",
    origin: pin.repository,
    transport: null,
    commit: pin.commit,
    indexSha256: null,
    updatedAt: null,
    admittedBundleCount: 0,
    totalBytes: 0,
    bundles: [],
    reason: credential?.present
      ? "credencial presente pero sin transporte utilizable"
      : `sin ${pin.mirrorEnv} y sin ${pin.credentialEnv}: no se descargó nada y no se afirma nada`,
  });
}

/** Punto de entrada de alto nivel: pin → origen → informe verificado. */
export function readAdmittedCorpus({ pinFile, env = process.env, cacheDir } = {}) {
  const pin = loadCorpusPin(pinFile);
  const { credential, transport } = resolveCorpusSource({ pin, env, cacheDir });
  if (!transport) return unavailableCorpusReport(pin, credential);
  return fetchAdmittedCorpus({ pin, transport });
}
