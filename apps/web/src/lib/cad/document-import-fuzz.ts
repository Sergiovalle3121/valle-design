/**
 * Corpus hostil y fuzzing determinista de la importación de JSON canónico.
 *
 * ## Por qué vive en `src/` y no dentro del spec
 *
 * Porque la fila de la rúbrica dice «ejecutados EN NAVEGADOR, no sólo en Node»,
 * y la única forma de que esa frase signifique algo es que los DOS entornos
 * ejecuten exactamente el mismo corpus. Si el spec de Node tuviera sus casos y
 * el de Playwright los suyos, comparar sus resultados no diría nada sobre el
 * motor: diría que dos personas escribieron dos listas. Aquí el corpus es uno,
 * el clasificador es uno, y lo que cambia entre entornos es sólo quién lo
 * ejecuta.
 *
 * ## Por qué importa el motor y no basta con Node
 *
 * Porque las tres puertas que protegen esta ruta dependen del intérprete:
 *
 * - `JSON.parse` y la clave `__proto__`. Que aparezca como propiedad ENUMERABLE
 *   —y por tanto que la guarda de claves inseguras la vea— es comportamiento
 *   del motor, no del producto.
 * - La profundidad. El recorrido de `assertSafeJson` es iterativo con pila
 *   explícita, pero `JSON.parse` sí es recursivo dentro del motor: un documento
 *   suficientemente anidado revienta la pila del INTÉRPRETE antes de llegar a
 *   nuestra guarda, y dónde está ese punto lo decide V8 o SpiderMonkey.
 * - El tamaño. El límite de 20 MB se mide en bytes UTF-8 con `TextEncoder`, y
 *   entre pares subrogados sueltos y BOM la cuenta de bytes no coincide con la
 *   de caracteres. En Node y en el navegador hay implementaciones distintas.
 *
 * ## La forma la enseñó el fuzzer del laboratorio de formato binario
 *
 * Semilla literal fija, casos derivados por hash de la semilla y el índice
 * (nada de PRNG con estado que dependa del orden de ejecución), DOS pasadas
 * comparadas por digest —el determinismo del fuzzer es él mismo una aserción—,
 * histograma por clase de fallo, y un invariante que vale más que todos los
 * umbrales: **ningún caso puede escapar por el error genérico**. Un caso que
 * clasifica en «desconocido» es un agujero, aunque no haya roto nada.
 *
 * ## Lo que este módulo NO hace
 *
 * No toca el worker ni el cliente de importación: `importDocumentFile` crea un
 * `Worker` desde una URL de módulo, y eso no sobrevive a un empaquetado IIFE
 * inyectado en una página en blanco. El camino del worker se cubre por la
 * interfaz real del producto, en el propio spec de navegador, con unos pocos
 * casos. Aquí se ataca `importDocumentText`, que es donde vive el 100 % de la
 * lógica de validación.
 */
import {
  importDocumentText,
  validateImportFile,
  type DocumentImportReport,
} from "./document-import";
import { serializeCadDocument } from "./cad-document";

/** Semilla literal. Cambiarla invalida los digests ya publicados. */
export const CAD_IMPORT_FUZZ_SEED = "valle-json-import-fuzz-2026-08-19-v1";

/**
 * Clases de resultado. Son la tabla contra la que se clasifica CADA caso.
 *
 * `desconocido` existe para poder contarlo, no para tolerarlo: el invariante
 * del arnés es que su cuenta sea cero. Un mensaje que nadie ha previsto es una
 * puerta que nadie ha revisado.
 */
export const CAD_IMPORT_OUTCOMES = {
  ok: /^$/,
  "formato-no-soportado": /Formato no soportado/i,
  "tamano-invalido": /está vacío o su tamaño no es válido/i,
  "supera-limite": /supera el límite de/i,
  "json-no-analizable": /El JSON no se puede analizar/i,
  "limites-estructurales": /excede los límites estructurales seguros/i,
  "clave-insegura": /contiene una clave insegura/i,
  "no-canonico": /no contiene un documento CAD canónico/i,
  "migracion-no-objeto": /CadDocument must be an object/i,
  "migracion-esquema": /Unsupported CadDocument schema/i,
  "migracion-no-finito": /non-finite numeric values/i,
  "migracion-ids": /entity ids must be non-empty and unique/i,
  "limite-cliente": /exceeds the 20 MB client limit/i,
  "dxf-corrupto": /DXF (corrupto|no válido)|no es un DXF/i,
  "pila-del-motor": /call stack|too much recursion|stack size/i,
} as const;

