import type { CadNativeEntityType } from "./entity-runtime";

/**
 * NOMBRES HUMANOS PARA LAS ENTIDADES DEL PLANO.
 *
 * ── EL DEFECTO ──────────────────────────────────────────────────────────────
 * El panel de propiedades enseñaba esto como identidad del objeto seleccionado:
 *
 *     ID   cad_mt60y4ol_uzfo
 *
 * Un identificador de máquina —prefijo, milisegundos en base 36 y cuatro
 * caracteres al azar— puesto donde el usuario busca «qué he seleccionado». No
 * se puede leer, no se puede decir por teléfono, no se puede comparar de un
 * vistazo con el de al lado, y encima el que veía todo el mundo era literalmente
 * el de la primera entidad del plano de ejemplo. La lista de entidades nativas
 * tenía el mismo problema multiplicado por veinte filas.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────
 * Tipo en español + ordinal: «Muro 3», «Cota 12», «Texto 5». Es como se habla
 * de un plano en una obra, y es lo que permite señalar un objeto sin leer un
 * hexadecimal en voz alta.
 *
 * ── QUÉ SIGNIFICA «ORDINAL ESTABLE» ─────────────────────────────────────────
 * El ordinal es la posición 1-basada de la entidad ENTRE LAS DE SU TIPO, en el
 * orden del documento. Es determinista: el mismo documento produce siempre los
 * mismos nombres, para todos los usuarios y en cualquier máquina.
 *
 * Lo que NO es: inmutable frente a borrados. Si se borra «Muro 2», el que era
 * «Muro 3» pasa a ser «Muro 2». Se eligió así a conciencia:
 *
 *   · La alternativa —un contador persistido por documento— convierte el nombre
 *     en estado que hay que migrar, versionar y resolver en conflictos de
 *     guardado. Un plano con «Muro 47» siendo el tercero de la lista es peor
 *     que renumerar.
 *   · Y el nombre NO es la identidad. La identidad sigue siendo el id, que no
 *     cambia nunca y que el panel enseña en el detalle para soporte. El nombre
 *     es una etiqueta de lectura, y una etiqueta que se reordena al borrar es
 *     exactamente lo que hace un gestor de capas de cualquier CAD.
 *
 * ── POR QUÉ ES UN MÓDULO PURO ───────────────────────────────────────────────
 * Porque lo consumen el panel de propiedades, la lista de entidades y el
 * desplegable de destino de recorte, y tres implementaciones del mismo nombre
 * empezarían a discrepar en la primera prisa. Sin React, sin estado, probable
 * con una tabla.
 */

/**
 * El nombre de cada tipo, en singular y en español de México.
 *
 * `opening` es «Vano» y no «Abertura» porque vano es la palabra del oficio: es
 * la que aparece en un cuadro de vanos y la que usa quien dibuja. Traducir al
 * castellano general en vez de al del gremio es el error que delata que el
 * producto lo escribió alguien de fuera.
 */
export const CAD_ENTITY_TYPE_NAMES: Record<CadNativeEntityType, string> = {
  line: "Línea",
  polyline: "Polilínea",
  circle: "Círculo",
  arc: "Arco",
  ellipse: "Elipse",
  spline: "Spline",
  hatch: "Sombreado",
  text: "Texto",
  mtext: "Texto",
  dimension: "Cota",
  mleader: "Directriz",
  insert: "Bloque",
  point: "Punto",
  xline: "Línea auxiliar",
  ray: "Rayo",
  solid: "Sólido",
  wipeout: "Máscara",
  image: "Imagen",
  attdef: "Atributo",
  table: "Tabla",
  solid3d: "Sólido 3D",
  region: "Región",
  wall: "Muro",
  opening: "Vano",
};

/** El nombre del tipo, o el propio tipo si algún día aparece uno sin traducir. */
export function cadTypeName(type: string): string {
  return (
    CAD_ENTITY_TYPE_NAMES[type as CadNativeEntityType] ??
    // Sin traducción no se inventa una: se enseña el tipo crudo, que al menos
    // es cierto. Un «Objeto» genérico escondería que falta una entrada aquí.
    type
  );
}

export interface LabelledEntity {
  id: string;
  type: string;
}

/**
 * Calcula el nombre de cada entidad del documento, de una vez.
 *
 * Se devuelve un mapa y no una función por entidad porque el ordinal depende
 * del conjunto: resolverlo entidad a entidad obligaría a recorrer la lista
 * entera cada vez, y el panel de propiedades lo pide para veinte filas seguidas.
 *
 * `text` y `mtext` comparten nombre («Texto») pero NO comparten contador: dos
 * objetos distintos con el mismo nombre serían peor que dos nombres distintos.
 * El contador va por TIPO, así que un `text` y un `mtext` pueden ser los dos
 * «Texto 1» — y eso es correcto, porque para quien dibuja son la misma clase de
 * cosa y nunca los ve juntos en la misma lista sin más contexto.
 */
export function cadEntityLabels(
  entities: readonly LabelledEntity[],
): Map<string, string> {
  const contadores = new Map<string, number>();
  const nombres = new Map<string, string>();
  for (const entity of entities) {
    const siguiente = (contadores.get(entity.type) ?? 0) + 1;
    contadores.set(entity.type, siguiente);
    nombres.set(entity.id, `${cadTypeName(entity.type)} ${siguiente}`);
  }
  return nombres;
}

/**
 * El nombre de UNA entidad dentro de su documento.
 *
 * Existe para los sitios que sólo tienen una entidad a mano (el panel de
 * selección única). Recorre la lista, así que no se debe llamar en bucle: para
 * eso está `cadEntityLabels`.
 */
export function cadEntityLabel(
  entity: LabelledEntity,
  entities: readonly LabelledEntity[],
): string {
  let ordinal = 0;
  for (const candidato of entities) {
    if (candidato.type !== entity.type) continue;
    ordinal += 1;
    if (candidato.id === entity.id) break;
  }
  return `${cadTypeName(entity.type)} ${Math.max(ordinal, 1)}`;
}
