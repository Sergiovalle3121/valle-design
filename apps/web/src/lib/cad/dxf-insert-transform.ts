/**
 * La transformación de un INSERT aplicada a las primitivas de su bloque.
 *
 * Es el camino de COMPATIBILIDAD: `importDxfPrimitives` conserva los bloques
 * como definiciones semánticas y además aplana cada INSERT a primitivas sueltas
 * para el código anterior a ese contrato. Sale de `dxf-import.ts` porque ese
 * archivo está en su asignación de tamaño y porque es una pieza coherente: la
 * matriz de un INSERT y lo que le hace a cada campo, sin nada del parser.
 *
 * ## Lo que este módulo existe para no volver a equivocar
 *
 * Los PUNTOS siempre usaron `sx`/`sy` **con signo**, así que un bloque
 * espejado aterrizaba donde tocaba. Los ÁNGULOS del arco recibían sólo el giro.
 * El resultado no era «un poco impreciso»: era incoherente CONSIGO MISMO — los
 * extremos del arco en su sitio y el arco combado hacia el otro lado. Un
 * dibujo plausible y equivocado, que es la peor clase.
 *
 * Módulo puro: sin THREE, sin DOM, sin estado.
 */
import type { CadDxfPoint, CadDxfPrimitive } from "./dxf-import";

/** Transformación de un INSERT: posición + rotación (grados) + escala. */
export interface CadDxfInsertTransform {
  x: number;
  y: number;
  rotationDeg: number;
  sx: number;
  sy: number;
}

/** Parte LINEAL de la transformación: el giro compuesto con la escala CON signo. */
export function transformInsertVector(
  v: CadDxfPoint,
  t: CadDxfInsertTransform,
): CadDxfPoint {
  const rad = (t.rotationDeg * Math.PI) / 180;
  const x = v.x * t.sx;
  const y = v.y * t.sy;
  return { x: x * Math.cos(rad) - y * Math.sin(rad), y: x * Math.sin(rad) + y * Math.cos(rad) };
}

/**
 * NO se escribe como `t + transformInsertVector(p, t)`: sumar la traslación al
 * final cambia el orden de evaluación en coma flotante y con él el último
 * dígito de cada coordenada importada. Eso no es purismo — la versión de una
 * entidad se calcula con `JSON.stringify`, así que un ulp de diferencia la
 * marca como cambiada y dispara un guardado que nadie pidió. Se conserva la
 * expresión tal cual estaba.
 */
export function transformInsertPoint(
  p: CadDxfPoint,
  t: CadDxfInsertTransform,
): CadDxfPoint {
  const rad = (t.rotationDeg * Math.PI) / 180;
  const x = p.x * t.sx;
  const y = p.y * t.sy;
  return { x: t.x + x * Math.cos(rad) - y * Math.sin(rad), y: t.y + x * Math.sin(rad) + y * Math.cos(rad) };
}

/**
 * Cómo deja la parte lineal —`R(θ)·diag(sx, sy)`— un ángulo ALMACENADO.
 *
 * Su determinante vale `sx·sy`: hay espejo cuando los signos difieren, y
 * entonces `atan2(b, a)` no es un giro sino `2φ`, el doble del ángulo del eje.
 * Ese ángulo base vale `θ` con `sx > 0` y `θ + 180` con `sx < 0` — el otro caso
 * que faltaba: con `(−1, −1)`, que es un giro de 180°, los puntos se movían y
 * los ángulos se quedaban donde estaban.
 */
export function mappedInsertAngle(t: CadDxfInsertTransform, angle: number): number {
  const base = t.sx < 0 ? t.rotationDeg + 180 : t.rotationDeg;
  return (((t.sx * t.sy < 0 ? base - angle : angle + base) % 360) + 360) % 360;
}

/** Aplica la transformación del INSERT a una primitiva ya mapeada. */
export function transformInsertPrimitive(
  primitive: CadDxfPrimitive,
  t: CadDxfInsertTransform,
): CadDxfPrimitive {
  const out: CadDxfPrimitive = {
    ...primitive,
    points: primitive.points.map((p) => transformInsertPoint(p, t)),
  };
  if (primitive.majorAxis) out.majorAxis = transformInsertVector(primitive.majorAxis, t);
  if (typeof primitive.radius === "number") {
    // Escala uniforme esperada; ante anisotropía se usa el promedio (avisado).
    out.radius = primitive.radius * ((Math.abs(t.sx) + Math.abs(t.sy)) / 2);
  }
  if (primitive.kind === "arc") {
    // El arco gira con el bloque; la elipse no (sus parámetros son relativos al
    // eje mayor, que ya rotó como vector). Bajo espejo los extremos se
    // INTERCAMBIAN además de reflejarse, porque un arco DXF se recorre siempre
    // en antihorario: reflejarlos sin intercambiarlos da el arco complementario.
    const reflected = t.sx * t.sy < 0;
    out.startAngle = mappedInsertAngle(t, (reflected ? primitive.endAngle : primitive.startAngle) ?? 0);
    out.endAngle = mappedInsertAngle(t, (reflected ? primitive.startAngle : primitive.endAngle) ?? 0);
  }
  return out;
}
