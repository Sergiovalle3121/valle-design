/**
 * EDITAR UNA REFERENCIA EN SITIO: REFEDIT, REFSET y REFCLOSE.
 *
 * ## El defecto, medido
 *
 * `docs/competitive/rubric.json`, fila `blocks`: *«BEDIT no existe… Sin editor
 * de bloques en sitio, redefinir un bloque exige explotar y volver a definir.»*
 * Y explotar y volver a definir **pierde los atributos**: el `INSERT` con su
 * `TAG` desaparece y hay que volver a rellenarlo pieza a pieza. Es el gesto más
 * caro de un dibujo con biblioteca propia, y es diario: corregir el detalle de
 * una puerta, ajustar el símbolo de un cajetín.
 *
 * ## Qué hace, y por qué en el propio dibujo
 *
 * `REFEDIT` saca la geometría de la definición AL DIBUJO, encima de la
 * referencia designada, marcada con `context.metadata`. Se edita con las
 * órdenes de siempre —MOVE, TRIM, OFFSET, lo que sea—, porque el editor de un
 * bloque tiene que ser el editor, no un editor más pequeño con la mitad de las
 * herramientas. `REFCLOSE Guardar` devuelve lo marcado a la definición y borra
 * la copia de trabajo; `REFCLOSE Descartar` sólo borra.
 *
 * `REFSET` añade a la sesión lo que se dibujó nuevo, o retira lo que sobra. Sin
 * él, una línea trazada durante la edición no entraría en el bloque y nadie
 * sabría por qué.
 *
 * ## Sin campos nuevos, y sin guardar el original en ningún sitio raro
 *
 * Todo va en `context.metadata` de la copia de trabajo: de qué bloque es, de
 * qué referencia salió, y el punto base con el que volver. La definición
 * original no se toca hasta `REFCLOSE Guardar`, así que descartar es borrar y
 * ya: no hay nada que restaurar.
 *
 * ## El límite de esta versión, dicho por su nombre
 *
 * Sólo se edita en sitio una referencia SIN GIRO y a escala 1. Con giro o
 * escala habría que traer la geometría al mundo y devolverla girada y escalada,
 * y girar un texto o escalar un arco no es trasladar: se hace bien o se hace
 * «casi», y «casi» aquí significa un bloque de biblioteca torcido para siempre.
 * Se niega POR SU NOMBRE, con el motivo y con la salida (editarla desde una
 * referencia sin girar).
 */
import type { CadBlockDefinition, CadDocument, CadEntity } from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";
import { cadTranslateEntity } from "../entity-translate";

/** Bloque al que pertenece esta copia de trabajo. */
export const CAD_REFEDIT_BLOCK = "refedit:bloque";
/** Referencia (INSERT) desde la que se abrió la sesión. */
export const CAD_REFEDIT_REF = "refedit:ref";
/** Punto base con el que volver a coordenadas del bloque: `"x,y"`. */
export const CAD_REFEDIT_BASE = "refedit:base";
/** Id que tenía la entidad DENTRO de la definición, si venía de ella. */
export const CAD_REFEDIT_SOURCE = "refedit:origen";

const meta = (entity: CadEntity, key: string): string | undefined => {
  const value = entity.context?.metadata?.[key];
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
};

export interface CadRefeditSession {
  blockId: string;
  referenceId: string;
  base: { x: number; y: number };
  /** Entidades de la copia de trabajo, en el orden en que están en el dibujo. */
  entityIds: string[];
}

/** Un texto `"x,y"` a punto; `null` si no tiene esa forma. */
function parseBase(raw: string | undefined): { x: number; y: number } | null {
  if (!raw) return null;
  const partes = raw.split(",").map((parte) => Number(parte.trim()));
  return partes.length === 2 && partes.every((valor) => Number.isFinite(valor))
    ? { x: partes[0], y: partes[1] }
    : null;
}

/**
 * La sesión abierta, si la hay.
 *
 * Devuelve `null` cuando no hay ninguna y LANZA cuando hay dos: dos sesiones a
 * la vez significan que alguien abrió una segunda sin cerrar la primera, y
 * guardar entonces mezclaría la geometría de dos bloques. Es un caso que hay
 * que decir, no resolver adivinando.
 */
export function cadRefeditSession(
  document: Pick<CadDocument, "entities">,
): { session: CadRefeditSession | null; conflict: string[] } {
  const porBloque = new Map<string, CadRefeditSession>();
  for (const entity of document.entities) {
    const blockId = meta(entity, CAD_REFEDIT_BLOCK);
    if (!blockId) continue;
    const base = parseBase(meta(entity, CAD_REFEDIT_BASE));
    const referenceId = meta(entity, CAD_REFEDIT_REF) ?? "";
    const abierta = porBloque.get(blockId);
    if (abierta) abierta.entityIds.push(entity.id);
    else
      porBloque.set(blockId, {
        blockId,
        referenceId,
        base: base ?? { x: 0, y: 0 },
        entityIds: [entity.id],
      });
  }
  const abiertas = [...porBloque.values()];
  if (abiertas.length > 1)
    return { session: null, conflict: abiertas.map((sesion) => sesion.blockId).sort() };
  return { session: abiertas[0] ?? null, conflict: [] };
}

