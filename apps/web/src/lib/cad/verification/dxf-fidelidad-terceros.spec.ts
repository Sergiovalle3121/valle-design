import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import DxfParser from "dxf-parser";
import { importDxfPrimitives, type CadDxfImportResult } from "../dxf-import";
import { buildCadDxfImportReport } from "../dxf-import-report";

/**
 * MATRIZ DE FIDELIDAD CONTRA EL CORPUS AJENO — A TRES BANDAS.
 *
 * `docs/cad/evidence/dxf-external-corpus-matrix.json` ya era una matriz por
 * entidad con el vocabulario de veredictos bien resuelto. Su problema no era
 * cómo estaba escrita: era su primera línea, `"corpusSintetico": true`. Imitar
 * un dialecto no es haberlo recibido. Esta matriz es la misma pregunta con
 * archivos que este proyecto NO escribió (`docs/cad/corpus/`, diecinueve DXF
 * de dos bibliotecas MIT), y hereda su vocabulario sin reinventarlo.
 *
 * ─── Por qué TRES bandas y no dos ──────────────────────────────────────────
 *
 * Comparar «lo que el archivo trae» contra «lo que llegó» exige alguien que
 * diga qué trae el archivo, y ese alguien no puede ser el propio lector. Hay
 * dos, y son distintos a propósito:
 *
 *  · **Oráculo A — `dxf-parser`** (MIT, GDS Storefront Estimating). Ya es
 *    dependencia declarada de `apps/web`, así que corre EN CI, en cada
 *    corrida, sobre estos mismos bytes. Su límite hay que decirlo entero:
 *    `dxf-import.ts` lo importa, o sea que **comparte motor de análisis con el
 *    lector de producción**. Contra el oráculo A no se mide el análisis: se
 *    mide la CONVERSIÓN a entidades canónicas, que es código propio. Y tiene
 *    un punto ciego medido: no trae manejador de HATCH, LEADER ni VIEWPORT
 *    (`node_modules/dxf-parser/dist/entities/`), así que sobre esos tipos no
 *    opina — no dice cero, no dice nada.
 *
 *  · **Oráculo B — `ezdxf` 1.4.4** (MIT, Manfred Moitzi). Otro autor, otra
 *    lengua, ni una línea en común con este proyecto ni con el oráculo A. Ve
 *    lo que el A no ve y **rechaza dos archivos que el lector de Valle sí
 *    abre**. No está instalada en CI: su censo se congela en
 *    `docs/cad/corpus/oraculos/ezdxf-1.4.4.json` y aquí se lee del artefacto.
 *    Cuando falta, se declara la ausencia; nunca se finge la medición.
 *
 * ─── Los dos ámbitos de conteo, y por qué el segundo es una limitación ─────
 *
 * El lector de producción devuelve las primitivas con su origen
 * (`primitiveSources`) y su espacio (`paperSpace`), así que para casi todo el
 * conteo comparable es **espacio modelo**: sólo las de origen `"entity"`. Con
 * ese filtro `floorplan.dxf` cuadra EXACTO contra los dos oráculos en LINE
 * 624, TEXT 89, CIRCLE 9, ARC 20, LWPOLYLINE 124 y DIMENSION 63.
 *
 * MTEXT y HATCH no: el lector los devuelve en `result.mtexts` y
 * `result.hatches` **sin dueño** — sin decir si venían del espacio modelo, del
 * papel o de dentro de un bloque. Así que su ámbito comparable es el ARCHIVO
 * ENTERO. Eso no es una elección de medición: es una limitación real del
 * lector, y se declara aquí en vez de esconderse eligiendo el ámbito que
 * cuadre. El día que esas dos listas lleven su origen, el ámbito baja a
 * espacio modelo y esta nota se borra.
 *
 * ─── Cómo se comprueba que no envejece ─────────────────────────────────────
 *
 * Este spec RECALCULA la matriz entera en memoria y afirma que es idéntica a
 * la comprometida en `docs/cad/evidence/`. Es el equivalente al `--check` que
 * usan los generadores de `scripts/`, sin poder tocar `scripts/`. Y fija el
 * número medido de `perdidosEnSilencio` como TECHO: sólo puede bajar.
 */

const RAIZ = path.resolve(process.cwd(), "../..");
const CORPUS = path.join(RAIZ, "docs/cad/corpus");
const MATRIZ = path.join(RAIZ, "docs/cad/evidence/dxf-corpus-terceros-matrix.json");

/**
 * TECHO DE PÉRDIDA SILENCIOSA. Medido, no elegido.
 *
 * Un tipo que el archivo trae, que no llega y que NINGÚN aviso menciona es la
 * única categoría que no debería existir: el usuario cree que tiene el plano
 * completo. Este número sólo puede BAJAR. Si sube, el spec falla y la
 * respuesta correcta es emitir el aviso que falta, jamás subir el techo.
 */
const TECHO_PERDIDOS_EN_SILENCIO = 0;

/** Ver `dxf-fidelidad-ambito.ts`: por qué esta lista está vacía y qué enseñó. */
const AMBITO_ARCHIVO_ENTERO = new Set<string>();

