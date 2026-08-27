/**
 * Recorta el resultado de `importDxfPrimitives` a SOLO espacio modelo.
 *
 * El código de grupo 67 marca cada entidad como papel o modelo
 * (`CadDxfPrimitive.paperSpace` y compañía, ver `dxf-import.ts`); sin este
 * recorte, `document-import.ts` y la orden DXFIN (`engine/commands/interop-dxf.ts`)
 * metían la hoja de plano —cajetín, marco, viñeta— en el mismo
 * `modelSpace.entityIds` que el dibujo, indistinguibles del resto: la fuga
 * que un contador de entidades no delata pero un plano impreso sí.
 *
 * Este módulo NO construye layouts de papel (perfil futuro, como el DWG de
 * esta fase): las entidades de papel se EXCLUYEN, nunca se cuelan sin
 * marcar — la exclusión la cuenta `buildCadDxfImportReport`
 * (`dxf-import-report.ts`) comparando estas listas contra las crudas.
 *
 * Comparte esta lógica `document-import.ts` (importar archivo completo) y
 * `engine/commands/interop-dxf.ts` (DXFIN, insertar en un dibujo vivo): las
 * dos construyen entidades a partir del MISMO resultado crudo y las dos
 * tenían la misma fuga.
 */
import type {
  CadDxfHatch,
  CadDxfImportResult,
  CadDxfMText,
  CadDxfPrimitive,
  CadDxfSemanticDimension,
  CadDxfSemanticInsert,
  CadDxfSemanticMleader,
} from "./dxf-import";

export interface CadDxfModelSpaceScope {
  primitives: CadDxfPrimitive[];
  hatches: CadDxfHatch[];
  mtexts: CadDxfMText[];
  semanticDimensions: CadDxfSemanticDimension[];
  mleaders: CadDxfSemanticMleader[];
  inserts: CadDxfSemanticInsert[];
  /**
   * Cuántas entidades de espacio papel quedaron fuera, sumadas las seis
   * familias. `document-import.ts` la usa para declarar la pérdida en
   * `lossManifest`, con la misma frase que ya usa el lado de EXPORTACIÓN
   * (`dxf_export_paper_space_excluded` en `dxf-document-export.ts`).
   */
  excludedCount: number;
}

function modelSpaceOnly<T extends { paperSpace?: boolean }>(
  items: readonly T[],
): { kept: T[]; excluded: number } {
  const kept: T[] = [];
  let excluded = 0;
  for (const item of items) {
    if (item.paperSpace) excluded += 1;
    else kept.push(item);
  }
  return { kept, excluded };
}

export function scopeDxfImportToModelSpace(result: CadDxfImportResult): CadDxfModelSpaceScope {
  // Las de origen "insert" NO se insertan sueltas: su bloque viaja entero
  // por `inserts`/`cadDxfBlocksToCadDocumentParts`. Esa exclusión es
  // independiente de papel/modelo y ya la hacían los dos llamadores; se
  // conserva igual, antes del recorte por espacio.
  const primitives = modelSpaceOnly(
    result.primitives.filter((_, index) => result.primitiveSources[index] !== "insert"),
  );
  const hatches = modelSpaceOnly(result.hatches);
  const mtexts = modelSpaceOnly(result.mtexts);
  const semanticDimensions = modelSpaceOnly(result.semanticDimensions);
  const mleaders = modelSpaceOnly(result.mleaders);
  const inserts = modelSpaceOnly(result.inserts);
  return {
    primitives: primitives.kept,
    hatches: hatches.kept,
    mtexts: mtexts.kept,
    semanticDimensions: semanticDimensions.kept,
    mleaders: mleaders.kept,
    inserts: inserts.kept,
    excludedCount:
      primitives.excluded +
      hatches.excluded +
      mtexts.excluded +
      semanticDimensions.excluded +
      mleaders.excluded +
      inserts.excluded,
  };
}
