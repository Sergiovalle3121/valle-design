/**
 * El SEGUNDO punto autorizado del producto que importa el códec DWG — el de
 * ESCRITURA. Autorizado por ADR-0009 §8 (firma del titular 2026-08-25):
 * exportación AC1015 acotada al subconjunto que el writer del laboratorio
 * escribe hoy (LINE/POINT/CIRCLE/ARC/LWPOLYLINE/TEXT/INSERT), con manifiesto
 * de pérdidas y NUNCA omisión silenciosa. `scripts/dwg/check-product-boundary.mjs`
 * lo nombra igual que nombra al adaptador de LECTURA; nadie más toca el
 * códec, y a este archivo sólo lo consume su spec — el botón del producto
 * llega cuando el oráculo externo de §8.2 esté corrido (OWNER ACTION), no
 * antes: `exportCadDocumentToDwg` es fallo cerrado contra ese gate.
 *
 * TRES ESTADOS, nunca dos. «éxito» = todos los tipos del documento viajaron;
 * «éxito con pérdidas» = el archivo salió y el manifiesto dice EXACTAMENTE
 * qué no viajó y por qué; «rechazado» = no hay archivo — porque el gate está
 * cerrado, o porque ninguna entidad del documento es escribible (un DWG
 * vacío que dice ser tu plano es peor que un error). El documento original
 * NUNCA se toca: esta función es pura — bytes nuevos o nada.
 */
import {
  writeCanonicalDwg,
  type CanonicalCadDocumentJson,
  type CanonicalLossEntry,
} from "@valle-design/dwg-codec";
import type { CadDocument } from "./cad-document";
import {
  cadHatchPatternBaseAngle,
  cadHatchPatternDefinition,
} from "./hatch-pattern-table";
import { cadHatchPatternDxfLines } from "./hatch-pattern-strokes";
import {
  DWG_EXPORT_GATES,
  dwgBetaExportIsEnabled,
  dwgExportBlockers,
  type DwgExportGates,
} from "./dwg-export-flag";

const RADIANS_PER_DEGREE = Math.PI / 180;

/**
 * El documento del producto guarda ángulos en GRADOS (confirmado por
 * `dxf-roundtrip.spec.ts`); el canónico del laboratorio los espera en
 * RADIANES (`packages/dwg-codec/src/model/entity-geometry.ts`, que documenta
 * el binario real). El lado de LECTURA ya convierte
 * (`dwg-document-bridge-primitives.ts:38`, `degrees()`); este lado de
 * ESCRITURA no lo hacía — pasaba el valor crudo, grados etiquetados como
 * radianes. Explícito por tipo, no un `map` genérico sobre todos los campos
 * numéricos: sólo ARC, INSERT y ELLIPSE tienen un ángulo en el subconjunto
 * que este writer escribe.
 *
 * ELLIPSE se suma el 2026-09-01, con el mismo cuidado. Sus `startParameter` y
 * `endParameter` están en GRADOS en el documento del producto —`curve-edit.ts`
 * los normaliza con `normalizeDeg`, `curve-model.ts` con `norm360` y
 * `paper-space.ts` compara la vuelta completa contra 359.999—, mientras que el
 * canónico del laboratorio los espera en RADIANES, como el resto de ángulos.
 * Enrutar la elipse sin convertir habría exportado TODA elipse recortada con
 * su arco equivocado, en silencio y sin pérdida declarada, que es exactamente
 * el defecto que este comentario existía para impedir.
 */
