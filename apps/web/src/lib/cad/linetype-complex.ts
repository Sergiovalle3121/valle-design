/**
 * TIPOS DE LÍNEA COMPLEJOS CON TEXTO: ----GAS----GAS---- (Ola F, 2026-09-02).
 *
 * Medido antes (`distancia-autocad-completo-20260901.md`, §4 2º MEP): el
 * bloqueo de un plano de instalaciones no era MEP, eran los tipos de línea
 * con texto incrustado, que `linetype-lin.ts` declaraba imposibles y sacaba
 * por `skipped`. Un plano de instalaciones distingue gas de drenaje de agua
 * fría SÓLO por el tipo de línea.
 *
 * ## Por qué una tabla de fábrica y no un campo persistido
 *
 * El documento persiste sus tipos de línea como `{ pattern: number[] }`
 * (`styles.linetype`): sólo trazos y huecos. Guardar el texto por tipo de
 * línea sería tocar el formato persistido, que es decisión del titular y no
 * se ha tomado. Así que, como con los patrones de sombreado (`hatch-pattern-
 * table.ts`), los tipos con texto viven en CÓDIGO y se referencian POR
 * NOMBRE: una capa que diga GAS_LINE dibuja «GAS» en pantalla, en la lámina,
 * en el PDF y en el DXF, y un documento antiguo que la nombre lo hace desde
 * hoy sin cambiar un byte de lo guardado. El precio, dicho: un `.lin` propio
 * con texto sigue sin cargarse (el lector lo dice y nombra a esta familia).
 *
 * ## La geometría, la de acad.lin
 *
 * `A,.5,-.2,["GAS",STANDARD,S=.1,R=0.0,X=-0.1,Y=-.05],-.25` es un ciclo de
 * 0,95 unidades: trazo 0,5, hueco 0,2, TEXTO (sin longitud propia) y hueco
 * 0,25. El texto arranca donde acaba el segundo tramo (0,7) desplazado X = −0,1
 * a lo largo de la línea e Y = −0,05 en perpendicular, con altura S = 0,1, y
 * todo se multiplica por la escala del tipo de línea (LTSCALE × la propia),
 * igual que los trazos. Un ciclo de 0,95 en un plano en milímetros es
 * invisible: se dibuja con LTSCALE 500–1000, como en AutoCAD.
 *
 * ## Lo que se decide aquí y NO tiene oráculo externo
 *
 *   - El texto se dibuja DERECHO (la opción `U` de AutoCAD): en un tramo que
 *     va de derecha a izquierda se gira 180° y se ancla por su otro extremo.
 *   - El patrón se reinicia en cada vértice de la polilínea (PLINEGEN = 0,
 *     el valor de fábrica); los arcos, círculos y tramos con bulge llevan
 *     los trazos pero no el texto, y se declara en ESCALERA.
 *   - En el DXF, el texto va como atributo del TRAMO que empieza donde el
 *     `.lin` lo coloca (códigos 74/75/46/50/44/45/9 sobre ese 49). El corpus
 *     admitido no trae ningún LTYPE con 74 ≠ 0 y `dxf-parser` ignora el 74,
 *     así que la lectura por AutoCAD queda sin verificar y así se dice.
 */
import type { CadPoint2 } from "./cad-document";

export interface CadLinetypeTextElement {
  text: string;
  /** Altura del texto en unidades del ciclo (S). */
  height: number;
  /** Índice del tramo del patrón en cuyo ARRANQUE se coloca el texto. */
  element: number;
  /** Desplazamiento a lo largo de la línea (X) y en perpendicular (Y), en unidades del ciclo. */
  dx: number;
  dy: number;
  /** Giro relativo a la línea, en grados (R). */
  rotation: number;
}

export interface CadComplexLinetype {
  name: string;
  description: string;
  /** Longitudes con signo (>0 trazo, <0 hueco), SIN mezclar los huecos que rodean al texto. */
  pattern: readonly number[];
  texts: readonly CadLinetypeTextElement[];
}

/** El ciclo de acad.lin para un rótulo de N letras: trazo 0,5, hueco 0,2, texto, hueco. */
function service(name: string, description: string, text: string, tailGap = 0.25): CadComplexLinetype {
  return {
    name,
    description,
    pattern: [0.5, -0.2, -tailGap],
    texts: [{ text, height: 0.1, element: 2, dx: -0.1, dy: -0.05, rotation: 0 }],
  };
}

