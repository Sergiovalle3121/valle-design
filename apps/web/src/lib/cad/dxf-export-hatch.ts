/**
 * El HATCH del DXF, escrito desde la tabla de patrones.
 *
 * Vive fuera de `dxf-export.ts` porque ese archivo está en el presupuesto de
 * monolitos y sólo puede encoger (978 líneas): la definición por familia
 * (53/43/44/45/46/79/49) que sustituye al par de ángulos de antes lo sacaba
 * de su asignación.
 */
import type { CadDxfExportHatch } from "./dxf-export";
import type { CadDxfPoint } from "./dxf-import";
import { fmt, pushPair, pushPoint, safeText } from "./dxf-write-core";
import { cadHatchPatternBaseAngle } from "./hatch-pattern-table";
import { cadHatchPatternDxfLines } from "./hatch-pattern-strokes";

export function hatchLoops(hatch: CadDxfExportHatch): CadDxfPoint[][] {
  return (hatch.boundaries?.length ? hatch.boundaries : hatch.points ? [hatch.points] : [])
    .map((boundary) => {
      if (boundary.length > 3) {
        const first = boundary[0];
        const last = boundary.at(-1)!;
        if (first.x === last.x && first.y === last.y) return boundary.slice(0, -1);
      }
      return boundary;
    })
    .filter((boundary) => boundary.length >= 3);
}

export function pushHatch(lines: string[], layer: string, hatch: CadDxfExportHatch) {
  const boundaries = hatchLoops(hatch);
  const requestedPattern = safeText(hatch.pattern || (hatch.solid === false ? "ANSI31" : "SOLID")) || "SOLID";
  const solid = hatch.solid ?? requestedPattern.toUpperCase() === "SOLID";
  const pattern = solid ? "SOLID" : requestedPattern.toUpperCase() === "SOLID" ? "ANSI31" : requestedPattern;
  const angle = Number.isFinite(hatch.angle) ? hatch.angle! : cadHatchPatternBaseAngle(pattern);
  const scale = Number.isFinite(hatch.scale) && hatch.scale! > 0 ? hatch.scale! : 1;
  const origin = hatch.origin ?? boundaries[0]?.[0] ?? { x: 0, y: 0 };
  const islandStyle = hatch.islandStyle === "outer" ? 1 : hatch.islandStyle === "ignore" ? 2 : 0;
  pushPair(lines, 0, "HATCH");
  pushPair(lines, 8, layer);
  pushPoint(lines, { x: 0, y: 0 }); // punto de elevación (siempre 0 en 2D)
  pushPair(lines, 210, "0");
  pushPair(lines, 220, "0");
  pushPair(lines, 230, "1");
  pushPair(lines, 2, pattern);
  pushPair(lines, 70, solid ? 1 : 0);
  pushPair(lines, 71, 0); // no asociativo
  pushPair(lines, 91, boundaries.length);
  for (const boundary of boundaries) {
    pushPair(lines, 92, 2); // camino = polilínea
    pushPair(lines, 72, 0); // sin bulge
    pushPair(lines, 73, 1); // cerrado
    pushPair(lines, 93, boundary.length);
    for (const point of boundary) {
      pushPair(lines, 10, fmt(point.x));
      pushPair(lines, 20, fmt(point.y));
    }
    pushPair(lines, 97, 0); // sin objetos fuente
  }
  pushPair(lines, 75, islandStyle);
  pushPair(lines, 76, 1); // patrón predefinido
  if (!solid) {
    // 52 es el GIRO del patrón, no el ángulo de sus rayas: `angle` persiste
    // el ángulo absoluto de la primera familia (45 en ANSI31), así que el
    // fichero lleva `angle − base`. Antes se escribía 52 = 45 y 53 = 45 para
    // un ANSI31 sin girar, y AutoCAD lo abría con las rayas a 90°. Cada
    // familia de la tabla sale como su propio renglón 53/43/44/45/46/79/49,
    // con el vector entre líneas ya girado al dibujo; 41 sigue siendo la
    // separación de ANSI31 en unidades de dibujo, como siempre.
    const definitionLines = cadHatchPatternDxfLines(pattern, angle, scale, origin);
    pushPair(lines, 52, fmt(angle - cadHatchPatternBaseAngle(pattern)));
    pushPair(lines, 41, fmt(scale));
    pushPair(lines, 77, 0);
    pushPair(lines, 78, definitionLines.length);
    for (const line of definitionLines) {
      pushPair(lines, 53, fmt(line.angle));
      pushPair(lines, 43, fmt(line.base.x));
      pushPair(lines, 44, fmt(line.base.y));
      pushPair(lines, 45, fmt(line.offset.x));
      pushPair(lines, 46, fmt(line.offset.y));
      pushPair(lines, 79, line.dashes.length);
      for (const dash of line.dashes) pushPair(lines, 49, fmt(dash));
    }
  }
  pushPair(lines, 98, 1);
  pushPoint(lines, origin);
}
