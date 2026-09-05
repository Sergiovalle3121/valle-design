/**
 * LAS CORRIDAS MEP LEÍDAS DEL DIBUJO, en un solo lector (Ola G, 2026-09-04).
 *
 * ## Por qué un lector y no dos
 *
 * Antes de esta ola, quien quería saber qué instalaciones había dibujadas
 * recorría las entidades a mano dentro de `mep-schedule.ts` — y sólo el cuadro
 * lo hacía, porque era el único que preguntaba. En cuanto una segunda cosa
 * necesita la misma respuesta —la detección de choques, que hasta ahora sólo
 * veía la tubería de proceso— hay dos maneras de contestarla, y la que se
 * queda sin arreglar es siempre la copia.
 *
 * Aquí está la ÚNICA: qué es una corrida MEP (una LINE o una POLYLINE en la
 * capa de un servicio, con su receta en `context.metadata` cuando la orden la
 * dejó), qué NO lo es (el contorno a doble línea de un ducto, que mide el
 * perímetro y no el tramo) y con qué cota (un vértice sin `z` es suelo).
 *
 * ## Y el mismo análisis de choques que la planta de proceso
 *
 * `cadMepRunsAsRoutes` viste esas corridas con la forma de `CadPipeRoute` para
 * que `plant/clash.ts` las mida con el análisis que ya existe: muros con su
 * altura y sus vanos restados, sólidos por su envolvente, y las demás
 * conducciones. La pregunta de un proyectista de instalaciones —«¿esta bajante
 * atraviesa la trabe?»— es exactamente la misma que la de un tubero, y tener
 * la respuesta a medio metro, en las órdenes PID, es tenerla en el sitio
 * equivocado.
 *
 * Dos cosas que el informe no cabe y hay que decir aquí:
 *
 *  · El ducto y la charola se miden como un CILINDRO DE SU ANCHO. El canto no
 *    lo guarda el dibujo —la orden traza el contorno en planta y su eje, no una
 *    sección—, así que la holgura por arriba y por abajo es la del ancho. Es
 *    conservadora en el eje horizontal y optimista en el vertical, y se dice.
 *  · Una corrida SIN TAMAÑO —una LINE trazada a mano en una capa de servicio—
 *    no tiene con qué medirse. Entra igual en la lista, con el tamaño vacío,
 *    para que el informe la declare «sin medir» con su motivo en vez de
 *    callarla: una holgura que no se pudo calcular no es una holgura que sobre.
 */
import type { CadEntity, CadPoint3 } from "./cad-document";
import type { CadCommandDocumentView } from "./engine/command-types";
import { cadMillimetresPerUnit } from "./engine/commands/architecture-support";
import { cadMepServiceFor, type CadMepKind, type CadMepService } from "./engine/commands/mep-support";
import type { CadPipeRoute } from "./plant/pipe-route";

/**
 * Lo que hace falta para leer las corridas: las entidades y, si se tienen, las
 * capas —para resolver el nombre de la capa cuando la entidad guarda su id—.
 * Sin la tabla de capas se lee igual, con el id como nombre, porque un análisis
 * que exige el documento entero no se puede llamar desde una orden a medio
 * terminar, y ahí es justo donde hace falta.
 */
export interface CadMepRunView {
  entities: readonly CadEntity[];
  layers?: CadCommandDocumentView["layers"];
}

export interface CadMepRun {
  entityId: string;
  service: CadMepService;
  kind: CadMepKind;
  /** Diámetro nominal en mm (tubería) o ancho en unidades del documento; `null` si nadie lo dijo. */
  size: number | null;
  /** El eje con su cota, en unidades de dibujo. Un vértice sin `z` es suelo. */
  points: CadPoint3[];
  /** Nombre de la capa tal como se rotula. */
  layer: string;
}

const z = (point: { z?: number }): number =>
  typeof point.z === "number" && Number.isFinite(point.z) ? point.z : 0;

