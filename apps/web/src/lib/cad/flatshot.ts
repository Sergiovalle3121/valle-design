/**
 * De un modelo 3D a GEOMETRÍA DE DIBUJO: el aplanado y el perfil.
 *
 * ## Para qué existe todo esto
 *
 * Un arquitecto dibuja la planta, y después vuelve a dibujar A MANO el alzado y
 * el corte de lo mismo. Esa segunda vez es lo único que justifica que un CAD de
 * dibujo tenga 3D. Este archivo es el final del camino: coge los segmentos ya
 * clasificados por `view/hidden-line-solver.ts` y los convierte en ENTIDADES del
 * documento —líneas, en capas, dentro de un bloque— para que las cotas, el
 * sombreado y el trazado que ya existen las traten como cualquier otro trazo.
 *
 * Si el resultado no se pudiera acotar ni imprimir, no serviría. Por eso no se
 * emite una imagen, ni un tipo de entidad nuevo, ni una malla: se emiten LINE.
 * Una cota enganchada a un extremo de una de esas líneas funciona el primer día
 * porque no hay nada que enseñarle al sistema de cotas.
 *
 * ## Por qué la proyección sale al plano XY del DIBUJO
 *
 * La dirección de mirada la pone el SCU —sin SCU, una proyección no sabe desde
 * dónde proyecta—, y las coordenadas de imagen que salen son las X e Y de ese
 * SCU. Aquí se escriben tal cual como X e Y del dibujo, y la cota es la del
 * punto de inserción que señaló el usuario.
 *
 * Eso significa que el alzado sale TUMBADO, y es deliberado: su destino es una
 * lámina. Un alzado que se quedara de pie en el plano vertical del SCU no se
 * podría acotar con las cotas de siempre, ni encajar en una carátula, ni
 * imprimir sin una ventana en perspectiva; sería una vista bonita del modelo y
 * no un plano. La alternativa —insertar el bloque sobre el plano del SCU— ni
 * siquiera se puede representar: un INSERT tiene un giro alrededor de Z y nada
 * más, así que un bloque apoyado en un plano inclinado no cabe en el esquema.
 *
 * ## Vistas y ocultas van a capas DISTINTAS, siempre
 *
 * No es una preferencia de estilo: es la única forma de que las ocultas se
 * puedan apagar. Un alzado con las ocultas encendidas es ilegible para
 * replantear y necesario para fabricar, y la misma lámina sirve para las dos
 * cosas si son dos capas. Además es donde se paga el coste: si el aplanado sale
 * caro, se apaga la capa y no hay que volver a calcular nada.
 *
 * ## Fallo cerrado
 *
 * Un bloque vacío, un nombre inválido, una mirada degenerada o una cara alabeada
 * devuelven su código y NO escriben. Un aplanado a medias es peor que ninguno:
 * parece un plano, se acota, y la arista que falta no se echa de menos hasta que
 * la pieza está cortada.
 */
import type { CadBlockDefinition, CadEntity, CadLayerDef, CadPoint3 } from "./cad-document";
import type { CadEntityCommand } from "./entity-commands";
import type { CadNativeEntity } from "./entity-runtime";
import { cadBlockNameIsValid, cadInsertBlockCommands } from "./blocks/block-workflow";
import type { BrepBody, Vec3 } from "../brep";
import {
  cadHiddenLineDrawing,
  type CadHiddenLineErrorCode,
  type CadHiddenLineOptions,
  type CadHiddenLineStats,
  type CadProjectedSegment,
} from "./view/hidden-line-solver";
import type { CadHiddenLineView } from "./view/hidden-lines";

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

export type CadFlatshotErrorCode =
  | CadHiddenLineErrorCode
  /** La proyección no dejó ni una línea: un bloque vacío no se escribe. */
  | "bloque-sin-geometria"
  /** Nombre de bloque que DXF no admite. */
  | "nombre-de-bloque-invalido";

