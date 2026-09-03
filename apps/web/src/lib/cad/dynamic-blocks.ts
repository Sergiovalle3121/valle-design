/**
 * BLOQUES DINÁMICOS Y BLOQUES ANOTATIVOS.
 *
 * ## Qué problema resuelve un bloque dinámico
 *
 * La biblioteca sembrada trae tres puertas abatibles —0,90, 0,80 y 0,70— porque
 * son tres anchos comerciales. Con cuatro ángulos de apertura y los dos sentidos
 * de giro serían veinticuatro bloques, y con dos espesores de muro, cuarenta y
 * ocho. Ese es exactamente el catálogo que nadie mantiene: el día que cambia el
 * grosor de la hoja hay que redibujar cuarenta y ocho definiciones y se olvidan
 * seis.
 *
 * Un bloque dinámico es UNO con parámetros. Aquí la puerta es una receta —claro,
 * apertura, muro, sentido— y la geometría se genera. Cambiar el claro de una
 * puerta ya colocada no es borrarla y poner otra: es mover un parámetro.
 *
 * ## Por qué se materializa en bloques anónimos y no en un campo nuevo
 *
 * `CadBlockDefinition` no tiene sección de parámetros, y añadírsela obligaría a
 * migrar el esquema persistido y la validación de la API. No hace falta: es el
 * mismo camino que sigue AutoCAD por dentro, que resuelve cada instancia de un
 * bloque dinámico en un bloque ANÓNIMO (`*U12`) con la geometría ya evaluada.
 * Aquí el anónimo tiene nombre determinista —`valle:din:puerta-abatible:apertura=90:claro=900:espejo=0:muro=150`—
 * y por eso dos puertas iguales comparten definición en vez de duplicarla, y
 * abrir el documento dos veces produce el mismo JSON.
 *
 * Los valores viven además en `context.metadata` de cada INSERT, que es el
 * bolsillo que el esquema ya reserva para asociatividades sin campo propio (lo
 * usa ARRAY). Sin eso, un bloque materializado sería geometría muerta: se podría
 * ver, no editar. Con eso, la puerta sigue siendo paramétrica después de guardar,
 * cerrar y volver a abrir.
 *
 * ## Qué es «anotativo» aquí y por qué hacía falta este módulo
 *
 * Un símbolo anotativo mide lo mismo EN EL PAPEL a cualquier escala: una marca
 * de nivel son 3 mm impresos, tanto en la planta a 1:50 como en el detalle a
 * 1:5. `layout/annotative-scale.ts` ya resuelve eso para lo que lleva `height`
 * —textos y cotas— y DECLARA que no puede con el resto: devuelve los demás en
 * `skippedEntityIds` en vez de fingir que los reescaló. Un INSERT es justo uno
 * de esos: su tamaño no es una altura, es una ESCALA.
 *
 * Este módulo cierra ese hueco y lo cierra con la misma cuenta: la altura sobre
 * papel se convierte a modelo con `cadAnnotativeModelHeight` —una sola fórmula,
 * no dos que se desincronicen— y el resultado se escribe como escala del INSERT.
 * Para que esa conversión sea directa, los símbolos anotativos de este catálogo
 * se dibujan con **altura 1**: así la escala de inserción ES la altura en el
 * modelo, sin un segundo factor que alguien pueda tocar por un lado y no por el
 * otro.
 *
 * El signo de la escala se CONSERVA al reescalar. Un símbolo espejado que
 * volviera a positivo al cambiar la escala de la ventana se daría la vuelta solo,
 * y nadie relacionaría eso con haber tocado la escala.
 */
import type {
  CadBlockDefinition,
  CadDocument,
  CadEntity,
  CadPaperSpace,
  CadPaperViewport,
  CadPoint3,
} from "./cad-document";
import type { CadEntityCommand } from "./entity-commands";
import type { CadNativeEntity } from "./entity-runtime";
import {
  CAD_ANNOTATIVE_HEIGHT_METADATA,
  cadAnnotativeHeightMm,
  cadAnnotativeModelHeight,
} from "./layout/annotative-scale";