/**
 * Puntos ciegos del oráculo A. No es una suposición: el spec los DEMUESTRA
 * abajo comparando contra el oráculo B, que sí los ve.
 */
const PUNTOS_CIEGOS_ORACULO_A = ["HATCH", "LEADER", "VIEWPORT"];

/** El vocabulario de veredictos, heredado de la matriz sintética sin tocarlo. */
type Veredicto = "intacto" | "degradado" | "perdido_declarado" | "perdido_en_silencio";

const CRITERIOS: Readonly<Record<Veredicto, string>> = {
  intacto:
    "Llegaron tantos ejemplares como declara el oráculo y con su naturaleza: un ARC vuelve arco, un " +
    "HATCH vuelve sombreado. Se mide contra el resultado del lector real, no contra una lista escrita a mano.",
  degradado:
    "Llegó, pero convertido en otra cosa, en menor número, o con un aviso del propio lector que lo " +
    "nombra. `degradaA` dice exactamente en qué, porque «degradado» a secas no permite decidir si el " +
    "plano sigue sirviendo.",
  perdido_declarado:
    "No llegó ningún ejemplar Y el lector emitió un aviso que nombra ese tipo (o declaró el archivo " +
    "ilegible entero). Es una limitación conocida: el remitente puede explotar la entidad y reenviar.",
  perdido_en_silencio:
    "No llegó ningún ejemplar y NINGÚN aviso lo menciona. Es el caso peligroso: el usuario cree que " +
    "tiene el plano completo. Todo lo que aparezca aquí es deuda del lector, no una limitación asumida.",
};

let comprobaciones = 0;
const ok = (condicion: boolean, mensaje: string) => {
  assert.ok(condicion, mensaje);
  comprobaciones += 1;
};

/* ══════════════════════════════════════════════════════════════════════════
   ENTRADAS
   ══════════════════════════════════════════════════════════════════════════ */

interface ArchivoCorpus {
  id: string;
  fuente: string;
  ruta: string;
  sha256: string;
  bytes: number;
}
const manifiesto = JSON.parse(
  fs.readFileSync(path.join(CORPUS, "manifest.json"), "utf8"),
) as { fuentes: Array<{ id: string }>; archivos: ArchivoCorpus[] };

interface CensoOraculoB {
  id: string;
  sha256Archivo: string;
  leido: boolean;
  error?: string;
  dialecto?: string;
  version?: string;
  espacioModelo?: Record<string, number>;
  espacioPapel?: Record<string, number>;
  definicionesDeBloque?: Record<string, number>;
  archivoEntero?: Record<string, number>;
}
const censoB = JSON.parse(
  fs.readFileSync(path.join(CORPUS, "oraculos/ezdxf-1.4.4.json"), "utf8"),
) as { herramienta: { nombre: string; version: string }; archivos: CensoOraculoB[] };
const porIdB = new Map(censoB.archivos.map((fila) => [fila.id, fila]));

/* ══════════════════════════════════════════════════════════════════════════
   BANDA 1 — EL ORÁCULO A, EJECUTADO AQUÍ MISMO
   ══════════════════════════════════════════════════════════════════════════ */

interface Censo {
  leido: boolean;
  error?: string;
  espacioModelo: Record<string, number>;
  archivoEntero: Record<string, number>;
}

const suma = (destino: Record<string, number>, tipo: string) => {
  destino[tipo] = (destino[tipo] ?? 0) + 1;
};

/**
 * Censo del oráculo A sobre los bytes ajenos. `entities` es la sección
 * ENTITIES —modelo y papel, distinguidos por `inPaperSpace`— y `blocks` son
 * las definiciones de bloque. `*Model_Space` no está entre ellas, así que la
 * suma no cuenta dos veces lo que ya contó el espacio modelo (el defecto que
 * la primera versión del censo del oráculo B sí tuvo).
 */
