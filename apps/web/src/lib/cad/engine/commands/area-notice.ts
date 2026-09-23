/**
 * Al cerrar una figura, DECIR cuánto mide.
 *
 * ## El hueco que tapa
 *
 * La meta del encargo es literal: «alguien que nunca vio VALLECAD dibuja una
 * habitación cerrada y ve sus m² en 60 segundos o menos». Medido el 2026-09-23
 * sobre la compilación de producción: se dibuja un rectángulo de 5900 × 4000 en
 * /demo, entra en el documento, se designa solo… y su superficie no aparece en
 * ninguna parte de la pantalla. Había que abrir la paleta de propiedades —un
 * clic que nadie da en su primer minuto— y allí sólo se leía «BOUNDS 5900 ×
 * 4000», que es la caja que la contiene, no los metros cuadrados.
 *
 * ## Por qué por la línea de órdenes
 *
 * Porque es donde un CAD contesta, y porque está a la vista en los dos modos
 * —Esencial no esconde la línea de órdenes—, sin robarle sitio al dibujo ni
 * abrir nada. Es exactamente el reparto de `notice`: lo que una orden quiere
 * DECIR además de escribir, que el anfitrión registra como mensaje después de
 * aplicar el lote.
 *
 * ## Y por qué sólo si la figura está CERRADA
 *
 * `cadEntityArea` sabe medir una figura abierta cerrándola por la cuerda, y
 * devuelve `assumedClosed` para decirlo. Un área de una figura que el usuario
 * no cerró es un número correcto sobre algo que no dibujó, así que aquí no se
 * anuncia: la paleta lo dirá, con su etiqueta, para quien vaya a buscarlo.
 */
import type { CadEntity } from "../../cad-document";
import { cadEntityArea } from "../../inquiry/contours";
import { formatCadHumanArea, formatCadHumanLength } from "../../inquiry/human-units";
import { cadDrawingUnitFromInsunits } from "../../units-imperial";
import type { CadCommandContext } from "../command-types";

/** INSUNITS 4 = milímetros, que es el plano por defecto de este producto. */
const INSUNITS_POR_DEFECTO = 4;

/** La unidad de dibujo vigente, leída de INSUNITS como hace el resto del motor. */
export function cadDrawingUnitOf(context: CadCommandContext): string {
  // `variables` puede no estar: hay contextos de prueba y de guion que llaman a
  // una orden sin tabla de variables, y el resto del motor ya los contempla
  // (`draw-rectang.ts` hace lo mismo con el SCU). Sin ella manda el milímetro,
  // que es el plano por defecto del producto.
  const code = Number(context.variables?.get("INSUNITS") ?? INSUNITS_POR_DEFECTO);
  return cadDrawingUnitFromInsunits(code) ?? "mm";
}

/**
 * «Rectángulo · 23.60 m² · perímetro 19.80 m», o `undefined` si la figura no
 * encierra nada o quedó abierta.
 *
 * `nombre` es el de la figura en español y en singular («Rectángulo»,
 * «Círculo»): el mensaje lo lee quien acaba de dibujarla, no una macro.
 */
export function cadClosedShapeNotice(
  nombre: string,
  entity: CadEntity,
  context: CadCommandContext,
): string | undefined {
  const medida = cadEntityArea(entity);
  if (!medida || medida.assumedClosed || !(medida.area > 0)) return undefined;
  const unidad = cadDrawingUnitOf(context);
  return (
    `${nombre} · ${formatCadHumanArea(medida.area, unidad)} · ` +
    `perímetro ${formatCadHumanLength(medida.perimeter, unidad)}`
  );
}