export interface CadFlatshotFailure {
  ok: false;
  code: CadFlatshotErrorCode;
  message: string;
}

/** Capa de destino con su estilo. Se crea si no existe; si existe, se ajusta. */
export interface CadFlatshotLayer {
  name: string;
  color?: string;
  linetype?: string;
  lineweight?: number;
}

export interface CadFlatshotOptions extends Omit<CadHiddenLineOptions, "includeHidden"> {
  /** Desde dónde se mira. Sale del SCU activo, no de una preferencia. */
  view: CadHiddenLineView;
  /** Dónde cae el origen de la imagen. La cota del bloque es la de este punto. */
  insertion: CadPoint3;
  /** Capa y estilo de las líneas VISTAS. */
  visibleLayer: CadFlatshotLayer;
  /** Capa y estilo de las OCULTAS. `null` es la respuesta «no las quiero». */
  hiddenLayer: CadFlatshotLayer | null;
  /** Nombre del bloque. Si ya existe, se REDEFINE conservando sus inserciones. */
  blockName: string;
  /** Bloques del documento: es lo que distingue crear de reemplazar. */
  blocks?: readonly CadBlockDefinition[];
  /** Capa del propio INSERT. Por defecto, la de las vistas. */
  insertLayer?: string;
  /** Generador de identificadores, inyectado para que las specs sean deterministas. */
  newId: () => string;
}

export interface CadFlatshotResult {
  ok: true;
  commands: CadEntityCommand[];
  definition: CadBlockDefinition;
  /** `true` si se redefinió un bloque que ya existía en el documento. */
  replaced: boolean;
  visibleLines: number;
  hiddenLines: number;
  stats: CadHiddenLineStats;
}

export type CadFlatshotOutcome = CadFlatshotResult | CadFlatshotFailure;

const failure = (code: CadFlatshotErrorCode, message: string): CadFlatshotFailure => ({
  ok: false,
  code,
  message,
});

/** `block:perfil-norte`: legible en el documento y estable entre corridas. */
export function cadFlatshotBlockId(name: string): string {
  const slug = name.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
  return `block:${slug || "aplanado"}`;
}

// ---------------------------------------------------------------------------
// De segmentos a entidades
// ---------------------------------------------------------------------------

/**
 * Una línea del bloque. Vive en coordenadas del BLOQUE —el origen de la imagen
 * en (0,0)— para que mover la inserción mueva el dibujo entero sin recalcular
 * nada, que es la razón de que esto sea un bloque y no un montón de líneas
 * sueltas.
 */
function lineOf(id: string, segment: CadProjectedSegment, layer: string): CadEntity {
  return {
    id,
    type: "line",
    start: { x: segment.from.x, y: segment.from.y, z: 0 },
    end: { x: segment.to.x, y: segment.to.y, z: 0 },
    layer,
  };
}

/** Orden de capas: la tabla se escribe antes que nada que la use. */
function layerCommand(layer: CadFlatshotLayer): CadEntityCommand {
  const definition: CadLayerDef = {
    id: `layer:${layer.name}`,
    name: layer.name,
    color: layer.color ?? "#ffffff",
    visible: true,
    locked: false,
    ...(layer.linetype ? { linetype: layer.linetype } : {}),
    ...(layer.lineweight === undefined ? {} : { lineweight: layer.lineweight }),
  };
  return { type: "layer", op: "upsert", layer: definition };
}

// ---------------------------------------------------------------------------
// FLATSHOT
// ---------------------------------------------------------------------------

/**
 * Aplana los cuerpos y devuelve el LOTE que lo escribe: capas, bloque e
 * inserción, en ese orden y en una sola transacción.
 *
 * Un solo lote y un solo paso de deshacer. Si se escribieran las capas por un
 * lado y el bloque por otro, deshacer dejaría dos capas huérfanas en la tabla de
 * un dibujo que el usuario cree haber dejado como estaba.
 */
