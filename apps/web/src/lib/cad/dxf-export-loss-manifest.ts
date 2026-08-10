/**
 * Manifiesto de pérdidas de la exportación DXF: qué se degrada, qué se
 * descarta y POR QUÉ, calculado ANTES de escribir una sola línea del fichero.
 *
 * El problema real nunca fue que el soporte DXF sea parcial —eso es legítimo y
 * está declarado—: es que las pérdidas fueran SILENCIOSAS. Un dibujante que
 * pone una directriz de construcción, un enmascaramiento y una imagen de fondo,
 * exporta y manda el fichero al cliente, tiene derecho a enterarse de que
 * llegan tres cosas menos ANTES de mandarlo, no después.
 *
 * Sale de `dxf-cad-document.ts` porque ese archivo está en su asignación exacta
 * del trinquete y porque el manifiesto es una pieza coherente por su cuenta: no
 * ensambla el modelo de exportación, lo AUDITA. Depende de
 * `dxf-entity-primitives.ts`, que es una hoja del grafo de carga, así que no
 * cierra ningún ciclo de importación.
 *
 * ## Regla de oro de este módulo
 *
 * Todo lo que el fichero no va a contener aparece aquí con su entidad, su tipo
 * de origen, su severidad y una frase que dice qué se pierde exactamente. Una
 * entidad que el exportador ignora sin más línea en el manifiesto es un fallo
 * del producto, no una limitación conocida.
 *
 * Módulo puro: sin THREE, sin DOM, sin estado.
 */
import type {
  CadDocument,
  CadEntity,
  CadLossManifestEntry,
  CadPoint3,
} from "./cad-document";
import { cadEntityToDxfPrimitive } from "./dxf-entity-primitives";

/** Tipos con su PROPIO camino de exportación, fuera de las primitivas. */
const DXF_NON_PRIMITIVE_TYPES = new Set([
  "hatch",
  "mtext",
  "dimension",
  "mleader",
  "insert",
]);

/**
 * Reglas de fidelidad de los tipos del esquema 4.
 *
 * Los ocho se escriben ya con su código DXF real, así que lo que queda aquí no
 * es "qué falta por implementar" sino qué NO SABE GUARDAR EL FORMATO aunque la
 * entidad viaje: el estilo de punto, que en DXF es del dibujo y no del punto;
 * los píxeles de una imagen, que el fichero nunca lleva dentro; el marco de un
 * enmascaramiento, que también es global.
 *
 * Un tipo sin entrada en esta tabla y sin primitiva se sigue reportando por la
 * vía genérica: el manifiesto no se queda mudo por un olvido en la tabla.
 *
 * `scoped` son las entidades que REALMENTE se van a exportar, no todas las del
 * documento: las variables globales del fichero ($PDMODE, el marco de los
 * enmascaramientos) las decide lo que viaja, así que un enmascaramiento en una
 * capa oculta no puede provocar un aviso de "mezcla de marcos" sobre un fichero
 * en el que no está.
 *
 * `null` = ninguna pérdida que declarar para ESTA entidad concreta.
 */
type Schema4LossRule = (
  entity: CadEntity,
  document: CadDocument,
  scoped: readonly CadEntity[],
) => Pick<CadLossManifestEntry, "code" | "severity" | "detail"> | null;

