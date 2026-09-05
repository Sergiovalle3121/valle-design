/**
 * El plano de una plantilla, en el tema activo — sin JavaScript.
 *
 * Dos <img> lazy, una por tema, y la que el tema oculta NO se descarga: la
 * carga perezosa es por intersección y un elemento `hidden` nunca interseca.
 * Es la forma más barata de que la galería siga al conmutador de tema sin
 * hidratar 149 tarjetas ni duplicar bytes.
 *
 * `width`/`height` van SIEMPRE declarados (la misma aritmética del renderizador,
 * vía `cadTemplateSvgSize`): la retícula de tarjetas no se mueve un píxel
 * cuando llegan los planos — CLS 0 por construcción.
 */
import { cadTemplateSvgSize } from "@/lib/cad/template-svg-size";

export function PlanRender({
  id,
  label,
  widthM,
  heightM,
  className,
  sizes,
  priority = false,
}: {
  id: string;
  label: string;
  widthM: number;
  heightM: number;
  className?: string;
  /** `sizes` del <img>, para que el navegador elija bien (el SVG escala solo). */
  sizes?: string;
  /** Carga ansiosa para la imagen principal de la ficha. */
  priority?: boolean;
}) {
  const size = cadTemplateSvgSize(widthM * 1000, heightM * 1000);
  const alt = `Plano de ${label} — plantilla CAD de Valle Design`;
  const loading = priority ? "eager" : "lazy";
  const common = {
    width: size.width,
    height: size.height,
    loading,
    decoding: "async",
    sizes,
    className: "h-auto w-full",
  } as const;
  return (
    <span className={className} data-testid={`plan-render-${id}`}>
      {/* <img> nativo y no next/image, con razón: la fuente es un SVG que el
          motor dibuja al vuelo — no hay srcset ni recompresión que aportar — y
          el truco de tema (dos imágenes lazy, la oculta no interseca y no se
          descarga) necesita el elemento plano. next/image además exigiría
          permitir dominios para una URL interna. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/plantillas/renders/${id}.oscuro.svg`}
        alt={alt}
        {...common}
        className={`${common.className} hidden dark:block`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/plantillas/renders/${id}.claro.svg`}
        alt={alt}
        {...common}
        className={`${common.className} dark:hidden`}
      />
    </span>
  );
}
