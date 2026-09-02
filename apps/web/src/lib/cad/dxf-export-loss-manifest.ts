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
import { wallFootprint } from "./wall-geometry";

/**
 * Lo MÍNIMO del documento que la exportación DXF necesita leer.
 *
 * Nació al cablear `DXFOUT`: un comando del motor no recibe el `CadDocument`
 * entero —su vista es un `Pick` deliberado, porque historia, colaboración y
 * publicaciones no son asunto de un comando— y exigir el documento completo
 * habría obligado a un `as` que finge tener sesiones que no tiene. Nombrar lo
 * que de verdad se lee es más honesto y no cuesta nada: un `CadDocument`
 * satisface este tipo sin conversión, así que ningún llamador anterior cambia.
 */
export type CadDxfExportSource = Pick<CadDocument, "entities" | "blocks"> &
  Partial<Pick<CadDocument, "imageDefinitions" | "unsupportedEntities">>;

/** Tipos con su PROPIO camino de exportación, fuera de las primitivas. */
const DXF_NON_PRIMITIVE_TYPES = new Set([
  "hatch",
  // TEXT y MTEXT viajan por su propio escritor (`pushText` / `pushMText`), no
  // como primitiva geométrica: preguntarle a `cadEntityToDxfPrimitive` por
  // ellos devuelve `null` y eso NO significa que se caigan del fichero. TEXT
  // se añade a esta lista en la campaña de lanzamiento, al mismo tiempo que
  // `cadDocumentNativeDxfTexts` lo empieza a escribir de verdad; antes el
  // manifiesto acertaba al declararlo perdido.
  "text",
  "mtext",
  "dimension",
  "mleader",
  "insert",
]);

/**
 * Reglas de fidelidad DECLARADAS por tipo. Nacieron con el esquema 4 y el
 * esquema 6 añade la suya (WALL); el nombre de la tabla conserva su origen.
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
  document: CadDxfExportSource,
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
  /**
   * WALL (esquema 6): la geometría VIAJA —el contorno en planta sale como
   * polilínea cerrada— pero la RECETA no. El DXF plano no tiene entidad de
   * muro, así que eje, grosor-como-parámetro y altura dejan de ser editables
   * al reimportar: vuelve un contorno de cuatro vértices, no un muro.
   */
  wall: (entity) => {
    if (entity.type !== "wall") return null;
    // Una receta degenerada no produce contorno: la entidad entera se cae del
    // fichero y eso es pérdida de geometría, no degradación — sube a `error`,
    // igual que la IMAGE sin definición.
    if (wallFootprint(entity) === null)
      return {
        code: "dxf_export_entity_dropped",
        severity: "error",
        detail:
          "WALL — la receta del muro es degenerada (eje nulo o grosor no positivo) y no produce " +
          "contorno: el muro NO estará en el fichero. Conserva el documento canónico como original.",
      };
    return {
      code: "dxf_export_wall_parametric_degraded",
      severity: "warning",
      detail:
        "WALL — el muro se exporta como su CONTORNO en planta (polilínea cerrada), no como muro " +
        "paramétrico: el DXF plano no tiene entidad de muro, así que el eje, el grosor editable " +
        `(${entity.thickness}) y la altura (${entity.height}) no viajan` +
        (entity.material ? ` (tampoco el material "${entity.material}")` : "") +
        ". Al reimportar volverá como polilínea. Conserva el documento canónico como original.",
    };
  },
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
/**
 * Tipos cuya cota VIAJA al fichero desde la Ola C (2026-09-02): la LINE y la
 * SPLINE con sus puntos WCS (30/31), el círculo, el arco y la elipse con la z
 * de su centro. Para ellos una z distinta de cero ya no es una pérdida.
 */
const Z_TRAVELS = new Set<CadEntity["type"]>(["line", "circle", "arc", "ellipse", "spline"]);

function entityElevations(entity: CadEntity): number[] {
  if (Z_TRAVELS.has(entity.type)) return [];
  if (entity.type === "polyline") {
    // Una polilínea plana (aunque elevada) viaja con su elevación, y una
    // alabeada pero RECTA viaja como polilínea 3D. Sólo pierde la cota la que
    // combina arcos con vértices a cotas distintas: el formato no tiene
    // polilínea 3D con bulge, y el escritor la aplana a la cota del primero.
    const zs = entity.vertices.map((vertex) => vertex.z ?? 0);
    const varies = zs.some((z) => Math.abs(z - zs[0]) > 1e-9);
    const bulged = entity.vertices.some((vertex) => typeof vertex.bulge === "number" && vertex.bulge !== 0);
    return varies && bulged ? zs.filter((z) => z !== zs[0]) : [];
  }
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
  document: CadDxfExportSource,
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
        detail:
          entity.type === "polyline"
            ? `La cota Z (${elevations[0]}) se perderá al exportar a DXF: el formato no tiene polilínea 3D con arcos, así que los vértices se escriben a la cota del primero. Si la cota importa, no uses este DXF como original.`
            : `La elevación Z (${elevations[0]}) se aplanará a 0 al exportar a DXF: esta entidad se escribe sobre el plano del suelo. Si la cota importa, no uses este DXF como original.`,
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
