/**
 * La matriz del corpus de PDF: qué entra íntegro, qué degrada y qué se pierde.
 *
 * ## Por qué se MIDE y no se escribe
 *
 * Una tabla de compatibilidad escrita a mano envejece, y envejece SIEMPRE hacia
 * el optimismo: nadie actualiza un documento para empeorarlo. Así que la matriz
 * se calcula ejecutando el importador REAL sobre el corpus, igual que la del DXF
 * ajeno, y una spec la vuelve a calcular en cada CI. Si el lector cambia y nadie
 * regenera, esa spec falla y dice cómo regenerarla.
 *
 * ## Las cuatro columnas y su frontera
 *
 * - `intacto` — entró todo lo declarado y siendo lo que era.
 * - `degradado` — entró, pero convertido en otra cosa. `degradaA` dice en qué,
 *   porque «degradado» a secas no permite decidir si el plano sigue sirviendo.
 * - `perdido_declarado` — no entró Y el importador lo dijo. Es una limitación
 *   conocida y el usuario puede actuar.
 * - `perdido_en_silencio` — no entró y NADIE lo mencionó. Es el caso peligroso:
 *   el arquitecto cree que tiene el plano completo. Todo lo que aparezca aquí es
 *   deuda del lector, no una limitación asumida.
 *
 * ## Cómo se mide cada tipo de contenido
 *
 * No hay una regla única y fingir que la hay sería lo cómodo. Un trazo se cuenta
 * por entidades; una curva, por su error; un bloque reutilizado, comparando con
 * el MISMO plano sin bloques. Cada tipo lleva su regla escrita, la regla viaja
 * dentro del artefacto en `criterio`, y así el número publicado se puede
 * discutir sin leer este archivo.
 */
import type { CadPdfContentType, CadPdfCorpusFile } from "./pdf-corpus";
import { cadPdfCorpus } from "./pdf-corpus";
import { CadPdfImportError, importCadPdf, type CadPdfImportResult } from "./pdf-import";
import { buildCadPdfImportReport } from "./pdf-import-report";

export type CadPdfVerdict = "intacto" | "degradado" | "perdido_declarado" | "perdido_en_silencio";

export interface CadPdfMatrixRow {
  tipo: CadPdfContentType;
  declarados: number;
  intactos: number;
  veredicto: CadPdfVerdict;
  /** Obligatorio cuando el veredicto es `degradado`. En qué se convirtió. */
  degradaA?: string;
  /** La regla con la que se llegó a ese veredicto. Viaja dentro del artefacto. */
  criterio: string;
}

export interface CadPdfMatrixFile {
  id: string;
  forma: string;
  proposito: string;
  /** `false` cuando el importador se negó a importar: el motivo va en `error`. */
  legible: boolean;
  /** Mensaje y código del fallo, cuando lo hubo. `null` si entró. */
  error: { codigo: string; mensaje: string } | null;
  paginas: number;
  paginaMedida: number;
  /** Capas opcionales que traía el PDF, con su estado de origen. */
  capasOpcionales: Array<{ nombre: string; encendida: boolean }>;
  /** Avisos del importador, por código y con su recuento. */
  avisos: Record<string, number>;
  /** Fidelidad de las curvas de esta página. `null` si no traía ninguna. */
  curvas: {
    modo: string;
    curvas: number;
    toleranciaUnidades: number;
    errorMaximoMedidoUnidades: number;
  } | null;
  /** Cuántas filas del manifiesto de pérdidas produce, por columna. */
  manifiesto: { perdido: number; degradado: number; conservado: number };
  entrada: CadPdfMatrixRow[];
}

export interface CadPdfCorpusMatrix {
  generadoPor: string;
  corpusSintetico: boolean;
  limitacion: string;
  alcance: string;
  criterios: Record<CadPdfVerdict, string>;
  resumen: {
    archivos: number;
    tiposEvaluados: number;
    intactos: number;
    degradados: number;
    perdidosDeclarados: number;
    perdidosEnSilencio: number;
  };
  rendimiento: {
    maquina: string;
    nota: string;
    medianaDe: number;
    archivos: Array<{ id: string; bytes: number; medianaMs: number }>;
  };
  archivos: CadPdfMatrixFile[];
}

