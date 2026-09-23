"use client";

/**
 * Contenedor de la paleta de propiedades.
 *
 * Separa dos responsabilidades que el monolito tenía pegadas: LEER el
 * documento (registro de adaptadores, bounds, grips) y PINTAR la tabla. La
 * paleta de abajo es presentacional y no importa nada de `lib/cad`; este
 * contenedor sí, y es el único sitio donde ocurre.
 *
 * ## La memoización es el punto, no un detalle
 *
 * El editor renderiza en cada movimiento del puntero sobre el lienzo. Leer las
 * propiedades de la designación, sus bounds y sus grips en cada uno de esos
 * renders es trabajo tirado: el resultado sólo cambia cuando cambia el
 * documento. De ahí el comparador a medida: `nativeSelectedEntities` se
 * reconstruye en cada render del monolito —es un `map().filter()`— pero sus
 * ELEMENTOS son los mismos objetos mientras no haya una transacción, así que
 * comparar elemento a elemento corta el render en seco. Un `React.memo` por
 * defecto no lo haría: compararía las dos arrays por identidad y siempre
 * decidiría que son distintas.
 */
import React from "react";
import {
  CAD_ENTITY_REGISTRY,
  type CadNativeEntity,
} from "@/lib/cad/entity-runtime";
import type { CadDocument } from "@/lib/cad/cad-document";
import { cadEntityLabel } from "@/lib/cad/entity-labels";
import { CadPropertiesPalette } from "./CadPropertiesPalette";
import {
  buildCadPropertyModel,
  type CadPropertyRow,
  type CadPropertyValue,
} from "./property-model";
import { cadEntityArea } from "@/lib/cad/inquiry/contours";
import { formatCadHumanArea, formatCadHumanLength } from "@/lib/cad/inquiry/human-units";

export interface CadEntityPropertiesPanelProps {
  /** Designación nativa, en orden de designación. */
  entities: readonly CadNativeEntity[];
  /** Documento vivo; hace falta para los bounds de un INSERT o un HATCH. */
  document: CadDocument | null;
  /** Se incrementa en cada transacción canónica; refresca los `defaultValue`. */
  revision: number;
  readOnly?: boolean;
  /**
   * Aplica un valor a todas las entidades de la fila. Quien lo implementa debe
   * emitir UN lote de `CadEntityCommand` para que sea UN paso de deshacer.
   */
  onEdit: (row: CadPropertyRow, value: CadPropertyValue) => void;
}

function sameEntities(
  left: readonly CadNativeEntity[],
  right: readonly CadNativeEntity[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1)
    if (left[index] !== right[index]) return false;
  return true;
}

function propsEqual(
  previous: CadEntityPropertiesPanelProps,
  next: CadEntityPropertiesPanelProps,
): boolean {
  return (
    previous.revision === next.revision &&
    previous.readOnly === next.readOnly &&
    previous.onEdit === next.onEdit &&
    previous.document === next.document &&
    sameEntities(previous.entities, next.entities)
  );
}

export const CadEntityPropertiesPanel = React.memo(
  function CadEntityPropertiesPanel({
    entities,
    document,
    revision,
    readOnly = false,
    onEdit,
  }: CadEntityPropertiesPanelProps) {
    const model = buildCadPropertyModel(
      entities.map((entity) => ({
        id: entity.id,
        type: entity.type,
        properties: CAD_ENTITY_REGISTRY.adapter(entity).properties.read(entity),
      })),
    );

    // El resumen —id, capa, tamaño, grips— sólo tiene sentido con un objeto:
    // con varios, la cabecera de la paleta cuenta cuántos y de qué tipos.
    const only = entities.length === 1 ? entities[0] : null;
    let summary: React.ComponentProps<typeof CadPropertiesPalette>["summary"];
    if (only) {
      const adapter = CAD_ENTITY_REGISTRY.adapter(only);
      const bounds = adapter.bounds.bounds(only, document ?? undefined);
      const grips = adapter.grips.grips(only);
      // EL NÚMERO QUE LA GENTE VIENE A BUSCAR. Se dibuja una habitación para
      // saber cuánto mide, y hasta hoy la paleta contestaba «BOUNDS 5900 ×
      // 4000» y se callaba los 23,6 m². El área sale del mismo cálculo que el
      // comando AREA (`inquiry/contours.ts`) y se dice en lenguaje de obra
      // (`inquiry/human-units.ts`), no en unidades de dibujo.
      const medida = cadEntityArea(only, CAD_ENTITY_REGISTRY, document ?? undefined);
      const unidad = document?.meta.unit;
      summary = {
        id: only.id,
        // El nombre se calcula sobre TODAS las entidades del documento, no
        // sobre la selección: el ordinal de «Muro 3» sólo significa algo dentro
        // del plano entero. Calcularlo sobre la designación daría «Muro 1» a
        // cualquier muro seleccionado solo.
        label: cadEntityLabel(only, document?.entities ?? [only]),
        layer: only.layer,
        bounds: `${Math.round(bounds.maxX - bounds.minX)} × ${Math.round(bounds.maxY - bounds.minY)}`,
        // `assumedClosed` es la figura ABIERTA que hubo que cerrar para poder
        // medirla: el número es correcto para una figura que el usuario no
        // dibujó, así que se dice con todas las letras en vez de callarlo.
        area: medida ? formatCadHumanArea(medida.area, unidad) : undefined,
        areaAssumed: medida?.assumedClosed ?? false,
        perimeter: medida ? formatCadHumanLength(medida.perimeter, unidad) : undefined,
        gripCount: grips.length,
        gripLabels: grips.map((grip) => grip.label),
      };
    }

    return (
      <CadPropertiesPalette
        model={model}
        revision={revision}
        readOnly={readOnly}
        summary={summary}
        onEdit={onEdit}
      />
    );
  },
  propsEqual,
);
