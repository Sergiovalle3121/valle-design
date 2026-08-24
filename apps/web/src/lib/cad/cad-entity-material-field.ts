/**
 * El campo `materialId` de la entidad `box` (activo heredado con acabado
 * arquitectónico elegido — `materials/architectural-material-library.ts`).
 *
 * Vive en su propio archivo, como `CadSchema10DimensionFields`, porque
 * `cad-document.ts` tiene tope de 800 líneas (`check:monolith-budget.mjs`) y
 * lo que se añade se extrae. Aditivo de verdad: una `box` que no lo trae
 * serializa igual que antes de este campo, y `buildAssetGroup()`
 * (`scene-objects.ts`) sigue coloreando con `color` plano cuando está ausente.
 */
export interface CadEntityMaterialField {
  materialId?: string;
}