function censoOraculoA(texto: string): Censo {
  const espacioModelo: Record<string, number> = {};
  const archivoEntero: Record<string, number> = {};
  try {
    const analizado = new DxfParser().parseSync(texto) as unknown as {
      entities?: Array<{ type: string; inPaperSpace?: boolean }>;
      blocks?: Record<string, { entities?: Array<{ type: string }> }>;
    } | null;
    for (const entidad of analizado?.entities ?? []) {
      if (!entidad.inPaperSpace) suma(espacioModelo, entidad.type);
      suma(archivoEntero, entidad.type);
    }
    for (const bloque of Object.values(analizado?.blocks ?? {}))
      for (const entidad of bloque?.entities ?? []) suma(archivoEntero, entidad.type);
    return { leido: true, espacioModelo, archivoEntero };
  } catch (error) {
    return {
      leido: false,
      error: error instanceof Error ? error.message : String(error),
      espacioModelo: {},
      archivoEntero: {},
    };
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   BANDA 3 — EL LECTOR DE PRODUCCIÓN
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Cuántos ejemplares de cada tipo DXF obtuvo el lector, por ámbito.
 *
 * La correspondencia tipo→resultado se escribe UNA vez y aquí, igual que en la
 * matriz sintética: es la parte discutible de la medición y merece leerse
 * entera. Lo que cambia respecto de aquélla es el filtro: **sólo las
 * primitivas de origen `"entity"`**. Las de un INSERT expandido pertenecen al
 * bloque —contarlas sería contar el bloque dos veces— y las de origen
 * `"dimension"` son el dibujo aplanado de una cota, no entidades del archivo.
 * Con ese filtro `floorplan.dxf` cuadra exacto contra los dos oráculos.
 */
function censoLector(resultado: CadDxfImportResult): Record<string, number> {
  const porKind = new Map<string, number>();
  resultado.primitives.forEach((primitiva, indice) => {
    if (resultado.primitiveSources[indice] !== "entity") return;
    if (primitiva.paperSpace) return;
    porKind.set(primitiva.kind, (porKind.get(primitiva.kind) ?? 0) + 1);
  });
  const kind = (nombre: string) => porKind.get(nombre) ?? 0;
  // `rect` es una LWPOLYLINE cerrada de cuatro lados que el lector reconoce
  // como rectángulo: sigue siendo la misma entidad del archivo y por eso suma.
  const polilineas = kind("polyline") + kind("rect");
  return {
    LINE: kind("line"),
    LWPOLYLINE: polilineas,
    POLYLINE: polilineas,
    CIRCLE: kind("circle"),
    ARC: kind("arc"),
    ELLIPSE: kind("ellipse"),
    SPLINE: kind("spline"),
    TEXT: kind("text"),
    POINT: kind("point"),
    XLINE: kind("xline"),
    RAY: kind("ray"),
    SOLID: kind("solid"),
    WIPEOUT: kind("wipeout"),
    IMAGE: kind("image"),
    ATTDEF: kind("attdef"),
    DIMENSION: resultado.semanticDimensions.filter((cota) => !cota.paperSpace).length,
    INSERT: resultado.inserts.filter((insercion) => !insercion.paperSpace).length,
    MLEADER: resultado.mleaders.filter((directriz) => !directriz.paperSpace).length,
    // Ámbito ARCHIVO ENTERO: el lector las devuelve sin dueño. Ver la nota.
    MTEXT: resultado.mtexts.length,
    HATCH: resultado.hatches.length,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   EL VEREDICTO
   ══════════════════════════════════════════════════════════════════════════ */

interface FilaMatriz {
  tipo: string;
  ambito: "espacio-modelo" | "archivo-entero";
  oraculoA: number | null;
  oraculoB: number | null;
  sinOpinionA?: "punto-ciego" | "archivo-rechazado";
  sinOpinionB?: "archivo-rechazado";
  /** La lectura más exigente de las dos: el máximo de los oráculos que opinan. */
  declarados: number;
  /** `null` cuando sólo opina un oráculo y no hay nada que contrastar. */
  consenso: boolean | null;
  lector: number;
  avisosDelTipo: string[];
  veredicto: Veredicto;
  degradaA?: string;
}

function veredictoDe(
  tipo: string,
  declarados: number,
  llegaron: number,
  avisos: string[],
  detallePorCodigo: Map<string, string>,
  legible: boolean,
): { veredicto: Veredicto; degradaA?: string } {
  if (llegaron >= declarados) {
    if (avisos.length === 0) return { veredicto: "intacto" };
    // Llegó completo Y el propio lector emitió un aviso que nombra el tipo:
    // eso es exactamente «llegó, pero peor». La frase de `degradaA` es la que
    // el lector ya publica al usuario (`dxf-import-report.ts`), no una nueva:
    // dos redacciones del mismo hecho serían dos verdades que se pueden
    // separar.
    return {
      veredicto: "degradado",
      degradaA: avisos.map((codigo) => detallePorCodigo.get(codigo) ?? codigo).join(" · "),
    };
  }
  if (llegaron > 0)
    return {
      veredicto: "degradado",
      degradaA: `sólo ${llegaron} de ${declarados} ejemplares de ${tipo}`,
    };
  // Un archivo que el lector declara ilegible no pierde nada «en silencio»: lo
  // pierde todo y lo dice con `parse_failed`, que cubre el archivo entero.
  if (!legible || avisos.length > 0) return { veredicto: "perdido_declarado" };
  return { veredicto: "perdido_en_silencio" };
}

/* ══════════════════════════════════════════════════════════════════════════
   LA MATRIZ
   ══════════════════════════════════════════════════════════════════════════ */

interface ArchivoMatriz {
  id: string;
  fuente: string;
  sha256: string;
  bytes: number;
  dialecto: string;
  oraculoA: { leido: boolean; error?: string };
  oraculoB: { leido: boolean; error?: string };
  lector: { legible: boolean; capas: number; avisos: Record<string, number> };
  filas: FilaMatriz[];
  /** Lo que el lector obtuvo y NINGÚN oráculo declara. No es un veredicto. */
  lectorSinOraculo?: Record<string, number>;
  /** Lo que el oráculo B ve en el ESPACIO PAPEL. Se publica, no se juzga. */
  espacioPapelSegunOraculoB?: Record<string, number>;
  nota?: string;
}

function medir(archivo: ArchivoCorpus): ArchivoMatriz {
  const bytes = fs.readFileSync(path.join(CORPUS, archivo.ruta));
  const texto = bytes.toString("latin1");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const a = censoOraculoA(texto);
  const b = porIdB.get(archivo.id);
  assert.ok(b, `${archivo.id}: el censo del oráculo B no cubre este archivo`);
  // El censo del oráculo B está CONGELADO: si los bytes que mide hoy este spec
  // no son los que midió ezdxf aquel día, la banda B dejó de hablar de este
  // archivo y la matriz estaría comparando dos cosas distintas.
  assert.equal(
    b.sha256Archivo,
    sha256,
    `${archivo.id}: el censo congelado del oráculo B mide otros bytes que los del árbol`,
  );

  const resultado = importDxfPrimitives(texto);
  const legible = !resultado.warnings.some((aviso) => aviso.code === "parse_failed");
  const llegaron = censoLector(resultado);

  // Índice código→frase del informe que el propio lector le enseña al usuario.
  const informe = buildCadDxfImportReport(resultado, {
    entityCount: resultado.primitives.length,
    blockCount: resultado.blocks.length,
  });
  const detallePorCodigo = new Map(informe.rows.map((fila) => [fila.code, fila.detail]));
  const avisosPorTipo = new Map<string, Set<string>>();
  const avisos: Record<string, number> = {};
  for (const aviso of resultado.warnings) {
    avisos[aviso.code] = (avisos[aviso.code] ?? 0) + 1;
    if (!aviso.entityType) continue;
    const tipo = aviso.entityType.toUpperCase();
    if (!avisosPorTipo.has(tipo)) avisosPorTipo.set(tipo, new Set());
    avisosPorTipo.get(tipo)!.add(aviso.code);
  }

  const ambitoDe = (tipo: string) =>
    AMBITO_ARCHIVO_ENTERO.has(tipo) ? "archivo-entero" : "espacio-modelo";
  const cuentaA = (tipo: string) =>
    ambitoDe(tipo) === "archivo-entero" ? a.archivoEntero[tipo] : a.espacioModelo[tipo];
  const cuentaB = (tipo: string) =>
    ambitoDe(tipo) === "archivo-entero"
      ? b.archivoEntero?.[tipo]
      : b.espacioModelo?.[tipo];

  const tipos = [
    ...new Set([
      ...Object.keys(a.espacioModelo),
      ...Object.keys(a.archivoEntero).filter((tipo) => AMBITO_ARCHIVO_ENTERO.has(tipo)),
      ...Object.keys(b.espacioModelo ?? {}),
      ...Object.keys(b.archivoEntero ?? {}).filter((tipo) => AMBITO_ARCHIVO_ENTERO.has(tipo)),
    ]),
  ].sort();

  const filas: FilaMatriz[] = [];
  for (const tipo of tipos) {
    const ciegoA = PUNTOS_CIEGOS_ORACULO_A.includes(tipo);
    const valorA = a.leido && !ciegoA ? (cuentaA(tipo) ?? 0) : null;
    const valorB = b.leido ? (cuentaB(tipo) ?? 0) : null;
    const declarados = Math.max(valorA ?? 0, valorB ?? 0);
    if (declarados === 0) continue;
    const misAvisos = [...(avisosPorTipo.get(tipo) ?? [])].sort();
    const { veredicto, degradaA } = veredictoDe(
      tipo,
      declarados,
      llegaron[tipo] ?? 0,
      misAvisos,
      detallePorCodigo,
      legible,
    );
    const fila: FilaMatriz = {
      tipo,
      ambito: ambitoDe(tipo),
      oraculoA: valorA,
      oraculoB: valorB,
      declarados,
      consenso: valorA !== null && valorB !== null ? valorA === valorB : null,
      lector: llegaron[tipo] ?? 0,
      avisosDelTipo: misAvisos,
      veredicto,
    };
    if (valorA === null) fila.sinOpinionA = ciegoA ? "punto-ciego" : "archivo-rechazado";
    if (valorB === null) fila.sinOpinionB = "archivo-rechazado";
    if (degradaA) fila.degradaA = degradaA;
    filas.push(fila);
  }

  // Lo que el lector obtuvo sin que ningún oráculo lo declare. No entra en el
  // veredicto —no hay contra qué medirlo— pero callarlo sería esconder que
  // hay material del que ninguna banda independiente puede opinar.
  const sinOraculo: Record<string, number> = {};
  for (const tipo of AMBITO_ARCHIVO_ENTERO) {
    if (filas.some((fila) => fila.tipo === tipo)) continue;
    if ((llegaron[tipo] ?? 0) > 0) sinOraculo[tipo] = llegaron[tipo];
  }

  const salida: ArchivoMatriz = {
    id: archivo.id,
    fuente: archivo.fuente,
    sha256,
    bytes: bytes.length,
    dialecto: b.leido ? `${b.dialecto} (${b.version})` : "no declarado por el oráculo B",
    oraculoA: a.leido ? { leido: true } : { leido: false, error: a.error },
    oraculoB: b.leido ? { leido: true } : { leido: false, error: b.error },
    lector: { legible, capas: resultado.layers.length, avisos },
    filas,
  };
  if (Object.keys(sinOraculo).length > 0) salida.lectorSinOraculo = sinOraculo;
  if (b.espacioPapel && Object.keys(b.espacioPapel).length > 0)
    salida.espacioPapelSegunOraculoB = b.espacioPapel;
  if (filas.length === 0)
    salida.nota =
      "Ningún oráculo declara una sola entidad comparable en este archivo, así que no hay fila " +
      "que juzgar. Se conserva en la matriz porque su ausencia de contenido es el dato.";
  return salida;
}

function construirMatriz() {
  const archivos = manifiesto.archivos.map(medir);
  const filas = archivos.flatMap((archivo) => archivo.filas);
  const cuenta = (veredicto: Veredicto) =>
    filas.filter((fila) => fila.veredicto === veredicto).length;
  return {
    generadoPor:
      "cd apps/web && VALLE_ESCRIBIR_MATRIZ=1 npx tsx " +
      "src/lib/cad/verification/dxf-fidelidad-terceros.spec.ts",
    verificadoPor: "apps/web/src/lib/cad/verification/dxf-fidelidad-terceros.spec.ts",
    /** La diferencia entera con `dxf-external-corpus-matrix.json`. */
    corpusSintetico: false,
    corpus: {
      manifiesto: "docs/cad/corpus/manifest.json",
      archivos: manifiesto.archivos.length,
      fuentes: manifiesto.fuentes.length,
    },
    loQueNoAcredita:
      "Ninguno de estos archivos lo guardó AutoCAD ni salió de un despacho: son ficheros de prueba " +
      "de dos bibliotecas libres. Acreditan interoperabilidad con material que este proyecto no " +
      "escribió, NO compatibilidad con AutoCAD, y ninguna afirmación derivada de aquí puede decirlo.",
    oraculos: {
      A: {
        herramienta: "dxf-parser (MIT, GDS Storefront Estimating)",
        corre: "en CI, en cada corrida: es dependencia declarada de apps/web",
        limite:
          "COMPARTE MOTOR con el lector de producción (apps/web/src/lib/cad/dxf-import.ts lo " +
          "importa). Contra el oráculo A no se mide el análisis del archivo, se mide la conversión " +
          "a entidades canónicas, que sí es código propio.",
        puntosCiegos: PUNTOS_CIEGOS_ORACULO_A,
        porQueEsePuntoCiego:
          "dxf-parser no trae manejador para esos tipos (node_modules/dxf-parser/dist/entities/), " +
          "así que sobre ellos no opina: no dice cero, no dice nada. Por eso hay un oráculo B.",
      },
      B: {
        herramienta: `${censoB.herramienta.nombre} ${censoB.herramienta.version} (MIT, Manfred Moitzi)`,
        corre: "NO está en CI: su censo se congela en docs/cad/corpus/oraculos/ezdxf-1.4.4.json",
        porQueEsIndependiente:
          "Otro autor, otra lengua, ninguna línea en común con este proyecto ni con el oráculo A.",
      },
    },
    loQueNoSeMide:
      "Dos ámbitos quedan FUERA del veredicto, y decirlo importa más que la cifra que sí está. " +
      "(1) El ESPACIO PAPEL: el lector lo excluye a propósito (dxf-model-space-scope.ts) y lo " +
      "declara como pérdida al usuario; el oráculo B sí lo censa, y esta matriz lo publica por " +
      "archivo en `espacioPapelSegunOraculoB` sin juzgarlo. (2) Lo que vive DENTRO de una " +
      "definición de bloque: llega al documento con el bloque entero, no como entidades sueltas, " +
      "así que contarlo como entidad sería contarlo dos veces. Las dos ausencias son elecciones " +
      "escritas, no huecos.",
    ambitosDeConteo: {
      "espacio-modelo":
        "El ámbito por defecto. El lector devuelve las primitivas con su origen y su espacio, así " +
        "que el conteo comparable filtra primitiveSources === \"entity\" y descarta el espacio papel.",
      "archivo-entero":
        "Sólo MTEXT y HATCH. El lector los devuelve en result.mtexts y result.hatches SIN DUEÑO: no " +
        "dice si venían del espacio modelo, del papel o de dentro de un bloque. Es una limitación " +
        "real del lector y por eso se declara; el ámbito no se eligió porque cuadre.",
    },
    criterios: CRITERIOS,
    resumen: {
      archivos: archivos.length,
      filas: filas.length,
      intactos: cuenta("intacto"),
      degradados: cuenta("degradado"),
      perdidosDeclarados: cuenta("perdido_declarado"),
      perdidosEnSilencio: cuenta("perdido_en_silencio"),
      archivosQueAbre: {
        oraculoA: archivos.filter((archivo) => archivo.oraculoA.leido).length,
        oraculoB: archivos.filter((archivo) => archivo.oraculoB.leido).length,
        lector: archivos.filter((archivo) => archivo.lector.legible).length,
      },
      filasConLosDosOraculos: filas.filter((fila) => fila.consenso !== null).length,
      discrepanciasEntreOraculos: filas.filter((fila) => fila.consenso === false).length,
    },
    archivos,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   1. LA MATRIZ COMPROMETIDA ES LA QUE SALE DE MEDIR
   ══════════════════════════════════════════════════════════════════════════ */

const recalculada = construirMatriz();

// Escapatoria de REGENERACIÓN, explícita y con nombre: `scripts/` no es
// territorio de este frente, así que el generador vive donde vive el `--check`.
if (process.env.VALLE_ESCRIBIR_MATRIZ === "1") {
  fs.writeFileSync(MATRIZ, `${JSON.stringify(recalculada, null, 2)}\n`, "utf8");
  console.log(`  · matriz reescrita: ${path.relative(RAIZ, MATRIZ)}`);
}

ok(fs.existsSync(MATRIZ), `falta la matriz comprometida en ${path.relative(RAIZ, MATRIZ)}`);
const comprometida = JSON.parse(fs.readFileSync(MATRIZ, "utf8"));

{
  // El equivalente al `--check` de los generadores de `scripts/`: si el lector
  // cambia de comportamiento, el artefacto deja de describirlo y esto se pone
  // en rojo antes de que nadie lo cite.
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(recalculada)),
    comprometida,
    "la matriz comprometida no coincide con la medición de hoy. Si el cambio es intencionado, " +
      "regenérala con VALLE_ESCRIBIR_MATRIZ=1 y revisa el resumen antes de commitear.",
  );
  comprobaciones += 1;
}

/* ══════════════════════════════════════════════════════════════════════════
   2. EL TECHO DE PÉRDIDA SILENCIOSA
   ══════════════════════════════════════════════════════════════════════════ */

{
  const medidos = recalculada.resumen.perdidosEnSilencio;
  ok(
    medidos <= TECHO_PERDIDOS_EN_SILENCIO,
    `${medidos} tipo(s) se pierden sin que ningún aviso los nombre, y el techo es ` +
      `${TECHO_PERDIDOS_EN_SILENCIO}. El techo NO se sube: se emite el aviso que falta.`,
  );
  const enSilencio = recalculada.archivos.flatMap((archivo) =>
    archivo.filas
      .filter((fila) => fila.veredicto === "perdido_en_silencio")
      .map((fila) => `${archivo.id}:${fila.tipo}`),
  );
  ok(
    enSilencio.length === medidos,
    "el resumen y las filas tienen que contar lo mismo; si no, el resumen es decorativo",
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   3. LAS TRES BANDAS SON TRES, Y CADA UNA APORTA ALGO QUE LAS OTRAS NO
   ══════════════════════════════════════════════════════════════════════════ */

{
  // El punto ciego del oráculo A, DEMOSTRADO y no declarado: hay archivos
  // donde el oráculo B ve estos tipos y el A no emite ni uno.
  for (const tipo of PUNTOS_CIEGOS_ORACULO_A) {
    const vistosPorB = censoB.archivos.filter(
      (fila) => fila.leido && ((fila.archivoEntero?.[tipo] ?? 0) > 0),
    );
    ok(
      vistosPorB.length > 0,
      `${tipo} está declarado punto ciego del oráculo A y el oráculo B no lo ve en ningún archivo: ` +
        "un punto ciego que no se puede demostrar no es evidencia, es una excusa",
    );
    for (const fila of vistosPorB) {
      const archivo = manifiesto.archivos.find((candidato) => candidato.id === fila.id)!;
      const a = censoOraculoA(fs.readFileSync(path.join(CORPUS, archivo.ruta), "latin1"));
      if (!a.leido) continue;
      ok(
        (a.archivoEntero[tipo] ?? 0) === 0,
        `${fila.id}: el oráculo A emitió ${tipo} y estaba declarado como punto ciego. ` +
          "La biblioteca cambió: quítalo de PUNTOS_CIEGOS_ORACULO_A y vuelve a medir.",
      );
    }
  }

  // Y la contraparte: el oráculo B rechaza archivos que el lector sí abre, y
  // el motor compartido rechaza uno que el oráculo B sí lee. Ninguna banda
  // domina a las otras, que es lo que justifica tener tres.
  const rechazaB = recalculada.archivos.filter((archivo) => !archivo.oraculoB.leido);
  ok(rechazaB.length > 0, "si el oráculo B lo leyera todo, no estaría midiendo nada difícil");
  ok(
    rechazaB.every((archivo) => archivo.lector.legible),
    "el oráculo B rechaza archivos que el lector de producción sí abre: eso es lo que se afirma " +
      "en el corpus y tiene que seguir siendo cierto",
  );
  const rechazaA = recalculada.archivos.filter((archivo) => !archivo.oraculoA.leido);
  // El lector IMPORTA `dxf-parser`, así que durante toda la campaña anterior
  // caían juntos y esta suite lo afirmaba. Desde P-evidencia-13 ya no: el
  // lector normaliza los booleanos de cabecera fuera de rango antes de
  // entregarle el texto —`$XCLIPFRAME` vale 0, 1 o 2 desde AutoCAD 2010 y la
  // biblioteca sólo admite 0 y 1— y abre `blocks2.dxf`, que el motor compartido
  // sigue rechazando sobre el texto crudo. Eso NO es que la asimetría se haya
  // perdido: es que el lector dejó de heredar un defecto de su dependencia, y
  // que siga cayendo el motor por debajo es la prueba de dónde estaba.
  ok(
    rechazaA.length > 0,
    "si el oráculo A lo leyera todo, no estaría midiendo nada difícil",
  );
  ok(
    rechazaA.every((archivo) => archivo.lector.legible),
    "el lector de producción abre lo que el motor compartido rechaza: es lo que compró P-evidencia-13, " +
      "y si volviera a caer con él sería que la normalización de cabecera se perdió",
  );
  for (const archivo of rechazaA) {
    const b = porIdB.get(archivo.id)!;
    ok(
      b.leido,
      `${archivo.id}: lo rechazan las tres bandas. Entonces no prueba la asimetría que documenta.`,
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   4. EL ARCHIVO QUE MÁS SE PARECE A UN PLANO, NÚMERO A NÚMERO
   ══════════════════════════════════════════════════════════════════════════ */

{
  // `floorplan.dxf` es el único del corpus que se parece a lo que un cliente
  // manda. Sus cifras se fijan aquí a mano A PROPÓSITO: son la prueba de que
  // el filtro `primitiveSources === "entity"` es el conteo comparable y no una
  // conveniencia. Si el lector cambia, estas seis igualdades se rompen.
  const planta = recalculada.archivos.find((archivo) => archivo.id === "bjnortier-dxf/floorplan")!;
  const ESPERADO: Record<string, number> = {
    LINE: 624,
    TEXT: 89,
    CIRCLE: 9,
    ARC: 20,
    LWPOLYLINE: 124,
    DIMENSION: 63,
  };
  for (const [tipo, cuantos] of Object.entries(ESPERADO)) {
    const fila = planta.filas.find((candidata) => candidata.tipo === tipo);
    ok(fila !== undefined, `floorplan.dxf perdió la fila de ${tipo}`);
    ok(
      fila!.oraculoA === cuantos && fila!.oraculoB === cuantos && fila!.lector === cuantos,
      `floorplan.dxf · ${tipo}: oráculo A ${fila!.oraculoA}, oráculo B ${fila!.oraculoB}, lector ` +
        `${fila!.lector}; se esperaban ${cuantos} en las tres bandas`,
    );
  }
  // HATCH es la fila que justifica el oráculo B entero —el A no la ve— y además
  // la que enseñó cómo se detecta un acuerdo falso. Hasta el 2026-09-05 el
  // oráculo decía 26 y el lector 26, y los dos estaban contando lo mismo MAL:
  // el fichero tiene 13 sombreados en espacio modelo y otros 13 en una
  // definición de bloque (`A$C198F7789`) que ningún INSERT alcanza en ningún
  // nivel. El lector los sacaba todos a espacio modelo y el censo se leía de
  // `archivoEntero`, que recorre `doc.blocks` e incluye `*Model_Space`. Se
  // notó al arreglar UNO de los dos lados; mientras los dos estuvieron mal por
  // el mismo sitio, la igualdad parecía una verificación.
  const hatch = planta.filas.find((fila) => fila.tipo === "HATCH")!;
  ok(
    hatch.ambito === "espacio-modelo" && hatch.sinOpinionA === "punto-ciego",
    "la fila de HATCH de floorplan.dxf tiene que declarar su ámbito y el silencio del oráculo A",
  );
  const mtext = planta.filas.find((fila) => fila.tipo === "MTEXT")!;
  for (const fila of [hatch, mtext])
    ok(
      fila.oraculoB === fila.lector,
      `floorplan.dxf · ${fila.tipo}: oráculo B ${fila.oraculoB}, lector ${fila.lector} — el espacio modelo tiene que coincidir`,
    );
  ok(hatch.lector === 13 && mtext.lector === 9, `floorplan.dxf: HATCH ${hatch.lector}, MTEXT ${mtext.lector}`);
  // Y las dos salen DEGRADADAS aunque el recuento cuadre, que es lo correcto
  // por el criterio de esta matriz: llegaron todas las de espacio modelo, y
  // además hay un aviso del lector que nombra el tipo. El aviso es
  // `entity_in_block_definition`, y habla de las 85 que viven en definiciones
  // que nada del dibujo inserta (72 MTEXT + 13 HATCH). No se dibujaban, así que
  // no falta nada de lo que se veía; faltarán en el archivo que se devuelva, y
  // por eso se dicen. Llamarlas «intactas» sería tapar esa mitad.
  for (const fila of [hatch, mtext])
    ok(
      fila.veredicto === "degradado" && /definiciones de bloque/u.test(fila.degradaA ?? ""),
      `floorplan.dxf · ${fila.tipo}: ${fila.veredicto} — «${String(fila.degradaA ?? "").slice(0, 70)}»`,
    );
}

/* ══════════════════════════════════════════════════════════════════════════
   5. LA MATRIZ DICE LO QUE NO PUEDE PROBAR
   ══════════════════════════════════════════════════════════════════════════ */

{
  ok(recalculada.corpusSintetico === false, "esta matriz existe justo por no ser sintética");
  ok(
    /AutoCAD/u.test(recalculada.loQueNoAcredita),
    "la matriz tiene que decir explícitamente que NO acredita compatibilidad con AutoCAD",
  );
  ok(
    recalculada.oraculos.A.limite.includes("COMPARTE MOTOR"),
    "el límite del oráculo A —que comparte analizador con el lector— no se puede omitir: sin él, " +
      "la matriz aparenta dos lecturas independientes donde hay una y media",
  );
  ok(
    [...AMBITO_ARCHIVO_ENTERO].every((tipo) =>
      recalculada.ambitosDeConteo["archivo-entero"].includes(tipo),
    ),
    "cada tipo con ámbito de archivo entero tiene que estar NOMBRADO en la explicación del ámbito",
  );
  // Ningún archivo del manifiesto se queda fuera: una matriz que elige sus
  // archivos elige sus resultados.
  ok(
    recalculada.archivos.length === manifiesto.archivos.length,
    "la matriz tiene que cubrir los diecinueve archivos del manifiesto, incluidos los que no dan " +
      "una sola fila: elegir cuáles se miden es elegir el resultado",
  );
  for (const archivo of recalculada.archivos)
    ok(
      archivo.filas.length > 0 || typeof archivo.nota === "string",
      `${archivo.id}: sin filas y sin nota que lo explique`,
    );
  // LWPOLYLINE y POLYLINE caen en el MISMO cubo del lector: son la polilínea
  // ligera y la pesada, y el documento canónico no las distingue. Mientras
  // ningún archivo declare las dos a la vez, cada fila tiene su cubo entero.
  // El día que uno las declare juntas, esta comprobación se pone en rojo antes
  // de que la matriz cuente dos veces las mismas primitivas.
  for (const archivo of recalculada.archivos)
    ok(
      !(
        archivo.filas.some((fila) => fila.tipo === "LWPOLYLINE") &&
        archivo.filas.some((fila) => fila.tipo === "POLYLINE")
      ),
      `${archivo.id} declara LWPOLYLINE y POLYLINE a la vez, y el lector las devuelve en el mismo ` +
        "cubo: separa el conteo antes de medir este archivo, o la matriz contará dos veces lo mismo",
    );
}

/* ══════════════════════════════════════════════════════════════════════════
   6. LOS DOS ORÁCULOS, CUANDO LOS DOS OPINAN, TIENEN QUE COINCIDIR
   ══════════════════════════════════════════════════════════════════════════ */

{
  // Dos implementaciones independientes que cuentan lo mismo sobre los mismos
  // bytes es la comprobación que convierte «dos lecturas» en «una medición».
  // Si discrepan, el número declarado deja de ser un hecho y pasa a ser una
  // opinión — y entonces hay que ir a mirar el archivo, no ajustar la matriz.
  const discrepan = recalculada.archivos.flatMap((archivo) =>
    archivo.filas
      .filter((fila) => fila.consenso === false)
      .map((fila) => `${archivo.id}:${fila.tipo} (A ${fila.oraculoA} ≠ B ${fila.oraculoB})`),
  );
  ok(
    discrepan.length === recalculada.resumen.discrepanciasEntreOraculos,
    "el resumen de discrepancias tiene que contar las mismas filas que la matriz",
  );
  ok(
    discrepan.length === 0,
    `los dos oráculos discrepan en ${discrepan.length} fila(s): ${discrepan.join(", ")}. ` +
      "Antes de tocar nada hay que mirar el archivo: uno de los dos está contando otra cosa.",
  );
  ok(
    recalculada.resumen.filasConLosDosOraculos > 0,
    "si ninguna fila tuviera los dos oráculos, la matriz sería de una banda con adornos",
  );
}

const r = recalculada.resumen;
console.log(
  `fidelidad contra corpus de terceros: ${comprobaciones} comprobaciones · ${r.filas} filas de ` +
    `${r.archivos} archivos ajenos · ${r.intactos} intactas, ${r.degradados} degradadas, ` +
    `${r.perdidosDeclarados} perdidas declaradas, ${r.perdidosEnSilencio} perdidas en silencio`,
);
console.log(
  `  · ${r.filasConLosDosOraculos} fila(s) con los dos oráculos y ${r.discrepanciasEntreOraculos} ` +
    `discrepancia(s); abren el corpus: oráculo A ${r.archivosQueAbre.oraculoA}/${r.archivos}, ` +
    `oráculo B ${r.archivosQueAbre.oraculoB}/${r.archivos}, lector ${r.archivosQueAbre.lector}/${r.archivos}`,
);
console.log(
  "  · TODAVÍA NO (2026-09-04): el lector devuelve MTEXT y HATCH sin dueño, así que esos dos tipos " +
    "sólo se pueden comparar sobre el archivo entero; y el oráculo A comparte analizador con el " +
    "lector, así que la independencia de análisis la aporta sólo el oráculo B, que no corre en CI.",
);