export function cadFlatshot(
  bodies: readonly BrepBody[],
  options: CadFlatshotOptions,
): CadFlatshotOutcome {
  const name = options.blockName.trim();
  if (!cadBlockNameIsValid(name))
    return failure(
      "nombre-de-bloque-invalido",
      "El nombre del bloque debe tener de 1 a 96 caracteres válidos de DXF.",
    );

  const drawing = cadHiddenLineDrawing(bodies, options.view, {
    up: options.up,
    towards: options.towards,
    featureAngleDeg: options.featureAngleDeg,
    tolerance: options.tolerance,
    includeHidden: options.hiddenLayer !== null,
  });
  if (!drawing.ok) return drawing;

  const id = cadFlatshotBlockId(name);
  const entities: CadEntity[] = [];
  for (const segment of drawing.visible)
    entities.push(lineOf(`${id}:entity:${entities.length}`, segment, options.visibleLayer.name));
  const visibleLines = entities.length;
  if (options.hiddenLayer)
    for (const segment of drawing.hidden)
      entities.push(lineOf(`${id}:entity:${entities.length}`, segment, options.hiddenLayer.name));
  const hiddenLines = entities.length - visibleLines;

  if (entities.length === 0)
    return failure(
      "bloque-sin-geometria",
      "La proyección no dejó ninguna línea: no se escribe un bloque vacío.",
    );

  const existing = options.blocks?.find((block) => block.id === id);
  const definition: CadBlockDefinition = {
    id,
    name,
    basePoint: { x: 0, y: 0, z: 0 },
    entities,
    description: `Aplanado de ${bodies.length} sólido(s): ${visibleLines} línea(s) vista(s) y ${hiddenLines} oculta(s).`,
    keywords: ["flatshot", "aplanado"],
    version: 1,
    library: { scope: "document" },
  };

  const commands: CadEntityCommand[] = [layerCommand(options.visibleLayer)];
  if (options.hiddenLayer) commands.push(layerCommand(options.hiddenLayer));
  commands.push({ type: "block", op: existing ? "redefine" : "define", definition });
  commands.push(
    ...cadInsertBlockCommands({
      id: options.newId(),
      block: definition,
      insertion: options.insertion,
      layer: options.insertLayer ?? options.visibleLayer.name,
    }),
  );

  return {
    ok: true,
    commands,
    definition,
    replaced: existing !== undefined,
    visibleLines,
    hiddenLines,
    stats: drawing.stats,
  };
}

// ---------------------------------------------------------------------------
// SOLPROF
// ---------------------------------------------------------------------------

/**
 * Capas de un perfil, con los nombres de AutoCAD.
 *
 * `PV-` y `PH-` seguidos del identificador de la ventana gráfica. Se conservan
 * esos prefijos porque un dibujante que viene de fuera los reconoce y porque un
 * archivo que salga de aquí y se abra allí tendrá las capas donde se esperan. El
 * sufijo lo pone quien llama: es el único dato que este archivo NO puede
 * inventar, porque las ventanas gráficas son de otro módulo.
 */
export const CAD_SOLPROF_VISIBLE_PREFIX = "PV-";
export const CAD_SOLPROF_HIDDEN_PREFIX = "PH-";

export interface CadSolprofOptions {
  view: CadHiddenLineView;
  up?: Vec3;
  featureAngleDeg?: number;
  insertion: CadPoint3;
  /** Identificador de la ventana gráfica. Va al nombre de las capas y del bloque. */
  viewportTag: string;
  /**
   * `true` manda las ocultas a la capa `PH-…` con trazo discontinuo. `false`
   * mete perfil visto y oculto en el MISMO bloque y la misma capa, que es lo que
   * hace SOLPROF cuando se le responde «No» a la pregunta de la capa aparte: el
   * perfil sale entero y sin distinguir, que a veces es justo lo que se quiere
   * para calcar por encima.
   */
  separateHiddenLayer: boolean;
  blocks?: readonly CadBlockDefinition[];
  newId: () => string;
}

