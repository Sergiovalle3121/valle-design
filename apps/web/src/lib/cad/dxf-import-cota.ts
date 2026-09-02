/**
 * La cota que se pierde al importar, DECLARADA.
 *
 * En DXF una entidad plana no guarda puntos 3D: guarda puntos 2D medidos sobre
 * un plano propio, definido por su dirección de extrusión (código 210) y su
 * elevación sobre ella (código 38). El documento canónico todavía no sabe
 * guardar esa normal ni esa cota, así que la geometría entra aplanada contra el
 * suelo. Eso es una CARENCIA y tiene su sitio en la escalera. Lo que era un
 * DEFECTO es que no se decía.
 *
 * Vive fuera de `dxf-import.ts` porque ese archivo tiene un trinquete que sólo
 * baja y esto lo empujó 134 líneas por encima de su techo. Aquí, además, es
 * aritmética pura: entra una entidad tal y como la entrega `dxf-parser` y sale
 * un aviso o `null`, sin tocar el mapeador.
 */
import type { CadDxfImportWarning, CadDxfPrimitive } from "./dxf-import";

/**
 * Lo que este módulo lee de una entidad de `dxf-parser`. Todo opcional y todo
 * `unknown`: el analizador sólo pone lo que el fichero traía, y cada campo se
 * valida al usarlo. Un tipo estrecho en vez de `any` porque aquí la pregunta es
 * justamente si esos campos existen y qué valen.
 */
export interface EntidadDxfCruda {
  type?: unknown;
  extrusionDirectionX?: unknown;
  extrusionDirectionY?: unknown;
  extrusionDirectionZ?: unknown;
  elevation?: unknown;
  vertices?: unknown;
  startPoint?: unknown;
  start?: unknown;
  endPoint?: unknown;
  end?: unknown;
  center?: unknown;
  position?: unknown;
}

/**
 * Tolerancia de la normal. Los ficheros reales traen la extrusión escrita con
 * los decimales que sobrevivieron a un producto vectorial ajeno, así que
 * comparar contra 1 exacto marcaría como inclinado medio fichero plano.
 */
const NORMAL_DEL_MUNDO_TOLERANCIA = 1e-9;

/** La z de un punto DXF tal y como la deja `dxf-parser`, o 0 si no viene. */
function cotaDe(punto: unknown): number {
  const z = Number((punto as { z?: unknown } | null | undefined)?.z);
  return Number.isFinite(z) ? z : 0;
}

/**
 * Los puntos que DEFINEN la entidad, para mirarles la cota. No es toda la
 * geometría: basta con que UNO esté fuera del suelo para que el aplanado sea
 * una pérdida, y recorrer diez mil vértices por entidad para responder a una
 * pregunta booleana estaría en el camino de cada importación.
 */
function puntosQueDefinen(entity: EntidadDxfCruda): unknown[] {
  const vertices: unknown[] = Array.isArray(entity?.vertices) ? entity.vertices : [];
  return [
    entity?.startPoint,
    entity?.start,
    entity?.endPoint,
    entity?.end,
    entity?.center,
    entity?.position,
    ...vertices.slice(0, 64),
  ];
}

/**
 * ¿Esta entidad vive FUERA del plano XY del mundo?
 *
 * En DXF una entidad plana no guarda puntos 3D: guarda puntos 2D medidos sobre
 * un plano propio, definido por su dirección de extrusión (código 210) y su
 * elevación sobre ella (código 38). Un círculo de pie en un muro, la geometría
 * de un faldón, un hueco en un forjado alto y —el caso más frecuente de todos—
 * cualquier cosa dibujada en un SCU reflejado, que AutoCAD escribe con
 * extrusión (0,0,-1), llegan todos así.
 *
 * `mapDxfEntityToPrimitiveEnElPlano` lee `center`, `vertices` y `radius`, que
 * son coordenadas DE ESE PLANO, y las escribe como si fueran del suelo. La
 * geometría se acuesta. Y hay un caso peor que acostarse: una LINE vertical de
 * (0,0,0) a (0,0,3000) —un pilar de tres metros— sale con sus dos extremos en
 * (0,0), es decir, de LONGITUD CERO. El propio comando LINE del editor se niega
 * a crear ese segmento; el importador lo creaba sin decir nada.
 *
 * Arreglar el aplanado pide que la entidad canónica lleve su normal y su cota,
 * y eso es otra obra. Dejar de perderlo EN SILENCIO no: mientras el documento
 * no sepa representarlo, el manifiesto tiene que decir qué se cayó. Es la misma
 * lección que ya está aprendida dos funciones más arriba, donde `pt()` conserva
 * el bulge porque descartarlo «aplanaba a cuerda recta todos los arcos de
 * polilínea del fichero importado, en silencio».
 */