/** Prefijo del carril de bloques materializados. Es un contrato de datos. */
export const CAD_DYNAMIC_BLOCK_PREFIX = "valle:din:";
/** Clave de metadatos con la familia dinámica de la que sale un INSERT. */
export const CAD_DYNAMIC_FAMILY_METADATA = "din:familia";
/** Prefijo de las claves de metadatos que guardan cada parámetro. */
export const CAD_DYNAMIC_PARAMETER_PREFIX = "din:";

export type CadDynamicParameterKind = "linear" | "angle" | "flip";

export interface CadDynamicParameter {
  /** Sin acentos ni espacios: forma parte de la llave del bloque anónimo. */
  name: string;
  kind: CadDynamicParameterKind;
  /** Lo que lee el arquitecto en la paleta. Aquí sí lleva acentos. */
  label: string;
  default: number;
  min?: number;
  max?: number;
  /**
   * Valores discretos admitidos. En una puerta NO es una comodidad: los anchos
   * de carpintería se venden en 0,60 / 0,70 / 0,80 / 0,90 / 1,00, y una puerta
   * de 0,873 m es una puerta que hay que fabricar a medida sin haberlo decidido.
   * El valor pedido se ajusta al más cercano y se DICE que se ajustó.
   */
  steps?: readonly number[];
}

export type CadDynamicValues = Readonly<Record<string, number>>;

export interface CadDynamicBlockFamily {
  /** Familia, sin el prefijo: `puerta-abatible`. */
  id: string;
  name: string;
  description: string;
  keywords: readonly string[];
  /** Capa de la geometría. Tiene que ser una que el documento declare. */
  layer: string;
  /**
   * Altura sobre el PAPEL, en mm, cuando la familia es anotativa. Ausente en las
   * que se dibujan a tamaño real, que son la mayoría: una puerta de 0,90 m mide
   * 0,90 m, no 3 mm impresos.
   */
  annotativeHeightMm?: number;
  parameters: readonly CadDynamicParameter[];
  /** Geometría para unos valores YA resueltos, sin id ni capa. */
  build(values: CadDynamicValues): readonly CadDynamicShape[];
  /** Atributos del bloque materializado, derivados de los valores. */
  attributes(values: CadDynamicValues): Record<string, { defaultValue: string; prompt: string }>;
}

/**
 * Primitiva sin identidad: el id y la capa los pone la materialización.
 *
 * `entity` es el caso de las familias que salen de un bloque DEL USUARIO: su
 * geometría es la que dibujó, y puede llevar texto, sombreado o cualquier otro
 * tipo que este documento guarde. Recortarla a cuatro primitivas obligaría a
 * decirle a un despacho que su bloque no puede ser dinámico porque tiene una
 * rotulación dentro, que es un límite del programa disfrazado de límite del
 * dibujo. La materialización le pone id nuevo y RESPETA su capa.
 */
export type CadDynamicShape =
  | { type: "line"; start: CadPoint3; end: CadPoint3 }
  | { type: "arc"; center: CadPoint3; radius: number; startAngle: number; endAngle: number }
  | { type: "circle"; center: CadPoint3; radius: number }
  | { type: "polyline"; vertices: CadPoint3[]; closed: boolean }
  | { type: "entity"; entity: CadEntity };

const p3 = (x: number, y: number): CadPoint3 => ({ x, y, z: 0 });
const line = (x1: number, y1: number, x2: number, y2: number): CadDynamicShape => ({
  type: "line",
  start: p3(x1, y1),
  end: p3(x2, y2),
});

/** Error tipado: pedir un parámetro que no existe no puede pasar en silencio. */
export class CadDynamicBlockError extends Error {
  readonly code: "cad_dynamic_family_unknown" | "cad_dynamic_parameter_unknown";
  constructor(code: CadDynamicBlockError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "CadDynamicBlockError";
  }
}

// ---------------------------------------------------------------------------
// Resolución de valores
// ---------------------------------------------------------------------------

export interface CadDynamicResolution {
  values: CadDynamicValues;
  /** Ajustes hechos sobre lo pedido. Se dicen, no se ocultan. */
  adjustments: string[];
}

const nearest = (value: number, steps: readonly number[]): number =>
  steps.reduce((best, step) =>
    Math.abs(step - value) < Math.abs(best - value) ? step : best,
  );

/**
 * Completa y sanea los valores de una familia.
 *
 * Falla CERRADO ante un parámetro que la familia no declara: un `claro` escrito
 * `ancho` se ignoraría en silencio y la puerta saldría con el valor por defecto,
 * que es el defecto más caro de diagnosticar — todo funciona y nada obedece.
 */
