/**
 * EL ISOMÉTRICO DE TUBERÍA, DIBUJADO DESDE LA RUTA.
 *
 * ## Qué es un isométrico y qué NO es
 *
 * No es una vista 3D del modelo. Es un dibujo de taller: la tubería en
 * proyección isométrica, **sin escala**, con las longitudes VERDADERAS
 * rotuladas y la lista de materiales al lado. Se hace así a propósito: un tramo
 * de 30 m y uno de 300 mm caben en la misma hoja y se leen igual, porque lo que
 * se lee es el número, no el trazo. Por eso el ancho de este módulo no está en
 * la proyección —son cuatro multiplicaciones— sino en QUÉ se rotula.
 *
 * ## La proyección, y por qué las cotas son las de verdad
 *
 * La isométrica de toda la vida: los ejes X e Y a 30° sobre la horizontal y la
 * Z vertical.
 *
 *     u = (x − y)·cos 30°
 *     v = (x + y)·sen 30° + z
 *
 * Es la isométrica DEL DIBUJANTE, no la proyección isométrica pura: los tramos
 * paralelos a los ejes conservan su longitud —la pura los encogería al 0,816—,
 * que es lo que permite leer un isométrico con un escalímetro cuando la tubería
 * es ortogonal. Pero cualquier tramo OBLICUO se dibuja más corto de lo que
 * mide: una diagonal de 1.414 en planta sale de 1.000 sobre el papel.
 *
 * Por eso la longitud se rotula como TEXTO con el valor 3D verdadero y no como
 * una cota del dibujo: la cota mediría el trazo proyectado y diría 1,00 m donde
 * hay 1,41. Es también la razón por la que un isométrico se declara SIN ESCALA
 * en su propio título, y aquí se declara.
 *
 * ## La flecha de norte
 *
 * Un isométrico sin norte no se puede montar en obra: el fontanero necesita
 * saber hacia dónde mira el dibujo. Va siempre, en la esquina, proyectada por
 * la misma función que la tubería para que apunte de verdad al norte del
 * modelo.
 *
 * ## Procedencia
 *
 * La proyección isométrica es geometría del siglo XIX y la convención de rotular
 * longitudes verdaderas es práctica común de todo taller de tubería. **No se
 * copia, traza ni adapta el formato de salida de ISOGEN ni de ninguna otra
 * herramienta con dueño**: aquí no hay plantilla ajena, sólo líneas, textos y
 * una tabla que ya existían en este documento.
 */
import type { CadPoint2, CadPoint3 } from "../cad-document";
import type { CadNativeEntity } from "../entity-runtime";
import {
  cadPipeFittingLabel,
  cadPipeFittings,
  cadPipeRouteLength,
  type CadPipeFitting,
  type CadPipeRoute,
} from "./pipe-route";

/** Capa del trazo de tubería del isométrico. */
export const CAD_ISO_PIPE_LAYER = "ISO-TUB";
/** Capa de los rótulos: longitudes, accesorios, título y norte. */
export const CAD_ISO_TEXT_LAYER = "ISO-ROT";

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

/** La proyección isométrica de un punto del modelo. */
export const cadIsoProject = (point: CadPoint3): CadPoint2 => ({
  x: (point.x - point.y) * COS30,
  y: (point.x + point.y) * SIN30 + point.z,
});

export interface CadIsoBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const growBounds = (bounds: CadIsoBounds, point: CadPoint2): CadIsoBounds => ({
  minX: Math.min(bounds.minX, point.x),
  minY: Math.min(bounds.minY, point.y),
  maxX: Math.max(bounds.maxX, point.x),
  maxY: Math.max(bounds.maxY, point.y),
});

const EMPTY_BOUNDS: CadIsoBounds = {
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
};

/**
 * Altura de rótulo proporcional al dibujo.
 *
 * Un isométrico no tiene escala, así que no hay una altura «de papel» que
 * convertir: se toma una fracción de la diagonal del propio dibujo, acotada
 * para que ni un tramo de 300 mm salga con letra ilegible ni uno de 200 m con
 * letra de cartel.
 */
