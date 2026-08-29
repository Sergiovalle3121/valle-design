/**
 * El render de una plantilla, dibujado POR EL MOTOR en el momento de servirlo.
 *
 * `/plantillas/renders/<id>.<tema>.svg` construye el documento real de la
 * plantilla (`buildCadTemplateDocument`) y lo proyecta con el registro de
 * entidades del editor. No hay imágenes pregeneradas que envejezcan: si el
 * motor cambia cómo traza un arco, la galería cambia con él en el siguiente
 * request. El manifiesto de evidencia (docs/cad/evidence/template-gallery.json)
 * conserva los hashes para que ese cambio quede REGISTRADO, no silencioso.
 *
 * La construcción es determinista y toma ~15 ms; el CDN y el navegador la
 * cachean una hora con stale-while-revalidate, que para un dibujo derivado
 * del código desplegado es exactamente la frescura correcta.
 */
import { buildCadTemplateDocument } from "@/lib/cad/template-document";
import { renderCadTemplateSvg } from "@/lib/cad/template-render";
import { getCadLayoutTemplate, type CadLayoutTemplateId } from "@/lib/cad/templates";

const ARCHIVO = /^([a-z0-9-]+)\.(oscuro|claro)\.svg$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ archivo: string }> },
) {
  const { archivo } = await params;
  const match = ARCHIVO.exec(archivo);
  if (!match) {
    return new Response("Formato: <plantilla>.<oscuro|claro>.svg", { status: 400 });
  }
  const [, id, tema] = match;
  if (!getCadLayoutTemplate(id as CadLayoutTemplateId)) {
    return new Response("Plantilla desconocida", { status: 404 });
  }
  const built = buildCadTemplateDocument(id as CadLayoutTemplateId);
  const render = renderCadTemplateSvg(built, {
    theme: tema === "oscuro" ? "dark" : "light",
  });
  return new Response(render.svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
