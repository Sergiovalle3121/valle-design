/**
 * LA LISTA DE MATERIALES, SACADA DEL MODELO.
 *
 * ## Por qué esto es el entregable
 *
 * Un isométrico sin lista de materiales no se puede comprar. Hoy esa lista se
 * hace contando a mano sobre el plano —o midiendo con un escalímetro— y en
 * cuanto la ruta cambia, la lista miente. Aquí sale de la GEOMETRÍA: los metros
 * son la longitud 3D de las rutas y los accesorios son los que la geometría
 * implica, así que rehacerla después de mover una tubería es volver a teclear
 * la orden.
 *
 * ## Lo que NO trae, dicho en el propio cuadro
 *
 * Ni espesor de pared, ni diámetro exterior, ni peso, ni clave de compra, ni
 * precio. Esas tablas están en normas y catálogos con dueño y aquí no se
 * transcribe ninguna: la especificación del proyecto —`CS150`, `SS300`— viaja
 * en cada renglón para que quien compre la cruce con SU catálogo, que es quien
 * puede. El límite va en el título del cuadro, no sólo en el renglón de la
 * orden: es lo que se imprime y lo que alguien lee dentro de un año.
 *
 * ## El tubo se cuenta por METROS y los accesorios por PIEZAS
 *
 * Y el tubo se cuenta ENTERO, sin descontar lo que ocupa cada codo. Descontarlo
 * exige el radio del codo, que lo da el catálogo del fabricante; sumar de más
 * es el lado seguro de un error de compra y así se dice.
 */
import type { CadDocument, CadPoint2 } from "../cad-document";
import type { CadNativeEntity } from "../entity-runtime";
import { scheduleTable } from "../data-extraction/data-extraction";
import {
  cadPipeFittingLabel,
  cadPipeFittings,
  cadPipeRouteLength,
  cadPipeRoutesOf,
  type CadPipeRoute,
} from "./pipe-route";

type CadTableEntity = Extract<CadNativeEntity, { type: "table" }>;

/** Lo que la lista NO comprueba, dicho entero y en un solo sitio. */
export const CAD_PL_MTO_LIMITS =
  "Metros de tubo medidos sobre el modelo 3D, sin descontar el desarrollo de los codos; accesorios deducidos de la geometría. Sin espesor, diámetro exterior, peso, clave de compra ni precio: ésos los da el catálogo del proyecto";

export interface CadPipeMtoRow {
  /** `tubo` va en metros; el resto, en piezas. */
  kind: "tubo" | "codo" | "te" | "reduccion";
  description: string;
  size: string;
  spec: string;
  quantity: number;
  unit: "m" | "pz";
}

export interface CadPipeMto {
  /** El número de línea, o `null` cuando la lista abarca todo el dibujo. */
  line: string | null;
  rows: CadPipeMtoRow[];
  /** Metros de tubo, sumados; el número que más se mira. */
  totalMetres: number;
}

const metresPerUnit = (unit: string | undefined): number =>
  unit === "mm" ? 1_000 : unit === "cm" ? 100 : 1;

/**
 * La lista de materiales de una línea, o de todo el dibujo.
 *
 * Los accesorios se deducen SIEMPRE sobre todas las rutas y después se filtran
 * por línea: una te que une el ramal `4"` con el cabezal `6"` existe por las
 * dos, y calcularla sólo con las rutas de una las perdería justo donde importa.
 */
export function cadPipeMto(
  document: Pick<CadDocument, "entities">,
  options: { line?: string | null; unit?: string } = {},
): CadPipeMto {
  const line = options.line ?? null;
  const todas = cadPipeRoutesOf(document);
  const porMetro = metresPerUnit(options.unit);
  const mias = (route: CadPipeRoute) => line === null || route.line === line;

  const tubo = new Map<string, CadPipeMtoRow>();
  for (const route of todas.filter(mias)) {
    const clave = `${route.size}|${route.spec}`;
    const largo = cadPipeRouteLength(route.points) / porMetro;
    const fila = tubo.get(clave);
    if (fila) fila.quantity += largo;
    else
      tubo.set(clave, {
        kind: "tubo",
        description: `Tubo ${route.size}`,
        size: route.size,
        spec: route.spec,
        quantity: largo,
        unit: "m",
      });
  }
  for (const fila of tubo.values()) fila.quantity = Math.round(fila.quantity * 100) / 100;

  const accesorios = new Map<string, CadPipeMtoRow>();
  for (const fitting of cadPipeFittings(todas)) {
    if (line !== null && fitting.line !== line) continue;
    const etiqueta = cadPipeFittingLabel(fitting);
    const clave = `${etiqueta}|${fitting.spec}`;
    const fila = accesorios.get(clave);
    if (fila) fila.quantity += 1;
    else
      accesorios.set(clave, {
        kind: fitting.kind,
        description: etiqueta,
        size: fitting.size,
        spec: fitting.spec,
        quantity: 1,
        unit: "pz",
      });
  }

  const orden = { tubo: 0, codo: 1, te: 2, reduccion: 3 } as const;
  const rows = [...tubo.values(), ...accesorios.values()].sort(
    (a, b) => orden[a.kind] - orden[b.kind] || a.description.localeCompare(b.description),
  );
  return {
    line,
    rows,
    totalMetres:
      Math.round([...tubo.values()].reduce((total, fila) => total + fila.quantity, 0) * 100) / 100,
  };
}

export const CAD_PL_MTO_HEADERS = [
  "Descripción",
  "Diámetro",
  "Especificación",
  "Cantidad",
  "Unidad",
] as const;

/**
 * El cuadro como TABLE del documento: se traza en la lámina y viaja al DXF.
 *
 * `scale` existe porque este mismo cuadro se coloca junto a un isométrico, y un
 * isométrico se dibuja a tamaño de MODELO: un renglón de 220 unidades junto a
 * una tubería de 20 m es una raya. Escalar la tabla al colocarla la deja
 * legible sin tocar el cuadro de los demás listados, que se colocan sobre
 * dibujos de otro tamaño.
 */
export function buildCadPipeMtoTable(
  mto: CadPipeMto,
  insertion: CadPoint2,
  layer: string,
  newEntityId: () => string,
  scale = 1,
): CadTableEntity {
  const rows = mto.rows.map((fila) => [
    fila.description,
    fila.size,
    fila.spec,
    fila.unit === "m" ? fila.quantity.toFixed(2) : String(fila.quantity),
    fila.unit,
  ]);
  const table = scheduleTable(
    `Lista de materiales${mto.line ? ` — ${mto.line}` : ""}. ${CAD_PL_MTO_LIMITS}`,
    CAD_PL_MTO_HEADERS,
    rows.length > 0 ? rows : [["(sin rutas 3D)", "—", "—", "0", "—"]],
    insertion,
    layer,
    newEntityId,
  );
  if (scale === 1) return table;
  return {
    ...table,
    rowHeights: table.rowHeights.map((height) => height * scale),
    columnWidths: table.columnWidths.map((width) => width * scale),
    cells: table.cells.map((cell) =>
      cell.textHeight === undefined ? cell : { ...cell, textHeight: cell.textHeight * scale },
    ),
  };
}

/** Alto que ocupará el cuadro, para colocar lo que va debajo sin pisarlo. */
export const cadPipeMtoTableSize = (
  mto: CadPipeMto,
  scale = 1,
): { width: number; height: number } => ({
  width: CAD_PL_MTO_HEADERS.length * 1_400 * scale,
  height: (Math.max(1, mto.rows.length) + 2) * 220 * scale,
});
