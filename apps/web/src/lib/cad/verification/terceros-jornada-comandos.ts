import { strict as assert } from "node:assert";
import { executeCadEntityCommandBatch } from "../entity-commands";
import { CAD_COMMAND_REGISTRY_V2 } from "../engine/index";
import { createCadVariableAccess } from "../system-variables";
import type { CadDocument } from "../cad-document";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandResult,
} from "../engine/command-types";
import { contador } from "./terceros-jornada-medicion";

/**
 * EL CONDUCTOR DE COMANDOS DE LA JORNADA.
 *
 * El acto 3 —modificar el plano ajeno— no vale nada si lo hace una función de
 * conveniencia que escribe entidades a mano: tiene que pasar por el registro
 * de comandos DEL PRODUCTO, el mismo que responde cuando alguien teclea MOVE.
 * Esto es lo que lo conduce: monta el contexto, empuja las entradas por
 * `begin`/`step` y exige que el resultado sea un cambio en el documento y no
 * un mensaje.
 *
 * `aplica` es la pieza con más filo: un comando que devuelve `message` en vez
 * de `document` ha respondido sin hacer nada, y ésa es exactamente la regla 2
 * de la campaña de cimientos («ningún comando responde éxito sin efecto
 * verificado»). Aquí falla con el texto que dio, para que se vea qué contestó.
 *
 * Vive aparte por el presupuesto de monolito (800 líneas por archivo no
 * presupuestado).
 */

let siguienteId = 0;
export const contexto = (
  documento: CadDocument,
  seleccion: readonly string[] = [],
  capaActiva = "0",
): CadCommandContext => ({
  entityIds: documento.entities.map((entidad) => entidad.id),
  entity: (entityId) => documento.entities.find((entidad) => entidad.id === entityId),
  selection: seleccion,
  activeLayer: capaActiva,
  view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
  newEntityId: () => `jornada${(siguienteId += 1)}`,
  variables: createCadVariableAccess({}),
});

export function conduce(
  nombre: string,
  entradas: readonly CadCommandInput[],
  ctx: CadCommandContext,
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(nombre);
  assert.ok(descriptor, `${nombre} debe estar en el registro del PRODUCTO`);
  let paso = descriptor.begin(ctx);
  for (const entrada of entradas) {
    if (paso.result) break;
    paso = descriptor.step(paso.state, entrada, ctx);
  }
  return paso.result;
}

export function aplica(documento: CadDocument, resultado: CadCommandResult | undefined, orden: string): CadDocument {
  assert.ok(
    resultado?.kind === "document",
    `${orden}: debía escribir en el documento; dio ${resultado?.kind}` +
      `${resultado?.kind === "message" ? ` «${resultado.text}»` : ""}`,
  );
  contador.comprobaciones += 1;
  return executeCadEntityCommandBatch(documento, resultado.commands, orden).document;
}

export const punto = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
export const designa = (ids: readonly string[]): CadCommandInput => ({ kind: "selection", entityIds: [...ids] });
export const intro: CadCommandInput = { kind: "enter" };
