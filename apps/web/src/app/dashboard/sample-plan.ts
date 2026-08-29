import { designClient } from "@/lib/cad/repositories/client";
import SAMPLE_PLAN from "@/lib/cad/sample-plan.json";
import type { CadDocumentInline, CadProject } from "@valle/design-sdk";

/**
 * Abrir el plano de ejemplo: crear su documento y escribirle el contenido.
 *
 * Se saca de `page.tsx` porque es una secuencia de llamadas a la API sin nada
 * de interfaz, y porque el fichero del tablero llegó al techo de 800 líneas que
 * el repo impone a los ficheros no presupuestados. Aquí, además, se puede leer
 * de un vistazo la única decisión que tiene: **el ejemplo necesita un proyecto
 * donde vivir**, y si la organización acaba de nacer no hay ninguno, así que se
 * crea uno con nombre propio en vez de pedirle al usuario que invente un
 * nombre antes de haber visto nada.
 *
 * Devuelve el proyecto creado —si lo hubo— para que quien llama actualice su
 * lista sin volver a pedirla.
 */
export async function abrirPlanoDeEjemplo(proyectoActual: string | undefined): Promise<{
  documentId: string;
  proyectoCreado: CadProject | null;
}> {
  let proyectoCreado: CadProject | null = null;
  let projectId = proyectoActual;
  if (!projectId) {
    proyectoCreado = await designClient.projects.create({ name: "Ejemplos" });
    projectId = proyectoCreado.id;
  }
  const document = await designClient.documents.create({
    name: "Planta de ejemplo",
    projectId,
  });
  await designClient.documents.saveContent(
    document.id,
    SAMPLE_PLAN as unknown as CadDocumentInline,
    0,
  );
  return { documentId: document.id, proyectoCreado };
}