export function cadDynamicResolveValues(
  family: CadDynamicBlockFamily,
  requested: Readonly<Record<string, number>> = {},
): CadDynamicResolution {
  const declared = new Map(family.parameters.map((item) => [item.name, item]));
  for (const name of Object.keys(requested)) {
    if (declared.has(name)) continue;
    throw new CadDynamicBlockError(
      "cad_dynamic_parameter_unknown",
      `La familia «${family.id}» no tiene el parámetro «${name}». Los suyos son: ${family.parameters
        .map((item) => item.name)
        .join(", ")}.`,
    );
  }
  const values: Record<string, number> = {};
  const adjustments: string[] = [];
  for (const parameter of family.parameters) {
    const raw = requested[parameter.name];
    let value = Number.isFinite(raw) ? Number(raw) : parameter.default;
    if (parameter.kind === "flip") {
      // Un interruptor no admite 0,3: cualquier cosa que no sea cero es «sí».
      values[parameter.name] = value ? 1 : 0;
      continue;
    }
    if (parameter.min !== undefined && value < parameter.min) {
      adjustments.push(
        `${parameter.label}: ${value} está por debajo del mínimo ${parameter.min}; se usa el mínimo.`,
      );
      value = parameter.min;
    }
    if (parameter.max !== undefined && value > parameter.max) {
      adjustments.push(
        `${parameter.label}: ${value} supera el máximo ${parameter.max}; se usa el máximo.`,
      );
      value = parameter.max;
    }
    if (parameter.steps?.length) {
      const snapped = nearest(value, parameter.steps);
      if (snapped !== value)
        adjustments.push(
          `${parameter.label}: ${value} no es una medida comercial; se ajusta a ${snapped}.`,
        );
      value = snapped;
    }
    values[parameter.name] = value;
  }
  return { values, adjustments };
}

// ---------------------------------------------------------------------------
// Materialización
// ---------------------------------------------------------------------------

/**
 * Llave del bloque anónimo. Determinista y ORDENADA por nombre de parámetro:
 * dos puertas iguales pedidas en distinto orden comparten definición en vez de
 * duplicarla, que es la diferencia entre un documento de 30 bloques y uno de
 * 300.
 */
export function cadDynamicBlockKey(
  family: CadDynamicBlockFamily,
  values: CadDynamicValues,
): string {
  const parts = Object.keys(values)
    .sort()
    .map((name) => `${name}=${values[name]}`);
  return `${CAD_DYNAMIC_BLOCK_PREFIX}${family.id}:${parts.join(":")}`;
}

/** Refleja una forma sobre el eje Y: `x → −x`. */
function mirrorShape(shape: CadDynamicShape): CadDynamicShape {
  const flip = (point: CadPoint3): CadPoint3 => ({ ...point, x: -point.x });
  // Una geometría de bloque de usuario NO llega aquí: `cadUserDynamicFamily`
  // rechaza declarar un parámetro interruptor y lo dice. Si algún día llegara,
  // fallar cerrado es lo correcto: reflejar «casi bien» un texto o un sombreado
  // es peor que negarse, porque el error se ve en obra y no en pantalla.
  if (shape.type === "entity")
    throw new CadDynamicBlockError(
      "cad_dynamic_parameter_unknown",
      "Una familia con geometría de usuario todavía no admite parámetros de espejo.",
    );
  if (shape.type === "line") return { ...shape, start: flip(shape.start), end: flip(shape.end) };
  if (shape.type === "circle") return { ...shape, center: flip(shape.center) };
  if (shape.type === "polyline")
    return { ...shape, vertices: shape.vertices.map(flip) };
  // Un arco reflejado NO conserva sus ángulos: el barrido va de 0→θ y pasa a ir
  // de 180−θ→180. Reflejar sólo el centro dibujaría el arco al otro lado de la
  // puerta, que es un barrido que la hoja no hace.
  return {
    ...shape,
    center: flip(shape.center),
    startAngle: 180 - shape.endAngle,
    endAngle: 180 - shape.startAngle,
  };
}

