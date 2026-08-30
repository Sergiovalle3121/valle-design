"use client";

/**
 * EL SHOWCASE PEGAJOSO — dibujar → acotar → publicar, enseñado HACIENDO.
 *
 * Tres pasos de texto a la izquierda; a la derecha, fija mientras se scrollea,
 * la microdemo del paso activo: la línea de comandos tecleándose con comandos
 * REALES del producto (`LINE`, `DIMLINEAR`, `PLOT`), el muro naciendo, la cota
 * rotulando su valor VERDADERO (el muro mide 6 000 mm y la cota dice 6.000 —
 * la convención mexicana: dibujo en milímetros, cota rotulada en metros), y la
 * lámina saliendo con su cajetín. Nada es un GIF: SVG del sistema, tokens de
 * motion de la casa, nítido en cualquier densidad y en los dos temas.
 *
 * Sustituye a los tres diagramas conceptuales de `FeelDemo` (campaña de
 * firma): mismo hueco —el tacto que una captura no cuenta— contado ahora con
 * los comandos de verdad en vez de conceptos.
 *
 * Accesibilidad y fluidez, por construcción:
 * - la activación es por IntersectionObserver sobre los BLOQUES DE TEXTO; el
 *   panel es `position: sticky` (cero JavaScript en el scroll);
 * - toda animación es opacity/stroke-dashoffset/transform — cero layout;
 * - `prefers-reduced-motion` recibe las tres escenas TERMINADAS (globals.css);
 * - el contenido informativo vive en el texto de los pasos; los SVG van
 *   `aria-hidden` con su figcaption visible.
 */
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

const STEPS = [
  {
    id: "dibujar",
    eyebrow: "Paso 1 · LINE",
    title: "Dibujas con comandos, como siempre",
    body:
      "La línea de comandos entiende el oficio: LINE, dos puntos, Enter. " +
      "Referencias a objetos, orto y rejilla están donde los esperas — el " +
      "músculo que ya tienes funciona aquí.",
  },
  {
    id: "acotar",
    eyebrow: "Paso 2 · DIMLINEAR",
    title: "La cota dice la verdad, y la sigue diciendo",
    body:
      "La cota nace amarrada a la geometría y rotula el valor real: el muro " +
      "mide 6 000 mm y la lámina dice 6.000. Si mueves el muro, la cota se " +
      "actualiza — asociativa de verdad, no un texto encima.",
  },
  {
    id: "publicar",
    eyebrow: "Paso 3 · PLOT",
    title: "La lámina sale a escala, con cajetín",
    body:
      "PLOT traza un PDF a escala exacta con el cajetín mexicano puesto: " +
      "proyecto, escala, clave de lámina y la responsiva del D.R.O. en su " +
      "lugar. Lo que imprimes es lo que mide.",
  },
] as const;

/** Cadena tecleada: un <span> por carácter, retraso en cascada, solo opacity. */
function Typed({
  text,
  startMs,
  charMs = 55,
  className,
}: {
  text: string;
  startMs: number;
  charMs?: number;
  className?: string;
}) {
  return (
    <tspan className={className}>
      {[...text].map((char, index) => (
        <tspan
          key={`${index}-${char}`}
          className="cmd-char"
          style={
            {
              "--char-delay": `${startMs + index * charMs}ms`,
            } as React.CSSProperties
          }
        >
          {char}
        </tspan>
      ))}
    </tspan>
  );
}

