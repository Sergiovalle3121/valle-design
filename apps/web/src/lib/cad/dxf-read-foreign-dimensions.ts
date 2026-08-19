/**
 * Cotas que llegan de OTRO CAD: DIMENSION sin XDATA nuestra.
 *
 * ## Qué se perdía
 *
 * El lector sólo reconocía como cota la que había escrito este producto, porque
 * la identificaba por su XDATA. Una DIMENSION del estructurista no la tenía, así
 * que caía al camino de aplanado: se expandía la geometría de su bloque anónimo
 * `*D` y entraban seis líneas y un texto. El plano se ve IDÉNTICO — ése es el
 * problema— y deja de medir: mover el muro ya no cambia el número, y el número
 * es el que compara el municipio.
 *
 * ## Qué se puede reconstruir y qué no
 *
 * La entidad DIMENSION lleva sus puntos medidos en códigos propios (13/23 y
 * 14/24 los de las líneas de extensión, 15/25 el centro o el vértice según la
 * familia) y su tipo en el 70. Con eso se rehace una cota VIVA: la medida se
 * recalcula desde los puntos y el texto vuelve a salir de la medida.
 *
 * Lo que NO se reconstruye es la asociatividad a la geometría. En DXF eso vive
 * en `$DIMASSOC` y en unos reactores persistentes que apuntan por handle a las
 * entidades medidas; esos handles son del fichero de origen y no nombran nada
 * de nuestro documento. Reconstruir la cadena a ojo —buscar qué línea pasa por
 * el punto medido— produciría una asociación que parece correcta y se rompe en
 * el primer plano donde dos entidades comparten un extremo. Así que la cota
 * entra DESLIGADA y se DECLARA: mide lo suyo y se recalcula si mueves la cota,
 * pero no se entera de que has movido el muro. Es la degradación honesta.
 *
 * ## Las familias que no se rehacen
 *
 * La angular de DOS LÍNEAS (tipo 2) da el vértice intersecando las dos rectas,
 * y un par casi paralelo lo manda al infinito sin que nada falle. La lineal
 * GIRADA a un ángulo que no sea múltiplo de 90° no cabe en el modelo canónico,
 * que sólo tiene eje X o Y. Ninguna de las dos entra a medias: se dejan al
 * camino de aplanado de siempre y sale un aviso que las nombra.
 *
 * Módulo puro: sólo lee texto.
 */
import { isDxfXdataApp } from "@valle-design/contracts";
import type { CadDxfImportWarning, CadDxfSemanticDimension } from "./dxf-import";
import { num, rawDxfPairs, type RawDxfPair } from "./dxf-read-core";

const DEFAULT_LAYER = "0";
const MAX_DIMENSIONS = 50_000;

/** Punto medido de la cota, en el sistema del fichero. */
interface Point {
  x: number;
  y: number;
}

export interface CadDxfForeignDimension {
  dimension: CadDxfSemanticDimension;
  /** Posición de la DIMENSION entre las entidades DIMENSION del fichero. */
  ordinal: number;
}

export interface CadDxfForeignDimensionResult {
  dimensions: CadDxfForeignDimension[];
  warnings: CadDxfImportWarning[];
}

/** Familia de la cota según los tres bits bajos del código 70. */
const KINDS: Readonly<Record<number, CadDxfSemanticDimension["dimensionKind"]>> = {
  0: "linear",
  1: "aligned",
  2: "angular",
  3: "diameter",
  4: "radius",
  5: "angular",
  6: "ordinate",
};

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: Point): number => Math.hypot(a.x, a.y);

/**
 * Distancia con signo del punto `p` a la recta `a`→`b`, medida sobre la normal
 * `(-dir.y, dir.x)`. Es EXACTAMENTE la convención de `alignedDimension`, y por
 * eso el desplazamiento que sale de aquí vuelve a dibujar la línea de cota
 * donde la puso el remitente en vez de en el lado contrario.
 */
function signedOffset(a: Point, b: Point, p: Point): number {
  const direction = sub(b, a);
  const length = len(direction);
  if (length <= 1e-9) return 0;
  const normal = { x: -direction.y / length, y: direction.x / length };
  const delta = sub(p, a);
  return delta.x * normal.x + delta.y * normal.y;
}