export const CAD_PDF_MATRIX_CRITERIA: Record<CadPdfVerdict, string> = {
  intacto:
    "Entraron tantos ejemplares como declara el archivo y siendo lo que eran: un trazo vuelve línea o polilínea, un rótulo vuelve texto. Se mide contra el resultado del importador real, no contra una lista escrita a mano.",
  degradado:
    "Entró, pero convertido en otra cosa o en menor número. `degradaA` dice exactamente en qué, porque «degradado» a secas no permite decidir si el plano sigue sirviendo.",
  perdido_declarado:
    "No entró ningún ejemplar Y el importador lo dijo: con un aviso que lo nombra, o negándose a importar el archivo entero con un error tipado. Es una limitación conocida sobre la que el usuario puede actuar.",
  perdido_en_silencio:
    "No entró ningún ejemplar y NINGÚN aviso lo menciona. Es el caso peligroso: el usuario cree que tiene el plano completo. Todo lo que aparezca aquí es deuda del lector, no una limitación asumida.",
};

/**
 * La limitación va DENTRO del artefacto, no en un README que nadie abre junto
 * al JSON. Su spec falla si desaparece, que es lo que impide que un día alguien
 * cite esta matriz como cobertura del mundo real.
 */
export const CAD_PDF_MATRIX_LIMITATION =
  "CORPUS SINTÉTICO. Ninguno de estos archivos procede de un despacho real: están construidos byte a byte " +
  "por `apps/web/src/lib/cad/pdf/pdf-corpus.ts` para imitar las formas de PDF que un despacho recibe " +
  "(vectorial de CAD, texto incrustado, texto en curvas, escaneado, con capas opcionales, multipágina, " +
  "comprimido y sin comprimir, con MediaBox desplazado, girado 90°, y con las páginas dentro de un objeto " +
  "comprimido). Imitar una forma NO es haberla recibido: esta matriz no acredita cobertura del mundo real y " +
  "no debe citarse como tal hasta que se incorporen archivos de despachos y se regenere. Además, los flujos " +
  "comprimidos del corpus usan bloques ALMACENADOS de zlib; el Huffman fijo y el dinámico se comprueban " +
  "aparte, contra `node:zlib`, en `pdf-inflate.spec.ts`.";

export const CAD_PDF_MATRIX_SCOPE =
  "Esta matriz mide la IMPORTACIÓN de PDF y sólo eso. Este producto importa los VECTORES y el texto de un PDF; " +
  "no convierte una imagen escaneada en geometría —eso no lo hace nadie sin inventarla— y no reexporta el " +
  "documento como PDF vectorial editable, así que no hay ciclo de ida y vuelta que medir.";

interface Measurement {
  file: CadPdfCorpusFile;
  result: CadPdfImportResult | null;
  error: CadPdfImportError | null;
  /** Entidades de geometría (todo menos texto) del archivo de referencia. */
  baselineGeometry: number;
}

const geometryOf = (result: CadPdfImportResult | null) =>
  result ? result.entities.filter((entity) => entity.type !== "mtext").length : 0;

const countOf = (result: CadPdfImportResult | null, type: string) =>
  result ? result.entities.filter((entity) => entity.type === type).length : 0;

const warningCount = (result: CadPdfImportResult | null, code: string) =>
  result ? result.warnings.filter((warning) => warning.code === code).reduce((sum, w) => sum + w.count, 0) : 0;

/** Reglas de medición, una por tipo de contenido. Cada una publica su criterio. */
const MEASURES: Record<
  CadPdfContentType,
  (measurement: Measurement, declared: number) => Omit<CadPdfMatrixRow, "tipo" | "declarados" | "criterio"> & {
    criterio?: string;
  }