export function cadDynamicShapes(
  family: CadDynamicBlockFamily,
  values: CadDynamicValues,
): CadDynamicShape[] {
  const shapes = [...family.build(values)];
  const mirrored = family.parameters.some(
    (parameter) => parameter.kind === "flip" && values[parameter.name] === 1,
  );
  return mirrored ? shapes.map(mirrorShape) : shapes;
}

/**
 * Convierte la receta en una definición de bloque del documento.
 *
 * Los ids de las entidades se derivan de la llave del bloque: dentro de un
 * documento tienen que ser únicos, y derivarlos de un contador global haría que
 * materializar la misma puerta dos veces produjera dos definiciones distintas
 * byte a byte.
 */
export function materializeCadDynamicBlock(
  family: CadDynamicBlockFamily,
  values: CadDynamicValues,
): CadBlockDefinition {
  const id = cadDynamicBlockKey(family, values);
  const entities = cadDynamicShapes(family, values).map((shape, index) =>
    shape.type === "entity"
      ? ({ ...shape.entity, id: `${id}:e${index}` } as CadEntity)
      : ({ ...shape, id: `${id}:e${index}`, layer: family.layer } as CadEntity),
  );
  return {
    id,
    name: cadDynamicBlockName(family, values),
    basePoint: p3(0, 0),
    entities,
    attributes: family.attributes(values),
    description: family.description,
    keywords: [...family.keywords],
    version: 1,
  };
}

/** Nombre legible del bloque materializado: `Puerta abatible 0.90 m · 90°`. */
export function cadDynamicBlockName(
  family: CadDynamicBlockFamily,
  values: CadDynamicValues,
): string {
  const parts = family.parameters
    .filter((parameter) => parameter.kind !== "flip")
    .map((parameter) => `${parameter.label} ${values[parameter.name]}`);
  const mirrored = family.parameters.some(
    (parameter) => parameter.kind === "flip" && values[parameter.name] === 1,
  );
  return [family.name, ...parts, ...(mirrored ? ["espejo"] : [])].join(" · ");
}

// ---------------------------------------------------------------------------
// El INSERT paramétrico
// ---------------------------------------------------------------------------

/** Lee los parámetros que un INSERT lleva encima. `null` si no es dinámico. */
export function cadDynamicInsertFamilyId(entity: CadEntity): string | null {
  const raw = entity.context?.metadata?.[CAD_DYNAMIC_FAMILY_METADATA];
  return typeof raw === "string" && raw ? raw : null;
}

export function cadDynamicInsertValues(entity: CadEntity): Record<string, number> {
  const metadata = entity.context?.metadata ?? {};
  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!key.startsWith(CAD_DYNAMIC_PARAMETER_PREFIX)) continue;
    const name = key.slice(CAD_DYNAMIC_PARAMETER_PREFIX.length);
    if (!name || name === "familia") continue;
    const numeric = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numeric)) values[name] = numeric;
  }
  return values;
}

function metadataPatch(
  family: CadDynamicBlockFamily,
  values: CadDynamicValues,
): Record<string, string | number> {
  const patch: Record<string, string | number> = {
    [CAD_DYNAMIC_FAMILY_METADATA]: family.id,
  };
  for (const [name, value] of Object.entries(values))
    patch[`${CAD_DYNAMIC_PARAMETER_PREFIX}${name}`] = value;
  if (family.annotativeHeightMm)
    patch[CAD_ANNOTATIVE_HEIGHT_METADATA] = family.annotativeHeightMm;
  return patch;
}

export interface CadDynamicInsertInput {
  entityId: string;
  insertion: CadPoint3;
  layer: string;
  rotation?: number;
  /** Escala uniforme. En una familia anotativa la fija la escala de la hoja. */
  scale?: number;
}

/**
 * ¿Hace falta escribir la definición, o ya está?
 *
 * La llave codifica TODOS los parámetros, así que dos definiciones con la misma
 * llave tienen la misma geometría por construcción. Volver a definirla no
 * aportaría nada y sí haría daño: `redefine` sube la versión del bloque, y esa
 * versión es lo que hace que cada INSERT vivo del documento se regenere. Estirar
 * una puerta invalidaría las otras nueve iguales.
 */
function defineIfAbsent(
  document: Pick<CadDocument, "blocks">,
  definition: CadBlockDefinition,
): CadEntityCommand[] {
  return document.blocks.some((block) => block.id === definition.id)
    ? []
    : [{ type: "block", op: "define", definition }];
}

