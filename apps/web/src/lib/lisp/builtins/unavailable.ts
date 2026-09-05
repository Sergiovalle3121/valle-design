/**
 * Lo que NO está, dicho con su motivo — y en UN solo sitio.
 *
 * Una rutina descargada que llama a `nentsel` puede fallar de tres maneras:
 *
 *  1. «no function definition: NENTSEL». Cierto, y completamente inútil: el
 *     autor no sabe si es que se escribe distinto, si falta cargar algo, o si
 *     el producto no lo hace.
 *  2. Devolviendo algo plausible —el INSERT entero en vez de la entidad
 *     anidada—. Es lo peor que puede pasar: la rutina sigue, procesa el objeto
 *     equivocado y el usuario descubre el defecto en el plano impreso.
 *  3. Diciendo QUÉ falta y POR QUÉ. Es lo que hace este módulo.
 *
 * Que estén todas juntas es deliberado: la lista de lo que este producto no
 * sabe hacer del lenguaje cabe en una pantalla y se ve entera en un diff. El
 * día que una de ellas se implemente, se borra de aquí, y ese borrado es la
 * prueba de que ya existe.
 *
 * Se instalan en la tabla del NÚCLEO, no en la del CAD, porque el motivo por el
 * que no están no depende de que haya un dibujo abierto: no lo hay en ninguno
 * de los dos casos, y quien valide la sintaxis de un `.lsp` sin documento
 * merece leer el mismo mensaje que quien lo ejecuta.
 */
import { LispError } from "../errors";
import { defsubr, type BuiltinTable } from "./define";

/** Una función declarada fuera de alcance: existe, y su cuerpo es el motivo. */
function declineFunction(table: BuiltinTable, name: string, reason: string): void {
  defsubr(table, name, 0, null, () => {
    throw new LispError(`${name}: no está disponible en esta versión. ${reason}`);
  });
}

/**
 * Una entrada de la frontera. Es DATO y no un efecto secundario de instalar la
 * tabla porque la matriz de cobertura que se publica en `docs/api/` se genera
 * leyendo esta lista: el motivo que se lee en el documento y el motivo que
 * lanza el intérprete son la MISMA cadena, así que no pueden discrepar.
 */
export interface LispFueraDeAlcance {
  /** Como se escribe en la rutina. La tabla la guarda en mayúsculas. */
  readonly nombre: string;
  /** El corte al que pertenece: lo que agrupa la columna del documento. */
  readonly familia: string;
  /** Por qué no está. Es el texto que sale por el error, palabra por palabra. */
  readonly motivo: string;
}

/** La E/S de ficheros de AutoLISP, entera. */
const FILE_IO_REASON =
  "La E/S de ficheros abre rutas del disco del usuario, y una rutina corre aquí dentro del " +
  "sandbox del intérprete, sin sistema de ficheros al que llegar. Devolver un descriptor " +
  "falso sería peor que negarse: `write-line` diría que escribió y no habría escrito nada, y " +
  "la rutina daría por generado un fichero de medición que no existe. Para leer y escribir " +
  "datos del dibujo están `entget`/`entmod`, y para guardar código, la biblioteca de rutinas " +
  "del estudio (`load`).";

/**
 * La frontera del puente ActiveX. Ya no es «no hay COM»: el puente de
 * ENTIDADES existe (`builtins/vlax.ts`) y contesta con el documento canónico
 * detrás. Lo que no existe es el otro lado —el objeto de APLICACIÓN— y hay que
 * decir con precisión dónde está el corte, porque una rutina que pide
 * `vlax-get-acad-object` normalmente sólo quiere llegar a las entidades y tiene
 * un camino más corto.
 */
const APPLICATION_COM_REASON =
  "El objeto de APLICACIÓN de ActiveX (`AcadApplication`, su `Documents`, su `Preferences`, su " +
  "línea de comandos COM) es una interfaz de Windows con el ejecutable de AutoCAD, y aquí no " +
  "hay ni Windows ni ese ejecutable: esto corre en el navegador. Devolver un objeto que acepta " +
  "`vlax-put-property` y no cambia nada sería un «éxito sin efecto» de manual. Lo que SÍ hay es " +
  "el puente de entidades entero: (vlax-ename->vla-object e) da un objeto VLA de verdad, con " +
  "vla-get-*/vla-put-*, vlax-get/vlax-put y vlax-curve-*, y su escritura entra en el historial " +
  "como cualquier otra. Para conducir el programa está (command …); para lo que el lenguaje no " +
  "alcanza, el SDK de plugins en JavaScript.";

/**
 * Los reactores. Se declaran aparte porque su motivo NO es la ausencia de COM:
 * es que un reactor ejecuta código del usuario DENTRO del ciclo de edición del
 * programa, y eso es precisamente lo que el sandbox del intérprete existe para
 * impedir.
 */
