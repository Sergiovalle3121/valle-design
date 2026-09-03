/**
 * LAS TABLAS DE PLUMAS QUE EL ESTUDIO TIENE CARGADAS.
 *
 * ## Qué estaba roto, medido
 *
 * `plot-host.ts` declara `plotStyleTables()` y lo consulta antes de trazar; si
 * la configuración de página nombra una tabla y el puente no la tiene, la orden
 * se niega —con razón— para no sacar un plano con los grosores equivocados:
 *
 *     La tabla de plumas «monochrome» no está cargada: el plano saldría con
 *     los grosores equivocados.
 *
 * Y NADIE aportaba ese puente: `grep -rn plotStyleTables src/` sólo lo
 * encontraba en su propia interfaz y en el publicador de conjuntos. El
 * resultado medido es peor que «no está»: `PAGESETUP Estilos monochrome` deja
 * el nombre escrito en la presentación —eso sí funcionaba— y a partir de ahí
 * `PLOT` DEJA DE TRAZAR esa hoja. Elegir una tabla rompía el trazado.
 *
 * ## Qué hace este módulo, y qué no
 *
 * Publica las tablas que el producto YA sabe construir, con el nombre de
 * archivo con el que se conocen en cualquier despacho:
 *
 * - `acad.ctb` — la tabla en blanco: 255 estilos que no cambian nada. Es el
 *   punto de partida honesto y es lo que AutoCAD trae.
 * - `monochrome.ctb` — todo negro, cada color con su grosor de la serie ISO
 *   128 (0,13 ejes · 0,25 general · 0,35 contornos · 0,50 secciones).
 * - `acad.stb` — la tabla de estilos con NOMBRE, para quien trabaja así.
 *
 * Lo que NO hace, y se dice: cargar el `.ctb` del despacho desde un archivo.
 * El lector existe entero (`importCadPlotStyleTable`, con su descompresor para
 * las comprimidas), pero traerlo pide un selector de archivo y una orden que lo
 * pida — `STYLESMANAGER` —, y ninguna de las dos está. Mientras tanto, una
 * tabla que no es de las tres se sigue diciendo «no está cargada», que es la
 * respuesta honesta.
 *
 * ## Por qué el nombre se busca sin distinguir mayúsculas ni extensión
 *
 * El nombre lo teclea una persona en `PAGESETUP Estilos`, y en Windows —de
 * donde viene el archivo— `Monochrome.ctb` y `monochrome.ctb` son el mismo. Un
 * `Map.get` exacto convertiría una mayúscula en «no está cargada», que es un
 * fallo inventado por el programa y no por el dibujo.
 */
import {
  createCadColorTable,
  createCadMonochromeTable,
  createCadNamedTable,
  type CadPlotStyleTable,
} from "@/lib/cad/plot/plot-style-table";

/** Las tres que el producto sabe construir, por su nombre de archivo. */
export function cadBuiltinPlotStyleTables(): Map<string, CadPlotStyleTable> {
  return new Map<string, CadPlotStyleTable>([
    ["acad.ctb", createCadColorTable("acad")],
    ["monochrome.ctb", createCadMonochromeTable("monochrome")],
    ["acad.stb", createCadNamedTable("acad")],
  ]);
}

// La búsqueda por nombre vive con el MODELO (`plot-style-table.ts`), porque la
// usan también la comprobación previa de la configuración de página y el
// publicador de conjuntos. Se reexporta para quien ya la pedía aquí.
export { cadFindPlotStyleTable } from "@/lib/cad/plot/plot-style-table";
