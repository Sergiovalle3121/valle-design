/**
 * La cota al importar: lo que VUELVE al mundo y lo que se pierde, DECLARADO.
 *
 * En DXF una entidad plana no guarda puntos 3D: guarda puntos 2D medidos sobre
 * un plano propio, definido por su dirección de extrusión (código 210) y su
 * elevación sobre ella (código 38). Desde la Ola C (2026-09-02) el documento
 * guarda la cota de la LINE, la polilínea, el círculo, el arco, la elipse y la
 * spline (`pt()` conserva el código 30 y `point3z` lo lleva al mundo), y
 * `enElMundo` devuelve al mundo lo dibujado en un SCU REFLEJADO —extrusión
 * (0,0,−1), el caso más frecuente—. Lo que sigue sin caber es un plano
 * INCLINADO (normal distinta de ±Z): esa geometría entra aplanada contra el
 * suelo, y eso es una CARENCIA con su sitio en la escalera. Lo que era un
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
  /** `dxf-parser` la entrega como objeto en POLYLINE y LINE, y como tres escalares en el resto. */
  extrusionDirection?: unknown;
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
/** Tipos cuya cota (30/31 y 38) ya viaja al documento: para ellos la z no es pérdida. */
const CONSERVAN_COTA = new Set(["LINE", "LWPOLYLINE", "POLYLINE", "CIRCLE", "ARC", "ELLIPSE", "SPLINE"]);
/** Tipos que `enElMundo` sabe devolver al mundo desde un SCU reflejado. */
const VUELVEN_DEL_REFLEJO = new Set(["LINE", "LWPOLYLINE", "POLYLINE", "CIRCLE", "ARC"]);

/** La extrusión (210/220/230) tal como la deja `dxf-parser`, o `null` si el fichero no la trae. */
function normalDe(entity: EntidadDxfCruda): { x: number; y: number; z: number } | null {
  const objeto = entity?.extrusionDirection as { x?: unknown; y?: unknown; z?: unknown } | undefined;
  const ex = entity?.extrusionDirectionX ?? objeto?.x;
  const ey = entity?.extrusionDirectionY ?? objeto?.y;
  const ez = entity?.extrusionDirectionZ ?? objeto?.z;
  if (ex == null && ey == null && ez == null) return null;
  // Los que falten valen 0 —no 1— o una extrusión (1,0,0) se leería como (1,0,1).
  const normal = { x: Number(ex ?? 0), y: Number(ey ?? 0), z: Number(ez ?? 0) };
  return Number.isFinite(normal.x) && Number.isFinite(normal.y) && Number.isFinite(normal.z) ? normal : null;
}

function esDelMundo(n: { x: number; y: number; z: number }): boolean {
  return (
    Math.abs(n.x) <= NORMAL_DEL_MUNDO_TOLERANCIA &&
    Math.abs(n.y) <= NORMAL_DEL_MUNDO_TOLERANCIA &&
    Math.abs(n.z - 1) <= NORMAL_DEL_MUNDO_TOLERANCIA
  );
}

/** Extrusión (0,0,−1): el SCU reflejado que AutoCAD escribe al dibujar con la Y girada 180° sobre X. */
function esReflejo(n: { x: number; y: number; z: number }): boolean {
  return (
    Math.abs(n.x) <= NORMAL_DEL_MUNDO_TOLERANCIA &&
    Math.abs(n.y) <= NORMAL_DEL_MUNDO_TOLERANCIA &&
    Math.abs(n.z + 1) <= NORMAL_DEL_MUNDO_TOLERANCIA
  );
}

/** Grados en `[0, 360)`. */
function vuelta(deg: number): number {
  const w = deg % 360;
  return w < 0 ? w + 360 : w;
}

/**
 * Completa la entidad de `dxf-parser` con la extrusión leída sobre los pares
 * crudos (`dxf-read-properties.ts`) cuando el analizador la tiró: pasa en
 * CIRCLE. Si la entidad ya la trae, manda la suya. `entry` es la entrada de la
 * MISMA posición en la sección ENTITIES; se comprueba el tipo por si las dos
 * listas se desalinearan, que es el mismo guardarraíl de `currentPresentation`.
 */
