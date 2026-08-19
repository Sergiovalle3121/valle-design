/**
 * La matriz de PROPIEDADES: qué se pierde de un DXF ajeno cuando lo que viaja
 * mal no es la entidad sino cómo se dibuja. Medida, no escrita.
 *
 * ## El criterio, antes que los números
 *
 * Cada sonda del corpus dice una propiedad, un objetivo y el valor que el
 * FICHERO declara. Aquí se lee ese valor dos veces:
 *
 * - `entrada` — después de importar. Responde «¿lo leyó el producto?».
 * - `idaYVuelta` — después de importar, volver a escribir con NUESTRO escritor
 *   y leer otra vez. Responde «¿sobrevive al plano que se devuelve?». Es la
 *   pregunta cara: un despacho abre el plano del estructurista, mueve un muro y
 *   lo reenvía, y una propiedad que entra bien y sale mal es igual de inútil
 *   que una que nunca entró.
 *
 * ## Los cuatro veredictos
 *
 * - `intacto` — el valor está en las dos lecturas.
 * - `solo_entrada` — entra y NO sobrevive al ciclo. El escritor lo tira.
 * - `perdido_declarado` — no llega, y algo lo dijo: un aviso del lector o una
 *   línea del manifiesto de pérdidas que NOMBRA la propiedad. Es una limitación
 *   accionable.
 * - `perdido_en_silencio` — no llega y nadie lo dijo. La única categoría que no
 *   debería existir: el arquitecto cree que tiene el plano y no lo tiene.
 *
 * Separar las dos últimas es el motivo entero del módulo. Mezcladas, un hueco
 * silencioso se leería como una limitación asumida.
 *
 * Módulo puro: devuelve un objeto serializable y no escribe nada.
 */
import { buildCadDimensionGeometry } from "./associative-dimension";
import type { CadDocument, CadEntity, CadLayerDef } from "./cad-document";
import { importDocumentText } from "./document-import";
import { exportCadDocumentDxf } from "./dxf-document-export";
import {
  CAD_DXF_PROPERTY_CORPUS,
  CAD_DXF_PROPERTY_LIMITATION,
  type CadDxfPropertyCase,
  type CadDxfPropertyProbe,
} from "./dxf-property-corpus";
import { defaultCadRenderStyle } from "./render/render-style";
import { resolveCadEntityStyle } from "./cad-effective-style";

export type CadDxfPropertyVerdict =
  | "intacto"
  | "solo_entrada"
  | "perdido_declarado"
  | "perdido_en_silencio";

export type CadDxfPropertyValue = string | number | null;

export interface CadDxfPropertyRow {
  sonda: string;
  propiedad: string;
  objetivo: string;
  esperado: string | number;
  entrada: CadDxfPropertyValue;
  idaYVuelta: CadDxfPropertyValue;
  veredicto: CadDxfPropertyVerdict;
  importa: string;
}

export interface CadDxfPropertyFile {
  id: string;
  dialecto: string;
  proposito: string;
  /** `false` cuando el importador rechazó el fichero. Con su razón. */
  legible: boolean;
  razon?: string;
  sondas: readonly CadDxfPropertyRow[];
}

export interface CadDxfPropertyMatrix {
  generadoPor: string;
  corpusSintetico: boolean;
  limitacion: string;
  criterios: Readonly<Record<CadDxfPropertyVerdict, string>>;
  resumen: {
    archivos: number;
    sondas: number;
    intactas: number;
    soloEntrada: number;
    perdidasDeclaradas: number;
    perdidasEnSilencio: number;
  };
  archivos: readonly CadDxfPropertyFile[];
}

