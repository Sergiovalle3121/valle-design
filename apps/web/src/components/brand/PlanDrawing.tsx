/**
 * EL PLANO QUE SE DIBUJA SOLO — la firma de movimiento de la casa.
 *
 * ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────
 * La portada vendía un CAD sin enseñar el acto de dibujar. Había capturas
 * reales del editor —que fue el arreglo de la campaña anterior y sigue siendo
 * correcto— pero una captura enseña un RESULTADO. Lo que convence a un
 * dibujante no es ver un plano terminado: es ver aparecer la línea.
 *
 * Esto es esa línea. Una planta arquitectónica real —muros dobles, vanos,
 * puertas con su barrido, cotas con sus líneas auxiliares y su cajetín— que se
 * traza sola en el orden en que la trazaría una persona: primero los muros,
 * luego los huecos, luego las puertas, luego las cotas y al final el cajetín.
 * Ese orden no es decorativo; es el orden real del oficio, y quien dibuja lo
 * reconoce en el primer segundo.
 *
 * ── CÓMO FUNCIONA ───────────────────────────────────────────────────────────
 * `stroke-dashoffset` animado: cada trazo lleva `pathLength="1"`, así que su
 * longitud es SIEMPRE 1 sin importar su geometría, y la clase `.stroke-draw-loop`
 * de `globals.css` lo lleva de 1 a 0 (dibujar), lo sostiene, y lo lleva a -1
 * (borrar). El escalonado sale de `--draw-delay`, una variable por trazo: como
 * todos comparten el mismo ciclo de 14 s, un retardo fijo los mantiene en fase
 * para siempre en vez de desincronizarlos.
 *
 * Cero JavaScript en el cliente: es un componente de servidor y la animación
 * entera es CSS. Un hero animado que costara hidratación sería un hero que
 * llega tarde justo en la primera impresión.
 *
 * `prefers-reduced-motion` está resuelto en `globals.css` y no aquí: quien pide
 * menos movimiento ve el plano COMPLETO y quieto, no un lienzo en blanco. Ése
 * fue el error que la regla general del sistema escondía y que quedó escrito
 * junto a la excepción.
 *
 * ── POR QUÉ NO LLEVA COLOR PROPIO ───────────────────────────────────────────
 * Todo sale de `currentColor` sobre clases de token (`text-foreground`,
 * `text-primary`, `text-muted-foreground`). El dibujo hereda el tema, así que
 * en claro es grafito sobre papel y en oscuro es tiza sobre pizarra sin una
 * sola línea de CSS condicional. Y `components/brand/` tiene prohibido el hex
 * por el gate del sistema de diseño, que es la razón por la que esto se
 * comprueba solo.
 */

/**
 * Los retardos, en el orden del oficio. Van juntos y con nombre porque el
 * escalonado ES la composición: separarlos por el archivo haría imposible
 * ajustar el ritmo sin cazar seis números sueltos.
 */
const DELAY = {
  murosExteriores: 0,
  murosInteriores: 700,
  vanos: 1400,
  puertas: 1900,
  mobiliario: 2400,
  cotas: 2900,
  cajetin: 3500,
} as const;

/** `--draw-delay` como estilo en línea: es un dato por trazo, no una clase. */
function delay(ms: number) {
  return { "--draw-delay": `${ms}ms` } as React.CSSProperties;
}

export interface PlanDrawingProps {
  className?: string;
  /**
   * Texto alternativo. Cuando es `null` el dibujo se marca decorativo
   * (`aria-hidden`), que es lo correcto cuando el texto de al lado ya cuenta
   * lo mismo: un lector de pantalla que anuncia «planta arquitectónica» junto
   * a un titular que dice lo mismo repite, y repetir es ruido.
   */
  title?: string | null;
}