/**
 * Coloca una instancia de una familia dinámica.
 *
 * Sale UN lote —definir el anónimo si no está, crear el INSERT y sellarle los
 * parámetros— para que sea UN paso de deshacer. Separarlas dejaría, al deshacer
 * a medias, un INSERT que apunta a un bloque que ya no está.
 */
export function cadDynamicInsertCommands(
  document: Pick<CadDocument, "blocks">,
  family: CadDynamicBlockFamily,
  requested: Readonly<Record<string, number>>,
  input: CadDynamicInsertInput,
): { commands: CadEntityCommand[]; values: CadDynamicValues; blockId: string; adjustments: string[] } {
  const { values, adjustments } = cadDynamicResolveValues(family, requested);
  const definition = materializeCadDynamicBlock(family, values);
  const scale = input.scale ?? 1;
  const entity: CadNativeEntity = {
    id: input.entityId,
    type: "insert",
    block: definition.id,
    insertion: { ...input.insertion },
    scale: { x: scale, y: scale, z: 1 },
    rotation: input.rotation ?? 0,
    layer: input.layer,
    attributes: Object.fromEntries(
      Object.entries(definition.attributes ?? {}).map(([tag, value]) => [
        tag,
        value.defaultValue ?? "",
      ]),
    ),
  } as CadNativeEntity;
  return {
    commands: [
      ...defineIfAbsent(document, definition),
      { type: "insert", entity },
      { type: "metadata", entityId: input.entityId, patch: metadataPatch(family, values) },
    ],
    values,
    blockId: definition.id,
    adjustments,
  };
}

/**
 * Cambia parámetros de una instancia YA colocada: el gesto que hace dinámico a
 * un bloque dinámico.
 *
 * No toca la posición ni la rotación del INSERT — sólo a qué definición apunta y
 * qué parámetros declara. Por eso estirar una puerta no la mueve, que es la
 * propiedad que distingue esto de borrar y volver a insertar.
 */
export function cadDynamicRestretchCommands(
  document: Pick<CadDocument, "blocks">,
  family: CadDynamicBlockFamily,
  entity: CadEntity,
  patch: Readonly<Record<string, number>>,
): { commands: CadEntityCommand[]; values: CadDynamicValues; blockId: string; adjustments: string[] } {
  const current = cadDynamicInsertValues(entity);
  const { values, adjustments } = cadDynamicResolveValues(family, { ...current, ...patch });
  const definition = materializeCadDynamicBlock(family, values);
  return {
    commands: [
      ...defineIfAbsent(document, definition),
      { type: "properties", entityId: entity.id, patch: { block: definition.id } },
      { type: "metadata", entityId: entity.id, patch: metadataPatch(family, values) },
    ],
    values,
    blockId: definition.id,
    adjustments,
  };
}

// ---------------------------------------------------------------------------
// Comportamiento anotativo de los bloques
// ---------------------------------------------------------------------------

/**
 * Escala de inserción para que un símbolo de altura 1 mida `paperHeightMm` sobre
 * el papel dentro de una ventana a 1:`scale`.
 *
 * Es literalmente `cadAnnotativeModelHeight`: se delega en vez de repetir la
 * cuenta porque la propiedad que hay que sostener es que un rótulo de 2,5 mm y
 * un símbolo de 2,5 mm salgan del MISMO número.
 */
export function cadAnnotativeBlockScale(
  paperHeightMm: number,
  scale: number,
  unit = "mm",
): number {
  return cadAnnotativeModelHeight(paperHeightMm, scale, unit);
}

/** Marca un INSERT como anotativo con su altura sobre el papel. */
export function markCadAnnotativeBlockCommand(
  entityId: string,
  paperHeightMm: number,
): CadEntityCommand {
  return {
    type: "metadata",
    entityId,
    patch: { [CAD_ANNOTATIVE_HEIGHT_METADATA]: paperHeightMm },
  };
}

export interface CadAnnotativeBlockRescaleResult {
  commands: CadEntityCommand[];
  rescaledEntityIds: string[];
  /** Anotativas que no son INSERT: las resuelve `annotative-scale.ts`. */
  skippedEntityIds: string[];
}

function defaultVisibility(viewport: CadPaperViewport, entity: CadEntity): boolean {
  return viewport.layerVisibility?.[entity.layer] !== false;
}