> = {
  PATH_LINE: ({ result }, declared) => {
    // Un trazo recto suelto entra como LINE; uno con más de dos vértices, como
    // POLYLINE abierta. Se cuentan los dos: exigir sólo LINE castigaría al
    // importador por hacer lo correcto con un camino de tres puntos.
    const intactos = countOf(result, "line") + (result?.entities.filter(
      (entity) => entity.type === "polyline" && !entity.closed,
    ).length ?? 0);
    return { intactos: Math.min(intactos, declared), veredicto: intactos >= declared ? "intacto" : "degradado", ...(intactos >= declared ? {} : { degradaA: `sólo ${intactos} de ${declared} trazos` }) };
  },
  PATH_RECT: ({ result }, declared) => {
    const intactos = result?.entities.filter((entity) => entity.type === "polyline" && entity.closed).length ?? 0;
    return { intactos: Math.min(intactos, declared), veredicto: intactos >= declared ? "intacto" : "degradado", ...(intactos >= declared ? {} : { degradaA: "polilínea abierta: el contorno deja de cerrar" }) };
  },
  PATH_CURVE: ({ result }, declared) => {
    const fidelity = result?.curveFidelity;
    if (!fidelity || fidelity.curves < declared)
      return { intactos: fidelity?.curves ?? 0, veredicto: "perdido_en_silencio" };
    if (fidelity.mode === "spline")
      return { intactos: fidelity.curves, veredicto: "intacto" };
    return {
      intactos: 0,
      veredicto: "degradado",
      degradaA:
        `polilínea de tramos rectos, con una desviación máxima MEDIDA de ` +
        `${fidelity.maxErrorUnits.toFixed(4)} unidades de dibujo (tolerancia pedida: ` +
        `${fidelity.toleranceUnits}). En modo spline la conversión es exacta.`,
    };
  },
  PATH_FILL: ({ result }, declared) => {
    const declaredCount = warningCount(result, "fill_as_outline");
    return {
      intactos: 0,
      veredicto: declaredCount >= declared ? "degradado" : "perdido_en_silencio",
      ...(declaredCount >= declared
        ? { degradaA: "el CONTORNO de la zona rellena, sin nada dentro: hay que rehacer el relleno con un sombreado" }
        : {}),
    };
  },
  TEXT: ({ result }, declared) => {
    const intactos = countOf(result, "mtext");
    return {
      intactos: Math.min(intactos, declared),
      veredicto: intactos >= declared ? "intacto" : intactos > 0 ? "degradado" : "perdido_en_silencio",
      ...(intactos > 0 && intactos < declared ? { degradaA: `sólo ${intactos} de ${declared} rótulos` } : {}),
    };
  },
  TEXT_AS_CURVES: ({ result, baselineGeometry }, declared) => {
    const extra = geometryOf(result) - baselineGeometry;
    return {
      intactos: 0,
      veredicto: extra >= declared ? "degradado" : "perdido_en_silencio",
      ...(extra >= declared
        ? {
            degradaA:
              "trazos: entra el DIBUJO de las letras y deja de ser texto. Ningún lector puede devolverlo " +
              "a MTEXT sin inventar qué ponía, y este no lo intenta.",
          }
        : {}),
    };
  },
  TEXT_GLYPH_INDICES: ({ result, error }, declared) => {
    const declaredLoss = error !== null || warningCount(result, "text_glyph_indices") >= declared;
    return { intactos: 0, veredicto: declaredLoss ? "perdido_declarado" : "perdido_en_silencio" };
  },
  TEXT_INVISIBLE: ({ result, error }, declared) => {
    const declaredLoss = error !== null || warningCount(result, "invisible_text_skipped") >= declared;
    return { intactos: 0, veredicto: declaredLoss ? "perdido_declarado" : "perdido_en_silencio" };
  },
  IMAGE: ({ result, error }, declared) => {
    const declaredLoss = error !== null || warningCount(result, "raster_dropped") >= declared;
    return { intactos: 0, veredicto: declaredLoss ? "perdido_declarado" : "perdido_en_silencio" };
  },
  FORM_XOBJECT: ({ result, baselineGeometry }, declared) => {
    const extra = geometryOf(result) - baselineGeometry;
    return {
      intactos: Math.max(0, Math.min(extra, declared)),
      veredicto: extra >= declared ? "intacto" : extra > 0 ? "degradado" : "perdido_en_silencio",
      ...(extra > 0 && extra < declared ? { degradaA: `sólo ${extra} de ${declared} entidades del bloque` } : {}),
    };
  },
  OCG_LAYER_ON: ({ result }, declared) => {
    const intactos = result?.optionalGroups.filter((group) => group.visible).length ?? 0;
    return {
      intactos: Math.min(intactos, declared),
      veredicto: intactos >= declared ? "intacto" : "perdido_en_silencio",
    };
  },
  OCG_LAYER_OFF: ({ result, error }, declared) => {
    const declaredLoss = error !== null || warningCount(result, "hidden_layer_skipped") >= declared;
    return { intactos: 0, veredicto: declaredLoss ? "perdido_declarado" : "perdido_en_silencio" };
  },
  SHADING: ({ result, error }, declared) => {
    const declaredLoss = error !== null || warningCount(result, "shading_dropped") >= declared;
    return { intactos: 0, veredicto: declaredLoss ? "perdido_declarado" : "perdido_en_silencio" };
  },
};