/** Marco común de escena: papel con retícula + línea de comandos abajo. */
function Scene({
  active,
  label,
  children,
  command,
}: {
  active: boolean;
  label: string;
  children: React.ReactNode;
  command: React.ReactNode;
}) {
  return (
    <figure
      className={cx(
        "showcase-scene absolute inset-0 transition-opacity duration-500 ease-out-expo",
        active ? "is-active opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="overflow-hidden rounded-card border border-border bg-background shadow-resting">
        <svg
          viewBox="0 0 480 320"
          fill="none"
          aria-hidden="true"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="block h-auto w-full"
        >
          <g
            className="text-border"
            stroke="currentColor"
            strokeWidth={0.5}
            opacity={0.5}
          >
            {Array.from({ length: 9 }, (_, i) => (
              <path key={`h${i}`} d={`M0 ${(i + 1) * 32}H480`} />
            ))}
            {Array.from({ length: 14 }, (_, i) => (
              <path key={`v${i}`} d={`M${(i + 1) * 32} 0V320`} />
            ))}
          </g>
          {children}
          {/* Línea de comandos: la del producto, monoespaciada, con caret. */}
          <rect
            x="12"
            y="278"
            width="456"
            height="30"
            rx="6"
            className="fill-card stroke-border"
            strokeWidth={1}
          />
          <text
            x="24"
            y="297"
            fontSize="13"
            className="fill-foreground"
            fontFamily="JetBrains Mono, ui-monospace, monospace"
          >
            <tspan className="text-primary-ink" fill="currentColor">
              &gt;{" "}
            </tspan>
            {command}
            <tspan className="cmd-caret fill-foreground">▍</tspan>
          </text>
        </svg>
      </div>
      <figcaption className="type-micro mt-3 text-muted-foreground">
        {label}
      </figcaption>
    </figure>
  );
}

export function ShowcaseFlows() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observers = refs.current.map((element, index) => {
      if (!element) return null;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActive(index);
        },
        { rootMargin: "-40% 0px -40% 0px" },
      );
      observer.observe(element);
      return observer;
    });
    return () => observers.forEach((observer) => observer?.disconnect());
  }, []);

  return (
    <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div>
        {STEPS.map((step, index) => (
          <div
            key={step.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            data-testid={`showcase-step-${step.id}`}
            className={cx(
              "border-l-2 py-14 pl-6 transition-colors duration-300 lg:min-h-[52vh] lg:py-20",
              active === index ? "border-primary" : "border-border",
            )}
          >
            <p className="type-eyebrow text-primary-ink">{step.eyebrow}</p>
            <h3 className="type-title mt-3">{step.title}</h3>
            <p className="type-lead mt-4 text-muted-foreground">{step.body}</p>
            {/* En móvil no hay columna pegajosa: la escena del paso vive aquí,
                activada por el mismo observador. */}
            <div className="relative mt-8 aspect-[480/360] lg:hidden">
              <Scenes active={active === index ? index : -1} />
            </div>
          </div>
        ))}
      </div>

      <div className="relative hidden lg:block">
        <div className="sticky top-28 aspect-[480/360]">
          <Scenes active={active} />
        </div>
      </div>
    </div>
  );
}

/**
 * Las tres escenas apiladas; la activa manda por opacidad. Se montan DOS
 * veces (columna pegajosa de escritorio y bloque por paso en móvil) sin
 * duplicar contenido en el archivo.
 */
