/**
 * Barrera pública de `lib/cad/interop/`: la vía de importación de modelos 3D
 * (OBJ, STL, glTF, COLLADA) hacia un `solid3d` de verdad. Ver `mesh-stitch.ts`
 * (`lib/brep/`) para el cosedor y `mesh-document-import.ts` para el puente al
 * documento canónico.
 */
export {
  MESH_IMPORT_MAX_BYTES,
  MESH_IMPORT_MAX_COMPONENTS,
  MESH_IMPORT_MAX_POINTS_PER_SOLID,
  MeshImportLimitError,
  assertMeshFileByteBudget,
  componentExceedsBudgetMessage,
  componentFitsPointBudget,
} from "./mesh-import-limits";
export type {
  MeshImportFormat,
  MeshImportLossEntry,
  MeshReader,
  MeshSourceUnit,
  RawMeshComponent,
  RawMeshDocument,
} from "./mesh-import-types";
export { importMeshDocument, type MeshDocumentImportReport } from "./mesh-document-import";
export { looksLikeSkp, rejectSkp } from "./skp-reject";
export { meshImportFormatOf, isMeshImportFileName } from "./mesh-format-detect";
