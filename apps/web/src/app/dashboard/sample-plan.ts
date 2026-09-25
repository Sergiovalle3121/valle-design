import { designClient } from "@/lib/cad/repositories/client";
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
 *
 * ## Por qué es la casa de la demostración
 *
 * Antes se abría `sample-plan.json`, un plano dibujado por el guion de
 * capturas sobre una planta de 40 × 26 m: la casa salía diminuta en una
 * esquina y sus rótulos de cuarto se cruzaban («BAÑO · 48 m²» encima de la
 * sala; visto el 25-sep-2026 abriéndolo desde una cuenta nueva). Ahora es la
 * MISMA casa que abre «Probar sin cuenta» y que enseña la portada: plantilla
 * casa habitación con sus muros y vanos, 12 × 8 m, seis cuartos con nombre y
 * m². Se importa al pulsar, no con el tablero: el catálogo de plantillas no
 * tiene por qué viajar en la primera carga.
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
  const [{ buildCadTemplateDocument }, { buildDemoVolumeDocument }] = await Promise.all([
    import("@/lib/cad/template-document"),
    import("@/lib/cad/demo/demo-volume"),
  ]);
  const casa = buildDemoVolumeDocument(buildCadTemplateDocument("casa-habitacion").document);
  await designClient.documents.saveContent(
    document.id,
    casa as unknown as CadDocumentInline,
    0,
  );
  return { documentId: document.id, proyectoCreado };
}
