/**
 * LAS TABLAS DE PLUMAS QUE LA SESIÓN TIENE CARGADAS.
 *
 * ## Qué faltaba, medido
 *
 * `plot-host.ts` pregunta `plotStyleTables()` antes de trazar y se niega —con
 * razón— si la configuración de página nombra una que no está. Nadie lo
 * aportaba, así que elegir una tabla con `PAGESETUP Estilos` convertía la hoja
 * en no trazable. La primera mitad de esto la cerró el catálogo de fábrica; la
 * que faltaba es la del despacho: su `.ctb` de verdad, el que lleva años
 * decidiendo qué grosor tiene cada color en sus planos.
 *
 * ## Por qué es de la SESIÓN y no del documento
 *
 * Una tabla de plumas es un archivo del despacho, no del dibujo: el mismo plano
 * se traza con la tabla del cliente A o la del B. El documento sólo guarda su
 * NOMBRE (en los atributos del cajetín, formato que ya existía). Guardar el
 * archivo dentro del dibujo sería inventar formato y además duplicarlo en cada
 * plano. Vive con los tipos de línea cargados y los filtros con nombre, que son
 * exactamente la misma clase de cosa.
 *
 * ## Las tres de fábrica no se pueden pisar por accidente… ni se protegen
 *
 * Cargar un `acad.ctb` propio SUSTITUYE al de fábrica, porque eso es justo lo
 * que quiere quien lo carga: su `acad.ctb` es el bueno. Lo que no puede pasar
 * es que se pierdan sin que nadie lo pida, y por eso `list()` dice cuáles hay.
 */
import {
  cadFindPlotStyleTable,
  createCadColorTable,
  createCadMonochromeTable,
  createCadNamedTable,
  type CadPlotStyleTable,
} from "./plot-style-table";

/**
 * Las tres que el producto sabe construir, por su nombre de archivo.
 *
 * - `acad.ctb` — la tabla en blanco: 255 estilos que no cambian nada. Es el
 *   punto de partida honesto y es lo que AutoCAD trae.
 * - `monochrome.ctb` — todo negro, cada color con su grosor de la serie ISO
 *   128 (0,13 ejes · 0,25 general · 0,35 contornos · 0,50 secciones).
 * - `acad.stb` — la tabla de estilos con NOMBRE, para quien trabaja así.
 */
export function cadBuiltinPlotStyleTables(): Map<string, CadPlotStyleTable> {
  return new Map<string, CadPlotStyleTable>([
    ["acad.ctb", createCadColorTable("acad")],
    ["monochrome.ctb", createCadMonochromeTable("monochrome")],
    ["acad.stb", createCadNamedTable("acad")],
  ]);
}

export class CadPlotStyleCatalog {
  private readonly loaded = cadBuiltinPlotStyleTables();

  /** Nombre de archivo de una tabla: `Estudio-2004` + su clase. */
  private static fileName(table: CadPlotStyleTable): string {
    return `${table.name}.${table.kind}`;
  }

  /** Carga una tabla; si ya había una con ese nombre, la sustituye. */
  load(table: CadPlotStyleTable): string {
    const key = CadPlotStyleCatalog.fileName(table);
    this.loaded.set(key, table);
    return key;
  }

  /** Los nombres cargados, en orden estable. */
  list(): string[] {
    return [...this.loaded.keys()].sort((a, b) => a.localeCompare(b, "es"));
  }

  /** El mapa que el anfitrión de trazado consulta. */
  tables(): ReadonlyMap<string, CadPlotStyleTable> {
    return this.loaded;
  }

  /** La tabla de un nombre, con la regla de nombre compartida. */
  find(name: string): CadPlotStyleTable | null {
    return cadFindPlotStyleTable(this.loaded, name);
  }
}
