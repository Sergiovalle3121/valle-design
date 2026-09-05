/**
 * POR QUÉ EL ÁMBITO COMPARABLE DE MTEXT Y HATCH DEJÓ DE SER «ARCHIVO ENTERO».
 *
 * Se guarda aparte, y no como comentario del spec, porque
 * `dxf-fidelidad-terceros.spec.ts` está en el tope de 800 líneas del
 * presupuesto de monolito — y porque es el hallazgo más instructivo de esta
 * suite y merece encontrarse por su nombre.
 *
 * Tipos cuyo ámbito comparable es el ARCHIVO ENTERO, y no el espacio modelo.
 *
 * ESTÁ VACÍA desde el 2026-09-05, y merece contarse porque es el caso más
 * instructivo de esta suite. Tenía dentro MTEXT y HATCH, con esta razón
 * escrita: «el lector los devuelve SIN DUEÑO — no dice si venían del espacio
 * modelo, del papel o de dentro de un bloque. Es una limitación real del lector
 * y por eso se declara; el ámbito no se eligió porque cuadre».
 *
 * La limitación era cierta y P-evidencia-11 la quitó: los escaneos crudos ya
 * saben en qué sección están. Y al quitarla salió a la luz que los dos lados
 * venían coincidiendo por el mismo error: el lector contaba el fichero entero
 * porque no sabía distinguir, y el censo del oráculo se leía de `archivoEntero`
 * —que recorre `doc.blocks`, o sea `*Model_Space` otra vez MÁS los bloques que
 * nadie inserta—. Sobre floorplan.dxf los dos decían 26 HATCH y 144 MTEXT; el
 * espacio modelo de ese fichero tiene 13 y 9, y eso es lo que dicen hoy los
 * dos. Un acuerdo entre dos medidas equivocadas por el mismo sitio no es un
 * acuerdo, y ésta es la forma en que se detecta: arreglando uno de los lados.
 *
 * Crecer esta lista vuelve a ser admitir una limitación nueva, y hay que
 * escribirla.
 */

export const PORQUE_DEL_AMBITO =
  "MTEXT y HATCH se comparaban en el ámbito «archivo entero» porque el lector los devolvía sin " +
  "dueño. Quitada esa limitación (P-evidencia-11), se vio que los dos lados coincidían por el " +
  "mismo error: el lector contaba el fichero entero y el censo se leía de `archivoEntero`, que " +
  "recorre doc.blocks e incluye *Model_Space más los bloques que nadie inserta. 26 y 144 eran; " +
  "13 y 9 son.";
