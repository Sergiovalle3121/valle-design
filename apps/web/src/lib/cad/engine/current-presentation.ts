/**
 * CECOLOR, CELTYPE y CELWEIGHT llegan a los objetos NUEVOS (Ola D, 2026-09-02).
 *
 * Medido antes: COLOR, LINETYPE y LWEIGHT escribían las tres variables y
 * ninguna orden de dibujo las leía — un `grep CECOLOR` sobre el motor sólo
 * encontraba a quien las fijaba—. Teclear COLOR 1 y dibujar una línea daba una
 * línea PorCapa, y ADDSELECTED (que en AutoCAD dibuja «uno como éste») no
 * tenía forma de prometer el color del original.
 *
 * ## La regla
 *
 * Al terminar una orden de DIBUJO o de ANOTACIÓN, las entidades que inserta y
 * que no traen presentación propia reciben la actual. Sólo ésas:
 *
 *   - Las de MODIFICACIÓN (COPY, EXPLODE, PASTECLIP) no: lo copiado conserva lo
 *     suyo, y lo PorCapa sigue PorCapa, que es lo que hace AutoCAD también.
 *   - Una entidad que ya trae presentación —el degradado de GRADIENT trae su
 *     color— no se pisa.
 *   - Con las tres variables en su valor de fábrica no cambia NADA: el lote
 *     vuelve tal cual, byte a byte, y las specs que lo fijan siguen verdes.
 *
 * Es una función pura sobre el lote, y se aplica en UN sitio (`finish` del
 * motor): añadirla a cada orden de dibujo habría dejado, tarde o temprano, una
 * que no la aplica.
 */
import type { CadEntityPresentation } from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";
import type { CadVariableAccess } from "../system-variables";

/** La presentación que piden las variables, o `null` si todo es PorCapa. */
export function cadCurrentPresentation(variables: CadVariableAccess | undefined): CadEntityPresentation | null {
  if (!variables) return null;
  const presentation: CadEntityPresentation = {};
  const color = String(variables.get("CECOLOR") ?? "BYLAYER").trim();
  if (color.toUpperCase() === "BYBLOCK") presentation.color = { source: "byBlock" };
  else if (color && color.toUpperCase() !== "BYLAYER") presentation.color = { source: "explicit", value: color };

  const linetype = String(variables.get("CELTYPE") ?? "ByLayer").trim();
  if (linetype.toUpperCase() === "BYBLOCK") presentation.linetype = { source: "byBlock" };
  else if (linetype && linetype.toUpperCase() !== "BYLAYER") {
    const scale = Number(variables.get("CELTSCALE") ?? 1);
    presentation.linetype = {
      source: "explicit",
      value: linetype,
      ...(Number.isFinite(scale) && scale > 0 && scale !== 1 ? { scale } : {}),
    };
  }

  const weight = Number(variables.get("CELWEIGHT") ?? -1);
  if (weight === -2) presentation.lineweight = { source: "byBlock" };
  else if (Number.isFinite(weight) && weight >= 0) presentation.lineweight = { source: "explicit", value: weight };

  return Object.keys(presentation).length > 0 ? presentation : null;
}

/**
 * El mismo lote con la presentación actual en las inserciones que no traían
 * ninguna. Devuelve el MISMO array cuando no hay nada que hacer, para que
 * quien compare por identidad no vea un cambio que no existe.
 */
export function cadWithCurrentPresentation(
  commands: readonly CadEntityCommand[],
  presentation: CadEntityPresentation | null,
): readonly CadEntityCommand[] {
  if (!presentation) return commands;
  let touched = false;
  const decorated = commands.map((command) => {
    if (command.type !== "insert" || command.entity.context?.presentation) return command;
    touched = true;
    return {
      ...command,
      entity: {
        ...command.entity,
        context: { ...(command.entity.context ?? {}), presentation: structuredClone(presentation) },
      },
    };
  });
  return touched ? decorated : commands;
}
