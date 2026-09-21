import type { CadEntityPresentation } from "./cad-document";
import type { CadDxfPoint, CadDxfPrimitive } from "./dxf-import";

export interface CadDxfBlockAttributeDefinition {
  defaultValue?: string;
  prompt?: string;
  position?: CadDxfPoint;
  height?: number;
  invisible?: boolean;
  constant?: boolean;
}
export interface CadDxfSemanticInsert {
  block: string;
  insertion: CadDxfPoint;
  scaleX: number;
  scaleY: number;
  rotation: number;
  layer: string;
  attributes: Record<string, string>;
  /** Tipo de línea y grosor de la INSERCIÓN: de aquí tira el BYBLOCK de dentro. */
  presentation?: CadEntityPresentation;
  /** Ver `CadDxfPrimitive.paperSpace`: mismo código 67, mismo significado. */
  paperSpace?: boolean;
}
export interface CadDxfSemanticBlock {
  name: string;
  basePoint: CadDxfPoint;
  primitives: CadDxfPrimitive[];
  inserts: CadDxfSemanticInsert[];
  attributes: Record<string, CadDxfBlockAttributeDefinition>;
  version?: number;
  description?: string;
  keywords?: string[];
  libraryScope?: "document" | "tenant";
  libraryTenantId?: string;
  businessEntityType?: string;
  businessEntityId?: string;
}