export function avisoDeCotaPerdida(
  entity: EntidadDxfCruda,
  type: string,
  layer: string,
): CadDxfImportWarning | null {
  // Los motivos van SIN números a propósito. `summarizeDxfImportWarnings` agrupa
  // por código+tipo+capa+MENSAJE, así que meter la extrusión exacta daría una
  // fila por normal distinta: un modelo con mil orientaciones llenaría el
  // manifiesto de mil renglones de uno en vez de decir «mil entidades de la capa
  // CUBIERTA perdieron su plano», que es lo que hay que leer de un vistazo.
  const motivos: string[] = [];

  // La extrusión viaja como tres códigos (210/220/230). Si no viene ninguno, el
  // plano es el del mundo; si viene alguno, los que falten valen 0 —no 1— o una
  // extrusión (1,0,0) se leería como (1,0,1) y no sería ni unitaria.
  const ex = entity?.extrusionDirectionX;
  const ey = entity?.extrusionDirectionY;
  const ez = entity?.extrusionDirectionZ;
  if (ex != null || ey != null || ez != null) {
    const nx = Number(ex ?? 0);
    const ny = Number(ey ?? 0);
    const nz = Number(ez ?? 0);
    const esDelMundo =
      Math.abs(nx) <= NORMAL_DEL_MUNDO_TOLERANCIA &&
      Math.abs(ny) <= NORMAL_DEL_MUNDO_TOLERANCIA &&
      Math.abs(nz - 1) <= NORMAL_DEL_MUNDO_TOLERANCIA;
    if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz) && !esDelMundo)
      motivos.push("su plano no es el del suelo");
  }

  const elevacion = Number(entity?.elevation);
  if (Number.isFinite(elevacion) && elevacion !== 0)
    motivos.push("está elevada sobre su plano");

  if (puntosQueDefinen(entity).some((punto) => punto != null && cotaDe(punto) !== 0))
    motivos.push("alguno de sus puntos tiene cota");

  if (motivos.length === 0) return null;
  return {
    code: "flattened_to_ground",
    message:
      `${type || "Entidad"} se aplanó contra el plano del suelo porque ` +
      `${motivos.join(", ")}. El documento todavía no guarda la normal ni la cota de ` +
      "una entidad plana, así que su geometría entra con las coordenadas medidas sobre " +
      "SU plano escritas como si fueran del suelo: cambia de sitio y puede cambiar de " +
      "longitud. Una línea perpendicular al suelo entra de longitud cero.",
    entityType: type || "UNKNOWN",
    layer,
  };
}


/**
 * El mapeador con la pérdida DECLARADA.
 *
 * Envuelve en vez de tocar los quince puntos de retorno del mapeador: el aviso
 * no depende de qué primitiva salga, sólo de dónde vivía la entidad, y
 * repartirlo por cada rama invitaba a olvidarlo en la siguiente que se añadiera.
 * Los llamadores ya miran `primitive` y `warning` por separado, así que devolver
 * los dos a la vez no obliga a cambiar ninguno.
 *
 * Un aviso preexistente MANDA: la entidad no importó limpia de todas formas, y
 * sustituirlo por el de la cota escondería el motivo principal.
 */
export function conCotaDeclarada(
  entity: EntidadDxfCruda,
  salida: { primitive?: CadDxfPrimitive; warning?: CadDxfImportWarning },
): { primitive?: CadDxfPrimitive; warning?: CadDxfImportWarning } {
  if (salida.warning || !salida.primitive) return salida;
  const aviso = avisoDeCotaPerdida(
    entity,
    String(entity?.type ?? "").toUpperCase(),
    salida.primitive.layer,
  );
  return aviso ? { ...salida, warning: aviso } : salida;
}
