/**
 * EL RESPALDO DEL REGISTRO PARA LA LÁMINA — y por qué existe.
 *
 * `renderEntity()` de `paper-space.ts` es una escalera de ramas por tipo escrita
 * cuando el documento iba por el esquema 3, y nunca creció. Todo lo que esa
 * escalera no supiera dibujar se devolvía como `[]`: la entidad desaparecía de
 * la lámina, del PDF y del paquete de entrega, en silencio y sin una
 * advertencia.
 *
 * Y lo que no sabía dibujar no era un caso raro: era TODO lo que llegó después
 * de escribirse. El compilador lo dice sin lugar a dudas —en el final de la
 * escalera el tipo estrechado era
 * `CadSchema4Entity | CadSchema5Entity | CadWallEntity | CadOpeningEntity`—, es
 * decir POINT, XLINE, RAY, SOLID, WIPEOUT, IMAGE, ATTDEF, TABLE, SOLID3D,
 * REGION, WALL y OPENING. Doce tipos, incluidas las dos entidades BIM que son
 * la bandera del producto.
 *
 * Se descubrió fotografiando la lámina para la portada: el sombreado del baño,
 * los tres rótulos y las tres cotas salían impresos, y la casa no.
 *
 * El registro de entidades ya sabe pintar todo eso: es la MISMA fuente que usa
 * el visor y la que usa la exportación a DXF. Así que en vez de añadir doce
 * ramas —que es exactamente lo que garantizó este agujero— la escalera termina
 * preguntando al registro, que crece solo cada vez que alguien da de alta un
 * adaptador.
 *
 * Vive en su propio módulo y no dentro de `paper-space.ts` porque ese archivo
 * tiene presupuesto propio en `scripts/cad/monolith-budget.json` y sólo puede
 * encoger: lo que se añade se extrae.
 */
import { CAD_ENTITY_REGISTRY } from "./entity-runtime";
import type { CadDocument, CadEntity, CadPoint2 } from "./cad-document";

/** Segmentos por curva al teselar para la lámina. El mismo número que el visor. */
const PLOT_SEGMENTS = 96;

/** Advertencia de publicación, en la forma que ya usa `paper-space.ts`. */
export interface CadPlotFallbackWarning {
  code: "entity_not_plottable";
  sheetId: string;
  viewportId: string;
  entityId: string;
  detail: string;
}

export interface CadPlotFallbackResult<TCommand> {
  commands: TCommand[];
  warning: CadPlotFallbackWarning | null;
}

/**
 * Traza por el registro lo que la escalera de ramas no supo trazar.
 *
 * `toCommand` es el mismo constructor de trazo que usa el resto de
 * `renderEntity` —con su matriz, su estilo y su capa ya resueltos—, así que
 * este módulo no duplica ni una decisión de presentación: sólo aporta los
 * PUNTOS que faltaban.
 *
 * Devuelve la advertencia en vez de empujarla: quien llama es el dueño de la
 * lista de advertencias de la publicación, y una función que escribe en una
 * lista ajena no se puede probar sin montarla entera.
 */
export function plotEntityFromRegistry<TCommand>(
  entity: CadEntity,
  document: CadDocument,
  where: { sheetId: string; viewportId: string },
  toCommand: (points: CadPoint2[], closed: boolean) => TCommand | null,
): CadPlotFallbackResult<TCommand> {
  // El id y el tipo se leen ANTES del guardia: `supports()` estrecha la unión y
  // después de él el compilador ya no deja mirar la entidad que quedó fuera,
  // que es justo la que hay que nombrar en la advertencia.
  const { id, type } = entity;
  if (CAD_ENTITY_REGISTRY.supports(entity)) {
    const paths = CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(
      entity,
      PLOT_SEGMENTS,
      document,
    );
    return {
      commands: paths
        .map((each) => toCommand(each.points, each.closed))
        .filter((value): value is TCommand => !!value),
      warning: null,
    };
  }
  /*
   * Lo que NADIE sabe pintar se DENUNCIA. Una entidad que desaparece de la
   * lámina sin dejar rastro es la peor forma de perder trabajo: el plano sale,
   * se entrega, y el error se descubre en obra. Hoy el registro cubre la unión
   * entera y esta rama no se alcanza —el compilador lo demuestra—, pero el día
   * que alguien estrene un tipo sin adaptador, el plano lo dirá en vez de
   * callárselo.
   */
  return {
    commands: [],
    warning: {
      code: "entity_not_plottable",
      sheetId: where.sheetId,
      viewportId: where.viewportId,
      entityId: id,
      detail: `No hay forma de trazar una entidad «${type}»; queda fuera de la lámina.`,
    },
  };
}