const SCHEMA4_LOSS_RULES: Record<string, Schema4LossRule> = {
  /**
   * TABLE se degrada a geometría A PROPÓSITO. El porqué —una ACAD_TABLE sin su
   * TABLESTYLE no la dibuja casi nadie— está en `dxf-schema4-table.ts`; aquí lo
   * que importa es que la decisión no se toma en silencio.
   */
  table: () => ({
    code: "dxf_export_table_degraded",
    severity: "warning",
    detail:
      "TABLE — la tabla se exporta como GEOMETRÍA (rejilla y textos), no como ACAD_TABLE editable: " +
      "una ACAD_TABLE fiel exige además su TABLESTYLE y el formato por celda, y sin ellos la mayoría " +
      "de los visores no dibujarían nada. Al reimportar volverá como líneas y textos sueltos.",
  }),
  /**
   * POINT: en DXF el estilo de marca es una variable del DIBUJO ($PDMODE y
   * $PDSIZE), no del punto. El documento canónico lo guarda por entidad, que es
   * estrictamente más expresivo — así que la pérdida sólo EXISTE si los puntos
   * no comparten estilo, y sólo entonces se declara.
   */
  point: (entity, _document, scoped) => {
    if (entity.type !== "point") return null;
    const styles = new Set<number>();
    const sizes = new Set<number>();
    for (const candidate of scoped) {
      if (candidate.type !== "point") continue;
      styles.add(candidate.style ?? 0);
      sizes.add(candidate.size ?? 0);
    }
    if (styles.size <= 1 && sizes.size <= 1) return null;
    return {
      code: "dxf_export_point_style_global",
      severity: "info",
      detail:
        "POINT — el estilo de marca es una variable global del DXF ($PDMODE/$PDSIZE) y el documento usa " +
        `${styles.size} estilo(s) y ${sizes.size} tamaño(s) distintos: todos los POINT del fichero saldrán ` +
        "con el estilo mayoritario.",
    };
  },
  /**
   * IMAGE: el DXF guarda la RUTA, nunca los píxeles. Y si la definición no
   * existe en el documento, no hay IMAGEDEF que escribir y la inserción se cae
   * del fichero: eso ya es una pérdida de geometría, no una degradación.
   */
  image: (entity, document) => {
    if (entity.type !== "image") return null;
    const definition = (document.imageDefinitions ?? []).find(
      (candidate) => candidate.id === entity.definition,
    );
    // Sin definición no hay IMAGEDEF y la inserción se cae del fichero: eso ya
    // es pérdida de geometría, no una degradación, y sube a `error`.
    if (!definition)
      return {
        code: "dxf_export_image_definition_missing",
        severity: "error",
        detail:
          `IMAGE — la inserción referencia la definición «${entity.definition}», que no existe en el ` +
          "documento: sin IMAGEDEF que escribir, la imagen NO estará en el fichero.",
      };
    return {
      code: "dxf_export_image_reference_only",
      severity: "warning",
      detail:
        `IMAGE — el DXF sólo guarda la RUTA de la imagen («${definition.uri}»), nunca sus píxeles: quien ` +
        "abra el fichero verá el marco vacío si no tiene acceso al mismo archivo.",
    };
  },
  /**
   * WIPEOUT: el marco es una variable del FICHERO (`ACAD_WIPEOUT_VARS`), no de
   * cada enmascaramiento. Mientras todos coincidan no se pierde nada.
   */
  wipeout: (entity, _document, scoped) => {
    if (entity.type !== "wipeout") return null;
    const frames = new Set(
      scoped
        .filter((candidate) => candidate.type === "wipeout")
        .map((candidate) => candidate.frame === true),
    );
    if (frames.size <= 1) return null;
    return {
      code: "dxf_export_wipeout_frame_global",
      severity: "info",
      detail:
        "WIPEOUT — el marco es una variable global del DXF (ACAD_WIPEOUT_VARS) y este documento mezcla " +
        "enmascaramientos con marco y sin él: en el fichero todos saldrán con marco.",
    };
  },
};

/** ¿Alguna coordenada de la entidad vive fuera del plano Z=0? */
function entityElevations(entity: CadEntity): number[] {
  const points: (CadPoint3 | undefined)[] = [];
  const candidate = entity as unknown as Record<string, CadPoint3 | undefined>;
  // `basePoint` es de XLINE/RAY; el resto ya existían antes del esquema 4.
  for (const key of ["start", "end", "center", "insertion", "position", "basePoint"]) {
    points.push(candidate[key]);
  }
  // `vertices` (polilínea), `controlPoints` (spline), `points` (SOLID) y
  // `boundary` (WIPEOUT) son los cuatro arrays de geometría del documento.
  for (const key of ["vertices", "controlPoints", "points", "boundary"]) {
    const list = (entity as unknown as Record<string, CadPoint3[] | undefined>)[key];
    if (Array.isArray(list)) points.push(...list);
  }
  return points
    .map((point) => point?.z)
    .filter((z): z is number => typeof z === "number" && Number.isFinite(z) && z !== 0);
}

