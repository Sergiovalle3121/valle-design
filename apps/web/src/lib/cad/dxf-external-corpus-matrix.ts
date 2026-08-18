/**
 * La matriz honesta: qué ENTRA, qué DEGRADA y qué se PIERDE, medido.
 *
 * ## Por qué se genera y no se escribe
 *
 * Una tabla de compatibilidad escrita a mano es una promesa con fecha de
 * caducidad invisible: envejece en cuanto alguien toca el lector, y lo hace en
 * silencio, porque nada la comprueba. Ésta se OBTIENE ejecutando el lector y el
 * escritor reales sobre cada archivo del corpus. Si el comportamiento cambia,
 * el artefacto cambia, y la spec que compara los dos falla.
 *
 * ## Los cuatro veredictos, y por qué son cuatro y no tres
 *
 * - `intacto` — llegó lo mismo que había, con su naturaleza. Un arco vuelve
 *   arco, no una polilínea de cuarenta segmentos.
 * - `degradado` — llegó, pero peor: menos ejemplares, o convertido en otra
 *   cosa. Se anota EN QUÉ se convirtió, porque «degradado» a secas no permite
 *   decidir si importa.
 * - `perdido_declarado` — no llegó, y el lector lo dijo. Es una limitación
 *   conocida y accionable: el remitente puede explotar la entidad y reenviar.
 * - `perdido_en_silencio` — no llegó y NADIE lo dijo. Es la única categoría
 *   que no debería existir, y separarla de la anterior es el motivo entero de
 *   esta matriz: si se mezclasen, un hueco silencioso se leería como una
 *   limitación asumida.
 *
 * ## Las dos patas de cada archivo
 *
 * `entrada` mide leer. `ida_y_vuelta` mide leer, volver a escribir con nuestro
 * escritor y leer otra vez: es lo que le pasa al plano que el arquitecto abre,
 * edita y devuelve al estructurista. Un formato que entra bien y sale mal es
 * exactamente igual de inservible para un despacho.
 *
 * Módulo puro: devuelve un objeto serializable y no escribe nada.
 */
import { importDocumentText } from "./document-import";
import { exportCadDocumentDxf } from "./dxf-document-export";
import { importDxfPrimitives, type CadDxfImportResult } from "./dxf-import";
import {
  CAD_DXF_CORPUS_LIMITATION,
  CAD_DXF_EXTERNAL_CORPUS,
  type CadDxfCorpusFile,
} from "./dxf-external-corpus";

export type CadDxfMatrixVerdict =
  | "intacto"
  | "degradado"
  | "perdido_declarado"
  | "perdido_en_silencio";

export interface CadDxfMatrixEntityRow {
  /** Tipo DXF tal y como viene en el archivo. */
  tipo: string;
  /** Cuántos trae el archivo, declarado por el generador del corpus. */
  declarados: number;
  /** Cuántos llegaron con su naturaleza intacta. */
  intactos: number;
  veredicto: CadDxfMatrixVerdict;
  /** Presente sólo cuando el veredicto es `degradado`: en qué se convirtió. */
  degradaA?: string;
  /** El criterio aplicado a ESTE caso, escrito para que se pueda discutir. */
  criterio: string;
}

export interface CadDxfMatrixFile {
  id: string;
  dialecto: string;
  proposito: string;
  /** `false` cuando el lector no reconoció el archivo. */
  legible: boolean;
  capas: readonly string[];
  avisos: Readonly<Record<string, number>>;
  entrada: readonly CadDxfMatrixEntityRow[];
  idaYVuelta: CadDxfRoundTrip;
}

export interface CadDxfRoundTrip {
  /** `false` si el documento canónico no se pudo construir. Con su razón. */
  completado: boolean;
  razon?: string;
  entidadesTrasImportar?: number;
  entidadesTrasReexportar?: number;
  /** Tipos que sobrevivieron al ciclo completo, con su recuento final. */
  supervivientes?: Readonly<Record<string, number>>;
  /** Pérdidas que el manifiesto de exportación declaró, por código. */
  perdidasDeclaradas?: Readonly<Record<string, number>>;
}