/** Vista de los pares de una entidad, con acceso por código. */
function reader(pairs: readonly RawDxfPair[]) {
  const first = (code: number) => pairs.find((pair) => pair.code === code)?.value;
  const point = (xCode: number, yCode: number): Point | null => {
    const x = num(first(xCode));
    const y = num(first(yCode));
    return x === null || y === null ? null : { x, y };
  };
  return { first, point };
}

/**
 * Reconstruye la cota de una familia concreta. Devuelve `null` —y por tanto el
 * aplanado de siempre— cuando la familia no cabe en el modelo canónico o cuando
 * al fichero le faltan los puntos que la definen. Media cota que se dibuja bien
 * y mide mal sería peor que las seis líneas sueltas: al menos aquéllas no
 * prometen nada.
 */
function rebuild(
  pairs: readonly RawDxfPair[],
  flags: number,
): { dimension: Omit<CadDxfSemanticDimension, "blockName" | "layer">; note?: string } | null {
  const { first, point } = reader(pairs);
  const kind = KINDS[flags & 7];
  const p10 = point(10, 20);
  const p13 = point(13, 23);
  const p14 = point(14, 24);
  const p15 = point(15, 25);
  const textOverride = first(1)?.trim();
  const style = first(3)?.trim();
  const precision = num(first(271));
  const common = {
    ...(style ? { style } : {}),
    // "<>" es el marcador de AutoCAD para «usa la medida»: copiarlo como texto
    // dejaría una cota que muestra literalmente esos dos caracteres.
    ...(textOverride && textOverride !== "<>" ? { text: textOverride } : {}),
    ...(precision !== null ? { precision: Math.max(0, Math.min(8, Math.round(precision))) } : {}),
    ...(first(11) !== undefined && point(11, 21) ? { textPosition: point(11, 21)! } : {}),
  };

  if (kind === "aligned") {
    if (!p13 || !p14 || len(sub(p14, p13)) <= 1e-9) return null;
    return {
      dimension: {
        ...common,
        dimensionKind: "aligned",
        a: p13,
        b: p14,
        ...(p10 ? { offset: signedOffset(p13, p14, p10) } : {}),
      },
    };
  }
  if (kind === "linear") {
    if (!p13 || !p14) return null;
    // El código 50 es el giro de la línea de cota. El modelo canónico sólo
    // tiene eje X o eje Y; un giro intermedio no cabe y no se aproxima.
    const rotation = ((num(first(50)) ?? 0) % 180 + 180) % 180;
    const axis = Math.abs(rotation) < 1e-6 ? "x" : Math.abs(rotation - 90) < 1e-6 ? "y" : null;
    if (!axis) return null;
    if (axis === "x" && Math.abs(p14.x - p13.x) <= 1e-9) return null;
    if (axis === "y" && Math.abs(p14.y - p13.y) <= 1e-9) return null;
    const offset = p10
      ? axis === "x"
        ? p10.y - Math.max(p13.y, p14.y)
        : p10.x - Math.max(p13.x, p14.x)
      : undefined;
    return {
      dimension: {
        ...common,
        dimensionKind: "linear",
        axis,
        a: p13,
        b: p14,
        ...(offset !== undefined ? { offset } : {}),
      },
    };
  }
  if (kind === "radius") {
    // 15/25 es el centro del arco y 10/20 el punto donde aterriza la flecha.
    if (!p15 || !p10) return null;
    const radius = len(sub(p10, p15));
    if (!(radius > 1e-9)) return null;
    return { dimension: { ...common, dimensionKind: "radius", a: p15, b: p10, radius } };
  }
  if (kind === "diameter") {
    // Los dos puntos son extremos OPUESTOS del diámetro: el centro es el punto
    // medio y el radio, la mitad de la distancia.
    if (!p15 || !p10) return null;
    const diameter = len(sub(p10, p15));
    if (!(diameter > 1e-9)) return null;
    const center = { x: (p10.x + p15.x) / 2, y: (p10.y + p15.y) / 2 };
    return {
      dimension: { ...common, dimensionKind: "diameter", a: center, b: p10, radius: diameter / 2 },
    };
  }
  if (kind === "angular") {
    // Sólo la angular de TRES PUNTOS (tipo 5): 15/25 es el vértice y 13/14 los
    // dos extremos. La de dos líneas (tipo 2) exigiría intersecar dos rectas.
    if ((flags & 7) !== 5 || !p15 || !p13 || !p14) return null;
    return {
      dimension: {
        ...common,
        dimensionKind: "angular",
        a: p15,
        b: p13,
        c: p14,
        ...(p10 ? { radius: len(sub(p10, p15)) } : {}),
      },
    };
  }
  if (kind === "ordinate") {
    // 10/20 es el origen del sistema de coordenadas y 13/23 el punto acotado.
    // El bit 64 dice si mide sobre X; sin él, sobre Y.
    if (!p10 || !p13) return null;
    return {
      dimension: {
        ...common,
        dimensionKind: "ordinate",
        axis: (flags & 64) === 64 ? "x" : "y",
        a: p10,
        b: p13,
        ...(p14 ? { c: p14 } : {}),
      },
    };
  }
  return null;
}

