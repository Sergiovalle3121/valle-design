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
 * Cada entrada describe lo que la exportación NO conserva de ese tipo, ya sea
 * porque la entidad entera se queda fuera (`severity: "error"`) o porque viaja
 * degradada (`severity: "warning"`). Un tipo del esquema 4 que no tenga entrada
 * aquí y tampoco primitiva se sigue reportando por la vía genérica: el
 * manifiesto nunca se queda mudo por un olvido en esta tabla.
 *
 * Que la tabla diga hoy «se descarta» para los ocho tipos es EXACTAMENTE lo que
 * hace el exportador hoy. El aviso genérico —«no tiene representación»— ya los
 * cubría, pero no dice nada accionable: quien acaba de trazar una directriz de
 * construcción necesita leer que se pierde la recta infinita, no una frase que
 * vale igual para un sombreado.
 */
interface Schema4LossRule {
  code: string;
  severity: CadLossManifestEntry["severity"];
  /** `null` = ninguna pérdida que declarar para ESTA entidad concreta. */
  detail: (entity: CadEntity, document: CadDocument) => string | null;
}

/** Frase común: la entidad entera se queda fuera del fichero. */
function dropped(what: string): Schema4LossRule {
  return {
    code: "dxf_export_entity_dropped",
    severity: "error",
    detail: () =>
      `${what} La exportación DXF todavía no escribe este tipo, así que la entidad NO estará en el ` +
      "fichero. Conserva el documento canónico como original.",
  };
}

const SCHEMA4_LOSS_RULES: Record<string, Schema4LossRule> = {
  point: dropped("POINT — el nodo del dibujo, con su estilo de marca y su tamaño."),
  xline: dropped("XLINE — recta de construcción infinita en ambos sentidos."),
  ray: dropped("RAY — semirrecta de construcción, infinita en un sentido."),
  solid: dropped("SOLID — triángulo o cuadrilátero relleno."),
  wipeout: dropped(
    "WIPEOUT — el polígono que TAPA lo que hay debajo; sin él, el dibujo exportado enseña lo que el " +
      "enmascaramiento ocultaba.",
  ),
  image: dropped("IMAGE — inserción de una imagen ráster con su encuadre."),
  attdef: dropped("ATTDEF — definición de atributo con su etiqueta, su valor por defecto y sus banderas."),
  table: dropped("TABLE — tabla con su rejilla, sus medidas de fila/columna y el texto de cada celda."),
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
  for (const entity of document.entities.filter((candidate) =>
    filter ? filter(candidate) : true,
  )) {
    // 1. Fidelidad declarada de los tipos del esquema 4. Va ANTES del descarte
    //    genérico porque una regla concreta dice QUÉ se pierde, y "no tiene
    //    representación" no dice nada que el usuario pueda accionar.
    const rule = SCHEMA4_LOSS_RULES[entity.type];
    if (rule) {
      const detail = rule.detail(entity, document);
      if (detail !== null)
        losses.push({
          code: rule.code,
          entityId: entity.id,
          sourceType: entity.type,
          severity: rule.severity,
          detail,
        });
      // Si la entidad entera se queda fuera, detallar además que su Z se
      // aplana sería ruido: no hay fichero donde aplanarla.
      if (rule.severity === "error") continue;
    }

    // 2. Entidades que no se escriben en absoluto.
    if (
      !rule &&
      !DXF_NON_PRIMITIVE_TYPES.has(entity.type) &&
      cadEntityToDxfPrimitive(entity) === null
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