const REACTOR_REASON =
  "Un reactor `vlr-*` engancha código de la rutina a los eventos del editor —cada objeto que " +
  "se crea, cada comando que empieza— y lo ejecuta DENTRO del ciclo de edición. Aquí una rutina " +
  "corre con presupuesto medido y con una sola salida de escritura; un reactor la convertiría " +
  "en código residente que puede reentrar en el comando que lo despertó, y ni el presupuesto " +
  "ni el paso único de deshacer sobrevivirían a eso. No se finge con un registro que nunca " +
  "dispara: eso dejaría a la rutina creyendo que su comprobación de norma está vigilando el " +
  "dibujo. Para reaccionar a los cambios está el SDK de plugins del estudio, que sí tiene " +
  "eventos con su propio ciclo de vida.";

/**
 * `nentsel` designa DENTRO de un bloque, y ése es exactamente el problema.
 */
const NENTSEL_REASON =
  "`nentsel` designa DENTRO de un bloque y devuelve, además de la entidad anidada, la " +
  "matriz de transformación del anidamiento. Este producto no expone la geometría " +
  "interior de un INSERT como entidades designables, así que la matriz no existiría y " +
  "devolver el INSERT entero sería contestar otra cosa a la pregunta que se hizo. Para " +
  "designar la referencia completa está `entsel`.";

/** El cuadro de archivos del sistema, que es disco y no dibujo. */
const GETFILED_REASON =
  "`getfiled` abre el cuadro de archivos del sistema y devuelve una ruta del disco del " +
  "usuario, que es justo lo que el sandbox del intérprete no alcanza. La variable FILEDIA " +
  "sigue en la tabla porque es estado del dibujo que las rutinas guardan y restauran, no " +
  "la promesa de un explorador de ficheros.";

/**
 * La parametrización interna de una curva. No es COM: es que este producto no
 * publica el parámetro de una curva, y traducirlo a distancia sería inventarse
 * una correspondencia con la que la rutina posicionaría geometría.
 */
const CURVE_PARAM_REASON =
  "La parametrización interna de una curva —el índice de tramo de una polilínea, el nudo de " +
  "una NURBS— no la publica este producto, y traducirla a una distancia sería inventarse " +
  "una correspondencia que la rutina usaría para colocar geometría. Para recorrer una " +
  "curva por LONGITUD, que es como se reparten marcas en un plano, están " +
  "vlax-curve-getPointAtDist, vlax-curve-getDistAtPoint y vlax-curve-getClosestPointTo, " +
  "que sí miden sobre la geometría del producto.";

/** Un corte entero de la frontera: varias funciones con el mismo motivo. */
function corte(familia: string, motivo: string, nombres: readonly string[]): LispFueraDeAlcance[] {
  return nombres.map((nombre) => ({ nombre, familia, motivo }));
}

/**
 * LA FRONTERA, entera y en un solo valor.
 *
 * El día que una de estas funciones se implemente, se borra de esta lista, y
 * ese borrado es a la vez lo que la hace existir en la tabla y lo que la mueve
 * de columna en la matriz publicada. Las tres entradas del puente ActiveX que
 * ya existen —`vlax-ename->vla-object`, `vlax-get-property`,
 * `vlax-put-property`— se borraron de aquí cuando se construyeron.
 */
export const LISP_FUERA_DE_ALCANCE: readonly LispFueraDeAlcance[] = [
  { nombre: "nentsel", familia: "designación anidada", motivo: NENTSEL_REASON },
  { nombre: "getfiled", familia: "cuadro de archivos del sistema", motivo: GETFILED_REASON },
  ...corte("E/S de ficheros", FILE_IO_REASON, [
    "open",
    "close",
    "read-line",
    "write-line",
    "read-char",
    "write-char",
  ]),
  ...corte("objeto de APLICACIÓN de ActiveX", APPLICATION_COM_REASON, [
    "vlax-get-acad-object",
    "vlax-create-object",
    "vlax-get-or-create-object",
    "vlax-import-type-library",
    "vlax-invoke",
    "vlax-invoke-method",
    "vlax-method-applicable-p",
  ]),
  ...corte("reactores", REACTOR_REASON, [
    "vlr-acdb-reactor",
    "vlr-object-reactor",
    "vlr-editor-reactor",
    "vlr-command-reactor",
    "vlr-dwg-reactor",
    "vlr-lisp-reactor",
    "vlr-remove",
    "vlr-remove-all",
    "vlr-reactors",
  ]),
  ...corte("parametrización interna de curvas", CURVE_PARAM_REASON, [
    "vlax-curve-getParamAtDist",
    "vlax-curve-getDistAtParam",
    "vlax-curve-getParamAtPoint",
    "vlax-curve-getPointAtParam",
    "vlax-curve-getFirstDeriv",
    "vlax-curve-getSecondDeriv",
  ]),
];

/**
 * Instala la frontera. Recorre la lista de arriba y nada más: no hay una
 * segunda vía por la que una función pueda declararse fuera de alcance sin
 * aparecer en la matriz publicada.
 */
export function installUnavailable(table: BuiltinTable): void {
  for (const entrada of LISP_FUERA_DE_ALCANCE)
    declineFunction(table, entrada.nombre, entrada.motivo);
}