/** Nombre en español de la familia, para el aviso que la declara. */
const KIND_NAMES: Readonly<Record<number, string>> = {
  0: "lineal girada",
  2: "angular de dos líneas",
  3: "de diámetro",
  4: "de radio",
  5: "angular",
  6: "de coordenada",
};

/**
 * Lee las DIMENSION del fichero que NO llevan XDATA de este producto.
 *
 * Las propias se leen en `dxf-read-annotations.ts` con toda su semántica; aquí
 * se atiende sólo a las ajenas, que es donde vive la pérdida.
 */
export function parseRawDxfForeignDimensions(text: string): CadDxfForeignDimensionResult {
  const pairs = rawDxfPairs(text);
  const dimensions: CadDxfForeignDimension[] = [];
  const warnings: CadDxfImportWarning[] = [];
  let ordinal = -1;
  let inEntities = false;
  let expectSectionName = false;

  for (let start = 0; start < pairs.length && dimensions.length < MAX_DIMENSIONS; start += 1) {
    if (pairs[start].code === 2 && expectSectionName) {
      inEntities = pairs[start].value.toUpperCase() === "ENTITIES";
      expectSectionName = false;
      continue;
    }
    if (pairs[start].code !== 0) continue;
    const type = pairs[start].value.toUpperCase();
    if (type === "SECTION") {
      expectSectionName = true;
      continue;
    }
    if (type === "ENDSEC" || type === "EOF") {
      inEntities = false;
      continue;
    }
    if (!inEntities || type !== "DIMENSION") continue;

    ordinal += 1;
    let end = start + 1;
    while (end < pairs.length && pairs[end].code !== 0) end += 1;
    const entityPairs = pairs.slice(start + 1, end);
    start = end - 1;
    // Las cotas propias ya entran por su XDATA, con su prefijo, su unidad
    // alternativa y su flecha. Volver a leerlas aquí las duplicaría.
    if (entityPairs.some((pair) => pair.code === 1001 && isDxfXdataApp("dimension", pair.value)))
      continue;

    const { first } = reader(entityPairs);
    const layer = first(8) || DEFAULT_LAYER;
    const flags = Math.trunc(num(first(70)) ?? 0);
    const rebuilt = rebuild(entityPairs, flags);
    if (!rebuilt) {
      // Sin bloque de geometría, quien avisa es el aplanado, y su mensaje es
      // más exacto («vino sin geometría»). Dos avisos por la misma cota no
      // informan el doble: hacen que se lean la mitad.
      if (!first(2)) continue;
      warnings.push({
        code: "foreign_dimension_unsupported",
        // El nombre de la CAPA va dentro del mensaje, no sólo en el campo
        // estructurado: es lo único que le permite a quien lee el aviso ir a
        // buscar la cota en el dibujo, y una capa de cotas de un plano real se
        // llama A-ANNO-DIMS, no «la tercera».
        message:
          `Cota ${KIND_NAMES[flags & 7] ?? "de tipo desconocido"} de otro CAD en la capa "${layer}": no ` +
          "se puede rehacer como cota viva y entra como la geometría suelta de su bloque.",
        entityType: "DIMENSION",
        layer,
      });
      continue;
    }
    warnings.push({
      code: "foreign_dimension_detached",
      message:
        `Cota de otro CAD en la capa "${layer}": entra VIVA —vuelve a medir sus propios puntos— pero ` +
        "DESLIGADA de la geometría, porque el fichero asocia por identificadores que no existen en " +
        "este dibujo.",
      entityType: "DIMENSION",
      layer,
    });
    dimensions.push({
      ordinal,
      dimension: {
        ...rebuilt.dimension,
        layer,
        blockName: first(2) ?? "",
      },
    });
  }
  return { dimensions, warnings };
}
