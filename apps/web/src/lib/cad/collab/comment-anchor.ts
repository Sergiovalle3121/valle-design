/**
 * El ANCLA de un comentario: qué se guarda en `cad_comments.anchor` para que
 * una nota viva en un PUNTO del dibujo y no en una barra lateral.
 *
 * ## Por qué el contrato vive en el cliente
 *
 * La API guarda `anchor` como JSON libre y sólo lo valida por FORMA —tamaño,
 * profundidad, claves prohibidas— en `cad-comment-anchor.ts` del API. Esa
 * decisión es buena: la tabla no se acopla al esquema del documento canónico,
 * que cambia de versión. Pero deja el SIGNIFICADO sin dueño, y un significado
 * sin dueño es cómo dos superficies —el estudio del autor y la página del
 * invitado— acaban escribiendo dos dialectos que no se leen entre sí.
 *
 * Este módulo es ese dueño. Las dos superficies escriben y leen por aquí.
 *
 * ## Fallo cerrado, y qué significa exactamente aquí
 *
 * Un ancla que no se entiende NO se coloca. Ni en el origen, ni en el centro
 * de la vista, ni «donde caiga». Un comentario que dice «esta viga está mal»
 * apuntando a una viga que no es miente peor que un comentario sin flecha: el
 * arquitecto va, mira, no ve nada raro, y lo cierra. Por eso la lectura
 * devuelve TRES estados distintos y quien pinta tiene que decidir en los tres:
 *
 *  · `anchored`   — hay punto: chincheta sobre el plano.
 *  · `unanchored` — el autor no ancló (comentario de documento): lista, sin
 *                   chincheta. Es legítimo, no es un error.
 *  · `unreadable` — hay ancla y no se entiende: lista, MARCADO, y con el
 *                   motivo a la vista. Nunca se dibuja.
 *
 * ## Por qué `space` está en el ancla
 *
 * Hoy sólo se ancla en el espacio modelo. Pero el producto ya tiene espacio
 * papel (`paper-space.ts`) y presentaciones con viewports, y una nota puesta
 * sobre la lámina impresa no está en las mismas coordenadas que la misma nota
 * sobre el modelo. Declararlo desde el primer registro cuesta una cadena;
 * deducirlo después, cuando ya hay comentarios guardados sin el campo, cuesta
 * una migración de datos que nadie puede hacer bien.
 */
import type { CadPoint2 } from "../cad-document";

/** Versión del formato. Sube si el significado de los campos cambia. */
export const CAD_COMMENT_ANCHOR_VERSION = 1;

export type CadCommentAnchorSpace = "model" | "paper";

export interface CadCommentAnchorPoint {
  kind: "point";
  version: number;
  space: CadCommentAnchorSpace;
  /** Coordenadas de DIBUJO (las mismas unidades del documento). */
  x: number;
  y: number;
  /**
   * Entidad bajo el punto cuando se colocó, si la había.
   *
   * No se usa para posicionar —posiciona `x`/`y`— sino para poder decir «este
   * comentario apuntaba a una entidad que ya no existe», que es información
   * que el autor quiere y que el punto solo no da.
   */
  entityId: string | null;
  /** Nombre de la presentación cuando `space === "paper"`. */
  layout?: string;
}

export type CadCommentAnchorProblem =
  | "anchor_not_object"
  | "anchor_kind_unknown"
  | "anchor_version_unsupported"
  | "anchor_space_unknown"
  | "anchor_point_not_finite"
  | "anchor_entity_not_string";

export type CadCommentAnchorRead =
  | { status: "anchored"; anchor: CadCommentAnchorPoint }
  | { status: "unanchored" }
  | {
      status: "unreadable";
      problem: CadCommentAnchorProblem;
      message: string;
    };

const PROBLEM_MESSAGES: Record<CadCommentAnchorProblem, string> = {
  anchor_not_object: "El ancla no es un objeto JSON.",
  anchor_kind_unknown: "El ancla no declara un tipo que este visor sepa pintar.",
  anchor_version_unsupported:
    "El ancla viene de una versión del formato que este visor no entiende.",
  anchor_space_unknown:
    "El ancla no dice si es del espacio modelo o de una presentación.",
  anchor_point_not_finite:
    "Las coordenadas del ancla no son dos números finitos.",
  anchor_entity_not_string: "La entidad del ancla no es un identificador.",
};

/** Construye el ancla que se envía a la API. */
export function cadCommentAnchor(
  point: CadPoint2,
  options: {
    entityId?: string | null;
    space?: CadCommentAnchorSpace;
    layout?: string | null;
  } = {},
): CadCommentAnchorPoint {
  const space = options.space ?? "model";
  return {
    kind: "point",
    version: CAD_COMMENT_ANCHOR_VERSION,
    space,
    x: point.x,
    y: point.y,
    entityId: options.entityId ?? null,
    ...(space === "paper" && options.layout ? { layout: options.layout } : {}),
  };
}

/**
 * Lee el `anchor` que devolvió la API.
 *
 * `null`/`undefined` es `unanchored` —la API lo normaliza a NULL cuando el
 * autor no manda nada— y CUALQUIER otra cosa que no case exactamente es
 * `unreadable`. No hay tolerancia deliberada: aceptar `{x, y}` a secas
 * «porque se entiende» es abrir el dialecto que este módulo existe para
 * cerrar, y el día que llegue un ancla de espacio papel se pintaría sobre el
 * modelo sin que nadie lo notara.
 */
export function readCadCommentAnchor(value: unknown): CadCommentAnchorRead {
  if (value === null || value === undefined) return { status: "unanchored" };
  if (typeof value !== "object" || Array.isArray(value))
    return unreadable("anchor_not_object");

  const record = value as Record<string, unknown>;
  if (record.kind !== "point") return unreadable("anchor_kind_unknown");
  if (record.version !== CAD_COMMENT_ANCHOR_VERSION)
    return unreadable("anchor_version_unsupported");
  if (record.space !== "model" && record.space !== "paper")
    return unreadable("anchor_space_unknown");
  if (
    typeof record.x !== "number" ||
    typeof record.y !== "number" ||
    !Number.isFinite(record.x) ||
    !Number.isFinite(record.y)
  )
    return unreadable("anchor_point_not_finite");
  const entityId = record.entityId;
  if (entityId !== null && entityId !== undefined && typeof entityId !== "string")
    return unreadable("anchor_entity_not_string");

  return {
    status: "anchored",
    anchor: {
      kind: "point",
      version: CAD_COMMENT_ANCHOR_VERSION,
      space: record.space,
      x: record.x,
      y: record.y,
      entityId: typeof entityId === "string" ? entityId : null,
      ...(typeof record.layout === "string" ? { layout: record.layout } : {}),
    },
  };
}

/** Texto de por qué un ancla no se pudo leer, para enseñárselo a la persona. */
export function cadCommentAnchorMessage(
  problem: CadCommentAnchorProblem,
): string {
  return PROBLEM_MESSAGES[problem];
}

function unreadable(problem: CadCommentAnchorProblem): CadCommentAnchorRead {
  return { status: "unreadable", problem, message: PROBLEM_MESSAGES[problem] };
}
