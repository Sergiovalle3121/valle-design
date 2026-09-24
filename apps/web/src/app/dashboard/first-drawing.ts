import type { CadDocumentInline, CadProject } from "@valle/design-sdk";
import { designClient } from "@/lib/cad/repositories/client";
import type { CadLayoutTemplateId } from "@/lib/cad/templates";

export type FirstDrawingId = "house" | "apartment" | "shop" | "blank";
export const FIRST_PROJECT_NAME = "Mis planos";

export const FIRST_DRAWINGS: ReadonlyArray<{
  id: FirstDrawingId;
  label: string;
  detail: string;
  templateId: CadLayoutTemplateId | null;
}> = [
  { id: "house", label: "Casa habitación", detail: "Sala, comedor, cocina y recámaras para editar.", templateId: "casa-habitacion" },
  { id: "apartment", label: "Departamento", detail: "Una planta compacta con los espacios principales.", templateId: "departamento" },
  { id: "shop", label: "Local comercial", detail: "Área de venta, bodega y baño para empezar.", templateId: "local-comercial" },
  { id: "blank", label: "En blanco", detail: "Un plano vacío para dibujar desde cero.", templateId: null },
];

/** Crea el primer proyecto sólo cuando no existe ninguno. El documento se
 * guarda antes de abrir el estudio para mantener un único escritor CAS. */
export async function createFirstDrawing(
  choiceId: FirstDrawingId,
  currentProjectId: string | undefined,
): Promise<{ documentId: string; projectCreated: CadProject | null }> {
  const choice = FIRST_DRAWINGS.find((item) => item.id === choiceId);
  if (!choice) throw new Error("No encontramos esa forma de empezar.");
  let projectCreated: CadProject | null = null;
  let projectId = currentProjectId;
  if (!projectId) {
    projectCreated = await designClient.projects.create({ name: FIRST_PROJECT_NAME });
    projectId = projectCreated.id;
  }
  const document = await designClient.documents.create({
    name: choice.templateId ? choice.label : "Plano en blanco",
    projectId,
  });
  if (choice.templateId) {
    const { buildCadTemplateDocument } = await import("@/lib/cad/template-document");
    await designClient.documents.saveContent(
      document.id,
      buildCadTemplateDocument(choice.templateId).document as unknown as CadDocumentInline,
      0,
    );
  }
  return { documentId: document.id, projectCreated };
}