/**
 * Enumera lo que la exportación DXF va a degradar o descartar, ANTES de
 * escribir el fichero.
 *
 * Esta función es ADITIVA: no cambia el contrato de exportación — permite
 * mostrar al usuario qué se va a perder con entidad, campo, severidad y
 * recomendación.
 *
 * NO cubre todavía OCS/extrusion ni widths, que no existen en el modelo
 * canónico actual: cuando se añadan, deben registrarse aquí.
 */
export function cadDocumentDxfExportLosses(
  document: CadDocument,
  filter?: (entity: CadEntity) => boolean,
): CadLossManifestEntry[] {
  const losses: CadLossManifestEntry[] = [];
  // El informe debe usar EL MISMO filtro que la exportación (ámbito de
  // selección, capas ocultas): avisar de pérdidas en entidades que no se van a
  // exportar sería ruido y erosionaría la confianza en el aviso.
  const scoped = document.entities.filter((candidate) =>
    filter ? filter(candidate) : true,
  );
  for (const entity of scoped) {
    // 1. Fidelidad declarada de los tipos del esquema 4. Va ANTES del descarte
    //    genérico porque una regla concreta dice QUÉ se pierde, y "no tiene
    //    representación" no dice nada que el usuario pueda accionar.
    const declared = SCHEMA4_LOSS_RULES[entity.type]?.(entity, document, scoped) ?? null;
    if (declared)
      losses.push({
        ...declared,
        entityId: entity.id,
        sourceType: entity.type,
      });
    // Si la entidad entera se queda fuera, detallar además que su Z se aplana
    // sería ruido: no hay fichero donde aplanarla.
    if (declared?.severity === "error") continue;

    // 2. Entidades que no se escriben en absoluto.
    if (
      !declared &&
      !DXF_NON_PRIMITIVE_TYPES.has(entity.type) &&
      cadEntityToDxfPrimitive(entity, document) === null
    ) {
      losses.push({
        code: "dxf_export_entity_dropped",
        entityId: entity.id,
        sourceType: entity.type,
        severity: "error",
        detail: `La entidad ${entity.type} no tiene representación en la exportación DXF y se omitirá del fichero. Conserva el documento canónico como original.`,
      });
      continue;
    }

    // 3. Elevación: las primitivas DXF de este exportador son 2D.
    const elevations = entityElevations(entity);
    if (elevations.length > 0) {
      losses.push({
        code: "dxf_export_z_flattened",
        entityId: entity.id,
        sourceType: entity.type,
        severity: "warning",
        detail: `La elevación Z (${elevations[0]}) se aplanará a 0 al exportar a DXF. Si la cota importa, no uses este DXF como original.`,
      });
    }

    // 4. Splines racionales: se exportan grado y knots, pero no los pesos, así
    //    que una NURBS racional sale como no racional y la curva cambia.
    if (entity.type === "spline") {
      const weights = (entity as unknown as { weights?: number[] }).weights;
      if (Array.isArray(weights) && weights.some((weight) => weight !== 1)) {
        losses.push({
          code: "dxf_export_spline_weights_dropped",
          entityId: entity.id,
          sourceType: "spline",
          severity: "warning",
          detail:
            "Los pesos de la spline racional no se exportan: la curva resultante será una spline NO racional y su forma cambiará.",
        });
      }
    }
  }

  // 5. Entidades OPACAS: lo que se conservó de un DXF ajeno al importarlo y que
  //    esta exportación NO reescribe. Es la pérdida más traicionera de todas
  //    —el usuario cree que están porque las importó— y hasta ahora no la
  //    declaraba nadie. No pasa por `filter`: una entidad opaca no es
  //    seleccionable, así que ningún ámbito de selección la incluiría jamás.
  // `?? []`: la sección es obligatoria en un documento canónico, pero esta
  // función también se llama sobre documentos parciales de prueba y un
  // manifiesto que revienta no informa de nada.
  for (const opaque of document.unsupportedEntities ?? []) {
    losses.push({
      code: "dxf_export_opaque_entity_dropped",
      entityId: opaque.id,
      sourceType: opaque.sourceType,
      severity: "error",
      detail:
        `La entidad ${opaque.sourceType} llegó de un fichero ajeno y se conserva sin interpretar: la ` +
        "exportación no la reescribe, así que NO estará en el DXF resultante. Conserva el fichero original.",
    });
  }

  return losses;
}
