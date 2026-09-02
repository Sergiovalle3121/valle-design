import type { CadEntity, CadPoint2 } from "../cad-document";

/**
 * LA PLANTA DE LA PRUEBA DE DESPACHO (área 2 del listón; Ola D, 2026-09-02).
 *
 * «Recibir un DWG, unir 34 líneas mal empatadas y obtener perímetro y
 * superficie.» Este módulo es el DWG: la misma planta la reciben el spec de
 * verificación (`prueba-de-despacho.spec.ts`, oráculo en papel) y el golden
 * (`e2e/golden/74-cad-prueba-de-despacho.spec.ts`, el producto de verdad), para
 * que los dos midan lo mismo y ninguno pueda pasar con una planta más fácil.
 *
 * ORÁCULO EN PAPEL. Un rectángulo de 12.000 × 8.000 con dos chaflanes de 600
 * en las esquinas sur y siete entrantes de 800 × 500 en el lado norte:
 *
 *   superficie = 96.000.000 − 2·(600²/2) − 7·(800·500) = 92.840.000 mm²
 *   perímetro  = 10.800 + 7.400 + (7·2.600 + 800) + 7.400 + 2·600·√2
 *              = 44.600 + 1.697,056… = 46.297,056… mm
 *
 * Los huecos desplazan cada vértice menos de 1 mm, así que lo medido sobre las
 * líneas recibidas difiere del papel en menos de perímetro × 1 mm ≈ 46.300 mm²
 * en superficie (cinco diezmilésimas) y de 34 × 1 mm en perímetro. Esas son
 * las holguras, y esa es su razón.
 */
export const TRAMOS = 34;
export const SUPERFICIE = 96_000_000 - 2 * (600 * 600) / 2 - 7 * (800 * 500);
export const PERIMETRO = 10_800 + 7_400 + (7 * 2_600 + 800) + 7_400 + 2 * 600 * Math.SQRT2;
export const HOLGURA_SUPERFICIE = 46_300;
export const HOLGURA_PERIMETRO = TRAMOS;
/** Un punto dentro de la planta, lejos de todos los tramos. */
export const DENTRO: CadPoint2 = { x: 6_000, y: 4_000 };
/**
 * Un punto SOBRE un tramo: el fondo del tercer entrante contando desde el este
 * (y = 7.500, x de 7.200 a 8.000), lejos de los bordes de la huella y de los
 * paneles que flotan sobre el lienzo.
 */
export const SOBRE_UN_TRAMO: CadPoint2 = { x: 7_600, y: 7_500 };

export function plantaDeDespacho(): CadPoint2[] {
  const points: CadPoint2[] = [
    { x: 600, y: 0 },
    { x: 11_400, y: 0 },
    { x: 12_000, y: 600 },
    { x: 12_000, y: 8_000 },
  ];
  let x = 12_000;
  for (let tooth = 0; tooth < 7; tooth += 1) {
    x -= 800;
    points.push({ x, y: 8_000 }, { x, y: 7_500 });
    x -= 800;
    points.push({ x, y: 7_500 }, { x, y: 8_000 });
  }
  points.push({ x: 0, y: 8_000 }, { x: 0, y: 600 });
  return points;
}

/** Fórmula del cordón: la superficie de un polígono, sin pasar por el producto. */
export function shoelace(points: readonly { x: number; y: number }[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/**
 * Cada tramo va del vértice i al i+1, pero el FINAL se acorta entre 0,2 y 0,9
 * mm y el ARRANQUE de uno de cada tres se desplaza 0,2 mm de través: ningún
 * extremo toca al siguiente (el hueco máximo es hypot(0,9; 0,2) = 0,92 mm) y
 * ninguno queda a menos de 0,2. Determinista, para que las dos pruebas reciban
 * el mismo fichero cada vez.
 */
export function tramosMalEmpatados(): { start: CadPoint2; end: CadPoint2; gap: number }[] {
  const vertices = plantaDeDespacho();
  return vertices.map((from, index) => {
    const to = vertices[(index + 1) % vertices.length];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const dir = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    const gap = 0.2 + 0.7 * (((index * 7) % 10) / 10);
    const across = index % 3 === 0 ? 0.2 : 0;
    return {
      start: { x: from.x - dir.y * across, y: from.y + dir.x * across },
      end: { x: to.x - dir.x * gap, y: to.y - dir.y * gap },
      gap,
    };
  });
}

/** El DXF tal como llega de otro despacho: sólo ENTITIES, 34 LINE en la capa dada. */
export function dxfDeOtroDespacho(layer = "MUROS"): string {
  const lines: string[] = ["0", "SECTION", "2", "ENTITIES"];
  for (const tramo of tramosMalEmpatados())
    lines.push(
      "0", "LINE", "8", layer,
      "10", String(tramo.start.x), "20", String(tramo.start.y), "30", "0",
      "11", String(tramo.end.x), "21", String(tramo.end.y), "31", "0",
    );
  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\n");
}

/** Las mismas 34 líneas ya como entidades del documento (ids `tramo-01` … `tramo-34`). */
export function lineasMalEmpatadas(layer = "MUROS"): CadEntity[] {
  return tramosMalEmpatados().map((tramo, index) => ({
    id: `tramo-${String(index + 1).padStart(2, "0")}`,
    type: "line" as const,
    start: { x: tramo.start.x, y: tramo.start.y, z: 0 },
    end: { x: tramo.end.x, y: tramo.end.y, z: 0 },
    layer,
  }));
}