function Scenes({ active }: { active: number }) {
  return (
    <>
      {/* ── ESCENA 1 · LINE: el muro naciendo del comando ─────────────── */}
          <Scene
            active={active === 0}
            label="LINE 0,0 → 6000,0 — el muro nace del comando, con osnap activo."
            command={
              <>
                <Typed text="LINE" startMs={200} />
                <Typed
                  text="  0,0"
                  startMs={600}
                  className="fill-muted-foreground"
                />
                <Typed
                  text="  6000,0"
                  startMs={1100}
                  className="fill-muted-foreground"
                />
              </>
            }
          >
            <g
              className="text-foreground"
              stroke="currentColor"
              strokeWidth={2.4}
            >
              <path
                d="M64 216 H 416"
                className="scene-draw"
                pathLength={1}
                style={{ "--draw-delay": "1700ms" } as React.CSSProperties}
              />
              <path
                d="M64 216 V 96"
                className="scene-draw"
                pathLength={1}
                style={{ "--draw-delay": "2500ms" } as React.CSSProperties}
              />
            </g>
            {/* La marca de osnap en el extremo: el imán del punto exacto. */}
            <g
              className="scene-fade text-primary-ink"
              stroke="currentColor"
              strokeWidth={1.6}
              style={{ "--draw-delay": "2400ms" } as React.CSSProperties}
            >
              <rect x="410" y="210" width="12" height="12" fill="none" />
            </g>
          </Scene>

          {/* ── ESCENA 2 · DIMLINEAR: la cota con su valor verdadero ──────── */}
          <Scene
            active={active === 1}
            label="DIMLINEAR — la cota nace asociada y rotula 6.000 (metros)."
            command={<Typed text="DIMLINEAR" startMs={200} />}
          >
            <g
              className="text-foreground"
              stroke="currentColor"
              strokeWidth={2.4}
            >
              <path d="M64 216 H 416" />
              <path d="M64 216 V 96" />
            </g>
            <g
              className="text-primary-ink"
              stroke="currentColor"
              strokeWidth={1.4}
            >
              {/* Líneas de extensión, línea de cota y garrapatas de la norma. */}
              <path
                d="M64 224 V 254"
                className="scene-draw"
                pathLength={1}
                style={{ "--draw-delay": "900ms" } as React.CSSProperties}
              />
              <path
                d="M416 224 V 254"
                className="scene-draw"
                pathLength={1}
                style={{ "--draw-delay": "1100ms" } as React.CSSProperties}
              />
              <path
                d="M64 248 H 416"
                className="scene-draw"
                pathLength={1}
                style={{ "--draw-delay": "1350ms" } as React.CSSProperties}
              />
              <path
                d="M60 252 l 8 -8 M412 252 l 8 -8"
                className="scene-draw"
                pathLength={1}
                style={{ "--draw-delay": "1800ms" } as React.CSSProperties}
              />
            </g>
            <text
              x="240"
              y="242"
              textAnchor="middle"
              fontSize="15"
              fontFamily="JetBrains Mono, ui-monospace, monospace"
              className="scene-fade fill-foreground"
              style={{ "--draw-delay": "2050ms" } as React.CSSProperties}
            >
              6.000
            </text>
          </Scene>

          {/* ── ESCENA 3 · PLOT: la lámina con cajetín saliendo ───────────── */}
          <Scene
            active={active === 2}
            label="PLOT — PDF a escala 1:50 en A1, cajetín mexicano incluido."
            command={<Typed text="PLOT" startMs={200} />}
          >
            {/* El marco de la lámina y su cajetín: la salida real del trazador. */}
            <g
              className="scene-fade"
              style={{ "--draw-delay": "700ms" } as React.CSSProperties}
            >
              <rect
                x="56"
                y="34"
                width="368"
                height="230"
                className="fill-card stroke-foreground"
                strokeWidth={1.6}
              />
              <rect
                x="60"
                y="38"
                width="360"
                height="222"
                fill="none"
                className="stroke-border"
                strokeWidth={0.8}
              />
            </g>
            <g
              className="text-foreground"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                d="M120 190 H 340"
                className="scene-draw"
                pathLength={1}
                style={{ "--draw-delay": "1200ms" } as React.CSSProperties}
              />
              <path
                d="M120 190 V 110"
                className="scene-draw"
                pathLength={1}
                style={{ "--draw-delay": "1500ms" } as React.CSSProperties}
              />
              <path
                d="M120 110 H 250 M340 190 V 150"
                className="scene-draw"
                pathLength={1}
                style={{ "--draw-delay": "1800ms" } as React.CSSProperties}
              />
            </g>
            <g
              className="scene-fade"
              style={{ "--draw-delay": "2200ms" } as React.CSSProperties}
            >
              <rect
                x="284"
                y="222"
                width="140"
                height="42"
                className="fill-muted stroke-border"
                strokeWidth={1}
              />
              <text
                x="292"
                y="238"
                fontSize="10"
                className="fill-foreground"
                fontFamily="JetBrains Mono, ui-monospace, monospace"
              >
                CASA HABITACIÓN
              </text>
              <text
                x="292"
                y="254"
                fontSize="9"
                className="fill-muted-foreground"
                fontFamily="JetBrains Mono, ui-monospace, monospace"
              >
                A-101 · ESC 1:50 · A1
              </text>
            </g>
            <g
              className="scene-fade"
              style={{ "--draw-delay": "2600ms" } as React.CSSProperties}
            >
              <rect
                x="366"
                y="44"
                width="48"
                height="20"
                rx="10"
                className="fill-primary"
                opacity={0.9}
              />
              <text
                x="390"
                y="58"
                textAnchor="middle"
                fontSize="11"
                fontWeight={600}
                className="fill-primary-foreground"
              >
                PDF
              </text>
            </g>
          </Scene>
    </>
  );
}