export interface CadSolprofResult {
  ok: true;
  commands: CadEntityCommand[];
  /** Nombres de las capas que el perfil ha creado o ajustado. */
  layers: string[];
  visibleLines: number;
  hiddenLines: number;
  stats: CadHiddenLineStats;
}

export type CadSolprofOutcome = CadSolprofResult | CadFlatshotFailure;

/**
 * Perfil 2D de unos sólidos vistos desde una ventana gráfica.
 *
 * Es FLATSHOT con otra política de nombres y otra respuesta a «¿las ocultas
 * aparte?», y por eso comparte solucionador y emisor en vez de tener los suyos:
 * dos implementaciones de la misma proyección acabarían discrepando, y el día
 * que discrepen el usuario tendrá dos alzados distintos del mismo sólido sin
 * saber cuál creer.
 */
export function cadSolprof(
  bodies: readonly BrepBody[],
  options: CadSolprofOptions,
): CadSolprofOutcome {
  const tag = options.viewportTag.trim();
  if (!tag) return failure("nombre-de-bloque-invalido", "El perfil necesita saber de qué ventana gráfica es.");

  const visibleLayer: CadFlatshotLayer = {
    name: `${CAD_SOLPROF_VISIBLE_PREFIX}${tag}`,
    color: "#ffffff",
    linetype: "CONTINUOUS",
  };
  // Trazo discontinuo en la capa, no en cada línea: así el dibujante cambia el
  // trazo de las mil líneas ocultas desde el gestor de capas, y no una a una.
  const hiddenLayer: CadFlatshotLayer | null = options.separateHiddenLayer
    ? { name: `${CAD_SOLPROF_HIDDEN_PREFIX}${tag}`, color: "#9aa0a6", linetype: "HIDDEN" }
    : null;

  const flat = cadFlatshot(bodies, {
    view: options.view,
    up: options.up,
    featureAngleDeg: options.featureAngleDeg,
    insertion: options.insertion,
    visibleLayer,
    // Con «No», las ocultas se dibujan como si fueran vistas: van al mismo
    // bloque y a la misma capa, que es lo que significa «un perfil sin
    // distinguir». No se pierden.
    hiddenLayer: hiddenLayer ?? { ...visibleLayer },
    blockName: `PERFIL-${tag}`,
    blocks: options.blocks,
    newId: options.newId,
  });
  if (!flat.ok) return flat;

  return {
    ok: true,
    commands: flat.commands,
    layers: hiddenLayer ? [visibleLayer.name, hiddenLayer.name] : [visibleLayer.name],
    visibleLines: flat.visibleLines,
    hiddenLines: flat.hiddenLines,
    stats: flat.stats,
  };
}

// ---------------------------------------------------------------------------
// Utilidad para el anfitrión
// ---------------------------------------------------------------------------

/**
 * Las líneas del bloque como entidades sueltas, ya colocadas.
 *
 * Existe para lo que un bloque no puede hacer: acotar un extremo concreto. Una
 * cota se engancha a una entidad del espacio modelo, y las entidades de dentro
 * de un bloque no son designables una a una. Quien quiera acotar el aplanado lo
 * explota —EXPLODE, que ya existe— o pide esto directamente.
 */
export function cadFlatshotEntities(
  definition: CadBlockDefinition,
  insertion: CadPoint3,
  newId: () => string,
): CadNativeEntity[] {
  return definition.entities.map((entity) => {
    if (entity.type !== "line") return { ...entity, id: newId() } as CadNativeEntity;
    return {
      ...entity,
      id: newId(),
      start: {
        x: entity.start.x + insertion.x,
        y: entity.start.y + insertion.y,
        z: entity.start.z + insertion.z,
      },
      end: {
        x: entity.end.x + insertion.x,
        y: entity.end.y + insertion.y,
        z: entity.end.z + insertion.z,
      },
    } as CadNativeEntity;
  });
}