const CRITERIOS: Readonly<Record<CadDxfPropertyVerdict, string>> = {
  intacto:
    "El valor que declara el fichero se lee al importar Y sigue ahí después de exportar y volver a " +
    "importar. Es el único veredicto que permite decir que la propiedad viaja.",
  solo_entrada:
    "Se lee al importar y NO sobrevive al ciclo completo. El lector la entiende y el escritor la tira: " +
    "el plano que el despacho devuelve al remitente ya no la lleva.",
  perdido_declarado:
    "No se lee, y un aviso del importador o una línea del manifiesto de exportación NOMBRA la " +
    "propiedad. Es una limitación conocida y accionable.",
  perdido_en_silencio:
    "No se lee y nada lo menciona. El informe de importación dice que todo entró y no es verdad. " +
    "Todo lo que aparezca aquí es deuda del producto, no una limitación asumida.",
};

/**
 * Lectura de un campo OPCIONAL por nombre.
 *
 * La matriz interroga al documento por propiedades que el esquema todavía puede
 * no tener declaradas —es exactamente lo que está midiendo—, así que preguntar
 * por nombre es la forma honesta: si el campo no existe, la sonda sale nula y
 * cuenta como pérdida, que es la lectura correcta.
 */
function optionalField(source: unknown, key: string): unknown {
  return source && typeof source === "object"
    ? (source as Record<string, unknown>)[key]
    : undefined;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function layerOf(document: CadDocument, name: string): CadLayerDef | undefined {
  return document.layers.find((layer) => layer.name === name);
}

/**
 * La entidad sonda de una capa, o la primera de un bloque cuando el objetivo
 * viene con el prefijo `@bloque:`. Cada sonda vive en su propia capa justo para
 * que esta búsqueda no dependa de un índice que se mueve al añadir un caso.
 */
function entityOf(document: CadDocument, target: string): CadEntity | undefined {
  if (target.startsWith("@bloque:")) {
    const name = target.slice("@bloque:".length);
    return document.blocks.find((block) => block.name === name)?.entities[0];
  }
  return document.entities.find(
    (entity) => entity.layer === target && entity.type !== "insert",
  );
}

/** La inserción de un bloque, que es quien resuelve el BYBLOCK de dentro. */
function insertOf(document: CadDocument, target: string): CadEntity | undefined {
  return document.entities.find(
    (entity) => entity.type === "insert" && entity.layer === target,
  );
}

function presentationOf(entity: CadEntity | undefined, channel: "linetype" | "lineweight"): unknown {
  return optionalField(optionalField(optionalField(entity, "context"), "presentation"), channel);
}

/**
 * El ORIGEN de una propiedad, con la regla del formato aplicada.
 *
 * La AUSENCIA del código 6 o del 370 significa BYLAYER en DXF; el documento la
 * representa igual, no guardando nada. Exigir aquí que el campo esté
 * materializado mediría la codificación en vez del significado, y además
 * empujaría al producto a escribir un objeto de herencia en cada una de las
 * cien mil entidades de un plano para no fallar una sonda. Se mide lo que la
 * entidad SIGNIFICA; que no exista la entidad sí es nulo.
 */
function sourceOf(
  document: CadDocument,
  target: string,
  channel: "linetype" | "lineweight",
): CadDxfPropertyValue {
  const entity = entityOf(document, target);
  if (!entity) return null;
  return asText(optionalField(presentationOf(entity, channel), "source")) ?? "byLayer";
}

/** Patrón de un LTYPE del catálogo del documento, serializado «12.7,-6.35». */
function catalogPattern(document: CadDocument, name: string): string | null {
  const catalog = optionalField(document.styles, "linetype");
  const entry = optionalField(catalog, name);
  const pattern = optionalField(entry, "pattern");
  if (!Array.isArray(pattern)) return null;
  return pattern.every((value) => typeof value === "number") ? pattern.join(",") : null;
}

/**
 * Lo EFECTIVO sale del resolvedor del producto, no de una copia de la regla.
 *
 * Reimplementar aquí BYLAYER y BYBLOCK habría medido esta matriz en vez del
 * CAD: la matriz saldría verde con el resolvedor real roto, que es la forma más
 * cara de tener una suite en verde. Se devuelve nulo cuando no hay entidad que
 * medir, y sólo entonces.
 */
function effective(
  document: CadDocument,
  target: string,
  channel: "linetype" | "lineweight" | "escala",
): CadDxfPropertyValue {
  const entity = entityOf(document, target);
  if (!entity) return null;
  const resolved = resolveCadEntityStyle(entity, document);
  return channel === "linetype"
    ? resolved.linetype
    : channel === "lineweight"
      ? resolved.lineweight
      : resolved.linetypeScale;
}

function dimensionOf(document: CadDocument): Extract<CadEntity, { type: "dimension" }> | undefined {
  return document.entities.find(
    (entity): entity is Extract<CadEntity, { type: "dimension" }> => entity.type === "dimension",
  );
}

/** Lee UNA sonda sobre un documento ya construido. */
export function observeCadDxfProperty(
  document: CadDocument,
  probe: CadDxfPropertyProbe,
): CadDxfPropertyValue {
  switch (probe.kind) {
    case "documento.ltscale":
      return asNumber(optionalField(document.meta, "linetypeScale"));
    case "tabla.ltype.patron":
      return catalogPattern(document, probe.target);
    case "capa.linetype":
      return asText(layerOf(document, probe.target)?.linetype);
    case "capa.lineweight":
      return asNumber(layerOf(document, probe.target)?.lineweight);
    case "entidad.linetype.valor":
      return asText(optionalField(presentationOf(entityOf(document, probe.target) ?? insertOf(document, probe.target), "linetype"), "value"));
    case "entidad.linetype.origen":
      return sourceOf(document, probe.target, "linetype");
    case "entidad.linetype.escala":
      return asNumber(optionalField(presentationOf(entityOf(document, probe.target), "linetype"), "scale"));
    case "entidad.lineweight.valor":
      return asNumber(optionalField(presentationOf(entityOf(document, probe.target) ?? insertOf(document, probe.target), "lineweight"), "value"));
    case "entidad.lineweight.origen":
      return sourceOf(document, probe.target, "lineweight");
    case "efectivo.linetype":
      return effective(document, probe.target, "linetype");
    case "efectivo.lineweight":
      return effective(document, probe.target, "lineweight");
    case "efectivo.escala":
      return effective(document, probe.target, "escala");
    // Las dos sondas del VISOR pasan por el mismo `defaultCadRenderStyle` que
    // alimenta el lote instanciado: medir una reimplementación aquí mediría
    // esta matriz, no el producto. Todas las entidades sonda son LINE, que es
    // nativa, así que la comprobación de tipo basta y no hace falta un guardián.
    case "visor.medioGrosorPx": {
      const entity = entityOf(document, probe.target);
      return entity?.type === "line" ? defaultCadRenderStyle(entity, document).halfWidthPx : null;
    }
    case "visor.linetypeIndex": {
      const entity = entityOf(document, probe.target);
      return entity?.type === "line" ? defaultCadRenderStyle(entity, document).linetypeIndex : null;
    }
    case "cota.presente":
      return dimensionOf(document) ? 1 : 0;
    case "cota.a": {
      const dimension = dimensionOf(document);
      return dimension ? `${dimension.a.x},${dimension.a.y}` : null;
    }
    case "cota.b": {
      const dimension = dimensionOf(document);
      return dimension ? `${dimension.b.x},${dimension.b.y}` : null;
    }
    case "cota.medida": {
      const dimension = dimensionOf(document);
      // La medida se RECALCULA desde los puntos: es la prueba de que la cota
      // sigue midiendo y no sólo dibujando el número que traía escrito.
      const geometry = dimension ? buildCadDimensionGeometry(dimension) : null;
      return geometry ? Number(geometry.measurement.toFixed(6)) : null;
    }
    case "cota.tipo":
      return asText(dimensionOf(document)?.dimensionKind);
    case "cota.estilo":
      return asText(dimensionOf(document)?.style);
  }
}

const CLOSE_ENOUGH = 1e-6;

function matches(observed: CadDxfPropertyValue, expected: string | number): boolean {
  if (observed === null) return false;
  if (typeof expected === "number")
    return typeof observed === "number" && Math.abs(observed - expected) <= CLOSE_ENOUGH;
  return String(observed) === expected;
}

/**
 * ¿Dijo alguien que esta propiedad no viaja?
 *
 * Se busca el nombre de la propiedad y el del objetivo en los avisos del
 * importador y en el manifiesto de la exportación. Es una comprobación ROMA a
 * propósito: cualquier mención cuenta como declaración, porque el listón que
 * importa es «¿el usuario tuvo forma de enterarse?», no «¿el mensaje era
 * bonito?». Si ni siquiera así aparece, la pérdida es silenciosa de verdad.
 */
function declared(haystack: string, probe: CadDxfPropertyProbe): boolean {
  const words = [probe.kind.split(".")[1] ?? probe.kind, probe.target].filter(Boolean);
  return words.some((word) => word.length > 2 && haystack.includes(word.toLowerCase()));
}

function measure(file: CadDxfPropertyCase): CadDxfPropertyFile {
  let imported;
  try {
    imported = importDocumentText(`${file.id}.dxf`, file.content);
  } catch (error) {
    return {
      id: file.id,
      dialecto: file.dialect,
      proposito: file.purpose,
      legible: false,
      razon: error instanceof Error ? error.message : String(error),
      sondas: file.probes.map((probe) => ({
        sonda: probe.id,
        propiedad: probe.kind,
        objetivo: probe.target,
        esperado: probe.expected,
        entrada: null,
        idaYVuelta: null,
        veredicto: "perdido_declarado" as const,
        importa: probe.matters,
      })),
    };
  }
  const written = exportCadDocumentDxf(imported.document);
  let roundTripped: CadDocument | null = null;
  try {
    roundTripped = importDocumentText(`${file.id}-ida-y-vuelta.dxf`, written.content).document;
  } catch {
    roundTripped = null;
  }
  const spoken = [
    ...imported.warnings.map((warning) => `${warning.code} ${warning.message}`),
    ...written.losses.map((loss) => `${loss.code} ${loss.detail}`),
    ...imported.document.lossManifest.map((loss) => `${loss.code} ${loss.detail}`),
  ]
    .join(" | ")
    .toLowerCase();

  return {
    id: file.id,
    dialecto: file.dialect,
    proposito: file.purpose,
    legible: true,
    sondas: file.probes.map((probe): CadDxfPropertyRow => {
      const entrada = observeCadDxfProperty(imported.document, probe);
      const idaYVuelta = roundTripped ? observeCadDxfProperty(roundTripped, probe) : null;
      const entered = matches(entrada, probe.expected);
      const survived = matches(idaYVuelta, probe.expected);
      const veredicto: CadDxfPropertyVerdict = entered
        ? survived
          ? "intacto"
          : "solo_entrada"
        : declared(spoken, probe)
          ? "perdido_declarado"
          : "perdido_en_silencio";
      return {
        sonda: probe.id,
        propiedad: probe.kind,
        objetivo: probe.target,
        esperado: probe.expected,
        entrada,
        idaYVuelta,
        veredicto,
        importa: probe.matters,
      };
    }),
  };
}

/** Construye la matriz entera midiendo con el lector y el escritor reales. */
export function buildCadDxfPropertyMatrix(): CadDxfPropertyMatrix {
  const archivos = CAD_DXF_PROPERTY_CORPUS.map(measure);
  const rows = archivos.flatMap((file) => file.sondas);
  const count = (verdict: CadDxfPropertyVerdict) =>
    rows.filter((row) => row.veredicto === verdict).length;
  return {
    generadoPor: "node scripts/cad/build-dxf-property-matrix.mjs",
    corpusSintetico: true,
    limitacion: CAD_DXF_PROPERTY_LIMITATION,
    criterios: CRITERIOS,
    resumen: {
      archivos: archivos.length,
      sondas: rows.length,
      intactas: count("intacto"),
      soloEntrada: count("solo_entrada"),
      perdidasDeclaradas: count("perdido_declarado"),
      perdidasEnSilencio: count("perdido_en_silencio"),
    },
    archivos,
  };
}
