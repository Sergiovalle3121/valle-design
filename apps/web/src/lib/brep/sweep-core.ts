/**
 * Cosido de secciones: la maquinaria común de extrusión, revolución, barrido y
 * solevado.
 *
 * Las cuatro operaciones son la MISMA operación con distinta forma de generar
 * las secciones. Extruir es mover el perfil en línea recta; revolucionar es
 * girarlo; barrer es llevarlo por un camino; solevar es interpolar entre
 * perfiles distintos. Una vez hay una lista de secciones con el mismo número de
 * puntos, coserlas es idéntico en los cuatro casos — y escribir ese cosido
 * cuatro veces es escribir cuatro veces el mismo bug de orientación.
 *
 * ORIENTACIÓN, QUE ES DE LO QUE VA ESTO. El convenio de perfiles (contorno
 * antihorario, agujeros horarios) hace todo el trabajo. La cara lateral entre la
 * sección `i` y la `i+1` se construye SIEMPRE igual:
 *
 *     [ s_i[k], s_i[k+1], s_{i+1}[k+1], s_{i+1}[k] ]
 *
 * Para el contorno eso da la normal hacia fuera. Para un agujero, como se
 * recorre al revés, la misma fórmula da la normal hacia el AGUJERO — que es
 * hacia fuera del material. No hace falta ningún caso especial, y no haberlo es
 * lo que evita que un agujero salga del revés en una de las cuatro operaciones y
 * no en las otras tres.
 *
 * SECCIONES QUE COLAPSAN. La punta de un cono es una sección de radio cero:
 * todos sus puntos son el mismo. `BodyBuilder` suelda los vértices repetidos, de
 * modo que el cuadrilátero lateral se convierte solo en un triángulo. Es la
 * razón de construir por PUNTOS y no por índices: los índices habría que
 * colapsarlos a mano, caso por caso, en cada operación.
 */
import { BodyBuilder } from "./body-builder";
import { BREP_TOLERANCE } from "./tolerance";
import type { BrepBody } from "./topology";
import type { Vec3 } from "./vec3";

/** Una sección del barrido, ya en coordenadas del mundo. */
export interface SweepSection {
  outer: Vec3[];
  inners: Vec3[][];
}

export interface StitchOptions {
  /** Tapar el primer extremo. Una revolución completa no lleva tapas. */
  capStart?: boolean;
  capEnd?: boolean;
  /** El barrido vuelve sobre sí mismo: la última sección se cose con la primera. */
  closed?: boolean;
  tolerance?: number;
}

/**
 * Cose una lista de secciones en un cuerpo.
 *
 * Todas las secciones deben tener el mismo número de puntos en el contorno y en
 * cada agujero. Se comprueba y se lanza: dos secciones con distinto número de
 * puntos no tienen ninguna correspondencia obvia, y elegir una en silencio
 * (emparejar por índice y sobrar puntos) produce un sólido retorcido que parece
 * correcto en el visor y tiene el volumen mal.
 */
export function stitchSections(sections: readonly SweepSection[], options: StitchOptions = {}): BrepBody {
  const closed = options.closed ?? false;
  if (sections.length < 2) throw new Error(`Un barrido necesita al menos 2 secciones, llegaron ${sections.length}.`);
  const reference = sections[0];
  for (let i = 1; i < sections.length; i += 1) {
    const section = sections[i];
    if (section.outer.length !== reference.outer.length) {
      throw new Error(
        `Sección ${i}: ${section.outer.length} puntos en el contorno frente a ${reference.outer.length} de la sección 0. Las secciones tienen que corresponderse punto a punto.`,
      );
    }
    if (section.inners.length !== reference.inners.length) {
      throw new Error(`Sección ${i}: ${section.inners.length} agujeros frente a ${reference.inners.length} de la sección 0.`);
    }
    for (let h = 0; h < section.inners.length; h += 1) {
      if (section.inners[h].length !== reference.inners[h].length) {
        throw new Error(`Sección ${i}, agujero ${h}: ${section.inners[h].length} puntos frente a ${reference.inners[h].length}.`);
      }
    }
  }

  const builder = new BodyBuilder(options.tolerance ?? BREP_TOLERANCE.linear);
  const lastPair = closed ? sections.length : sections.length - 1;
  for (let i = 0; i < lastPair; i += 1) {
    const from = sections[i];
    const to = sections[(i + 1) % sections.length];
    stitchRing(builder, from.outer, to.outer);
    for (let h = 0; h < from.inners.length; h += 1) stitchRing(builder, from.inners[h], to.inners[h]);
  }

  if (!closed) {
    if (options.capStart ?? true) {
      const first = sections[0];
      builder.addPolygon([...first.outer].reverse(), { inners: first.inners.map((hole) => [...hole].reverse()) });
    }
    if (options.capEnd ?? true) {
      const last = sections[sections.length - 1];
      builder.addPolygon([...last.outer], { inners: last.inners.map((hole) => [...hole]) });
    }
  }
  return builder.build();
}

