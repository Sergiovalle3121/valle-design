/**
 * Piezas compartidas por los comandos de modelado de sólidos.
 *
 * Los quince comandos del esquema 5 (REGION, EXTRUDE, REVOLVE, SWEEP, LOFT,
 * PRESSPULL, UNION, SUBTRACT, INTERSECT, FILLETEDGE, CHAMFEREDGE, SLICE,
 * SECTION, INTERFERE, MASSPROP) repiten cuatro gestos: leer las entidades
 * designadas, sacar de ellas un perfil, montar un SOLID3D y comprobar que lo
 * montado es realmente un sólido antes de escribirlo en el documento. Está aquí
 * para que ninguno de los cuatro tenga dos versiones.
 *
 * ## La validación no es opcional
 *
 * `finishedSolid` evalúa el árbol y valida los invariantes ANTES de emitir el
 * lote. Es la diferencia entre «la operación falló» y «la operación dejó el
 * documento con un sólido roto que reventará dos órdenes más tarde». Un comando
 * que no puede producir un sólido válido termina con un MENSAJE, no con una
 * escritura: el ejecutor por lotes es atómico y un dibujo a medio romper es peor
 * que una orden que no se hizo.
 */
import type { CadEntity } from "../../cad-document";
import type { CadSolid3dEntity, CadSolidNode } from "../../cad-entities-v5";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import { evaluateSolidTree, validateSolidTree } from "../../solid3d-build";
import type { CadCommandContext, CadCommandStep } from "../command-types";

/** Entidades designadas que el contexto sabe resolver. */
export function selectedEntities(
  context: CadCommandContext,
  ids: readonly string[],
): CadEntity[] {
  if (!context.entity) return [];
  const found: CadEntity[] = [];
  for (const id of ids) {
    const entity = context.entity(id);
    if (entity) found.push(entity);
  }
  return found;
}

/** Los SOLID3D de una designación, en el orden en que se designaron. */
export function selectedSolids(
  context: CadCommandContext,
  ids: readonly string[],
): CadSolid3dEntity[] {
  return selectedEntities(context, ids).filter(
    (entity): entity is CadSolid3dEntity => entity.type === "solid3d",
  );
}

/** Monta la entidad SOLID3D a partir de sus nodos. */
export function makeSolidEntity(
  id: string,
  nodes: CadSolidNode[],
  root: string,
  layer: string,
  name?: string,
): CadSolid3dEntity {
  return {
    id,
    type: "solid3d",
    nodes,
    root,
    layer,
    ...(name ? { name } : {}),
  };
}

/**
 * Renombra los nodos de un árbol con un prefijo.
 *
 * Lo necesitan UNION, SUBTRACT e INTERSECT: al fundir dos árboles en uno, dos
 * nodos llamados igual —y `perfil` es un nombre que sale de cada EXTRUDE— se
 * pisarían, y el sólido resultante tomaría el operando equivocado sin dar ningún
 * error. Se comprueba en el spec con dos extrusiones distintas cuyo nodo raíz
 * comparte nombre.
 */
export function prefixNodes(nodes: readonly CadSolidNode[], prefix: string): CadSolidNode[] {
  const rename = (id: string) => `${prefix}${id}`;
  return nodes.map((node) => {
    const renamed = { ...node, id: rename(node.id) } as CadSolidNode;
    if ("operands" in renamed && renamed.operands)
      return { ...renamed, operands: renamed.operands.map(rename) } as CadSolidNode;
    if ("operand" in renamed && renamed.operand)
      return { ...renamed, operand: rename(renamed.operand) } as CadSolidNode;
    return renamed;
  });
}

export interface SolidCommandFinish<S> {
  state: S;
  label: string;
  /** Órdenes previas al alta del sólido: normalmente borrar los perfiles. */
  before?: CadEntityCommand[];
}

/**
 * Cierra un comando emitiendo el sólido YA VALIDADO, o un mensaje si no lo es.
 *
 * El validador de `invariants.ts` es lo mejor que tiene el kernel y éste es el
 * único sitio donde puede salvar al usuario: entre la operación y la escritura.
 */
export function finishedSolid<S>(
  solid: CadSolid3dEntity,
  options: SolidCommandFinish<S>,
): CadCommandStep<S> {
  const structural = validateSolidTree(solid);
  if (structural.length > 0)
    return solidMessage(options.state, `${options.label} no pudo montar el sólido: ${structural[0].message}`);
  try {
    evaluateSolidTree(solid);
  } catch (error) {
    return solidMessage(
      options.state,
      `${options.label} no produjo un sólido válido: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    state: options.state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands: [
        ...(options.before ?? []),
        { type: "insert", entity: solid as CadNativeEntity },
      ],
      label: options.label,
    },
  };
}

/** Termina el comando diciendo algo, sin tocar el documento. */
export function solidMessage<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

/** Termina el comando sin hacer nada (Esc, o designación vacía). */
export function solidCancelled<S>(state: S): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
}

/** Termina emitiendo un lote ya construido. */
export function solidBatch<S>(
  state: S,
  commands: readonly CadEntityCommand[],
  label: string,
): CadCommandStep<S> {
  if (commands.length === 0) return solidCancelled(state);
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands, label },
  };
}

/** Formatea una magnitud para los mensajes de consulta. */
export function formatMagnitude(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute < 1e-3 || absolute >= 1e9)) return value.toExponential(4);
  return value.toLocaleString("es-ES", { maximumFractionDigits: 4 });
}