function toCanonicalEntity(entity: CadDocument["entities"][number]): Record<string, unknown> {
  if (entity.type === "arc")
    return {
      ...entity,
      startAngle: entity.startAngle * RADIANS_PER_DEGREE,
      endAngle: entity.endAngle * RADIANS_PER_DEGREE,
    };
  if (entity.type === "insert") return toCanonicalInsert(entity);
  if (entity.type === "ellipse")
    return {
      ...entity,
      startParameter: entity.startParameter * RADIANS_PER_DEGREE,
      endParameter: entity.endParameter * RADIANS_PER_DEGREE,
    };
  // MTEXT COMPARTE LA TRAMPA DE LAS ANTERIORES. La rotación del editor viaja
  // en GRADOS y el documento canónico la quiere en RADIANES; el camino
  // público la convierte en el vector del eje X con `Math.cos`/`Math.sin`, así
  // que dejarla en grados no habría fallado por ningún lado: habría girado
  // cada párrafo a un ángulo equivocado, en silencio.
  if (entity.type === "mtext")
    return { ...entity, rotation: (entity.rotation ?? 0) * RADIANS_PER_DEGREE };
  if (entity.type === "hatch") return toCanonicalHatch(entity);
  return { ...entity };
}

/**
 * EL RÓTULO DEL BLOQUE, CON SU TEXTO (2026-09-04). Hasta este corte el
 * códec fijaba el bit de ATTRIBs a 0 y fallaba cerrado si el modelo pedía
 * atributos: un INSERT con cuadro de rótulo NO se escribía —el bloque entero
 * desaparecía del archivo, no sólo su texto—. Ahora los escribe, y este lado
 * le manda lo que el laboratorio no puede resolver por su cuenta.
 *
 * `positionedAttributes` ES LA FUENTE, no el mapa plano. El mapa dice qué
 * vale cada etiqueta; esto dice DÓNDE se dibuja, ya en coordenadas del mundo.
 * Es la misma decisión que tomó el exportador DXF (`dxf-export.ts`,
 * `pushInsert`) cuando recomponer la posición desde la definición del bloque
 * dejaba el texto en un sitio distinto del que el usuario ve en pantalla; sin
 * el gemelo posicionado, el laboratorio declara la pérdida en vez de
 * inventarse una posición.
 *
 * LAS UNIDADES, otra vez: la rotación de un atributo viaja en GRADOS en el
 * documento del producto y en RADIANES en el archivo, igual que la del INSERT
 * que lo lleva. Convertirla aquí es lo que impide que una etiqueta girada
 * salga a un ángulo equivocado en silencio.
 */
function toCanonicalInsert(
  entity: Extract<CadDocument["entities"][number], { type: "insert" }>,
): Record<string, unknown> {
  const rotation = entity.rotation * RADIANS_PER_DEGREE;
  const positioned = entity.positionedAttributes;
  if (positioned === undefined || positioned.length === 0) {
    return { ...entity, rotation };
  }
  return {
    ...entity,
    rotation,
    positionedAttributes: positioned.map((attribute) => ({
      ...attribute,
      ...(attribute.rotation === undefined
        ? {}
        : { rotation: attribute.rotation * RADIANS_PER_DEGREE }),
    })),
  };
}

/**
 * EL SOMBREADO DE PATRÓN, CON SU TRAMA (2026-09-04). Hasta este corte todo
 * achurado que no fuera sólido se DESCARTABA, y el motivo escrito —«el
 * canónico lleva el nombre del patrón pero no su definición»— dejó de ser
 * cierto el día que `hatch-pattern-table.ts` se volvió una tabla propia con
 * ángulo, separación, desfase, corrimiento y trazos por familia. El
 * laboratorio no puede consultarla (ADR-0007 le prohíbe importar el
 * producto), así que la resuelve ESTE lado y la manda ya resuelta.
 *
 * NO ES UNA SEGUNDA DEFINICIÓN DEL PATRÓN. Son las MISMAS líneas que escribe
 * el DXF —`cadHatchPatternDxfLines`, con el vector entre rayas ya girado al
 * dibujo—, de modo que el mismo sombreado exportado a DXF y a DWG lleva la
 * misma trama. Duplicar aquí la trigonometría habría creado dos tramas que
 * podían separarse sin que nada lo viera.
 *
 * LAS UNIDADES, que es donde esto se rompe en silencio: el producto guarda
 * los ángulos en GRADOS y el archivo DWG los lleva en RADIANES —medido: el
 * ANSI31 de `11-hatch` del corpus guarda 0.7853981633974483 en su línea de
 * definición, y el DXF del oráculo del mismo bundle escribe 53 = 45.0—, así
 * que se convierten aquí, como ya se convierten los de ARC, INSERT, ELLIPSE
 * y MTEXT. Y `angle` del archivo es el GIRO del patrón (`ángulo − base`), no
 * el ángulo de las rayas: la misma resta que hace el DXF.
 *
 * UN NOMBRE QUE LA TABLA NO CONOCE NO SE INVENTA. No se le pone el respaldo
 * ANSI31: se manda sin definición y el laboratorio lo declara como pérdida.
 * Un archivo que dice llevar tu trama y lleva otra es peor que uno que dice
 * que no la lleva.
 */
