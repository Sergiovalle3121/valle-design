import type { JsonLdNode } from "@/lib/seo/structured-data";

/**
 * Imprime un nodo JSON-LD dentro de `<script type="application/ld+json">`.
 *
 * EL ESCAPE NO ES DECORATIVO. Dentro de un `<script>` el navegador corta el
 * bloque en el primer `</script>` literal que encuentre, aunque esté dentro de
 * una cadena JSON. Basta con que una descripción venga de configuración y
 * contenga esa secuencia para que el resto de la página se interprete como
 * HTML. Escapar cada `<` como su secuencia unicode produce JSON equivalente
 * —el analizador la deshace— sin dejar ninguna etiqueta reconocible en el flujo
 * del documento.
 *
 * Se usa `dangerouslySetInnerHTML` porque React escaparía el JSON como texto
 * HTML y el buscador recibiría `&quot;` en lugar de comillas.
 */
export function JsonLd({ data }: { data: JsonLdNode }) {
  const serialized = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialized }}
    />
  );
}