export interface CadRefeditOpenInput {
  definition: CadBlockDefinition;
  referenceId: string;
  /** Punto de inserción de la referencia designada. */
  base: { x: number; y: number };
  newEntityId: () => string;
}

/**
 * Saca la geometría de la definición al dibujo, encima de la referencia.
 *
 * Las entidades conservan su capa: un bloque se edita como se ve. Y llevan de
 * dónde salieron (`refedit:origen`), para que al guardar conserven su id dentro
 * de la definición — cambiarlos haría que cada edición reescribiera el bloque
 * entero byte a byte, y dos ediciones idénticas darían documentos distintos.
 */
export function cadRefeditOpenCommands(input: CadRefeditOpenInput): CadEntityCommand[] {
  const { definition, referenceId, base, newEntityId } = input;
  return definition.entities.map((entity) => {
    const movida = cadTranslateEntity(entity, base.x, base.y);
    return {
      type: "insert",
      entity: {
        ...movida,
        id: newEntityId(),
        context: {
          ...((movida as { context?: Record<string, unknown> }).context ?? {}),
          metadata: {
            ...(movida.context?.metadata ?? {}),
            [CAD_REFEDIT_BLOCK]: definition.id,
            [CAD_REFEDIT_REF]: referenceId,
            [CAD_REFEDIT_BASE]: `${base.x},${base.y}`,
            [CAD_REFEDIT_SOURCE]: entity.id,
          },
        },
      } as never,
    };
  });
}

/** Marca una entidad ya existente como parte de la sesión abierta. */
export function cadRefeditAddCommand(
  session: CadRefeditSession,
  entityId: string,
): CadEntityCommand {
  return {
    type: "metadata",
    entityId,
    patch: {
      [CAD_REFEDIT_BLOCK]: session.blockId,
      [CAD_REFEDIT_REF]: session.referenceId,
      [CAD_REFEDIT_BASE]: `${session.base.x},${session.base.y}`,
    },
  };
}

/**
 * Quita una entidad de la sesión SIN borrarla del dibujo.
 *
 * Se vacían las claves en vez de suprimirlas porque el parche de metadatos
 * fusiona: escribir `""` es lo que el lector entiende como «no está», y así no
 * hace falta una operación de borrado de claves que hoy no existe.
 */
export function cadRefeditRemoveCommand(entityId: string): CadEntityCommand {
  return {
    type: "metadata",
    entityId,
    patch: { [CAD_REFEDIT_BLOCK]: "", [CAD_REFEDIT_REF]: "", [CAD_REFEDIT_BASE]: "" },
  };
}

/** Las entidades de la copia de trabajo, en el documento. */
export function cadRefeditEntities(
  document: Pick<CadDocument, "entities">,
  session: CadRefeditSession,
): CadEntity[] {
  const ids = new Set(session.entityIds);
  return document.entities.filter((entity) => ids.has(entity.id));
}

/**
 * Devuelve la copia de trabajo a la definición y la borra del dibujo.
 *
 * Un solo lote: redefinir y limpiar son un paso de deshacer. Con dos, deshacer
 * a medias dejaría el bloque nuevo Y la copia de trabajo encima, que es un
 * dibujo con la geometría duplicada y nadie sabría por qué.
 */
export function cadRefeditSaveCommands(
  document: Pick<CadDocument, "entities" | "blocks">,
  session: CadRefeditSession,
): { commands: CadEntityCommand[]; entities: number } | { error: string } {
  const definition = (document.blocks ?? []).find((block) => block.id === session.blockId);
  if (!definition)
    return { error: `El bloque «${session.blockId}» ya no está en el dibujo: no hay dónde guardar.` };

  const trabajo = cadRefeditEntities(document, session);
  if (trabajo.length === 0)
    return {
      error:
        "La copia de trabajo quedó vacía. Guardar así dejaría el bloque sin geometría y todas sus referencias en blanco: si es lo que quiere, bórrelo con PURGE.",
    };

  const entities = trabajo.map((entity) => {
    const devuelta = cadTranslateEntity(entity, -session.base.x, -session.base.y);
    const metadata = { ...(devuelta.context?.metadata ?? {}) };
    // Las marcas de la sesión NO entran en la definición: dentro del bloque no
    // significan nada y saldrían en cada inserción futura.
    delete metadata[CAD_REFEDIT_BLOCK];
    delete metadata[CAD_REFEDIT_REF];
    delete metadata[CAD_REFEDIT_BASE];
    const origen = metadata[CAD_REFEDIT_SOURCE];
    delete metadata[CAD_REFEDIT_SOURCE];
    const context = Object.keys(metadata).length > 0 ? { ...devuelta.context, metadata } : undefined;
    return {
      ...devuelta,
      id: typeof origen === "string" && origen ? origen : devuelta.id,
      ...(context ? { context } : { context: undefined }),
    } as CadEntity;
  });

  return {
    commands: [
      { type: "block", op: "redefine", definition: { ...definition, entities } },
      ...session.entityIds.map((entityId) => ({ type: "delete", entityId }) as CadEntityCommand),
    ],
    entities: entities.length,
  };
}

/** Descarta la sesión: borra la copia de trabajo y no toca la definición. */
export function cadRefeditDiscardCommands(session: CadRefeditSession): CadEntityCommand[] {
  return session.entityIds.map((entityId) => ({ type: "delete", entityId }) as CadEntityCommand);
}
