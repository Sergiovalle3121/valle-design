/**
 * La lámina PDF de muestra de una plantilla — trazada por el pipeline REAL.
 *
 * Es el mismo camino que el comando TRAZAR del estudio: documento →
 * `buildCadPlotJob` → `renderCadPlotPdf`, con el cajetín mexicano (proyecto,
 * disciplina, clave de lámina, responsiva del D.R.O.) que el documento de la
 * plantilla trae puesto. Un visitante que descarga esto está viendo la salida
 * verdadera del producto, no un folleto: la lámina que obtendría al pulsar
 * trazar en su primer minuto de uso.
 */
import { buildCadTemplateDocument } from "@/lib/cad/template-document";
import { buildCadPlotJob } from "@/lib/cad/plot/plot-job";
import { renderCadPlotPdf } from "@/lib/cad/plot/plot-pdf";
import { cadPageSetupFromLayout } from "@/lib/cad/plot/page-setup";
import { getCadLayoutTemplate, type CadLayoutTemplateId } from "@/lib/cad/templates";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getCadLayoutTemplate(id as CadLayoutTemplateId)) {
    return new Response("Plantilla desconocida", { status: 404 });
  }
  const built = buildCadTemplateDocument(id as CadLayoutTemplateId);
  const space = built.document.paperSpaces[0];
  const job = buildCadPlotJob({
    document: built.document,
    layoutIds: [space.id],
    pageSetup: cadPageSetupFromLayout(space),
  });
  const pdf = await renderCadPlotPdf(job.sheets, {});
  if (pdf.pageCount === 0) {
    return new Response("La lámina no se pudo trazar", { status: 500 });
  }
  const body = new Uint8Array(pdf.bytes);
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="plano-${id}-valledesign.pdf"`,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