function toCanonicalHatch(
  entity: Extract<CadDocument["entities"][number], { type: "hatch" }>,
): Record<string, unknown> {
  if (entity.solid || cadHatchPatternDefinition(entity.pattern) === undefined) {
    return { ...entity };
  }
  const scale =
    Number.isFinite(entity.scale) && (entity.scale ?? 0) > 0 ? entity.scale! : 1;
  const base = cadHatchPatternBaseAngle(entity.pattern);
  const angle = Number.isFinite(entity.angle) ? entity.angle! : base;
  const origin = entity.origin ??
    entity.boundaries[0]?.[0] ?? { x: 0, y: 0, z: 0 };
  return {
    ...entity,
    patternDefinition: {
      angle: (angle - base) * RADIANS_PER_DEGREE,
      scale,
      double: false,
      lines: cadHatchPatternDxfLines(entity.pattern, angle, scale, origin).map(
        (line) => ({
          angle: line.angle * RADIANS_PER_DEGREE,
          basePoint: { x: line.base.x, y: line.base.y },
          offset: { x: line.offset.x, y: line.offset.y },
          dashes: [...line.dashes],
        }),
      ),
    },
  };
}

/**
 * El subconjunto §8.1 — el preflight cuenta contra ESTA lista, no adivina.
 *
 * `ellipse` entra el 2026-09-01. No es que el writer aprendiera a emitirla:
 * la emitía desde hacía olas. Lo que faltaba era el enrutado en el camino
 * PÚBLICO (`canonical-to-dwg.ts`), que la mandaba al `default` y la declaraba
 * no escribible. Esta lista reflejaba fielmente esa carencia, así que se
 * actualiza cuando la carencia se cierra y no antes.
 */
export const DWG_EXPORT_WRITABLE_TYPES = new Set([
  "line",
  "point",
  "circle",
  "arc",
  "polyline",
  "text",
  "insert",
  "ellipse",
  // `mtext` entra el 2026-09-02, y tampoco porque el writer aprendiera nada:
  // lo emitía desde hacía olas. Lo que faltaba era la SEMÁNTICA del anclaje
  // —qué significa cada número—, que no estaba en el hecho registrado de la
  // fuente y ha habido que medir contra el oráculo DXF del corpus.
  "mtext",
  // `hatch` entra por INSTANCIA, no por tipo: ver `cadEntityIsDwgWritable`.
  // El sólido viaja, y desde el 2026-09-04 también el de patrón cuyo nombre
  // conoce la tabla propia; el que la tabla no conoce se declara. Aparece en
  // el conjunto para que la lista siga siendo la única fuente de «qué clases
  // toca el writer», y el predicado es quien decide el caso concreto.
  "hatch",
]);

