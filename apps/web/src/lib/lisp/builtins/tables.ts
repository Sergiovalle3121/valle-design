/**
 * Las TABLAS DE SÍMBOLOS: `tblsearch`, `tblnext` y `tblobjname`.
 *
 * Es cómo una rutina averigua qué capas hay antes de dibujar. El gesto clásico
 * —el que hace media biblioteca de despacho en su primera pantalla— es éste:
 *
 *     (if (not (tblsearch "LAYER" "EJES"))
 *       (command "-LAYER" "N" "EJES" ""))
 *
 * Con `tblsearch` sola no se puede RECORRER la tabla, y recorrerla es la otra
 * mitad del trabajo: comprobar la norma de capas del estudio, contar cuántas
 * están apagadas, renombrar por lote. Por eso está `tblnext`, que itera.
 *
 * ## `tblobjname` devuelve un nombre de entidad DE VERDAD
 *
 * En AutoCAD, `(entget (tblobjname "LAYER" "EJES"))` lee la capa como objeto de
 * la base de datos. Aquí también, y no por gusto: devolver un nombre que
 * `entget` no supiera leer habría sido un valor bonito e inservible —la rutina
 * seguiría con nil sin saber por qué—. El nombre lleva su propio prefijo
 * (`dxf/layer-record.ts`) y `entget` lo reconoce.
 *
 * Lo que NO se puede es `entmod` sobre una capa: la escritura de la tabla de
 * símbolos va por el comando `-LAYER`, que es la única ruta que produce
 * comandos canónicos de capa. `entities.ts` lo rechaza diciéndolo.
 *
 * ## Sólo LAYER, y se dice
 *
 * BLOCK, STYLE, LTYPE, DIMSTYLE, UCS, VIEW y VPORT existen en el documento con
 * otra forma —o no existen— y contestar una lista aproximada por cada una sería
 * inventarse la tabla de símbolos de otro producto. Se rechazan nombrando la
 * tabla pedida, que es lo que permite al autor decidir qué hacer.
 */
import { LispError } from "../errors";
import { findLayerRecord, layerRecordDxf, layerRecordEname } from "../dxf/layer-record";
import { NIL } from "../values";
import { defsubr, wantString, type BuiltinTable } from "./define";
import { requireHost } from "./entities";

/** Cuántas celdas cuesta materializar un registro de capa. */
const RECORD_CELLS = 12;

/** La única tabla implementada. El resto se rechaza por su nombre. */
function requireLayerTable(caller: string, tableName: string): void {
  if (tableName !== "LAYER")
    throw new LispError(
      `${caller}: sólo está implementada la tabla LAYER, no ${tableName}. Las demás tablas de ` +
        `símbolos —BLOCK, STYLE, LTYPE, DIMSTYLE— tienen otra forma en este documento, y ` +
        `devolver una lista aproximada por cada una sería inventarse la base de datos de otro ` +
        `producto.`,
    );
}

/** Dónde va el recorrido de `tblnext`, por tabla. Vive en la pizarra de la sesión. */
function cursorKey(tableName: string): string {
  return `tblnext:${tableName}`;
}

export function installTableFunctions(table: BuiltinTable): void {
  /**
   * `tblsearch` devuelve los DATOS de la capa, sin `(-1 . <nombre>)`. La
   * diferencia con `entget` no es cosmética: lo que se devuelve aquí es una
   * copia que no se puede volver a tocar, y por eso ninguna rutina intenta
   * modificarla.
   */
  defsubr(table, "tblsearch", 2, 3, (args, ctx) => {
    const host = requireHost(ctx, "tblsearch");
    const tableName = wantString(args[0]).v.trim().toUpperCase();
    requireLayerTable("tblsearch", tableName);
    const layer = findLayerRecord(host.layers(), wantString(args[1]).v);
    if (!layer) return NIL;
    ctx.charge(RECORD_CELLS);
    return layerRecordDxf(layer);
  });

  /**
   * `(tblnext "LAYER")` avanza; `(tblnext "LAYER" T)` rebobina y devuelve la
   * primera. Al final devuelve nil, que es cómo termina el bucle:
   *
   *     (setq capa (tblnext "LAYER" T))
   *     (while capa
   *       …
   *       (setq capa (tblnext "LAYER")))
   *
   * El cursor vive en la pizarra de la SESIÓN, no en un símbolo LISP, por la
   * misma razón que `initget`: un símbolo lo puede pisar la rutina, y entonces
   * el recorrido volvería a empezar a mitad sin que nada lo dijera.
   */
  defsubr(table, "tblnext", 1, 2, (args, ctx) => {
    const host = requireHost(ctx, "tblnext");
    const tableName = wantString(args[0]).v.trim().toUpperCase();
    requireLayerTable("tblnext", tableName);
    const rewind = args.length > 1 && args[1].t !== "nil";
    const key = cursorKey(tableName);
    const position = rewind ? 0 : ((ctx.state.get(key) as number | undefined) ?? 0);
    const layers = host.layers();
    if (position >= layers.length) {
      // Agotada la tabla, el cursor se queda al final: llamar otra vez sigue
      // dando nil. Reiniciarlo solo convertiría el bucle de arriba en infinito.
      ctx.state.set(key, layers.length);
      return NIL;
    }
    ctx.state.set(key, position + 1);
    ctx.charge(RECORD_CELLS);
    return layerRecordDxf(layers[position]);
  });

  /**
   * `(tblobjname "LAYER" "EJES")` → el nombre de entidad del registro, o nil si
   * la capa no está. Es lo que se le pasa a `entget` para leerla como objeto.
   */
  defsubr(table, "tblobjname", 2, 2, (args, ctx) => {
    const host = requireHost(ctx, "tblobjname");
    const tableName = wantString(args[0]).v.trim().toUpperCase();
    requireLayerTable("tblobjname", tableName);
    const layer = findLayerRecord(host.layers(), wantString(args[1]).v);
    return layer ? layerRecordEname(layer.id) : NIL;
  });
}
