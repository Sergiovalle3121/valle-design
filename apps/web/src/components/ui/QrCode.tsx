import { encodeQr } from "@/lib/qr/qr-encode";
import { cx } from "./styles";

/**
 * UN CÓDIGO QR, en SVG y sin dependencias.
 *
 * ── POR QUÉ SVG Y NO CANVAS ─────────────────────────────────────────────────
 * Un QR es geometría, no una imagen. En SVG sale nítido a cualquier tamaño y en
 * cualquier densidad de pantalla, se puede imprimir, y —lo que más importa
 * aquí— se renderiza en el SERVIDOR: el usuario ve el código en el primer
 * pintado, sin esperar a que hidrate nada. Un canvas obligaría a JavaScript en
 * el cliente para dibujar algo que no cambia nunca.
 *
 * ── LA ZONA TRANQUILA NO ES ADORNO ──────────────────────────────────────────
 * El estándar exige cuatro módulos de margen claro alrededor. Sin ellos, un
 * lector real falla a menudo: necesita ese silencio para encontrar los bordes.
 * El codificador devuelve la matriz desnuda a propósito —el margen es decisión
 * de quien pinta— y aquí se añade.
 *
 * ── EL FONDO ES BLANCO SIEMPRE, TAMBIÉN EN TEMA OSCURO ──────────────────────
 * Y es deliberado. Un QR con los colores invertidos lo leen algunos lectores y
 * otros no, y quien esté dando de alta su segundo factor en modo oscuro no
 * tiene por qué descubrir de qué bando es su teléfono. Las dos tintas son
 * tokens (`--qr-dark`, `--qr-light`) que `.dark` NO redefine: son un requisito
 * de lectura, no paleta — la misma clase de excepción que los colores ACI del
 * dibujo. El MARCO que lo rodea sí sigue el tema.
 */
export function QrCode({
  value,
  className,
  label,
}: {
  value: string;
  className?: string;
  /** Alternativa textual. El contenido crudo de un QR no se lee en voz alta. */
  label: string;
}) {
  const { modules, size } = encodeQr(value);
  const QUIET = 4;
  const total = size + QUIET * 2;

  // Un solo `<path>` con todos los módulos en vez de miles de `<rect>`: un QR
  // de versión 4 tiene ~1.100 módulos oscuros, y mil elementos en el árbol
  // cuestan más que una cadena larga.
  let d = "";
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (modules[row][col]) {
        d += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label={label}
      className={cx("block h-auto w-full", className)}
      shapeRendering="crispEdges"
    >
      {/*
        Las dos tintas salen de `--qr-dark` / `--qr-light`, que existen en
        `globals.css` justo para esto y valen lo mismo en los dos temas: un QR
        es un requisito de lectura, no una decisión de paleta.
      */}
      <rect width={total} height={total} fill="hsl(var(--qr-light))" />
      <path d={d} fill="hsl(var(--qr-dark))" />
    </svg>
  );
}