/**
 * Recalcula la escala de los INSERT anotativos de una presentación.
 *
 * Es el gemelo de `cadAnnotativeRescaleCommands` para lo que aquélla declara que
 * no puede tocar. Misma regla de reparto —manda la ventana en la que la entidad
 * se ve, y con varias, la primera en el orden de la hoja— porque un símbolo que
 * cambiara de tamaño según qué función lo mirase sería peor que uno que no se
 * reescala.
 */
export function cadAnnotativeBlockRescaleCommands(
  input: { entities: readonly CadEntity[]; unit?: string },
  space: CadPaperSpace,
  isVisible: (viewport: CadPaperViewport, entity: CadEntity) => boolean = defaultVisibility,
): CadAnnotativeBlockRescaleResult {
  const unit = input.unit ?? "mm";
  const commands: CadEntityCommand[] = [];
  const rescaledEntityIds: string[] = [];
  const skippedEntityIds: string[] = [];
  const decided = new Set<string>();

  for (const viewport of space.viewports ?? []) {
    const scale = viewport.annotationScale ?? viewport.scale;
    if (!(scale > 0)) continue;
    for (const entity of input.entities) {
      if (decided.has(entity.id)) continue;
      const paperHeight = cadAnnotativeHeightMm(entity);
      if (paperHeight === null) continue;
      if (!isVisible(viewport, entity)) continue;
      decided.add(entity.id);
      if (entity.type !== "insert") {
        skippedEntityIds.push(entity.id);
        continue;
      }
      const target = cadAnnotativeBlockScale(paperHeight, scale, unit);
      // El SIGNO se conserva: un símbolo espejado sigue espejado. Reescalar no
      // es reorientar, y un espejo que se deshace solo al cambiar la escala de
      // la ventana es un defecto que nadie ata a su causa.
      const x = Math.sign(entity.scale.x || 1) * target;
      const y = Math.sign(entity.scale.y || 1) * target;
      if (Math.abs(entity.scale.x - x) < 1e-9 && Math.abs(entity.scale.y - y) < 1e-9)
        continue;
      commands.push({
        type: "properties",
        entityId: entity.id,
        patch: { scaleX: x, scaleY: y },
      });
      rescaledEntityIds.push(entity.id);
    }
  }
  return { commands, rescaledEntityIds, skippedEntityIds };
}

// ---------------------------------------------------------------------------
// El catálogo
// ---------------------------------------------------------------------------

/** Espesor de hoja de puerta tambor de madera, medida comercial mexicana. */
const HOJA_MM = 45;

/**
 * PUERTA ABATIBLE PARAMÉTRICA.
 *
 * Sustituye a las tres sembradas y a las veintiuna que habría que sembrar para
 * cubrir apertura y sentido. Se inserta en el QUICIAL, igual que las sembradas:
 * el claro corre hacia +X, el muro hacia −Y y el barrido hacia +Y, de modo que
 * colocarla es enganchar su origen al extremo del vano ya dibujado.
 *
 * Las medidas por defecto son las mínimas de las Normas Técnicas
 * Complementarias para el Proyecto Arquitectónico del Reglamento de
 * Construcciones de la Ciudad de México, que en la práctica mexicana son además
 * las que se venden.
 */
