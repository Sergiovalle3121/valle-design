/**
 * Del documento canónico a un archivo DXF completo, en una llamada.
 *
 * Las siete piezas del modelo de exportación —primitivas, sombreados, textos
 * con formato, cotas, directrices, bloques e inserciones— ya existían por
 * separado en `dxf-cad-document.ts`, y cada consumidor las ensamblaba a mano.
 * Eso significaba que un consumidor que olvidase los sombreados producía un
 * archivo sin rellenos, correcto para el compilador y equivocado para el
 * cliente. Ahora hay un solo ensamblaje y un solo sitio donde añadir la octava.
 *
 * El manifiesto de pérdidas sale con el MISMO filtro que el contenido. Avisar
 * de pérdidas en entidades que no se van a escribir es ruido, y el ruido acaba
 * con que nadie lea el aviso que sí importaba.
 *
 * Módulo puro: sin DOM, sin THREE, sin estado.
 */
import type {
  CadEntity,
  CadLayerDef,
  CadLossManifestEntry,
  CadStyleTable,
} from "./cad-document";
import { CAD_LINEWEIGHT_DEFAULT } from "./cad-effective-style";
import {
  cadDocumentDxfBlocks,
  cadDocumentDxfExportLosses,
  cadDocumentDxfInserts,
  cadDocumentNativeDxfHatches,
  cadDocumentNativeDxfMleaders,
  cadDocumentNativeDxfMTexts,
  cadDocumentNativeDxfPrimitives,
  cadDocumentNativeDxfSemanticDimensions,
  type CadDxfExportSource,
} from "./dxf-cad-document";
import { exportCadDxf, type CadDxfExportModel, type CadDxfExportOptions } from "./dxf-export";

/**
 * Lo que hace falta leer para escribir un DXF: entidades, bloques, capas y —
 * desde que el tipo de línea viaja— el catálogo de patrones y la escala global
 * del guion. Las dos últimas son OPCIONALES: un documento que nunca abrió un
 * DXF con tabla LTYPE no las tiene, y exigirlas habría obligado a los
 * llamadores que sólo tienen una selección a inventárselas.
 */
export type CadDxfDocumentExportSource = CadDxfExportSource & {
  layers: readonly CadLayerDef[];
  styles?: Partial<Pick<CadStyleTable, "linetype" | "dimension">>;
  meta?: { linetypeScale?: number };
  /**
   * Sin esto, "Todo" mezclaba entidades de espacio papel en la sección de
   * ENTITIES de espacio modelo, indistinguibles — la fuga que
   * `document-import.ts` reclasificaba de vuelta como modelo al reimportar.
   * Este DXF NO escribe layouts de papel todavía (perfil futuro, como el
   * DWG de esta fase); mientras tanto, sus entidades se EXCLUYEN y se
   * DECLARAN, nunca se cuelan sin marcar.
   */
  paperSpaces?: readonly { entityIds: readonly string[] }[];
};

/** Ids de TODAS las entidades que pertenecen a algún espacio papel. */
function paperSpaceEntityIds(
  document: Pick<CadDxfDocumentExportSource, "paperSpaces">,
): Set<string> {
  const ids = new Set<string>();
  for (const paperSpace of document.paperSpaces ?? [])
    for (const id of paperSpace.entityIds) ids.add(id);
  return ids;
}

export interface CadDxfDocumentExport {
  content: string;
  entityCount: number;
  layers: readonly string[];
  /** Qué NO lleva el archivo, calculado ANTES de escribirlo. */
  losses: readonly CadLossManifestEntry[];
}

/**
 * Ensambla el modelo de exportación. `filter` acota el ámbito (selección);
 * las entidades de espacio papel se excluyen SIEMPRE, las pase o no el
 * filtro del llamador (ver el campo `paperSpaces` de
 * `CadDxfDocumentExportSource`).
 */
