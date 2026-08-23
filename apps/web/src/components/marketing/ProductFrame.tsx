import Image from "next/image";
import { cx } from "@/components/ui";

/**
 * EL PRODUCTO, ENMARCADO.
 *
 * La carencia número uno de esta portada era vender un CAD sin enseñar un
 * dibujo: el hero pintaba a la derecha una caja con degradado y una lista `<ol>`
 * numerada. Nadie compra un programa de dibujo por una lista numerada.
 *
 * El marco de ventana no es adorno: una captura a sangre se lee como un error
 * de maquetación —¿es una imagen o es la página?—, mientras que el mismo píxel
 * dentro de un marco con su barra de título se lee como «esto es el programa».
 * Los tres círculos son los del sistema operativo y el ojo los descodifica sin
 * pensar.
 *
 * `.product-halo` y `.float-slow` llevaban escritos en `globals.css` desde el
 * principio con CERO usos. Aquí se cablean por fin, y los dos respetan
 * `prefers-reduced-motion` desde la regla global.
 */

export function ProductFrame({
  src,
  alt,
  caption,
  priority = false,
  float = true,
  className,
}: {
  src: string;
  alt: string;
  /** Pie de foto. Explica QUÉ se está viendo; sin él, la captura decora. */
  caption?: string;
  /** `true` sólo en la imagen del hero: es el LCP de la página. */
  priority?: boolean;
  float?: boolean;
  className?: string;
}) {
  return (
    /*
      `overflow-hidden` NO es cosmético: el halo es `absolute -inset-8`, o sea
      32 px más ancho que la figura por cada lado. En escritorio sobra sitio; en
      un teléfono de 390 px la figura mide 376 y el halo 440, y como nadie lo
      recortaba, la PORTADA ENTERA se desplazaba en horizontal. Medido con
      `document.documentElement.scrollWidth`: 560 contra 390 de ventana. El
      barrido que lo habría cazado —`e2e/public/mobile-accessibility.spec.ts`—
      moría dos aserciones antes, así que el defecto llevaba desde el rediseño
      sin que nadie lo viera.
    */
    <figure className={cx("relative overflow-hidden", className)}>
      {/* Halo bajo el producto: le da peso y lo separa del fondo sin sombra. */}
      <div
        aria-hidden="true"
        className="product-halo pointer-events-none absolute -inset-8 -z-10"
      />

      <div
        className={cx(
          "overflow-hidden rounded-surface border border-border bg-card shadow-floating",
          float && "float-slow",
        )}
      >
        {/* Barra de ventana. `select-none` para que nadie arrastre los puntos. */}
        <div className="flex select-none items-center gap-1.5 border-b border-border bg-muted/60 px-3.5 py-2.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-danger/70" />
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-success/70" />
          <span className="type-mono type-micro ml-2 truncate text-muted-foreground">
            {alt}
          </span>
        </div>

        {/*
          `width`/`height` reales de la captura (2× de 1440×900) para que el
          navegador reserve la caja ANTES de descargar el archivo: sin ellos, la
          página salta cuando la imagen llega, y ese salto es lo que Google
          castiga como CLS.
        */}
        <Image
          src={src}
          alt={alt}
          width={2880}
          height={1800}
          priority={priority}
          sizes="(min-width: 1024px) 46rem, 100vw"
          className="block h-auto w-full"
        />
      </div>

      {caption ? (
        <figcaption className="type-small mt-4 text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
