import { cx } from "@/components/ui";

/**
 * ILUSTRACIONES DE ESTADO — geometría, no stock.
 *
 * Un estado vacío con una ilustración comprada de un banco de imágenes dice dos
 * cosas a la vez: «somos una empresa» y «esta pantalla nos dio igual». Estas
 * tres están dibujadas con el mismo vocabulario que el isotipo —trazo de plano,
 * líneas de construcción, nodos de referencia a objetos— así que pertenecen al
 * producto en vez de decorarlo.
 *
 * TODAS EN `currentColor`. No llevan un solo color propio: heredan el del texto
 * de quien las contiene, así que funcionan en claro, en oscuro y sobre
 * cualquier superficie sin una variante. El acento —cuando lo hay— sale del
 * token por clase, nunca de un hex.
 *
 * `aria-hidden` sin excepción: lo que informa es el texto que llevan al lado.
 * Una ilustración con `alt` obliga a quien usa lector de pantalla a oír la
 * descripción de un dibujo decorativo antes de llegar al mensaje.
 */

type Props = { className?: string };

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/**
 * LIENZO VACÍO — una hoja con su cajetín y una retícula que se desvanece.
 *
 * Dice «aquí va un plano» sin dibujar uno: si dibujara una planta terminada
 * estaría prometiendo un contenido que la pantalla no tiene.
 */
export function EmptyCanvasArt({ className }: Props) {
  return (
    <svg
      viewBox="0 0 120 96"
      aria-hidden="true"
      focusable="false"
      className={cx("h-24 w-auto text-muted-foreground", className)}
    >
      {/* Retícula, desvanecida hacia arriba para que no compita con la hoja. */}
      <g opacity="0.35" {...STROKE} strokeWidth={0.75}>
        {[24, 40, 56, 72].map((y) => (
          <path key={`h${y}`} d={`M14 ${y} H106`} />
        ))}
        {[30, 46, 62, 78, 94].map((x) => (
          <path key={`v${x}`} d={`M${x} 14 V82`} />
        ))}
      </g>

      {/* La hoja. */}
      <rect x="14" y="14" width="92" height="68" rx="3" {...STROKE} />

      {/* El cajetín, abajo a la derecha: la firma de una lámina. */}
      <path d="M64 68 H106" {...STROKE} />
      <path d="M64 68 V82" {...STROKE} />
      <path d="M64 75 H106" {...STROKE} />
      <path d="M85 68 V82" {...STROKE} />

      {/* Un nodo de referencia a objetos, esperando. */}
      <rect
        x="42"
        y="38"
        width="6"
        height="6"
        className="fill-brand-strong dark:fill-primary"
      />
    </svg>
  );
}

/**
 * SIN RESULTADOS — una lupa hecha con la geometría del oficio: un círculo con
 * su marca de centro, como se acota un radio.
 */
export function NoResultsArt({ className }: Props) {
  return (
    <svg
      viewBox="0 0 120 96"
      aria-hidden="true"
      focusable="false"
      className={cx("h-24 w-auto text-muted-foreground", className)}
    >
      <circle cx="52" cy="44" r="26" {...STROKE} />
      {/* Marcas de centro, como en un plano. */}
      <path d="M52 36 V52" {...STROKE} strokeWidth={1} opacity="0.6" />
      <path d="M44 44 H60" {...STROKE} strokeWidth={1} opacity="0.6" />
      {/* Línea de cota del radio, con su marca oblicua. */}
      <path d="M52 44 L78 44" {...STROKE} strokeWidth={1} opacity="0.6" />
      <path d="M74 40 L82 48" {...STROKE} strokeWidth={1} opacity="0.6" />
      {/* El mango. */}
      <path d="M71 63 L92 84" {...STROKE} strokeWidth={2.5} />
      <rect
        x="49"
        y="41"
        width="6"
        height="6"
        className="fill-brand-strong dark:fill-primary"
      />
    </svg>
  );
}

/**
 * ALGO SE ROMPIÓ — una línea de construcción interrumpida, con el hueco
 * marcado por los dos nodos que ya no se encuentran.
 *
 * Es exactamente lo que el editor pinta cuando una referencia se rompe, así que
 * el dibujo dice lo mismo que el mensaje.
 */
export function BrokenLinkArt({ className }: Props) {
  return (
    <svg
      viewBox="0 0 120 96"
      aria-hidden="true"
      focusable="false"
      className={cx("h-24 w-auto text-muted-foreground", className)}
    >
      {/* Los dos tramos que no llegan a juntarse. */}
      <path d="M16 62 L48 62 L56 40" {...STROKE} strokeWidth={2.5} />
      <path d="M70 40 L78 62 L104 62" {...STROKE} strokeWidth={2.5} />

      {/* El hueco, punteado: la parte que falta. */}
      <path
        d="M57 36 L69 36"
        {...STROKE}
        strokeWidth={1}
        strokeDasharray="3 3"
        opacity="0.6"
      />

      {/* Los dos nodos huérfanos. */}
      <rect
        x="53"
        y="33"
        width="6"
        height="6"
        className="fill-warning"
      />
      <rect x="67" y="33" width="6" height="6" className="fill-warning" />

      {/* Línea de base, para que el conjunto se lea como un plano. */}
      <path d="M10 78 H110" {...STROKE} strokeWidth={0.75} opacity="0.35" />
    </svg>
  );
}
