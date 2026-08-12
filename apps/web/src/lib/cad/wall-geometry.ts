/**
 * Geometría DERIVADA del muro paramétrico.
 *
 * `CadWallEntity` persiste la receta —eje, grosor, altura— y este módulo es el
 * único sitio donde esa receta se convierte en contorno. La unicidad no es
 * estética: el adaptador de entidad, la previsualización del comando WALL y la
 * exportación DXF tienen que dibujar EXACTAMENTE el mismo polígono, porque un
 * contorno que difiere entre lo que se ve, lo que se pincha y lo que se exporta
 * es la clase de defecto que nadie reproduce dos veces igual.
 *
 * Es una HOJA del grafo de carga: importa sólo tipos, así que el manifiesto de
 * pérdidas y los adaptadores pueden depender de él sin cerrar ningún ciclo.
 */
import type { CadPoint2 } from "./cad-document";
import type { CadWallEntity } from "./cad-entities-v6";

/** La receta mínima de planta: el eje y el grosor. `height` no pinta aquí. */
export type CadWallPlanRecipe = Pick<CadWallEntity, "start" | "end" | "thickness">;

/**
 * Las cuatro esquinas del contorno en planta, en sentido ANTIHORARIO.
 *
 * El grosor se reparte simétricamente a ambos lados del eje. El orden empieza
 * en la esquina «izquierda» del arranque (mirando de `start` a `end`) y
 * recorre el contorno de forma que el área con signo salga positiva — lo que
 * espera todo consumidor de anillos del producto, de `pointInPolygon` a la
 * extrusión de sólidos.
 *
 * Devuelve `null` para una receta degenerada (eje de longitud nula o grosor
 * no positivo) en vez de un polígono colapsado: la validación del servidor la
 * rechaza al guardar, pero el render no puede permitirse reventar por un
 * documento que aún no cruzó la frontera.
 */
export function wallFootprint(wall: CadWallPlanRecipe): CadPoint2[] | null {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-9) || !(wall.thickness > 0)) return null;
  // Normal unitaria a la izquierda del eje; media anchura hacia cada lado.
  const nx = (-dy / length) * (wall.thickness / 2);
  const ny = (dx / length) * (wall.thickness / 2);
  return [
    { x: wall.start.x + nx, y: wall.start.y + ny },
    { x: wall.start.x - nx, y: wall.start.y - ny },
    { x: wall.end.x - nx, y: wall.end.y - ny },
    { x: wall.end.x + nx, y: wall.end.y + ny },
  ];
}

/**
 * Rayado ligero del interior, como segmentos sueltos a 45° del eje.
 *
 * Es la representación de planta de toda la vida: la doble línea dice «muro» y
 * el rayado dice «cortado por el plano». Se generan en el marco LOCAL del eje
 * y se llevan al mundo, así el rayado gira con el muro y no cambia al moverlo
 * — un rayado anclado al mundo «nada» dentro del contorno con cada MOVE.
 *
 * El paso se ata al grosor (2×) para que un muro fino no se ennegrezca y uno
 * grueso no quede casi vacío. Cada segmento cruza de cara a cara, recortado
 * por los extremos del eje.
 */
export function wallFillSegments(wall: CadWallPlanRecipe): { a: CadPoint2; b: CadPoint2 }[] {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-9) || !(wall.thickness > 0)) return [];
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const half = wall.thickness / 2;
  const step = wall.thickness * 2;
  const segments: { a: CadPoint2; b: CadPoint2 }[] = [];
  // En el marco local, un segmento a 45° que arranca en (t, -half) termina en
  // (t + thickness, +half). Se recorre `t` desde el arranque, dejando fuera
  // los que no caben enteros: un rayado recortado a mitad de trazo parece un
  // defecto de dibujo, no una convención.
  for (let t = step / 2; t + wall.thickness <= length; t += step) {
    const ax = wall.start.x + ux * t - nx * half;
    const ay = wall.start.y + uy * t - ny * half;
    const bx = wall.start.x + ux * (t + wall.thickness) + nx * half;
    const by = wall.start.y + uy * (t + wall.thickness) + ny * half;
    segments.push({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
  }
  return segments;
}

/** Punto medio del eje: el asidero natural para mover el muro entero. */
export function wallMidpoint(wall: CadWallPlanRecipe): CadPoint2 {
  return {
    x: (wall.start.x + wall.end.x) / 2,
    y: (wall.start.y + wall.end.y) / 2,
  };
}

/** Longitud del eje. Es la que un dibujante llama «longitud del muro». */
export function wallLength(wall: CadWallPlanRecipe): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}
