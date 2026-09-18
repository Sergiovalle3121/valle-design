/**
 * R7 — reescribir la geometría y dejarla IGUAL no es una mutación.
 *
 * Vive aparte de `command-integrity-rules.mjs` por dos razones: ese archivo ya
 * roza el presupuesto de monolito (800 líneas), y esta regla es la única que
 * necesita los EVALUADORES del producto para medir. El árbol de decisión sólo
 * recibe el motivo ya calculado, igual que con R6.
 *
 * ## El agujero que cierra
 *
 * SLICE ascendía a «muta» sin cortar nada. En la pasada de sólidos la sonda le
 * da como plano de corte los dos primeros puntos de su repertorio —(10,10) y
 * (80,40)— mientras las dos cajas de la probeta viven en y∈[200,290]: todos sus
 * vértices caen del lado positivo, así que «conservar el positivo» conservaba
 * el cuerpo ENTERO. Su lote eran dos `replace` que apilaban un nodo
 * `{op:"slice"}` y repuntaban la raíz, y el sólido resultante tenía el mismo
 * volumen (240000), la misma área (24800) y los mismos 12 triángulos, medido
 * con los evaluadores del producto. El documento cambiaba —el árbol lleva un
 * nodo más— y con eso la orden cobraba «muta» sin decir una palabra.
 *
 * R2 no lo caza porque pregunta si lo tocado es DIBUJABLE, y una caja sin
 * cortar lo es. R6 no lo caza porque sólo mira lotes que son todo `metadata`.
 * La causa se arregló en el producto (SLICE lo comprueba y lo dice), pero la
 * MEDICIÓN seguía regalando el verde: si mañana alguien vaciara la rama de
 * SLICE y dejara sólo el apilado del nodo, el gate volvería a decir «muta». Y
 * no es sólo SLICE: los quince comandos del esquema 5 trabajan apilando nodos
 * sobre el árbol —UNION, SUBTRACT, INTERSECT, FILLETEDGE, CHAMFEREDGE,
 * PRESSPULL…— y cualquiera de ellos puede apilar uno que no cambie el cuerpo.
 *
 * ## Qué se compara, y por qué la huella lleva DOS partes
 *
 * La huella de una entidad tocada es su geometría EVALUADA más todo lo demás
 * que la entidad dice de sí misma:
 *
 * - de un `solid3d` se evalúan volumen, área y malla, y se deja fuera de la
 *   parte textual su árbol (`nodes`, `root`) y su colocación (`placement`),
 *   que es lo único que puede cambiar sin cambiar el cuerpo;
 * - de cualquier otro tipo, la huella es su serialización entera: sus
 *   coordenadas son explícitas, así que su texto YA es su geometría.
 *
 * Las dos partes son necesarias. Sin la evaluada, un `slice` que no corta pasa
 * por cambio. Sin la textual, un comando que cambia la CAPA de un sólido
 * —LAYMCH, que es kind `modify` y en la pasada de sólidos no dice nada— saldría
 * acusado de no hacer nada, y sí hace lo que promete. R7 no es «el sólido se ve
 * igual»: es «el lote reescribió la geometría y el cuerpo es el mismo».
 *
 * De ahí se sigue el ALCANCE exacto de la regla, que conviene decir en voz
 * alta: como una entidad tocada tiene que haber cambiado de serialización para
 * entrar, y en todo lo que no es `solid3d` la serialización ES la huella, R7
 * sólo puede acusar a un lote cuyas entidades tocadas son TODAS sólidos con el
 * árbol reescrito. Es justo la familia que trabaja apilando nodos, y ninguna
 * otra.
 *
 * ## Lo que R7 NO dice
 *
 * No habla de los lotes que añaden o borran entidades: ahí hay geometría nueva
 * o menos geometría, y ninguna de las dos cosas es un no-op. Tampoco de los que
 * cambian el documento FUERA de las entidades (una capa, un estilo, una
 * presentación): si el lote no tocó ninguna entidad, esta regla se calla, y quien
 * juzga es el contrato del `kind` —R6 para las banderas, y la contabilidad del
 * documento para `manage`—.
 */

/** Lo que en un SOLID3D describe su geometría, y sólo se juzga EVALUADO. */
const GEOMETRIA_DE_SOLIDO = ["nodes", "root", "placement"];

/**
 * La huella de una entidad: lo que tiene que cambiar para que haya mutación.
 *
 * @param {any} entity
 * @param {{
 *   solid3dMesh: (entity: any) => {positions: ArrayLike<number>, indices: ArrayLike<number>},
 *   solid3dMassProperties: (entity: any) => {volume: number, area: number},
 * }} evaluadores
 * @returns {string}
 */
export function huellaGeometrica(entity, evaluadores) {
  if (entity?.type !== "solid3d") return JSON.stringify(entity);
  const resto = Object.fromEntries(
    Object.entries(entity).filter(([clave]) => !GEOMETRIA_DE_SOLIDO.includes(clave)),
  );
  try {
    const masa = evaluadores.solid3dMassProperties(entity);
    const malla = evaluadores.solid3dMesh(entity);
    return JSON.stringify([
      resto,
      masa.volume,
      masa.area,
      [...malla.positions],
      [...malla.indices],
    ]);
  } catch (error) {
    // Un cuerpo que no se puede evaluar no es «el mismo de antes»: se le da una
    // huella única para que R7 no lo declare intacto. Quien lo caza es R2, que
    // ya descalifica al «muta» cuyo lote deja algo sin geometría.
    return JSON.stringify([resto, "no evaluable", String(error).slice(0, 120)]);
  }
}

/**
 * R7 — ¿el lote reescribió entidades que ya existían y TODAS conservan su
 * geometría evaluada?
 *
 * @param {readonly {id: string}[]} antes    entidades antes del lote
 * @param {readonly {id: string}[]} despues  entidades después del lote
 * @param {object} evaluadores               los del producto (ver `huellaGeometrica`)
 * @returns {string | null} el motivo, o null si el lote aporta o quita geometría
 */
export function geometriaReescritaSinCambio(antes, despues, evaluadores) {
  const previas = new Map(antes.map((entity) => [entity.id, entity]));
  const actuales = new Map(despues.map((entity) => [entity.id, entity]));
  if (previas.size !== antes.length || actuales.size !== despues.length) return null;
  for (const id of actuales.keys()) if (!previas.has(id)) return null;
  for (const id of previas.keys()) if (!actuales.has(id)) return null;
  const tocadas = [];
  for (const [id, entity] of actuales) {
    if (JSON.stringify(previas.get(id)) === JSON.stringify(entity)) continue;
    if (huellaGeometrica(previas.get(id), evaluadores) !== huellaGeometrica(entity, evaluadores))
      return null;
    tocadas.push(id);
  }
  if (tocadas.length === 0) return null;
  return (
    `el lote no añade ni borra entidades y las ${tocadas.length} que reescribe ` +
    `(${tocadas.sort().join(", ")}) conservan su geometría evaluada`
  );
}