/**
 * ¿Viajará ESTA entidad, no su tipo?
 *
 * Hasta el 2026-09-01 el preflight preguntaba sólo por el TIPO, y bastaba
 * porque cada clase era escribible entera o nada. El HATCH rompe eso, y
 * desde el 2026-09-04 la frontera se movió pero NO desapareció: el de
 * relleno sólido viaja siempre, y el de patrón viaja si su nombre está en la
 * tabla propia —de ahí salen las líneas de definición que el archivo lleva—.
 * El nombre que la tabla no conoce sigue sin viajar, porque escribirlo
 * exigiría inventarle una trama.
 *
 * Un conjunto por tipo tendría que mentir en una de las dos direcciones:
 * incluir `hatch` prometería exportar sombreados que luego se declaran
 * perdidos, y excluirlo daría por perdidos los que sí viajan. El preflight
 * existe justamente para que la pérdida NO sorprenda después, así que
 * pregunta por la instancia.
 */
export function cadEntityIsDwgWritable(
  entity: CadDocument["entities"][number],
): boolean {
  if (entity.type === "hatch") {
    return entity.solid === true || cadHatchPatternDefinition(entity.pattern) !== undefined;
  }
  return DWG_EXPORT_WRITABLE_TYPES.has(entity.type);
}

export interface CadDwgExportPreflight {
  /** Cuántas entidades del documento caen dentro del subconjunto §8.1. */
  readonly writableCount: number;
  /** Cuántas quedarán declaradas en el manifiesto, por tipo. */
  readonly unwritableByType: Readonly<Record<string, number>>;
}

export type CadDwgExportResult =
  | {
      readonly estado: "rechazado";
      readonly motivo: "gate_cerrado" | "sin_entidades_escribibles";
      readonly bloqueos: readonly string[];
      readonly preflight: CadDwgExportPreflight;
    }
  | {
      readonly estado: "exito" | "exito_con_perdidas";
      readonly bytes: Uint8Array;
      readonly manifiestoDePerdidas: readonly CanonicalLossEntry[];
      readonly preflight: CadDwgExportPreflight;
    };

/** Qué viajaría y qué no — SIN escribir nada. Es lo que la interfaz enseña
 * antes de que la persona confirme, para que la pérdida nunca sorprenda. */
export function preflightCadDwgExport(
  document: CadDocument,
): CadDwgExportPreflight {
  let writableCount = 0;
  const unwritableByType: Record<string, number> = {};
  for (const entity of document.entities) {
    if (cadEntityIsDwgWritable(entity)) writableCount += 1;
    else unwritableByType[entity.type] = (unwritableByType[entity.type] ?? 0) + 1;
  }
  return { writableCount, unwritableByType };
}

/**
 * Los patrones de tipo de línea del documento, en la forma que el laboratorio
 * espera. Se copian los arreglos: el documento del producto es del editor y no
 * puede acabar compartiendo memoria con lo que se serializa.
 */
function toCanonicalLinetypeStyles(
  styles: Record<string, { pattern: number[]; description?: string }>,
): Record<string, { pattern: number[]; description?: string }> {
  const projected: Record<string, { pattern: number[]; description?: string }> = {};
  for (const [name, style] of Object.entries(styles)) {
    if (!Array.isArray(style?.pattern)) continue;
    projected[name] = {
      pattern: [...style.pattern],
      ...(style.description === undefined ? {} : { description: style.description }),
    };
  }
  return projected;
}

/**
 * Proyección explícita del documento del producto al canónico del
 * laboratorio — campo a campo, nada de `as`: lo que el canónico de esta fase
 * no modela (espacios de papel, restricciones, referencias externas) se
 * VACÍA aquí y se declara como pérdida, no se cuela tipado a la fuerza.
 */
