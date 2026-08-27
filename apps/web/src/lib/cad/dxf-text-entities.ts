/**
 * TEXT canónico ↔ TEXT del DXF — la traducción que faltaba.
 *
 * ─── El hueco que este módulo cierra ───────────────────────────────────────
 *
 * El importador SÍ creaba entidades `text` desde un DXF ajeno, el adaptador
 * nativo (`text-entity-adapter.ts`) las dibuja, las imanta y las gira… y el
 * exportador no las escribía. El manifiesto de pérdidas lo DECÍA —«la entidad
 * text no tiene representación en la exportación DXF»—, así que no era una
 * mentira silenciosa; pero el efecto para el arquitecto era que abrir un DXF
 * con rótulos y volver a exportarlo los perdía todos. El corpus de terceros lo
 * medía sin que nadie lo leyera: `ac1027-padded-group-codes` importaba 3
 * entidades y reexportaba 2.
 *
 * La campaña de lanzamiento lo encontró midiendo la frontera de ángulos: el
 * TEXT giraba en pantalla y no llegaba al fichero. Se cierra en vez de
 * declararse mejor, porque la traducción es directa —punto, altura, rotación,
 * estilo— y el escritor de TEXT ya existía para la ruta de anotaciones.
 *
 * ─── Por qué vive en su propio archivo ─────────────────────────────────────
 *
 * `dxf-cad-document.ts` está en `scripts/cad/monolith-budget.json` y sólo
 * puede ENCOGER. La regla no es burocracia: esos tres archivos DXF concentran
 * la mitad del riesgo del intercambio, y cada función nueva que se les añade
 * es una más que nadie va a poder extraer después. Lo nuevo nace fuera.
 */
import type { CadEntity, CadEntityContext } from "./cad-document";
import type { CadDxfExportText } from "./dxf-export";
import type { CadDxfExportSource } from "./dxf-export-loss-manifest";
import type { CadDxfPrimitive } from "./dxf-import";
import { projectedAngle, type CadDxfProjection } from "./dxf-projection";
import type { CadNativeEntity } from "./entity-runtime";

/**
 * Las entidades TEXT del documento, listas para el escritor DXF.
 *
 * Altura, rotación y estilo sólo viajan si existen: un `40 0` o un `50 0` en
 * cada rótulo horizontal ensuciaría el fichero sin decir nada.
 */
export function cadDocumentNativeDxfTexts(
  document: CadDxfExportSource,
  filter?: (entity: CadEntity) => boolean,
): CadDxfExportText[] {
  return document.entities
    .filter((entity) => entity.type === "text" && (filter ? filter(entity) : true))
    .map((entity) => {
      if (entity.type !== "text") throw new Error("Unexpected non-TEXT entity.");
      return {
        layer: entity.layer,
        position: { x: entity.x, y: entity.y },
        text: entity.text,
        ...(typeof entity.height === "number" ? { height: entity.height } : {}),
        ...(typeof entity.rotation === "number" ? { rotation: entity.rotation } : {}),
        ...(entity.style ? { style: entity.style } : {}),
      };
    });
}

/**
 * TEXT del DXF → entidad canónica.
 *
 * Altura y rotación viajan si el fichero las trae, y la rotación se compone
 * con la PROYECCIÓN por el mismo `projectedAngle` que ya usan MTEXT e INSERT,
 * no sumando ángulos a mano. Importa porque una proyección puede además
 * REFLEJAR: bajo determinante negativo el giro no se suma, se invierte, y
 * `projectedAngle` lo resuelve midiendo la imagen de un vector en vez de
 * confiar en la aritmética.
 */
export function cadDxfTextPrimitiveToEntity(
  primitive: CadDxfPrimitive,
  id: string,
  projection: CadDxfProjection,
  context: CadEntityContext | undefined,
): CadNativeEntity | null {
  const source = primitive.points[0];
  if (primitive.kind !== "text" || !source) return null;
  const insertion = projection.point(source);
  return {
    id,
    type: "text",
    x: insertion.x,
    y: insertion.y,
    text: primitive.text ?? "",
    ...(typeof primitive.textHeight === "number" && primitive.textHeight > 0
      ? { height: primitive.textHeight }
      : {}),
    ...(typeof primitive.textRotation === "number"
      ? { rotation: projectedAngle(projection, source, 1, primitive.textRotation) }
      : {}),
    layer: primitive.layer,
    context,
  } as CadNativeEntity;
}