export function PlanDrawing({
  className,
  title = "Planta arquitectónica dibujándose trazo a trazo",
}: PlanDrawingProps) {
  return (
    <svg
      viewBox="0 0 840 560"
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title ?? undefined}
      // `vectorEffect` mantiene el grosor del trazo al escalar: sin él, el
      // plano en un teléfono sale con líneas de pelo y en un monitor grande
      // con líneas gordas, y en dibujo técnico el grosor SIGNIFICA algo.
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* ── MUROS EXTERIORES ─ doble línea, como se dibuja un muro de verdad ── */}
      <g className="text-foreground" stroke="currentColor" strokeWidth={3}>
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.murosExteriores)}
          d="M60 60 H780 V420 H60 Z"
        />
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.murosExteriores + 260)}
          d="M78 78 H762 V402 H78 Z"
        />
      </g>

      {/* ── MUROS INTERIORES ─ la partición del programa ────────────────────── */}
      <g className="text-foreground" stroke="currentColor" strokeWidth={2.5}>
        {/* Tabique vertical: de la fachada norte hasta el pasillo. */}
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.murosInteriores)}
          d="M430 78 V214 M448 78 V214"
        />
        {/* Tabique vertical inferior, con el vano del paso ya reservado. */}
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.murosInteriores + 200)}
          d="M430 296 V402 M448 296 V402"
        />
        {/* Tabique horizontal del ala derecha. */}
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.murosInteriores + 400)}
          d="M448 250 H620 M448 268 H620"
        />
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.murosInteriores + 560)}
          d="M700 250 H762 M700 268 H762"
        />
      </g>

      {/* ── VANOS ─ las jambas que cierran el hueco de puerta ───────────────── */}
      <g className="text-muted-foreground" stroke="currentColor" strokeWidth={2}>
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.vanos)}
          d="M430 214 H448 M430 296 H448"
        />
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.vanos + 160)}
          d="M620 250 V268 M700 250 V268"
        />
        {/* Ventana de fachada: los dos vidrios del hueco. */}
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.vanos + 320)}
          d="M170 60 V78 M330 60 V78 M170 69 H330"
        />
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.vanos + 440)}
          d="M540 402 V420 M680 402 V420 M540 411 H680"
        />
      </g>

      {/* ── PUERTAS ─ hoja recta y barrido en arco, la firma del plano ───────── */}
      <g className="text-primary" stroke="currentColor" strokeWidth={2}>
        {/* Paso principal: hoja de 82 y su barrido de un cuarto de vuelta. */}
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.puertas)}
          d="M448 296 L448 214"
        />
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.puertas + 240)}
          d="M448 214 A82 82 0 0 1 366 296"
        />
        {/* Puerta del ala derecha. */}
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.puertas + 480)}
          d="M620 268 L700 268"
        />
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.puertas + 700)}
          d="M700 268 A80 80 0 0 1 620 348"
        />
      </g>

      {/* ── MOBILIARIO ─ dos trazos que dan escala humana al dibujo ─────────── */}
      <g
        className="text-muted-foreground"
        stroke="currentColor"
        strokeWidth={1.5}
        opacity={0.85}
      >
        {/* Mesa y sillas del estar. */}
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.mobiliario)}
          d="M150 150 H330 V260 H150 Z"
        />
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.mobiliario + 200)}
          d="M186 122 H218 V150 H186 Z M262 122 H294 V150 H262 Z M186 260 H218 V288 H186 Z M262 260 H294 V288 H262 Z"
        />
        {/* Escalera: los peldaños son el detalle que hace creíble una planta. */}
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.mobiliario + 420)}
          d="M500 296 H600 V386 H500 Z M500 314 H600 M500 332 H600 M500 350 H600 M500 368 H600"
        />
      </g>

      {/* ── COTAS ─ línea de cota, auxiliares y marcas de 45°, como una lámina ── */}
      <g className="text-primary" stroke="currentColor" strokeWidth={1.5}>
        {/* Auxiliares que bajan del muro sin tocarlo (el hueco es normativo). */}
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.cotas)}
          d="M60 432 V486 M448 432 V486 M780 432 V486"
        />
        {/* Las dos líneas de cota, con su marca oblicua en cada extremo. */}
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.cotas + 260)}
          d="M60 470 H448 M54 476 L66 464 M442 476 L454 464"
        />
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.cotas + 460)}
          d="M448 470 H780 M442 476 L454 464 M774 476 L786 464"
        />
        {/* Cota vertical del costado. */}
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.cotas + 660)}
          d="M812 60 V420 M806 66 L818 54 M806 426 L818 414 M796 60 H830 M796 420 H830"
        />
      </g>

      {/* Las cifras aparecen cuando su cota ya está trazada, nunca antes. */}
      <g className="fill-current text-primary type-mono" fontSize={17}>
        <text
          x={254}
          y={464}
          textAnchor="middle"
          className="draw-fade-in"
          style={delay(DELAY.cotas + 900)}
        >
          3.88
        </text>
        <text
          x={614}
          y={464}
          textAnchor="middle"
          className="draw-fade-in"
          style={delay(DELAY.cotas + 1050)}
        >
          3.32
        </text>
        <text
          x={824}
          y={246}
          textAnchor="middle"
          transform="rotate(-90 824 246)"
          className="draw-fade-in"
          style={delay(DELAY.cotas + 1200)}
        >
          3.60
        </text>
      </g>

      {/* ── CAJETÍN ─ lo último que se dibuja, como en una lámina de verdad ─── */}
      <g className="text-muted-foreground" stroke="currentColor" strokeWidth={1.5}>
        <path
          pathLength={1}
          className="stroke-draw-loop"
          style={delay(DELAY.cajetin)}
          d="M540 500 H780 V548 H540 Z M540 524 H780 M660 524 V548"
        />
      </g>
      <g className="fill-current text-muted-foreground type-mono" fontSize={13}>
        <text x={552} y={517} className="draw-fade-in" style={delay(DELAY.cajetin + 400)}>
          PLANTA BAJA
        </text>
        <text x={552} y={541} className="draw-fade-in" style={delay(DELAY.cajetin + 550)}>
          ESC 1:50
        </text>
        <text x={672} y={541} className="draw-fade-in" style={delay(DELAY.cajetin + 700)}>
          A-01
        </text>
      </g>
    </svg>
  );
}