function toCanonicalDocument(document: CadDocument): {
  canonical: CanonicalCadDocumentJson;
  droppedLosses: CanonicalLossEntry[];
} {
  const droppedLosses: CanonicalLossEntry[] = [];
  if (document.paperSpaces.length > 0) {
    droppedLosses.push({
      code: "paper-spaces-not-written",
      sourceType: "PAPER_SPACE",
      detail: `El documento tiene ${document.paperSpaces.length} espacio(s) de papel; el DWG de esta fase escribe SOLO model space — las hojas siguen intactas en el documento y en el PDF/DXF.`,
      severity: "warning",
    });
  }
  const canonical: CanonicalCadDocumentJson = {
    meta: {
      version: document.meta.version,
      schema: document.meta.schema,
      unit: document.meta.unit,
    },
    // EL ESTADO Y EL TIPO DE LÍNEA DE CADA CAPA (2026-09-01). Hasta este corte
    // aquí sólo viajaban id, nombre, color, visible y bloqueo: una capa
    // CONGELADA se exportaba descongelada y una de ejes con TRAZOS salía
    // continua, las dos EN SILENCIO. No era una limitación del códec —que ya
    // sabe escribir ambas cosas— sino de este adaptador, que las tiraba antes
    // de que el códec llegara a verlas.
    layers: document.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      color: layer.color,
      visible: layer.visible,
      locked: layer.locked,
      ...(layer.frozen === undefined ? {} : { frozen: layer.frozen }),
      ...(layer.linetype === undefined ? {} : { linetype: layer.linetype }),
    })),
    entities: document.entities.map(toCanonicalEntity),
    history: [],
    modelSpace: { entityIds: [...document.modelSpace.entityIds] },
    paperSpaces: [],
    // LOS PATRONES DE TIPO DE LÍNEA DEL DOCUMENTO. Sin ellos el writer no
    // puede emitir la entrada LTYPE y toda capa cae a Continuous: el nombre
    // solo no basta, hace falta el patrón. Los demás estilos siguen vacíos
    // porque esta fase no los escribe, y eso ya estaba declarado.
    styles: {
      text: {},
      dimension: {},
      table: {},
      plot: {},
      ...(document.styles?.linetype === undefined
        ? {}
        : { linetype: toCanonicalLinetypeStyles(document.styles.linetype) }),
    },
    blocks: document.blocks.map((block) => ({
      id: block.id,
      name: block.name,
      basePoint: { ...block.basePoint },
      entities: block.entities.map(toCanonicalEntity),
    })),
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
  return { canonical, droppedLosses };
}

/**
 * La exportación completa: gate → preflight → escritura → estado. `gates` es
 * inyectable SOLO para que la spec pueda ejercitar el camino post-oráculo
 * sin fingir que el oráculo corrió: producción usa el congelado.
 */
export function exportCadDocumentToDwg(
  document: CadDocument,
  options: { betaFlagOn: boolean; gates?: DwgExportGates },
): CadDwgExportResult {
  const gates = options.gates ?? DWG_EXPORT_GATES;
  const preflight = preflightCadDwgExport(document);
  if (!dwgBetaExportIsEnabled(options.betaFlagOn, gates)) {
    return {
      estado: "rechazado",
      motivo: "gate_cerrado",
      bloqueos: options.betaFlagOn
        ? dwgExportBlockers(gates)
        : ["la bandera de exportación DWG está apagada en este entorno", ...dwgExportBlockers(gates)],
      preflight,
    };
  }
  if (preflight.writableCount === 0) {
    return {
      estado: "rechazado",
      motivo: "sin_entidades_escribibles",
      bloqueos: [
        "ninguna entidad del documento cae en el subconjunto AC1015_EXPORT_2D_V1 — un DWG vacío que dice ser tu plano sería peor que este aviso",
      ],
      preflight,
    };
  }
  const { canonical, droppedLosses } = toCanonicalDocument(document);
  const { bytes, lossManifest } = writeCanonicalDwg(canonical);
  const manifiestoDePerdidas = [...droppedLosses, ...lossManifest];
  return {
    estado: manifiestoDePerdidas.length === 0 ? "exito" : "exito_con_perdidas",
    bytes,
    manifiestoDePerdidas,
    preflight,
  };
}