export function cadIsoTextHeight(bounds: CadIsoBounds): number {
  const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  if (!Number.isFinite(diagonal) || diagonal <= 0) return 100;
  return Math.min(2_000, Math.max(60, diagonal / 45));
}

/** La longitud en metros como se rotula en un isométrico: dos decimales. */
export const cadIsoLengthText = (units: number, unitsPerMetre: number): string =>
  `${(units / unitsPerMetre).toFixed(2)} m`;

export interface CadIsoDrawingInput {
  routes: readonly CadPipeRoute[];
  /** El número de línea que titula la hoja. */
  line: string;
  /** Unidades de dibujo por metro: 1000 en un plano en milímetros. */
  unitsPerMetre: number;
  /** Dónde cae la esquina inferior izquierda del dibujo, en el espacio modelo. */
  origin: CadPoint2;
  newEntityId: () => string;
}

export interface CadIsoDrawing {
  entities: CadNativeEntity[];
  /** El rectángulo que ocupa el dibujo YA colocado en el modelo. */
  bounds: CadIsoBounds;
  /** Accesorios rotulados, para que la lista y el dibujo digan lo mismo. */
  fittings: CadPipeFitting[];
}

/**
 * El isométrico entero: trazo, longitudes, accesorios, norte y título.
 *
 * Devuelve entidades sueltas —no un bloque— porque un isométrico se anota a
 * mano después: se le añade un soporte, se corrige una cota, se marca una
 * junta. Un bloque obligaría a explotarlo para tocar nada.
 */
export function cadIsoDrawing(input: CadIsoDrawingInput): CadIsoDrawing {
  const { routes, line, unitsPerMetre, origin, newEntityId } = input;
  const fittings = cadPipeFittings(routes).filter((fitting) => fitting.line === line);

  // Primero se proyecta todo para conocer el tamaño, y sólo después se coloca:
  // la altura de rótulo depende del tamaño, y el desplazamiento de los dos.
  let crudo = EMPTY_BOUNDS;
  const proyectadas = routes.map((route) => {
    const points = route.points.map(cadIsoProject);
    for (const point of points) crudo = growBounds(crudo, point);
    return { route, points };
  });
  if (proyectadas.length === 0 || !Number.isFinite(crudo.minX))
    return { entities: [], bounds: { minX: origin.x, minY: origin.y, maxX: origin.x, maxY: origin.y }, fittings };

  const altura = cadIsoTextHeight(crudo);
  const margen = altura * 4;
  const dx = origin.x + margen - crudo.minX;
  const dy = origin.y + margen - crudo.minY;
  const coloca = (point: CadPoint2): CadPoint3 => ({ x: point.x + dx, y: point.y + dy, z: 0 });

  const entities: CadNativeEntity[] = [];
  const text = (at: CadPoint3, value: string, size = altura): void => {
    entities.push({
      id: newEntityId(),
      type: "mtext",
      insertion: at,
      text: value,
      height: size,
      alignment: "middle-center",
      layer: CAD_ISO_TEXT_LAYER,
    } as CadNativeEntity);
  };

  for (const { route, points } of proyectadas) {
    entities.push({
      id: newEntityId(),
      type: "polyline",
      vertices: points.map(coloca),
      closed: false,
      layer: CAD_ISO_PIPE_LAYER,
    } as CadNativeEntity);

    // La longitud de cada tramo, con el valor VERDADERO —el 3D—, junto a su
    // punto medio proyectado y apartada del trazo para que se lea.
    for (let index = 1; index < route.points.length; index += 1) {
      const largo = cadPipeRouteLength([route.points[index - 1], route.points[index]]);
      if (largo <= 0) continue;
      const a = points[index - 1];
      const b = points[index];
      const medio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dirX = b.x - a.x;
      const dirY = b.y - a.y;
      const largoProyectado = Math.hypot(dirX, dirY) || 1;
      // Perpendicular al trazo, siempre hacia arriba: dos rótulos a lados
      // distintos del mismo codo se leen como si fueran de otra tubería.
      const nx = -dirY / largoProyectado;
      const ny = dirX / largoProyectado;
      const lado = ny >= 0 ? 1 : -1;
      text(
        {
          x: medio.x + dx + nx * lado * altura,
          y: medio.y + dy + ny * lado * altura,
          z: 0,
        },
        cadIsoLengthText(largo, unitsPerMetre),
      );
    }
  }

  for (const fitting of fittings) {
    const at = coloca(cadIsoProject(fitting.at));
    text({ ...at, y: at.y - altura * 1.4 }, cadIsoFittingMark(fitting), altura * 0.85);
  }

  // El título, arriba del todo, con el número de línea y su especificación:
  // un isométrico sin número de línea no se puede archivar.
  const ancho = crudo.maxX - crudo.minX;
  const alto = crudo.maxY - crudo.minY;
  const spec = routes.find((route) => route.line === line)?.spec ?? "";
  text(
    { x: origin.x + margen + ancho / 2, y: origin.y + margen + alto + altura * 2.5, z: 0 },
    `ISOMÉTRICO ${line}${spec ? ` · ESPEC. ${spec}` : ""} — SIN ESCALA, COTAS EN METROS`,
    altura * 1.3,
  );

  // El norte, proyectado por la misma función que la tubería.
  const norte = origin.x + margen + ancho + altura * 3;
  const baseNorte = origin.y + margen;
  entities.push(...cadIsoNorthArrow({ x: norte, y: baseNorte }, altura, newEntityId));

  const bounds: CadIsoBounds = {
    minX: origin.x,
    minY: origin.y,
    maxX: norte + altura * 3,
    maxY: origin.y + margen * 2 + alto + altura * 3,
  };
  return { entities, bounds, fittings };
}