export const CAD_DYNAMIC_DOOR: CadDynamicBlockFamily = {
  id: "puerta-abatible",
  name: "Puerta abatible paramétrica",
  description:
    "Puerta abatible de claro, apertura, espesor de muro y sentido variables. Se inserta en el quicial; el arco es el barrido real de la hoja.",
  keywords: ["puerta", "abatible", "dinamico", "parametrico", "arquitectura"],
  layer: "architecture",
  parameters: [
    {
      name: "claro",
      kind: "linear",
      label: "Claro",
      default: 900,
      min: 600,
      max: 1200,
      // Los anchos de carpintería que se venden en México.
      steps: [600, 700, 800, 900, 1000, 1200],
    },
    { name: "apertura", kind: "angle", label: "Apertura", default: 90, min: 0, max: 180 },
    { name: "muro", kind: "linear", label: "Muro", default: 150, min: 100, max: 400 },
    { name: "espejo", kind: "flip", label: "Sentido invertido", default: 0 },
  ],
  build: (values) => {
    const claro = values.claro;
    const muro = values.muro;
    const radians = (values.apertura * Math.PI) / 180;
    const dirX = Math.cos(radians);
    const dirY = Math.sin(radians);
    // Perpendicular al eje de la hoja, girada −90°: con apertura 90° deja el
    // espesor hacia +X, que es exactamente como está dibujada la sembrada.
    const thickX = Math.sin(radians);
    const thickY = -Math.cos(radians);
    return [
      {
        type: "polyline",
        closed: true,
        vertices: [
          p3(0, 0),
          p3(claro * dirX, claro * dirY),
          p3(claro * dirX + HOJA_MM * thickX, claro * dirY + HOJA_MM * thickY),
          p3(HOJA_MM * thickX, HOJA_MM * thickY),
        ],
      },
      // El barrido va del vano cerrado (0°) hasta donde queda la hoja. Con
      // apertura 0 el arco es degenerado y NO se dibuja: un arco de barrido nulo
      // es una línea encima del muro que ensucia el plano.
      ...(values.apertura > 0
        ? [
            {
              type: "arc" as const,
              center: p3(0, 0),
              radius: claro,
              startAngle: 0,
              endAngle: values.apertura,
            },
          ]
        : []),
      line(0, 0, 0, -muro),
      line(claro, 0, claro, -muro),
    ];
  },
  attributes: (values) => ({
    CLAVE: { defaultValue: "P-01", prompt: "Clave en planta" },
    ANCHO: { defaultValue: (values.claro / 1000).toFixed(2), prompt: "Ancho (m)" },
    ALTO: { defaultValue: "2.10", prompt: "Alto (m)" },
    SENTIDO: {
      defaultValue: values.espejo ? "derecha" : "izquierda",
      prompt: "Sentido de giro",
    },
  }),
};

/**
 * SÍMBOLO DE NIVEL, anotativo.
 *
 * Es el triángulo que marca el nivel de piso terminado. Se dibuja con ALTURA 1 a
 * propósito —ver la cabecera— y declara 3 mm sobre el papel, que es el tamaño al
 * que se lee sin tapar la cota que suele llevar al lado.
 *
 * Su parámetro `invertido` es un interruptor de verdad: en una planta la punta
 * mira hacia abajo, y en un corte por debajo de la línea de nivel mira hacia
 * arriba. Son dos bloques en cualquier biblioteca estática; aquí es un
 * parámetro.
 */
export const CAD_DYNAMIC_LEVEL_MARK: CadDynamicBlockFamily = {
  id: "nivel",
  name: "Símbolo de nivel",
  description:
    "Triángulo de nivel de piso terminado. Anotativo: mide 3 mm en el papel a cualquier escala de ventana.",
  keywords: ["nivel", "npt", "anotativo", "simbolo", "arquitectura"],
  layer: "architecture",
  annotativeHeightMm: 3,
  parameters: [{ name: "invertido", kind: "flip", label: "Punta hacia arriba", default: 0 }],
  build: (values) => {
    // Altura 1, base 1: el triángulo cabe en el cuadrado unidad y su punta toca
    // el punto de inserción, que es el punto cuyo nivel se está marcando.
    const up = values.invertido === 1 ? 1 : -1;
    return [
      {
        type: "polyline",
        closed: true,
        vertices: [p3(0, 0), p3(-0.5, -up), p3(0.5, -up)],
      },
      line(-0.5, -up, 0.5, -up),
    ];
  },
  attributes: () => ({
    NIVEL: { defaultValue: "+0.00", prompt: "Nivel (m)" },
  }),
};

export const CAD_DYNAMIC_BLOCKS: readonly CadDynamicBlockFamily[] = [
  CAD_DYNAMIC_DOOR,
  CAD_DYNAMIC_LEVEL_MARK,
];

export function cadDynamicBlockFamily(id: string): CadDynamicBlockFamily {
  const family = CAD_DYNAMIC_BLOCKS.find((item) => item.id === id);
  if (family) return family;
  throw new CadDynamicBlockError(
    "cad_dynamic_family_unknown",
    `No existe la familia dinámica «${id}». Las disponibles son: ${CAD_DYNAMIC_BLOCKS.map(
      (item) => item.id,
    ).join(", ")}.`,
  );
}
