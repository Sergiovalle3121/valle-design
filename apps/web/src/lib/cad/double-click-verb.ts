/**
 * QUÉ ABRE EL DOBLE CLIC, POR TIPO DE OBJETO.
 *
 * ## El hueco que cierra
 *
 * `docs/competitive/distancia-autocad-completo-20260901.md` lo midió y lo puso
 * entre los tres reflejos caros: **cero** manejadores de `dblclick` en todo
 * `components/cad/` y `lib/cad/`. En AutoCAD el doble clic es un VERBO
 * universal —sobre MTEXT abre el editor, sobre un bloque sus atributos, sobre
 * una polilínea PEDIT, sobre una cota su texto— y aquí no hacía nada sobre
 * nada. Es el renglón 8 de la prueba de los diez segundos.
 *
 * ## Por qué es una tabla pura y no un `switch` dentro del lienzo
 *
 * Porque lo que un tipo de objeto abre es una DECISIÓN DE PRODUCTO, no un
 * detalle del viewport: se lee, se prueba en Node y se amplía sin tocar el
 * monolito. El lienzo se queda con lo suyo —qué entidad hay bajo el cursor— y
 * pregunta aquí qué hacer con ella.
 *
 * ## Lo que NO abre, y se dice
 *
 * Un tipo sin verbo devuelve `null` y el editor no hace nada: NO se cae al
 * panel de propiedades como consuelo. Un doble clic que abre siempre «algo»
 * enseña a desconfiar del gesto, que es peor que un gesto que no responde en
 * los casos que todavía no existen. Hoy quedan fuera, y cada uno con su
 * motivo: el sombreado (`HATCHEDIT` no existe todavía), la referencia externa
 * (`REFEDIT` tampoco) y la imagen (`IMAGEADJUST` existe pero pide sus valores
 * por la línea, no por un cuadro; abrirlo a ciegas con dos clics sería más
 * sorpresa que ayuda).
 */

/**
 * El verbo que abre un tipo de objeto.
 *
 * `"mtext-editor"` no es una orden del motor sino el editor de párrafo del
 * estudio, que es lo que AutoCAD abre sobre un MTEXT: un editor en sitio con
 * formato, no un prompt de una línea. El resto son nombres canónicos del
 * registro y viajan tal cual.
 */
export type CadDoubleClickVerb =
  | { kind: "mtext-editor" }
  | { kind: "command"; command: string };

const VERBOS: Readonly<Record<string, CadDoubleClickVerb>> = {
  // El editor de párrafo del estudio, con formato y máscara.
  mtext: { kind: "mtext-editor" },
  // Texto de una línea, directriz, cota y atributo: DDEDIT los edita todos.
  text: { kind: "command", command: "DDEDIT" },
  mleader: { kind: "command", command: "DDEDIT" },
  dimension: { kind: "command", command: "DDEDIT" },
  attdef: { kind: "command", command: "DDEDIT" },
  // La tabla abre su celda.
  table: { kind: "command", command: "TABLEDIT" },
  // Una inserción abre sus atributos, como en AutoCAD; si el bloque no tiene,
  // la propia orden lo dice en vez de fingir que editó algo.
  insert: { kind: "command", command: "ATTEDIT" },
  // Y la polilínea, PEDIT: el verbo que todo el mundo teclea sobre ella.
  polyline: { kind: "command", command: "PEDIT" },
};

/** El verbo de un tipo de entidad, o `null` si ese tipo todavía no abre nada. */
export function cadDoubleClickVerb(entityType: string): CadDoubleClickVerb | null {
  return VERBOS[entityType] ?? null;
}

/** Los tipos que hoy responden al doble clic. Para inventarios y pruebas. */
export const CAD_DOUBLE_CLICK_TYPES: readonly string[] = Object.keys(VERBOS);