/** Cómo se marca un accesorio SOBRE el dibujo: corto, que compite con el trazo. */
export function cadIsoFittingMark(fitting: CadPipeFitting): string {
  return fitting.kind === "codo"
    ? cadPipeFittingLabel(fitting).replace(/^Codo /u, "")
    : cadPipeFittingLabel(fitting);
}

/**
 * La flecha de norte, proyectada como la tubería.
 *
 * El norte del modelo es +Y, así que la flecha apunta hacia donde la proyección
 * manda +Y: no es una flecha decorativa pegada arriba a la derecha, es la
 * dirección de verdad.
 */
export function cadIsoNorthArrow(
  at: CadPoint2,
  size: number,
  newEntityId: () => string,
): CadNativeEntity[] {
  const base = cadIsoProject({ x: 0, y: 0, z: 0 });
  const punta = cadIsoProject({ x: 0, y: size * 3, z: 0 });
  const dirX = punta.x - base.x;
  const dirY = punta.y - base.y;
  const largo = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / largo;
  const uy = dirY / largo;
  const fin = { x: at.x + ux * size * 3, y: at.y + uy * size * 3 };
  const ala = size * 0.8;
  return [
    {
      id: newEntityId(),
      type: "line",
      start: { x: at.x, y: at.y, z: 0 },
      end: { ...fin, z: 0 },
      layer: CAD_ISO_TEXT_LAYER,
    } as CadNativeEntity,
    {
      id: newEntityId(),
      type: "polyline",
      vertices: [
        { x: fin.x - ux * ala + -uy * ala * 0.4, y: fin.y - uy * ala + ux * ala * 0.4, z: 0 },
        { x: fin.x, y: fin.y, z: 0 },
        { x: fin.x - ux * ala - -uy * ala * 0.4, y: fin.y - uy * ala - ux * ala * 0.4, z: 0 },
      ],
      closed: false,
      layer: CAD_ISO_TEXT_LAYER,
    } as CadNativeEntity,
    {
      id: newEntityId(),
      type: "mtext",
      insertion: { x: fin.x + ux * size, y: fin.y + uy * size, z: 0 },
      text: "N",
      height: size,
      alignment: "middle-center",
      layer: CAD_ISO_TEXT_LAYER,
    } as CadNativeEntity,
  ];
}
