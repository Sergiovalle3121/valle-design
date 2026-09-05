/**
 * El REGISTRO DE CAPA como lista de códigos DXF: una sola forma, tres puertas.
 *
 * `tblsearch`, `tblnext` y `entget` sobre el nombre que devuelve `tblobjname`
 * enseñan la MISMA capa. Escrito en tres sitios, el día que alguien añadiera el
 * color a uno de ellos habría rutinas que ven el color por una puerta y no por
 * la otra, y el autor buscaría el defecto en su código.
 *
 * ## El nombre de entidad de una capa
 *
 * En AutoCAD, una capa es un objeto de la base de datos con su propio nombre de
 * entidad: `tblobjname` lo devuelve y `entget` lo lee. Aquí las capas no son
 * entidades del documento —viven en `document.layers`—, así que el nombre se
 * fabrica con un PREFIJO propio (`tabla:LAYER:`) y quien lo recibe lo reconoce.
 * No es un identificador persistido: no se guarda en el documento, no viaja al
 * DXF y no sobrevive a la sesión. Es una referencia opaca, exactamente igual
 * que el ename de una entidad, con la diferencia de que ésta apunta a la tabla
 * de símbolos y no al espacio modelo.
 *
 * Que el prefijo NO pueda chocar con el id de una entidad es lo que sostiene el
 * truco: los ids nacen de `newEntityId` (un UUID, o `lisp:N` en las specs) y
 * ninguno empieza por `tabla:`.
 *
 * ## El código 70, y por qué aquí dice `frozen` y no `visible`
 *
 * El bit 1 del código 70 es CONGELADA, no apagada — lo dice el DXF y lo repite
 * `CadLayerDef.frozen` en el documento canónico. Una capa APAGADA se codifica
 * en AutoCAD con el color en NEGATIVO (código 62), que es lo que leen las
 * rutinas de comprobación de norma con `(minusp (cdr (assoc 62 …)))`.
 *
 * La versión anterior de `tblsearch` ponía `!visible` en el bit 1: una capa
 * apagada se leía como congelada y una congelada como visible. Se corrige aquí,
 * en el sitio único, porque las dos cosas tienen consecuencias distintas para
 * quien recorre las capas antes de trazar.
 */
import type { CadLayerDef } from "../../cad/cad-document";
import { hexToAci } from "../../cad/plot/aci-palette";
import { ename, list, type LispEname, type LispValue } from "../values";
import { dxfEname, dxfInt, dxfString } from "./codes";

/** Marca del nombre de entidad de un registro de la tabla LAYER. */
export const LAYER_RECORD_PREFIX = "tabla:LAYER:";

export function layerRecordEname(layerId: string): LispEname {
  return ename(`${LAYER_RECORD_PREFIX}${layerId}`);
}

/** El id de capa que hay dentro de un ename de tabla, o `null` si no lo es. */
export function layerIdFromEname(id: string): string | null {
  return id.startsWith(LAYER_RECORD_PREFIX) ? id.slice(LAYER_RECORD_PREFIX.length) : null;
}

/** Bits del código 70 que este producto sabe responder con certeza. */
export function layerFlags(layer: CadLayerDef): number {
  return (layer.frozen ? 1 : 0) | (layer.locked ? 4 : 0);
}

/**
 * La capa como lista de códigos. Con `withEname`, encabezada por
 * `(-1 . <nombre>)` — que es lo que distingue un `entget` de un `tblsearch`:
 * el primero devuelve un objeto al que se puede volver, el segundo una copia
 * de los datos.
 */
export function layerRecordDxf(layer: CadLayerDef, withEname = false): LispValue {
  const aci = hexToAci(layer.color);
  const entries: LispValue[] = [
    ...(withEname ? [dxfEname(`${LAYER_RECORD_PREFIX}${layer.id}`)] : []),
    dxfString(0, "LAYER"),
    dxfString(2, layer.name),
    dxfInt(70, layerFlags(layer)),
    // Apagada = color NEGATIVO. Es la codificación de AutoCAD y la única que
    // distingue «apagada» de «congelada» sin inventarse un código nuevo.
    dxfInt(62, layer.visible ? aci : -aci),
    dxfString(6, layer.linetype ?? "Continuous"),
  ];
  return list(entries);
}

/** Busca una capa por nombre o por id, como hace `tblsearch`. */
export function findLayerRecord(
  layers: readonly CadLayerDef[],
  wanted: string,
): CadLayerDef | undefined {
  const key = wanted.trim().toUpperCase();
  return layers.find(
    (layer) => layer.name.toUpperCase() === key || layer.id.toUpperCase() === key,
  );
}
