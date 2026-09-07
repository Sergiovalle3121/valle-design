/**
 * LA LISTA DE LÍNEAS Y EL METRADO DE TUBERÍA, COMO TABLA DEL DIBUJO (T-35).
 *
 * ## El mismo defecto que H1, en la mitad que nadie miró
 *
 * `DATAEXTRACTION` ya saca a la lámina el cuadro de superficies, el de
 * carpintería, el de instalaciones (MEP) y el de cargas (Electrical) — los
 * cuatro como `TABLE` del documento, así que se trazan, se publican y viajan
 * al DXF por el mismo camino que cualquier otro cuadro. Planta era la única
 * de las tres disciplinas sin cuadro en el plano: `PIDLIST` y `PIDMTO` son
 * `kind: "inquiry"` — escriben un renglón en la línea de órdenes y se lo
 * lleva el viento en cuanto se teclea la orden siguiente. Un despacho que
 * necesita ENTREGAR la lista de líneas la copiaba a mano de la pantalla.
 *
 * Este módulo no cambia `PIDLIST` ni `PIDMTO`: son consultas y siguen
 * siéndolo. Lo que hace es la MISMA lectura (`cadPlantLinesOf`,
 * `cadPlantRunLength`, `cadPipeMto`) servida como `TABLE`, exactamente como
 * `circuit-schedule-table.ts` sirve lo que `AECHECK` ya calculaba.
 */
import type { CadDocument, CadPoint2 } from "../cad-document";
import type { CadNativeEntity } from "../entity-runtime";
import { cadPlantLinesOf, cadPlantRunLength } from "../plant/line-numbers";
import type { CadPipeMto } from "../plant/pipe-mto";
import { scheduleTable } from "./data-extraction";

type CadTableEntity = Extract<CadNativeEntity, { type: "table" }>;

const metresPerUnit = (unit: string | undefined): number =>
  unit === "mm" ? 1_000 : unit === "cm" ? 100 : 1;

export const PLANT_LINE_HEADERS = [
  "Línea",
  "Diámetro",
  "Servicio",
  "Especificación",
  "Longitud (m)",
] as const;

/**
 * Una fila por número de línea, con su longitud sumada desde el PLANO — el
 * dato que un P&ID de AutoCAD, al no estar a escala, no puede dar. Varios
 * tramos con el mismo número (una línea que cruza de una hoja a otra) se
 * suman en una sola fila: es el mismo criterio que `PIDLIST` ya usa en su
 * renglón (`porNumero`, `plant-line.ts`).
 */
export function buildCadPlantLineScheduleTable(
  document: Pick<CadDocument, "entities">,
  insertion: CadPoint2,
  layer: string,
  newEntityId: () => string,
  unit: string | undefined,
): CadTableEntity {
  const entities = document.entities;
  const lines = cadPlantLinesOf({ entities });
  const porNumero = new Map<string, { size: string; service: string; spec: string; length: number }>();
  for (const line of lines) {
    const entity = entities.find((candidate) => candidate.id === line.entityId);
    const largo = entity ? cadPlantRunLength(entity) : 0;
    const existente = porNumero.get(line.line);
    if (existente) existente.length += largo;
    else porNumero.set(line.line, { size: line.size, service: line.service, spec: line.spec, length: largo });
  }
  const porMetro = metresPerUnit(unit);
  const rows = [...porNumero.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([linea, datos]) => [
      linea,
      datos.size,
      datos.service,
      datos.spec,
      (datos.length / porMetro).toFixed(1),
    ]);
  return scheduleTable(
    // El límite viaja en el título, como en el cuadro de cargas: lo que NO
    // se comprueba es la especificación del cliente — la aprueba la
    // ingeniería, no este cuadro.
    "Lista de líneas: longitud medida sobre el dibujo. No se compara contra la especificación de tubería del proyecto — la aprueba la ingeniería.",
    PLANT_LINE_HEADERS,
    rows,
    insertion,
    layer,
    newEntityId,
  );
}

export const PLANT_MTO_HEADERS = ["Descripción", "Diámetro", "Especificación", "Cantidad", "Unidad"] as const;

/**
 * El metrado de tubería (`PIDMTO`) como TABLE: tubo en metros, accesorios en
 * piezas, la misma lectura que la consulta ya hace (`cadPipeMto`).
 */
export function buildCadPlantMtoScheduleTable(
  mto: CadPipeMto,
  insertion: CadPoint2,
  layer: string,
  newEntityId: () => string,
): CadTableEntity {
  const rows = mto.rows.map((row) => [
    row.description,
    row.size,
    row.spec,
    row.unit === "m" ? row.quantity.toFixed(2) : String(row.quantity),
    row.unit,
  ]);
  const title = mto.line
    ? `Metrado de tubería — línea ${mto.line}: ${mto.totalMetres.toFixed(2)} m de tubo`
    : `Metrado de tubería — todo el dibujo: ${mto.totalMetres.toFixed(2)} m de tubo`;
  return scheduleTable(title, PLANT_MTO_HEADERS, rows, insertion, layer, newEntityId);
}
