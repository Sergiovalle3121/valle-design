import { cx } from "@/components/ui";

/**
 * ASÍ SE SIENTE — tres microdemos de lo que hace un CAD y una captura no cuenta.
 *
 * ── EL HUECO QUE LLENAN ─────────────────────────────────────────────────────
 * La portada sabe demostrar QUÉ hay (capturas reales del editor) y sabe declarar
 * QUÉ FALTA (la sección de honestidad). Lo que no sabía enseñar es el TACTO: la
 * sensación concreta de que la referencia a objetos te imanta al punto exacto,
 * de que la cota nace amarrada a lo que mide, de que la lámina sale a escala.
 * Eso es lo que un dibujante compra, y es justo lo que una imagen quieta no
 * puede transmitir.
 *
 * ── POR QUÉ SON DIAGRAMAS Y NO GRABACIONES ──────────────────────────────────
 * Un GIF de la aplicación pesa megabytes, envejece en silencio en cuanto el
 * editor cambia y se ve borroso en cualquier pantalla que no sea la de quien lo
 * grabó. Estos son SVG de 2 KB, nítidos a cualquier tamaño, que heredan el tema
 * y que no pueden mentir sobre la interfaz porque no la dibujan: dibujan el
 * CONCEPTO. Cada uno lleva su frase debajo diciendo qué se está viendo.
 *
 * Todos usan la firma de movimiento de la casa (`.stroke-draw-loop`) y por tanto
 * respetan `prefers-reduced-motion` desde `globals.css`, donde quedan quietos y
 * completos en vez de en blanco.
 */

const VIEWBOX = "0 0 240 150";

function delay(ms: number) {
  return { "--draw-delay": `${ms}ms` } as React.CSSProperties;
}

function Demo({
  titulo,
  texto,
  children,
}: {
  titulo: string;
  texto: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="rounded-card border border-border bg-card p-6 shadow-resting">
      <div className="overflow-hidden rounded-control border border-border bg-background">
        <svg
          viewBox={VIEWBOX}
          fill="none"
          aria-hidden="true"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="block h-auto w-full"
        >
          {/* Retícula del papel, quieta, como fondo del concepto. */}
          <g className="text-border" stroke="currentColor" strokeWidth={0.5} opacity={0.6}>
            <path d="M0 30H240M0 60H240M0 90H240M0 120H240M30 0V150M60 0V150M90 0V150M120 0V150M150 0V150M180 0V150M210 0V150" />
          </g>
          {children}
        </svg>
      </div>
      <figcaption className="mt-5">
        <p className="type-heading">{titulo}</p>
        <p className="type-small mt-2 text-muted-foreground">{texto}</p>
      </figcaption>
    </figure>
  );
}

export function FeelDemos({ className }: { className?: string }) {
  return (
    <div className={cx("grid gap-6 lg:grid-cols-3", className)}>
      {/* ── 1 · EL SNAP QUE IMANTA ──────────────────────────────────────────
          Dos líneas que no se tocan, el marcador cuadrado del punto final y la
          línea nueva que salta a ese punto exacto en vez de al píxel del ratón. */}
      <Demo
        titulo="La referencia te imanta al punto"
        texto="No se dibuja «cerca de» la esquina: se dibuja EN la esquina. El editor indexa los puntos notables de la geometría y el cursor salta al que corresponde, con su marcador diciendo cuál es. Un plano cuyos vértices no coinciden es un plano que falla al acotar y al exportar."
      >
        <g className="text-foreground" stroke="currentColor" strokeWidth={2.4}>
          <path pathLength={1} className="stroke-draw-loop" style={delay(0)} d="M40 118 L40 46 L128 46" />
        </g>
        {/* Marcador de punto final: el cuadrado que el oficio reconoce. */}
        <g className="text-primary" stroke="currentColor" strokeWidth={2}>
          <path pathLength={1} className="stroke-draw-loop" style={delay(900)} d="M33 39H47V53H33Z" />
          <path pathLength={1} className="stroke-draw-loop" style={delay(1300)} d="M40 46 L196 104" />
        </g>
        <g className="fill-current text-primary type-mono" fontSize={9}>
          <text x={54} y={34} className="draw-fade-in" style={delay(1700)}>
            FIN
          </text>
        </g>
      </Demo>

      {/* ── 2 · LA COTA QUE NACE AMARRADA ───────────────────────────────────
          El muro, las auxiliares saliendo de sus extremos, la línea de cota con
          sus marcas y la cifra apareciendo al final. */}
      <Demo
        titulo="La cota nace amarrada a lo que mide"
        texto="Acotas una vez y el número queda unido a la geometría: mueves el muro y la cifra cambia sola. Una medida escrita a mano encima de una línea acaba mintiendo el día que alguien mueve esa línea, y nadie se entera hasta que está construido."
      >
        <g className="text-foreground" stroke="currentColor" strokeWidth={3}>
          <path pathLength={1} className="stroke-draw-loop" style={delay(0)} d="M44 40H196M44 52H196" />
        </g>
        <g className="text-primary" stroke="currentColor" strokeWidth={1.6}>
          <path pathLength={1} className="stroke-draw-loop" style={delay(700)} d="M44 60V104M196 60V104" />
          <path
            pathLength={1}
            className="stroke-draw-loop"
            style={delay(1100)}
            d="M44 94H196M38 100L50 88M190 100L202 88"
          />
        </g>
        <g className="fill-current text-primary type-mono" fontSize={12}>
          <text x={120} y={86} textAnchor="middle" className="draw-fade-in" style={delay(1600)}>
            4.20
          </text>
        </g>
      </Demo>

      {/* ── 3 · LA LÁMINA QUE SALE A ESCALA ─────────────────────────────────
          El papel, la ventana con su recorte del modelo, el cajetín y el sello. */}
      <Demo
        titulo="La lámina sale con el tamaño de página exacto"
        texto="Eliges papel y escala normalizada, y el PDF sale con esas medidas: una unidad de dibujo mide en el papel lo que la escala dice que mide. Con su cajetín, su escala gráfica y las plumas decidiendo el grosor de cada trazo."
      >
        {/* La hoja. */}
        <g className="text-foreground" stroke="currentColor" strokeWidth={2}>
          <path pathLength={1} className="stroke-draw-loop" style={delay(0)} d="M46 18H194V132H46Z" />
        </g>
        {/* La ventana de presentación y lo que encuadra. */}
        <g className="text-muted-foreground" stroke="currentColor" strokeWidth={1.4}>
          <path pathLength={1} className="stroke-draw-loop" style={delay(600)} d="M58 30H150V96H58Z" />
          <path pathLength={1} className="stroke-draw-loop" style={delay(1000)} d="M70 84V44H116V84Z M116 62H138" />
        </g>
        {/* El cajetín. */}
        <g className="text-primary" stroke="currentColor" strokeWidth={1.4}>
          <path
            pathLength={1}
            className="stroke-draw-loop"
            style={delay(1500)}
            d="M58 106H182V122H58Z M140 106V122"
          />
        </g>
        <g className="fill-current text-primary type-mono" fontSize={8}>
          <text x={64} y={117} className="draw-fade-in" style={delay(2000)}>
            ESC 1:50
          </text>
          <text x={146} y={117} className="draw-fade-in" style={delay(2200)}>
            A-01
          </text>
        </g>
        <g className="fill-current text-muted-foreground type-mono" fontSize={8}>
          <text x={160} y={28} className="draw-fade-in" style={delay(2400)}>
            A3
          </text>
        </g>
      </Demo>
    </div>
  );
}