export interface CadDxfExternalCorpusMatrix {
  /** Cómo se regenera. Un artefacto sin esto es un artefacto huérfano. */
  generadoPor: string;
  /** SIEMPRE `true` hoy. Ver `limitacion`. */
  corpusSintetico: boolean;
  limitacion: string;
  criterios: Readonly<Record<CadDxfMatrixVerdict, string>>;
  resumen: {
    archivos: number;
    tiposEvaluados: number;
    intactos: number;
    degradados: number;
    perdidosDeclarados: number;
    perdidosEnSilencio: number;
  };
  archivos: readonly CadDxfMatrixFile[];
}

const CRITERIOS: Readonly<Record<CadDxfMatrixVerdict, string>> = {
  intacto:
    "Llegaron tantos ejemplares como declara el archivo y con su naturaleza: un ARC vuelve arco, un " +
    "HATCH vuelve sombreado. Se mide contra el resultado del lector real, no contra una lista escrita a mano.",
  degradado:
    "Llegó, pero convertido en otra cosa o en menor número. `degradaA` dice exactamente en qué, porque " +
    "«degradado» a secas no permite decidir si el plano sigue sirviendo.",
  perdido_declarado:
    "No llegó ningún ejemplar Y el lector emitió un aviso que nombra ese tipo. Es una limitación " +
    "conocida: el remitente puede explotar la entidad y reenviar el archivo.",
  perdido_en_silencio:
    "No llegó ningún ejemplar y NINGÚN aviso lo menciona. Es el caso peligroso: el usuario cree que " +
    "tiene el plano completo. Todo lo que aparezca aquí es deuda del lector, no una limitación asumida.",
};

/**
 * Cuántos ejemplares de cada tipo DXF sobrevivieron, contados sobre el
 * resultado del lector.
 *
 * La correspondencia tipo→resultado se escribe UNA vez y aquí: es la parte
 * discutible de la medición y merece estar donde se pueda leer entera. Un tipo
 * que no aparezca en esta tabla cuenta cero, que es la lectura pesimista y la
 * correcta: si nadie sabe dónde buscarlo, no se puede afirmar que llegó.
 */
function survivors(result: CadDxfImportResult): Record<string, number> {
  const byKind = new Map<string, number>();
  result.primitives.forEach((primitive, index) => {
    // Las primitivas de un INSERT expandido no cuentan como entidades sueltas:
    // el bloque viaja entero y contarlas sería contarlo dos veces.
    if (result.primitiveSources[index] === "insert") return;
    const key = result.primitiveSources[index] === "dimension" ? "@cota-aplanada" : primitive.kind;
    byKind.set(key, (byKind.get(key) ?? 0) + 1);
  });
  const kind = (name: string) => byKind.get(name) ?? 0;
  return {
    LINE: kind("line"),
    LWPOLYLINE: kind("polyline") + kind("rect"),
    POLYLINE: kind("polyline") + kind("rect"),
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
    MTEXT: result.mtexts.length,
    HATCH: result.hatches.length,
    MLEADER: result.mleaders.length,
    DIMENSION: result.semanticDimensions.length,
    INSERT: result.inserts.length,
    "@cota-aplanada": kind("@cota-aplanada"),
  };
}

/** Avisos agrupados por código, con los tipos que cada uno nombró. */
function warningIndex(result: CadDxfImportResult): {
  counts: Record<string, number>;
  typesMentioned: Set<string>;
} {
  const counts: Record<string, number> = {};
  const typesMentioned = new Set<string>();
  for (const warning of result.warnings) {
    counts[warning.code] = (counts[warning.code] ?? 0) + 1;
    if (warning.entityType) typesMentioned.add(warning.entityType.toUpperCase());
    // El mensaje también cuenta: `unsupported_entity` nombra el tipo dentro del
    // texto, y un aviso que lo dice SÍ es una declaración aunque el campo
    // estructurado viniese vacío.
    for (const token of warning.message.toUpperCase().match(/\b[A-Z0-9]{3,}\b/g) ?? [])
      typesMentioned.add(token);
  }
  return { counts, typesMentioned };
}

