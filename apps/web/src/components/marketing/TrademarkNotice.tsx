import { BRAND } from "@/config/brand";

/**
 * EL AVISO DE MARCAS — el único sitio del producto donde se nombra a otra.
 *
 * ── LA DECISIÓN QUE LO PUSO AQUÍ ────────────────────────────────────────────
 * Hasta la campaña de firma propia (2026-08-28) la portada se presentaba como
 * «una alternativa a AutoCAD en la nube». La referencia nominativa con aviso de
 * marcas es LEGAL —nombrar a un competidor para describirse es uso legítimo—,
 * así que no se retiró por miedo jurídico. Se retiró porque el dueño decidió
 * que su producto no se presenta por comparación:
 *
 *   «No quiero que mi página anuncie que compito con nadie. Quiero que diga lo
 *    que hace.»
 *
 * Comercialmente además es lo correcto: un producto que se define contra otro
 * le regala el marco al otro. El comprador recuerda la marca grande y el
 * pequeño queda como su sucedáneo. Valle Design se describe solo — CAD
 * profesional en el navegador, sus capacidades, su precio — y donde hace falta
 * hablar de interoperabilidad se habla del FORMATO, no de quién lo publica.
 *
 * ── POR QUÉ ESTA LÍNEA SÍ SE QUEDA ──────────────────────────────────────────
 * Porque el producto SÍ lee DXF y DWG, esos nombres SÍ aparecen en la
 * documentación técnica, y dejar que alguien deduzca una afiliación que no
 * existe es exactamente el riesgo que un aviso de marcas cierra. Una línea
 * discreta en el pie es la forma barata de que no haya ninguna duda.
 *
 * ── EL GATE ─────────────────────────────────────────────────────────────────
 * `npm run check:surface` (scripts/design/check-public-surface.mjs) falla si
 * «AutoCAD» o «Autodesk» aparecen en cualquier superficie pública que no sea
 * este archivo. Por eso la línea vive en un componente propio y no suelta en el
 * pie de la portada: para que el gate tenga UN sitio que permitir en vez de una
 * excepción por página, y para que la próxima página pública que necesite pie
 * la reutilice en vez de reescribirla con otras palabras.
 */
export function TrademarkNotice({ className }: { className?: string }) {
  return (
    <p className={className}>
      AutoCAD y DWG son marcas de Autodesk, Inc. {BRAND.brandName} no está
      afiliado a Autodesk ni respaldado por Autodesk.
    </p>
  );
}