const espacial = (point: { x: number; y: number; z?: number }): CadPoint3 => ({
  x: point.x,
  y: point.y,
  z: z(point),
});

function pathOf(entity: CadEntity): CadPoint3[] | null {
  if (entity.type === "line") return [espacial(entity.start), espacial(entity.end)];
  if (entity.type === "polyline") return entity.vertices.map(espacial);
  return null;
}

function layerNameOf(view: CadMepRunView, layerId: string): string {
  return view.layers?.find((layer) => layer.id === layerId || layer.name === layerId)?.name ?? layerId;
}

/**
 * Las corridas MEP del dibujo: tubería, ducto y charola, con su servicio, su
 * tamaño cuando lo hay y su eje con la cota puesta.
 *
 * El servicio sale de `context.metadata` si la orden lo dejó y, si no, de la
 * capa: una tubería que alguien trazó con LINE en IH-AF cuenta como agua fría,
 * porque el dibujo dice lo que dice y no lo que se teclearía hoy.
 */
export function cadMepRunsOf(view: CadMepRunView): CadMepRun[] {
  const runs: CadMepRun[] = [];
  for (const entity of view.entities) {
    const path = pathOf(entity);
    if (!path) continue;
    const metadata = entity.context?.metadata ?? {};
    // El contorno a doble línea mide el PERÍMETRO del ducto, no su recorrido:
    // contarlo doblaría los metros y, en el informe de choques, acusaría al
    // ducto de chocar contra su propia pared.
    if (metadata.outline === true) continue;
    const service =
      cadMepServiceFor(typeof metadata.service === "string" ? metadata.service : undefined) ??
      cadMepServiceFor(layerNameOf(view, entity.layer));
    if (!service) continue;
    runs.push({
      entityId: entity.id,
      service,
      kind: service.kind,
      size: typeof metadata.size === "number" ? metadata.size : null,
      points: path,
      layer: layerNameOf(view, entity.layer),
    });
  }
  return runs;
}

/** Cómo se nombra una corrida en un renglón de choque: sin número de línea, con lo que sí tiene. */
export function cadMepRunLabel(run: CadMepRun, unit: string | undefined): string {
  if (run.size === null) return `${run.service.label} en ${run.service.layer}`;
  const mm = run.kind === "pipe" ? run.size : run.size * cadMillimetresPerUnit(unit);
  const medida = Math.round(mm * 10) / 10;
  return run.kind === "pipe"
    ? `${run.service.label} Ø${medida} mm en ${run.service.layer}`
    : `${run.service.label} de ${medida} mm en ${run.service.layer}`;
}

/**
 * Las corridas MEP con la forma de una ruta de tubería, para que las mida el
 * mismo análisis de choques.
 *
 * `nominalMm` viaja ya resuelto porque una corrida MEP no rotula su diámetro en
 * pulgadas —la tubería lo lleva en milímetros y el ducto lleva un ancho— y
 * `cadPipeNominalMillimetres`, que lee pulgadas, devolvería `null` para las
 * dos. `number` y `spec` son de una línea de proceso; una corrida MEP no las
 * tiene, el análisis de choques no las mira, y rellenarlas con algo verosímil
 * sería inventárselas.
 */
export function cadMepRunsAsRoutes(view: CadMepRunView, unit: string | undefined): CadPipeRoute[] {
  const porUnidad = cadMillimetresPerUnit(unit);
  return cadMepRunsOf(view).map((run) => ({
    entityId: run.entityId,
    line: cadMepRunLabel(run, unit),
    // Sin tamaño no hay radio; el informe lo declara «sin medir» con su motivo.
    size: "",
    service: run.service.id,
    number: 0,
    spec: "",
    points: run.points,
    ...(run.size === null
      ? {}
      : { nominalMm: run.kind === "pipe" ? run.size : run.size * porUnidad }),
  }));
}