export type CadImportOutcome = keyof typeof CAD_IMPORT_OUTCOMES | "desconocido";

/** Clasifica un mensaje en una de las clases conocidas. */
export function classifyCadImportError(message: string): CadImportOutcome {
  for (const [outcome, pattern] of Object.entries(CAD_IMPORT_OUTCOMES)) {
    if (outcome === "ok") continue;
    if (pattern.test(message)) return outcome as CadImportOutcome;
  }
  return "desconocido";
}

// ---------------------------------------------------------------------------
// Aleatoriedad determinista, sin estado compartido entre casos
// ---------------------------------------------------------------------------

/**
 * Hash de 32 bits sobre una cadena (xmur3). Deterministo en cualquier motor
 * porque sólo usa aritmética entera de 32 bits, que IEEE-754 no toca.
 */
function hash32(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    h = Math.imul(h ^ text.charCodeAt(index), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/**
 * PRNG por caso, sembrado con `hash32(semilla ‖ índice)`.
 *
 * Uno por caso y no uno global: así el caso 4.312 produce lo mismo tanto si se
 * ejecuta el corpus entero como si alguien lo ejecuta suelto para depurarlo. Un
 * generador global haría que reproducir un fallo exigiera reproducir toda la
 * corrida anterior.
 */
function caseRandom(index: number): () => number {
  let state = hash32(`${CAD_IMPORT_FUZZ_SEED}#${index}`);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Digest de la corrida: dos carriles de 32 bits sobre el texto acumulado. */
export function fuzzDigest(parts: readonly string[]): string {
  const joined = parts.join("\u001f");
  const low = hash32(joined);
  const high = hash32(`${joined}\u001eH`);
  return `${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
}

// ---------------------------------------------------------------------------
// Documento canónico válido, base de las mutaciones
// ---------------------------------------------------------------------------

/** Documento pequeño y VÁLIDO. Todo lo hostil sale de romper éste. */
export function validCanonicalDocument(entities = 12): Record<string, unknown> {
  const list = Array.from({ length: entities }, (_, index) => ({
    id: `fuzz-${String(index).padStart(4, "0")}`,
    type: "line",
    start: { x: index * 10, y: index * 5, z: 0 },
    end: { x: index * 10 + 100, y: index * 5 + 60, z: 0 },
    layer: index % 2 === 0 ? "MURO" : "0",
  }));
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MURO", name: "MURO", color: "#f8fafc", visible: true, locked: false },
    ],
    entities: list,
    history: [],
    modelSpace: { entityIds: list.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
  };
}

// ---------------------------------------------------------------------------
// Corpus hostil DECLARADO: las esquinas, escritas a mano
// ---------------------------------------------------------------------------

export interface HostileCase {
  id: string;
  fileName: string;
  content: string;
  /** Qué debe pasar. `null` = basta con que clasifique en algo conocido. */
  expect: CadImportOutcome | null;
  why: string;
}

function nestedJson(depth: number): string {
  return `${"[".repeat(depth)}1${"]".repeat(depth)}`;
}

/**
 * Los casos que el PRNG nunca produciría por azar.
 *
 * Cada uno ataca una puerta concreta y trae escrito CUÁL. Sin ese campo, dentro
 * de un año una lista de cadenas raras no le dice a nadie qué se estaba
 * protegiendo.
 */
export function hostileCorpus(options: { includeHuge?: boolean } = {}): HostileCase[] {
  const valid = validCanonicalDocument();
  const cases: HostileCase[] = [
    {
      id: "extension-dwg",
      fileName: "plano.dwg",
      content: "{}",
      expect: "formato-no-soportado",
      why: "La puerta de formato: por aquí sólo entran DXF de texto y JSON canónico, y nada más.",
    },
    {
      id: "vacio",
      fileName: "plano.json",
      content: "",
      expect: "tamano-invalido",
      why: "Un archivo de cero bytes no es un documento: se rechaza por tamaño, antes de intentar parsearlo.",
    },
    {
      id: "json-truncado",
      fileName: "plano.json",
      content: JSON.stringify(valid).slice(0, 200),
      expect: "json-no-analizable",
      why: "Una descarga cortada a la mitad. Es el fallo de red más común.",
    },
    {
      id: "json-basura",
      fileName: "plano.json",
      content: "{not-json",
      expect: "json-no-analizable",
      why: "Texto que no es JSON en absoluto: el caso de quien renombra un .txt a .json y lo arrastra.",
    },
    {
      id: "proto-clave-propia",
      fileName: "plano.json",
      content: `{"meta":{"schema":3},"entities":[],"__proto__":{"polluted":true}}`,
      expect: "clave-insegura",
      why: "Contaminación de prototipo. La guarda depende de que el motor materialice __proto__ como propiedad propia enumerable: es exactamente el comportamiento que Node no puede responder por Chromium ni por Firefox.",
    },
    {
      id: "constructor-anidado",
      fileName: "plano.json",
      content: `{"meta":{"schema":3},"entities":[{"constructor":{"x":1}}]}`,
      expect: "clave-insegura",
      why: "La clave prohibida escondida un nivel más abajo: la guarda recorre TODO el árbol, no sólo la raíz.",
    },
    {
      id: "prototype-en-hoja",
      fileName: "plano.json",
      content: `{"meta":{"schema":3},"entities":[],"styles":{"text":{"prototype":{}}}}`,
      expect: "clave-insegura",
      why: "Ídem, escondida en una hoja del árbol de estilos que el importador sí recorre y sí lee.",
    },
    {
      id: "profundidad-129",
      fileName: "plano.json",
      content: `{"meta":{"schema":3},"entities":[],"deep":${nestedJson(129)}}`,
      expect: "limites-estructurales",
      why: "Un nivel por encima del tope de 128. El caso que separa «rechazado» de «aceptado» tiene que estar en el corpus, no cerca.",
    },
    {
      id: "profundidad-2000",
      fileName: "plano.json",
      content: `{"meta":{"schema":3},"entities":[],"deep":${nestedJson(2_000)}}`,
      expect: null,
      why: "Muy por encima del tope. Puede rechazarlo nuestra guarda o puede reventar antes la pila del propio JSON.parse: las dos son respuestas aceptables, y CUÁL de las dos ocurre lo decide el motor. Por eso no se fija expectativa y sí se publica la clase observada.",
    },
    {
      id: "sin-meta",
      fileName: "plano.json",
      content: `{"entities":[]}`,
      expect: "no-canonico",
      why: "Forma mínima: sin `meta` no hay versión de esquema que comprobar, así que no es canónico.",
    },
    {
      id: "entities-no-array",
      fileName: "plano.json",
      content: `{"meta":{"schema":3},"entities":{"0":{"id":"a"}}}`,
      expect: "no-canonico",
      why: "Un objeto donde se espera una lista. Es lo que produce un serializador ajeno mal escrito.",
    },
    {
      id: "raiz-array",
      fileName: "plano.json",
      content: `[{"meta":{"schema":3},"entities":[]}]`,
      expect: "no-canonico",
      why: "El documento envuelto en una lista: el error de quien exporta «todos mis planos».",
    },
    {
      id: "raiz-nula",
      fileName: "plano.json",
      content: "null",
      expect: "no-canonico",
      why: "JSON perfectamente válido que no es un objeto. La puerta de forma tiene que verlo igual.",
    },
    {
      id: "esquema-futuro",
      fileName: "plano.json",
      content: JSON.stringify({ ...valid, meta: { version: 1, schema: 99, unit: "mm" } }),
      expect: "migracion-esquema",
      why: "Un archivo de una versión futura del producto. Fallo cerrado: no se intenta adivinar.",
    },
    {
      id: "no-finito-por-cadena",
      fileName: "plano.json",
      content: JSON.stringify(valid).replace('"x":0', '"x":1e999'),
      expect: "migracion-no-finito",
      why: "JSON no tiene Infinity, pero 1e999 se parsea como Infinity. Es la vía por la que un no-finito entra sin que el JSON sea inválido.",
    },
    {
      id: "ids-duplicados",
      fileName: "plano.json",
      content: JSON.stringify({
        ...valid,
        entities: [
          ...(valid.entities as unknown[]),
          { ...((valid.entities as Record<string, unknown>[])[0] ?? {}) },
        ],
      }),
      expect: "migracion-ids",
      why: "Dos entidades con el mismo id rompen toda referencia posterior: selección, historial y bloques.",
    },
    {
      id: "id-vacio",
      fileName: "plano.json",
      content: JSON.stringify({
        ...valid,
        entities: [{ ...((valid.entities as Record<string, unknown>[])[0] ?? {}), id: "" }],
      }),
      expect: "migracion-ids",
      why: "Un id vacío es indistinguible de «sin id» y ninguna referencia podría apuntarlo.",
    },
    {
      id: "bom-al-frente",
      fileName: "plano.json",
      content: `﻿${JSON.stringify(valid)}`,
      expect: null,
      why: "La marca de orden de bytes que ponen los editores de Windows. Si el motor la rechaza, el mensaje debe ser el de JSON no analizable y NO el genérico. Se observa y se publica.",
    },
    {
      id: "nulo-incrustado",
      fileName: "plano.json",
      content: JSON.stringify(valid).replace("fuzz-0000", "fuzz-\u0000000"),
      expect: null,
      why: "Un carácter NUL dentro de un id. Es JSON legal y el importador no lo prohíbe: interesa saber si pasa, porque un id con NUL viaja distinto por cada capa.",
    },
    {
      id: "subrogado-suelto",
      fileName: "plano.json",
      content: JSON.stringify(valid).replace("MURO", "MU\uD800RO"),
      expect: null,
      why: "Media pareja subrogada. `TextEncoder` la sustituye por el carácter de reemplazo y la cuenta de BYTES deja de coincidir con la de caracteres: es justo donde un límite medido en bytes puede sorprender.",
    },
    {
      id: "clave-duplicada",
      fileName: "plano.json",
      content: `{"meta":{"schema":3},"entities":[],"meta":{"schema":99}}`,
      expect: null,
      why: "JSON permite claves repetidas y el motor se queda con la última. Qué esquema acaba viendo el importador lo decide el intérprete, no nosotros.",
    },
    {
      id: "dxf-que-no-lo-es",
      fileName: "plano.dxf",
      content: "esto no es DXF",
      expect: "dxf-corrupto",
      why: "La otra rama del despachador. Entra por la misma puerta y debe fallar tipada igual.",
    },
  ];
  if (options.includeHuge !== false) {
    // Un caso REAL por encima del límite, no un tamaño fabricado. Cuesta unos
    // 20 MB de memoria y es el único modo de comprobar que el límite se aplica
    // sobre los bytes de verdad y no sobre lo que alguien dijo que medía.
    cases.push({
      id: "veinte-megas-reales",
      fileName: "plano.json",
      content: `{"meta":{"schema":3},"entities":[],"relleno":"${"a".repeat(20_000_100)}"}`,
      expect: "supera-limite",
      why: "Por encima de los 20 MB con contenido real. El límite se mide en bytes UTF-8 con TextEncoder, y esa medición es del motor.",
    });
  }
  return cases;
}

// ---------------------------------------------------------------------------
// Mutaciones deterministas sobre el documento válido
// ---------------------------------------------------------------------------

const MUTATIONS = [
  "truncar",
  "cortar-en-medio",
  "cambiar-byte",
  "duplicar-tramo",
  "quitar-llave",
  "inyectar-clave",
  "inyectar-no-finito",
  "anidar",
  "repetir-entidad",
  "vaciar-id",
] as const;

/** Aplica UNA mutación al texto de un documento válido. */
function mutate(text: string, kind: (typeof MUTATIONS)[number], random: () => number): string {
  const at = (fraction: number) => Math.max(1, Math.floor(text.length * fraction));
  switch (kind) {
    case "truncar":
      return text.slice(0, at(random()));
    case "cortar-en-medio": {
      const from = at(random() * 0.5);
      const to = from + at(random() * 0.4);
      return text.slice(0, from) + text.slice(Math.min(to, text.length));
    }
    case "cambiar-byte": {
      const position = at(random());
      const replacement = '{}[]",:0nul'[Math.floor(random() * 11)];
      return text.slice(0, position) + replacement + text.slice(position + 1);
    }
    case "duplicar-tramo": {
      const from = at(random() * 0.8);
      const chunk = text.slice(from, from + at(random() * 0.1));
      return text.slice(0, from) + chunk + chunk + text.slice(from);
    }
    case "quitar-llave":
      return text.replace(/[{}[\]]/, "");
    case "inyectar-clave": {
      const key = ["__proto__", "constructor", "prototype"][Math.floor(random() * 3)];
      return text.replace('"entities"', `"${key}":{"x":1},"entities"`);
    }
    case "inyectar-no-finito":
      return text.replace(/"x":\s*-?\d+/, `"x":${random() < 0.5 ? "1e999" : "-1e999"}`);
    case "anidar": {
      const depth = 100 + Math.floor(random() * 200);
      return text.replace('"history":[]', `"history":${nestedJson(depth)}`);
    }
    case "repetir-entidad": {
      const match = /\{"id":"fuzz-\d{4}"[^}]*\}\}/.exec(text);
      return match ? text.replace(match[0], `${match[0]},${match[0]}`) : text;
    }
    case "vaciar-id":
      return text.replace(/"id":"fuzz-\d{4}"/, '"id":""');
    default:
      return text;
  }
}

// ---------------------------------------------------------------------------
// El arnés
// ---------------------------------------------------------------------------

export interface FuzzCaseResult {
  id: string;
  outcome: CadImportOutcome;
  message: string | null;
  /** Sólo en los que importan bien: qué salió del otro lado. */
  imported: { entities: number; blocks: number; warnings: string[] } | null;
  /** ¿El documento importado vuelve a salir idéntico al serializarlo? */
  roundTripStable: boolean | null;
  elapsedMs: number;
}

export interface FuzzPassResult {
  cases: number;
  histogram: Record<string, number>;
  digest: string;
  unknownOutcomes: { id: string; message: string }[];
  unexpected: { id: string; expected: string; got: string; message: string | null }[];
  nonErrorThrows: string[];
  slowestCase: { id: string; elapsedMs: number } | null;
  totalMs: number;
  results: FuzzCaseResult[];
}

export interface FuzzConfig {
  /** Mutaciones aleatorias además del corpus declarado. */
  mutations?: number;
  /** El caso de 20 MB reales. Se puede apagar donde la memoria no dé. */
  includeHuge?: boolean;
  /** Guardar el detalle por caso. El navegador lo quiere; el resumen no. */
  keepResults?: boolean;
}

/**
 * Ejecuta un caso y lo clasifica. NUNCA propaga: clasificar es su trabajo.
 *
 * Un `throw` que no sea `Error` se anota aparte porque significa que alguien
 * lanzó una cadena o un objeto suelto, y eso rompe la promesa de error tipado
 * aunque el mensaje resultante parezca razonable.
 */
function runCase(
  id: string,
  fileName: string,
  content: string,
  nonErrorThrows: string[],
): FuzzCaseResult {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const finish = (
    outcome: CadImportOutcome,
    message: string | null,
    imported: FuzzCaseResult["imported"],
    roundTripStable: boolean | null,
  ): FuzzCaseResult => ({
    id,
    outcome,
    message,
    imported,
    roundTripStable,
    elapsedMs:
      Number(
        ((typeof performance !== "undefined" ? performance.now() : Date.now()) - started).toFixed(3),
      ),
  });
  let report: DocumentImportReport;
  try {
    // Se mide el tamaño como lo mide el producto: bytes UTF-8, no caracteres.
    validateImportFile(fileName, new TextEncoder().encode(content).byteLength);
    report = importDocumentText(fileName, content);
  } catch (error) {
    if (!(error instanceof Error)) {
      nonErrorThrows.push(`${id}: se lanzó ${typeof error} en vez de Error`);
      return finish("desconocido", String(error), null, null);
    }
    return finish(classifyCadImportError(error.message), error.message, null, null);
  }
  // Importó. Un éxito TAMBIÉN se audita: el documento que sale tiene que
  // sobrevivir a su propia serialización, porque si no, el fuzzing habría
  // encontrado una entrada que el producto acepta y luego no puede guardar.
  let roundTripStable: boolean | null = null;
  try {
    const once = serializeCadDocument(report.document);
    const twice = serializeCadDocument(importDocumentText("roundtrip.json", once).document);
    roundTripStable = once === twice;
  } catch {
    roundTripStable = false;
  }
  return finish(
    "ok",
    null,
    {
      entities: report.importedEntityCount,
      blocks: report.importedBlockCount,
      warnings: report.warnings.map((warning) => warning.code).sort(),
    },
    roundTripStable,
  );
}

/** Una pasada completa: corpus declarado + mutaciones. */
export function runCadImportFuzzPass(config: FuzzConfig = {}): FuzzPassResult {
  const mutations = config.mutations ?? 2_000;
  const histogram: Record<string, number> = {};
  const unknownOutcomes: FuzzPassResult["unknownOutcomes"] = [];
  const unexpected: FuzzPassResult["unexpected"] = [];
  const nonErrorThrows: string[] = [];
  const results: FuzzCaseResult[] = [];
  const digestParts: string[] = [];
  let slowest: FuzzPassResult["slowestCase"] = null;
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();

  const record = (result: FuzzCaseResult, expected: CadImportOutcome | null) => {
    histogram[result.outcome] = (histogram[result.outcome] ?? 0) + 1;
    digestParts.push(`${result.id}=${result.outcome}`);
    if (result.outcome === "desconocido")
      unknownOutcomes.push({ id: result.id, message: result.message ?? "" });
    if (expected !== null && result.outcome !== expected)
      unexpected.push({
        id: result.id,
        expected,
        got: result.outcome,
        message: result.message,
      });
    if (!slowest || result.elapsedMs > slowest.elapsedMs)
      slowest = { id: result.id, elapsedMs: result.elapsedMs };
    if (config.keepResults) results.push(result);
  };

  for (const hostile of hostileCorpus({ includeHuge: config.includeHuge })) {
    record(runCase(hostile.id, hostile.fileName, hostile.content, nonErrorThrows), hostile.expect);
  }

  const base = JSON.stringify(validCanonicalDocument());
  for (let index = 0; index < mutations; index += 1) {
    const random = caseRandom(index);
    // Entre una y tres mutaciones encadenadas: una sola casi siempre cae en la
    // misma puerta, y lo interesante es lo que pasa cuando dos defectos se
    // tapan mutuamente.
    let text = base;
    const applied: string[] = [];
    const rounds = 1 + Math.floor(random() * 3);
    for (let round = 0; round < rounds; round += 1) {
      const kind = MUTATIONS[Math.floor(random() * MUTATIONS.length)];
      applied.push(kind);
      text = mutate(text, kind, random);
    }
    record(runCase(`mut-${index}-${applied.join("+")}`, "plano.json", text, nonErrorThrows), null);
  }

  return {
    cases: Object.values(histogram).reduce((sum, count) => sum + count, 0),
    histogram: Object.fromEntries(Object.entries(histogram).sort(([a], [b]) => a.localeCompare(b))),
    digest: fuzzDigest(digestParts),
    unknownOutcomes,
    unexpected,
    nonErrorThrows,
    slowestCase: slowest,
    totalMs: Number(
      ((typeof performance !== "undefined" ? performance.now() : Date.now()) - started).toFixed(3),
    ),
    results,
  };
}

export interface FuzzRunResult {
  seed: string;
  passes: FuzzPassResult[];
  /** Las dos pasadas tienen que coincidir; si no, el fuzzer no es fuzzer. */
  deterministic: boolean;
  divergence: string | null;
  environment: {
    userAgent: string | null;
    engine: string;
  };
}

/**
 * Dos pasadas y su comparación.
 *
 * El determinismo del propio fuzzer es una aserción, no una esperanza: si dos
 * pasadas de la misma semilla dan histogramas distintos, lo que se publique
 * después no describe al producto sino al azar de esa tarde.
 */
export function runCadImportFuzz(config: FuzzConfig = {}): FuzzRunResult {
  const passes = [runCadImportFuzzPass(config), runCadImportFuzzPass(config)];
  const divergence =
    passes[0].digest !== passes[1].digest
      ? `digests ${passes[0].digest} ≠ ${passes[1].digest}`
      : JSON.stringify(passes[0].histogram) !== JSON.stringify(passes[1].histogram)
        ? "histogramas distintos entre pasadas"
        : null;
  const agent =
    typeof navigator !== "undefined" && typeof navigator.userAgent === "string"
      ? navigator.userAgent
      : null;
  return {
    seed: CAD_IMPORT_FUZZ_SEED,
    passes,
    deterministic: divergence === null,
    divergence,
    environment: {
      userAgent: agent,
      engine:
        agent === null
          ? `node ${typeof process !== "undefined" ? process.version : "?"}`
          : /Firefox\//.test(agent)
            ? "gecko"
            : /Chrome\//.test(agent)
              ? "blink"
              : "desconocido",
    },
  };
}

declare global {
  interface Window {
    __cadImportFuzz?: {
      run: (config?: FuzzConfig) => FuzzRunResult;
      seed: string;
    };
  }
}

/** Punto de entrada del paquete que Playwright inyecta en la página. */
export function installCadImportFuzz(): void {
  window.__cadImportFuzz = { run: (config) => runCadImportFuzz(config), seed: CAD_IMPORT_FUZZ_SEED };
}