/** La regla concreta de cada tipo, en una frase. Va dentro del artefacto. */
const TYPE_CRITERIA: Record<CadPdfContentType, string> = {
  PATH_LINE:
    "Se cuentan las entidades LINE y las polilíneas ABIERTAS resultantes. Un camino de dos puntos entra como línea y uno de más, como polilínea: exigir sólo líneas castigaría al importador por hacer lo correcto.",
  PATH_RECT:
    "Se cuentan las polilíneas CERRADAS. Un `re` del PDF que entrase abierto dejaría sin contorno a cualquier sombreado que se apoye en él.",
  PATH_CURVE:
    "Se cuenta la fidelidad declarada por el propio importador: en modo spline la conversión es algebraica y exacta; en modo polilínea se publica la desviación MEDIDA contra la Bézier original, no la tolerancia pedida.",
  PATH_FILL:
    "Un relleno macizo no tiene equivalente: se comprueba que el importador lo DECLARE como contorno sin trama. Sin ese aviso sería una pérdida en silencio.",
  TEXT: "Se cuentan las entidades MTEXT con contenido. Un rótulo que llegue vacío no cuenta como llegado.",
  TEXT_AS_CURVES:
    "Se compara la geometría contra el MISMO plano sin las letras dibujadas. Lo que entra son trazos, y el veredicto es degradado por definición: el texto dejó de ser texto en el PDF, antes de llegar aquí.",
  TEXT_GLYPH_INDICES:
    "No puede entrar ningún MTEXT, y la pérdida tiene que estar declarada con su aviso. Un texto adivinado a partir de índices de glifo sería geometría plausible y falsa, que es peor que no importar nada.",
  TEXT_INVISIBLE:
    "El texto invisible no es contenido: es la capa de búsqueda de un OCR. Se exige que NO entre y que se diga.",
  IMAGE:
    "Una imagen no es geometría. Se exige que el importador lo declare: con su aviso si el PDF además trae vectores, o negándose a importar con un error tipado si el PDF es sólo la imagen.",
  FORM_XOBJECT:
    "Se cuentan las entidades que aportan los bloques reutilizados, comparando con el MISMO plano sin ellos. Sin expandirlos, un plano lleno de puertas entraría vacío.",
  OCG_LAYER_ON:
    "Se cuentan las capas opcionales que el importador reconoce como ENCENDIDAS y convierte en capas del dibujo.",
  OCG_LAYER_OFF:
    "El contenido de una capa apagada NO entra por defecto —el remitente no lo ve en su pantalla— y la omisión tiene que estar declarada con el nombre de la capa.",
  SHADING:
    "Un degradado no tiene equivalente en el dibujo. Se exige que se declare perdido en vez de desaparecer.",
};

function measure(file: CadPdfCorpusFile, baselineGeometry: number): Measurement {
  try {
    return {
      file,
      result: importCadPdf(file.bytes, { page: file.measurePage ?? 1 }),
      error: null,
      baselineGeometry,
    };
  } catch (error) {
    if (error instanceof CadPdfImportError) return { file, result: null, error, baselineGeometry };
    throw error;
  }
}

/** Mediana de tres importaciones. Una sola medida en una máquina cargada miente. */
function medianImportMs(file: CadPdfCorpusFile): number {
  const samples: number[] = [];
  for (let run = 0; run < 3; run += 1) {
    const started = performance.now();
    try {
      importCadPdf(file.bytes, { page: file.measurePage ?? 1 });
    } catch {
      // Un archivo que se rechaza también consume tiempo, y ese tiempo cuenta:
      // detectar un escaneo tiene que ser rápido o el usuario espera para nada.
    }
    samples.push(performance.now() - started);
  }
  return Number(samples.sort((a, b) => a - b)[1].toFixed(2));
}

export const CAD_PDF_MATRIX_MACHINE =
  "AMD Ryzen 5 5500U · 7,4 GB RAM · Node v22.18.0 · Windows 11. Máquina de desarrollo COMPARTIDA con " +
  "otros procesos: estas cifras acotan el orden de magnitud, no son un SLO.";