function verdictFor(
  type: string,
  declared: number,
  survived: Record<string, number>,
  mentioned: Set<string>,
  readable: boolean,
): CadDxfMatrixEntityRow {
  // Un archivo que el lector declara ilegible no pierde nada «en silencio»: lo
  // pierde TODO y lo dice con un aviso propio. Contarlo como hueco del lector
  // confundiría un fallo del archivo con una deuda del producto.
  if (!readable)
    return {
      tipo: type,
      declarados: declared,
      intactos: 0,
      veredicto: "perdido_declarado",
      criterio: CRITERIOS.perdido_declarado,
    };
  const intact = survived[type] ?? 0;
  if (intact >= declared)
    return {
      tipo: type,
      declarados: declared,
      intactos: intact,
      veredicto: "intacto",
      criterio: CRITERIOS.intacto,
    };
  // DIMENSION es el caso con degradación NOMBRADA: si no volvió como cota
  // semántica pero sí como geometría aplanada, el plano se ve igual y deja de
  // medir. Es la degradación más cara de un plano de arquitectura.
  if (type === "DIMENSION" && (survived["@cota-aplanada"] ?? 0) > 0)
    return {
      tipo: type,
      declarados: declared,
      intactos: intact,
      veredicto: "degradado",
      degradaA:
        "geometría suelta (líneas y texto): se ve igual y deja de recalcularse al mover el muro",
      criterio: CRITERIOS.degradado,
    };
  if (intact > 0)
    return {
      tipo: type,
      declarados: declared,
      intactos: intact,
      veredicto: "degradado",
      degradaA: `sólo ${intact} de ${declared} ejemplares`,
      criterio: CRITERIOS.degradado,
    };
  return {
    tipo: type,
    declarados: declared,
    intactos: 0,
    veredicto: mentioned.has(type) ? "perdido_declarado" : "perdido_en_silencio",
    criterio: mentioned.has(type) ? CRITERIOS.perdido_declarado : CRITERIOS.perdido_en_silencio,
  };
}

/**
 * Ciclo completo: leer, construir el documento, volver a escribir con NUESTRO
 * escritor y leer otra vez. Es lo que le pasa al plano que se devuelve.
 */
function roundTrip(file: CadDxfCorpusFile): CadDxfRoundTrip {
  let imported;
  try {
    imported = importDocumentText(`${file.id}.dxf`, file.content);
  } catch (error) {
    return {
      completado: false,
      razon: error instanceof Error ? error.message : String(error),
    };
  }
  const written = exportCadDocumentDxf(imported.document);
  const reread = importDxfPrimitives(written.content);
  const perdidas: Record<string, number> = {};
  for (const loss of written.losses) perdidas[loss.code] = (perdidas[loss.code] ?? 0) + 1;
  const survived = survivors(reread);
  return {
    completado: true,
    entidadesTrasImportar: imported.importedEntityCount,
    entidadesTrasReexportar: written.entityCount,
    supervivientes: Object.fromEntries(
      Object.entries(survived).filter(([, count]) => count > 0),
    ),
    perdidasDeclaradas: perdidas,
  };
}

function measure(file: CadDxfCorpusFile): CadDxfMatrixFile {
  const result = importDxfPrimitives(file.content);
  const { counts, typesMentioned } = warningIndex(result);
  const survived = survivors(result);
  const legible = !result.warnings.some((warning) => warning.code === "parse_failed");
  return {
    id: file.id,
    dialecto: file.dialect,
    proposito: file.purpose,
    legible,
    capas: result.layers,
    avisos: counts,
    entrada: Object.entries(file.declares)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, declared]) => verdictFor(type, declared, survived, typesMentioned, legible)),
    idaYVuelta: roundTrip(file),
  };
}

/** Construye la matriz entera midiendo el corpus con el lector y el escritor reales. */
export function buildCadDxfExternalCorpusMatrix(): CadDxfExternalCorpusMatrix {
  const archivos = CAD_DXF_EXTERNAL_CORPUS.map(measure);
  const rows = archivos.flatMap((file) => file.entrada);
  const count = (verdict: CadDxfMatrixVerdict) =>
    rows.filter((row) => row.veredicto === verdict).length;
  return {
    generadoPor: "node scripts/cad/build-dxf-external-corpus.mjs",
    corpusSintetico: true,
    limitacion: CAD_DXF_CORPUS_LIMITATION,
    criterios: CRITERIOS,
    resumen: {
      archivos: archivos.length,
      tiposEvaluados: rows.length,
      intactos: count("intacto"),
      degradados: count("degradado"),
      perdidosDeclarados: count("perdido_declarado"),
      perdidosEnSilencio: count("perdido_en_silencio"),
    },
    archivos,
  };
}