/**
 * Cose dos anillos, PARTIENDO EN TRIÁNGULOS los cuadriláteros alabeados.
 *
 * Esto no es una optimización: es una corrección. El cuadrilátero entre dos
 * secciones sólo es plano cuando las dos aristas que une son paralelas o
 * coplanarias. En una extrusión o una revolución siempre lo son; en un solevado
 * entre un cuadrado y un octógono, o entre dos cuadrados girados, NO — y un
 * cuadrilátero alabeado no tiene plano, así que:
 *
 *   · el volumen por integración sobre caras (que asume caras planas) sale mal,
 *   · la normal por Newell no describe ninguno de sus dos "medios",
 *   · y el teselado tendría que inventarse una diagonal, distinta según quién
 *     lo tesele.
 *
 * Partirlo aquí, una sola vez y con la diagonal escrita, resuelve las tres cosas
 * a la vez. El sólido tiene más caras y todas son planas de verdad, que es la
 * hipótesis sobre la que se sostiene el resto del kernel.
 */
function stitchRing(builder: BodyBuilder, from: readonly Vec3[], to: readonly Vec3[]): void {
  for (let k = 0; k < from.length; k += 1) {
    const j = (k + 1) % from.length;
    const quad: Vec3[] = [from[k], from[j], to[j], to[k]];
    if (quadIsPlanar(quad)) {
      builder.addPolygon(quad);
      continue;
    }
    // La DIAGONAL importa, y no de forma cosmética. Un cuadrilátero alabeado no
    // encierra un volumen definido: las dos triangulaciones posibles difieren
    // exactamente en ⅙ del determinante de sus cuatro esquinas, y el volumen del
    // sólido cambia con ella. Se elige la diagonal CORTA porque produce
    // triángulos menos degenerados y porque es una regla determinista — no
    // porque sea "la correcta", que no existe. Quien necesite el sólido reglado
    // de verdad debe subdividir con `steps`: el alabeo baja con el cuadrado del
    // número de secciones y las dos triangulaciones convergen a lo mismo.
    const diagonal02 = squaredDistance(quad[0], quad[2]);
    const diagonal13 = squaredDistance(quad[1], quad[3]);
    if (diagonal02 <= diagonal13) {
      builder.addPolygon([quad[0], quad[1], quad[2]]);
      builder.addPolygon([quad[0], quad[2], quad[3]]);
    } else {
      builder.addPolygon([quad[1], quad[2], quad[3]]);
      builder.addPolygon([quad[1], quad[3], quad[0]]);
    }
  }
}

function squaredDistance(a: Vec3, b: Vec3): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}

/** ¿Los cuatro puntos son coplanarios, con tolerancia relativa a su tamaño? */
function quadIsPlanar(quad: readonly Vec3[]): boolean {
  const [a, b, c, d] = quad;
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const ad = { x: d.x - a.x, y: d.y - a.y, z: d.z - a.z };
  const normal = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  };
  const area = Math.hypot(normal.x, normal.y, normal.z);
  if (area === 0) return true;
  const distance = Math.abs(normal.x * ad.x + normal.y * ad.y + normal.z * ad.z) / area;
  const scale = Math.max(
    Math.hypot(ab.x, ab.y, ab.z),
    Math.hypot(ac.x, ac.y, ac.z),
    Math.hypot(ad.x, ad.y, ad.z),
  );
  return distance <= 1e-12 * Math.max(1, scale);
}

/**
 * Remuestrea un anillo cerrado a `count` puntos repartidos por longitud de arco.
 *
 * Lo necesita el solevado entre perfiles de distinto número de puntos. Repartir
 * por longitud de arco y no por índice importa: emparejar el vértice 3 de un
 * triángulo con el vértice 3 de un dodecágono retuerce la superficie, y el
 * resultado es un sólido válido cuyo volumen no se parece al que pidió nadie.
 */
export function resampleRing(points: readonly Vec3[], count: number): Vec3[] {
  if (count < 3) throw new Error(`Un anillo remuestreado necesita al menos 3 puntos, se pidieron ${count}.`);
  const n = points.length;
  const lengths: number[] = [0];
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    lengths.push(lengths[i] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  const total = lengths[n];
  if (total === 0) throw new Error("No se puede remuestrear un anillo de longitud cero.");
  const out: Vec3[] = [];
  for (let k = 0; k < count; k += 1) {
    const target = (total * k) / count;
    let segment = 0;
    while (segment < n - 1 && lengths[segment + 1] < target) segment += 1;
    const span = lengths[segment + 1] - lengths[segment];
    const t = span === 0 ? 0 : (target - lengths[segment]) / span;
    const a = points[segment];
    const b = points[(segment + 1) % n];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  }
  return out;
}

/**
 * Alinea el punto de arranque de `ring` con el de `reference` minimizando la
 * suma de distancias al cuadrado sobre todas las rotaciones posibles.
 *
 * Sin esto, solevar entre dos cuadrados girados 45° produce un sólido retorcido
 * media vuelta: perfectamente válido en topología, y visiblemente absurdo.
 */
export function alignRingStart(ring: readonly Vec3[], reference: readonly Vec3[]): Vec3[] {
  const n = ring.length;
  if (n !== reference.length || n === 0) return [...ring];
  let bestShift = 0;
  let bestCost = Infinity;
  for (let shift = 0; shift < n; shift += 1) {
    let cost = 0;
    for (let k = 0; k < n; k += 1) {
      const a = ring[(k + shift) % n];
      const b = reference[k];
      cost += (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestShift = shift;
    }
  }
  return Array.from({ length: n }, (_, k) => ring[(k + bestShift) % n]);
}