export function buildCadPdfCorpusMatrix(): CadPdfCorpusMatrix {
  const corpus = cadPdfCorpus();
  const byId = new Map(corpus.map((file) => [file.id, file]));

  // La referencia de cada archivo que se mide por comparación. Se calcula una
  // vez: importar el plano base una vez por fila multiplicaría el trabajo.
  const baselines = new Map<string, number>();
  const baselineFor = (file: CadPdfCorpusFile): number => {
    const id = file.baselineId;
    if (!id) return 0;
    if (!baselines.has(id)) {
      const reference = byId.get(id);
      baselines.set(id, reference ? geometryOf(measure(reference, 0).result) : 0);
    }
    return baselines.get(id) ?? 0;
  };

  const archivos: CadPdfMatrixFile[] = corpus.map((file) => {
    const measurement = measure(file, baselineFor(file));
    const { result, error } = measurement;
    const report = result ? buildCadPdfImportReport(result) : null;

    const entrada: CadPdfMatrixRow[] = (
      Object.entries(file.declares) as Array<[CadPdfContentType, number]>
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tipo, declarados]) => {
        const measured = MEASURES[tipo](measurement, declarados);
        return {
          tipo,
          declarados,
          intactos: measured.intactos,
          veredicto: measured.veredicto,
          ...(measured.degradaA ? { degradaA: measured.degradaA } : {}),
          criterio: `${TYPE_CRITERIA[tipo]} ${CAD_PDF_MATRIX_CRITERIA[measured.veredicto]}`,
        };
      });

    const avisos: Record<string, number> = {};
    for (const warning of result?.warnings ?? [])
      avisos[warning.code] = (avisos[warning.code] ?? 0) + warning.count;

    return {
      id: file.id,
      forma: file.shape,
      proposito: file.purpose,
      legible: result !== null,
      error: error ? { codigo: error.code, mensaje: error.message } : null,
      paginas: file.pages,
      paginaMedida: file.measurePage ?? 1,
      capasOpcionales: (result?.optionalGroups ?? []).map((group) => ({
        nombre: group.name,
        encendida: group.visible,
      })),
      avisos: Object.fromEntries(Object.entries(avisos).sort(([a], [b]) => a.localeCompare(b))),
      curvas:
        result && result.curveFidelity.curves > 0
          ? {
              modo: result.curveFidelity.mode,
              curvas: result.curveFidelity.curves,
              toleranciaUnidades: result.curveFidelity.toleranceUnits,
              errorMaximoMedidoUnidades: Number(result.curveFidelity.maxErrorUnits.toFixed(6)),
            }
          : null,
      manifiesto: {
        perdido: report?.rows.filter((row) => row.fidelity === "lost").length ?? 0,
        degradado: report?.rows.filter((row) => row.fidelity === "degraded").length ?? 0,
        conservado: report?.rows.filter((row) => row.fidelity === "kept").length ?? 0,
      },
      entrada,
    };
  });

  const rows = archivos.flatMap((archivo) => archivo.entrada);
  const count = (verdict: CadPdfVerdict) => rows.filter((row) => row.veredicto === verdict).length;

  return {
    generadoPor: "node scripts/cad/build-pdf-import-corpus.mjs",
    corpusSintetico: true,
    limitacion: CAD_PDF_MATRIX_LIMITATION,
    alcance: CAD_PDF_MATRIX_SCOPE,
    criterios: CAD_PDF_MATRIX_CRITERIA,
    resumen: {
      archivos: archivos.length,
      tiposEvaluados: rows.length,
      intactos: count("intacto"),
      degradados: count("degradado"),
      perdidosDeclarados: count("perdido_declarado"),
      perdidosEnSilencio: count("perdido_en_silencio"),
    },
    rendimiento: {
      maquina: CAD_PDF_MATRIX_MACHINE,
      nota:
        "Mediana de 3 importaciones por archivo, en el mismo proceso. Este bloque es el ÚNICO que cambia " +
        "entre regeneraciones sin que haya cambiado el comportamiento, y por eso el comprobador del " +
        "artefacto lo ignora al comparar: un `--check` que fallara por dos milisésimas dejaría de leerse.",
      medianaDe: 3,
      archivos: corpus.map((file) => ({
        id: file.id,
        bytes: file.bytes.length,
        medianaMs: medianImportMs(file),
      })),
    },
    archivos,
  };
}