export function cadDocumentToDxfExportModel(
  document: CadDxfDocumentExportSource,
  filter?: (entity: CadEntity) => boolean,
): CadDxfExportModel {
  const paperIds = paperSpaceEntityIds(document);
  const scoped = (entity: CadEntity) =>
    !paperIds.has(entity.id) && (filter ? filter(entity) : true);
  return {
    primitives: cadDocumentNativeDxfPrimitives(document, scoped),
    hatches: cadDocumentNativeDxfHatches(document, scoped),
    mtexts: cadDocumentNativeDxfMTexts(document, scoped),
    semanticDimensions: cadDocumentNativeDxfSemanticDimensions(document, scoped),
    mleaders: cadDocumentNativeDxfMleaders(document, scoped),
    // Las DEFINICIONES de bloque no pasan por el filtro: una inserción dentro
    // del ámbito cuya definición se quedara fuera produciría un INSERT que
    // apunta a un bloque inexistente, y eso no lo abre ningún visor.
    blocks: cadDocumentDxfBlocks(document),
    inserts: cadDocumentDxfInserts(document, scoped),
    // El grosor cruza aquí su frontera de unidades: la paleta de capas guarda
    // MILÍMETROS con −1 por «por defecto» y el fichero pide CENTÉSIMAS con −3.
    // La conversión de ida vive en el importador y la resolución en
    // `cad-effective-style.ts`; los tres sitios se editan juntos.
    layers: document.layers.map((layer) => ({
      name: layer.name,
      ...(layer.linetype ? { linetype: layer.linetype } : {}),
      ...(typeof layer.lineweight === "number"
        ? { lineweight: layer.lineweight < 0 ? CAD_LINEWEIGHT_DEFAULT : Math.round(layer.lineweight * 100) }
        : {}),
      // Congelada viaja al bit 1 del código 70; el importador ya lo leía.
      ...(layer.frozen === true ? { frozen: true } : {}),
    })),
    ...(document.styles?.linetype
      ? {
          linetypes: Object.entries(document.styles.linetype).map(([name, entry]) => ({
            name,
            pattern: entry.pattern,
            ...(entry.description ? { description: entry.description } : {}),
          })),
        }
      : {}),
    // La norma de acotación viaja como TABLA (además del nombre en código 3 y
    // los overrides XDATA por entidad): un despacho que fija su DIMSTYLE lo
    // recupera al reabrir el fichero, no sólo el aspecto de cada cota.
    ...(document.styles?.dimension &&
    Object.keys(document.styles.dimension).length > 0
      ? { dimensionStyles: document.styles.dimension }
      : {}),
    ...(typeof document.meta?.linetypeScale === "number"
      ? { linetypeScale: document.meta.linetypeScale }
      : {}),
  };
}

/** Escribe el DXF y su manifiesto. Es lo que `DXFOUT` entrega al anfitrión. */
export function exportCadDocumentDxf(
  document: CadDxfDocumentExportSource,
  filter?: (entity: CadEntity) => boolean,
  options?: CadDxfExportOptions,
): CadDxfDocumentExport {
  const paperIds = paperSpaceEntityIds(document);
  const modelSpaceOnly = (entity: CadEntity) =>
    !paperIds.has(entity.id) && (filter ? filter(entity) : true);
  const exported = exportCadDxf(
    cadDocumentToDxfExportModel(document, filter),
    options ?? {},
  );
  const scopedPaperCount = document.entities.filter(
    (entity) => paperIds.has(entity.id) && (filter ? filter(entity) : true),
  ).length;
  const losses = cadDocumentDxfExportLosses(document, modelSpaceOnly);
  if (scopedPaperCount > 0)
    losses.push({
      code: "dxf_export_paper_space_excluded",
      sourceType: "PAPER_SPACE",
      severity: "warning",
      detail:
        `${scopedPaperCount} entidad(es) de espacio papel quedaron fuera del ` +
        "DXF: este exportador escribe SOLO espacio modelo — las hojas siguen " +
        "intactas en el documento y en el PDF.",
    });
  return {
    content: exported.content,
    entityCount: exported.entityCount,
    layers: exported.layers,
    losses,
  };
}