export function conExtrusionCruda<T extends EntidadDxfCruda>(
  entity: T,
  entry: { type: string; extrusion?: { x: number; y: number; z: number } } | undefined,
): T {
  if (!entry?.extrusion || entry.type !== String(entity?.type ?? "").toUpperCase()) return entity;
  if (normalDe(entity) !== null) return entity;
  return { ...entity, extrusionDirection: entry.extrusion };
}

/**
 * Devuelve la primitiva AL MUNDO: aplica la elevación del código 38 y deshace
 * el SCU reflejado.
 *
 * Con extrusión (0,0,−1) el algoritmo del eje arbitrario de DXF da el eje X
 * del OCS en (−1,0,0) y el Y en (0,1,0): un punto (x, y, z) del OCS está en
 * (−x, y, −z) del mundo. Es un espejo, así que los arcos cambian de sentido:
 * un ARC de `a` a `b` (antihorario en su plano) pasa a ir de `180−b` a
 * `180−a` en el mundo, y el bulge de cada tramo cambia de signo. La LINE no
 * se toca: sus puntos son WCS y su 210 sólo orienta el grosor.
 *
 * Todo lo demás —normales inclinadas, textos, inserciones— sale igual que
 * entró, y `avisoDeCotaPerdida` lo declara.
 */
export function enElMundo(
  entity: EntidadDxfCruda,
  salida: { primitive?: CadDxfPrimitive; warning?: CadDxfImportWarning },
): { primitive?: CadDxfPrimitive; warning?: CadDxfImportWarning } {
  const primitive = salida.primitive;
  if (!primitive) return salida;
  const type = String(entity?.type ?? "").toUpperCase();
  let points = primitive.points;
  const elevacion = Number(entity?.elevation);
  if (type === "LWPOLYLINE" && Number.isFinite(elevacion) && elevacion !== 0)
    points = points.map((punto) => ({ ...punto, z: elevacion }));
  const normal = normalDe(entity);
  const reflejo = normal !== null && esReflejo(normal) && VUELVEN_DEL_REFLEJO.has(type) && type !== "LINE";
  if (reflejo)
    points = points.map((punto) => {
      const { z, bulge, ...resto } = punto;
      // `0 - x` y no `-x`: el negado de 0 es −0, y `deepStrictEqual` los distingue.
      return {
        ...resto,
        x: 0 - punto.x,
        ...(z ? { z: 0 - z } : {}),
        ...(bulge ? { bulge: 0 - bulge } : {}),
      };
    });
  if (points === primitive.points) return salida;
  const angulos =
    reflejo && type === "ARC" && typeof primitive.startAngle === "number" && typeof primitive.endAngle === "number"
      ? { startAngle: vuelta(180 - primitive.endAngle), endAngle: vuelta(180 - primitive.startAngle) }
      : {};
  return { ...salida, primitive: { ...primitive, points, ...angulos } };
}

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

  // La extrusión (210/220/230). Sin ninguna, el plano es el del mundo. Con
  // (0,0,−1) en un tipo que `enElMundo` devuelve al mundo, tampoco se pierde
  // nada; y la LINE es WCS: su normal sólo orienta el grosor.
  const normal = normalDe(entity);
  if (normal && !esDelMundo(normal) && type !== "LINE" && !(esReflejo(normal) && VUELVEN_DEL_REFLEJO.has(type)))
    motivos.push("su plano no es el del suelo");

  // La elevación del 38 viaja a los vértices de la LWPOLYLINE desde la Ola C.
  const elevacion = Number(entity?.elevation);
  if (type !== "LWPOLYLINE" && Number.isFinite(elevacion) && elevacion !== 0)
    motivos.push("está elevada sobre su plano");

  if (!CONSERVAN_COTA.has(type) && puntosQueDefinen(entity).some((punto) => punto != null && cotaDe(punto) !== 0))
    motivos.push("alguno de sus puntos tiene cota");

  if (motivos.length === 0) return null;
  return {
    code: "flattened_to_ground",
    message:
      `${type || "Entidad"} se aplanó contra el plano del suelo porque ` +
      `${motivos.join(", ")}. El documento guarda la cota de líneas, polilíneas, círculos, ` +
      "arcos, elipses y splines y devuelve al mundo lo dibujado en un SCU reflejado, pero " +
      "todavía no guarda un plano INCLINADO ni la cota de textos, inserciones y símbolos: su " +
      "geometría entra con las coordenadas medidas sobre SU plano escritas como si fueran " +
      "del suelo, así que cambia de sitio y puede cambiar de longitud.",
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