/**
 * Los de fábrica: los dos de acad.lin con texto y la familia de servicios
 * como se rotulan en México (AF, AC, SAN, PLU, GAS, CI). Los de acad.lin con
 * FORMAS (FENCELINE1/2, TRACKS, ZIGZAG, BATTING) piden un `.shx` y no están.
 */
export const CAD_COMPLEX_LINETYPES: readonly CadComplexLinetype[] = [
  service("GAS_LINE", "Gas ----GAS----GAS----GAS----GAS----", "GAS"),
  service("HOT_WATER_SUPPLY", "Agua caliente ---- HW ---- HW ---- HW ----", "HW", 0.2),
  service("AGUA_FRIA", "Agua fría ----AF----AF----AF----", "AF", 0.2),
  service("AGUA_CALIENTE", "Agua caliente ----AC----AC----AC----", "AC", 0.2),
  service("SANITARIO", "Drenaje sanitario ----SAN----SAN----SAN----", "SAN"),
  service("PLUVIAL", "Drenaje pluvial ----PLU----PLU----PLU----", "PLU"),
  service("CONTRA_INCENDIO", "Red contra incendio ----CI----CI----CI----", "CI", 0.2),
];

/** El tipo complejo de ese nombre (sin distinguir mayúsculas), o `undefined`. */
export function cadComplexLinetypeFor(name: string | undefined): CadComplexLinetype | undefined {
  if (!name) return undefined;
  const wanted = name.trim().toUpperCase();
  return CAD_COMPLEX_LINETYPES.find((entry) => entry.name.toUpperCase() === wanted);
}

/** Longitud de un ciclo en unidades del ciclo. */
export function cadComplexLinetypeCycle(definition: CadComplexLinetype): number {
  return definition.pattern.reduce((total, value) => total + Math.abs(value), 0);
}

export interface CadLinetypeTextPlacement {
  text: string;
  /** Origen de la línea base, en las unidades de los puntos. */
  x: number;
  y: number;
  /** Altura del texto, en las unidades de los puntos. */
  height: number;
  /** Giro legible, en grados. */
  rotationDeg: number;
  /** `right` cuando el tramo iba hacia la izquierda y el rótulo se giró para leerse derecho. */
  align: "left" | "right";
}

/**
 * Dónde cae cada rótulo a lo largo de un camino de tramos RECTOS.
 *
 * `scale` es la escala del tipo de línea en las unidades de los puntos
 * (LTSCALE × escala propia en el modelo; LTSCALE en mm sobre el papel). El
 * patrón se reinicia en cada tramo. Un tramo más corto que la posición del
 * primer rótulo no lleva ninguno: un texto cortado a media letra es peor que
 * un tramo sin rótulo, y así lo hace AutoCAD.
 */
export function cadLinetypeTextPlacements(
  points: readonly CadPoint2[],
  closed: boolean,
  definition: CadComplexLinetype,
  scale: number,
): CadLinetypeTextPlacement[] {
  if (!(scale > 0) || points.length < 2) return [];
  const cycle = cadComplexLinetypeCycle(definition) * scale;
  if (!(cycle > 0)) return [];
  const placements: CadLinetypeTextPlacement[] = [];
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 1e-9)) continue;
    const ux = dx / length;
    const uy = dy / length;
    // Derecho: si el tramo va hacia la izquierda, el rótulo gira 180° y se
    // ancla por su otro extremo, para que «GAS» no se lea «SAG».
    const flip = ux < -1e-9 || (Math.abs(ux) <= 1e-9 && uy < 0);
    const angle = (Math.atan2(uy, ux) * 180) / Math.PI;
    const rotationDeg = flip ? angle + 180 : angle;
    for (const element of definition.texts) {
      const start = definition.pattern.slice(0, element.element).reduce((total, value) => total + Math.abs(value), 0) * scale;
      const along = start + element.dx * scale;
      const across = element.dy * scale;
      const height = element.height * scale;
      for (let position = along; position + height * 0.5 * element.text.length <= length + 1e-9; position += cycle) {
        if (position < -1e-9) continue;
        // Perpendicular a la IZQUIERDA del avance; con el rótulo girado, la Y
        // del texto apunta al otro lado y el desplazamiento cambia de signo.
        const side = flip ? -across : across;
        placements.push({
          text: element.text,
          x: a.x + ux * position - uy * side,
          y: a.y + uy * position + ux * side,
          height,
          rotationDeg: ((rotationDeg + element.rotation) % 360 + 360) % 360,
          align: flip ? "right" : "left",
        });
      }
    }
  }
  return placements;
}
