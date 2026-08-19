/**
 * Construcción de la `SnapScene`: de lo que hay dibujado a lo que se puede
 * enganchar.
 *
 * ## Por qué esto no puede vivir en el editor
 *
 * `snap-engine.ts` es puro y sabe resolver un enganche dada una escena. Lo que
 * no existía en ninguna parte era el paso ANTERIOR: recorrer lo que hay
 * alrededor del cursor y traducirlo a esa escena. Ese paso vivía dentro de
 * `snapFloor`, en el monolito, cien líneas metidas en un manejador de
 * `pointermove` — es decir, la mitad del OSNAP del producto estaba donde no se
 * podía probar ni reutilizar, y donde cualquier cambio obligaba a tocar un
 * archivo de veintidós mil líneas.
 *
 * Aquí no hay nada nuevo: es exactamente la misma aritmética, movida. Lo que
 * cambia es que ahora se puede llamar desde el enganche 3D, desde el banco de
 * pruebas de rendimiento y desde un spec, sin montar un lienzo.
 *
 * ## Las dos fuentes, y por qué se tratan distinto
 *
 * - **Cajas** (emplazamientos y activos del editor): son rectángulos, posiblemente
 *   girados, y dan esquinas, aristas, puntos medios y centro. Se ordenan por
 *   distancia al cursor y se toman las más cercanas, porque una planta con miles
 *   de cajas no puede alimentar el motor entera en cada movimiento del ratón.
 * - **Entidades canónicas**: dan sus trazos teselados y sus puntos notables por
 *   el adaptador de su tipo. Los tramos llevan `pathId` y `ordinal` para que el
 *   motor sepa cuáles son vecinos dentro de la misma polilínea y no invente una
 *   intersección en cada vértice.
 */
import type { CadDocument } from "./cad-document";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "./entity-runtime";
import { rectGeometry, type Point, type SnapScene } from "./snap-engine";

/** Caja del editor: emplazamiento o activo, con giro opcional en grados. */
export interface CadSnapSceneBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

/**
 * Cuántas cajas alimentan el motor.
 *
 * Cuarenta y ocho, y el número no es decorativo: el motor cruza los tramos de
 * la escena entre sí buscando intersecciones, que es O(n²). Sin tope, una
 * planta con dos mil cajas convertiría cada movimiento del ratón en cuatro
 * millones de pruebas.
 */
export const CAD_SNAP_SCENE_BOX_LIMIT = 48;

/** Segmentos por curva al teselar para ENGANCHAR, más bajos que los de dibujo. */
export const CAD_SNAP_SCENE_CURVE_SEGMENTS = 24;

/**
 * Escena de enganche a partir de las cajas más cercanas al cursor.
 *
 * `nodes` entra tal cual —son los puntos del DXF de fondo, que el editor ya
 * tiene indexados— y no se copia: el motor sólo lee.
 */
export function cadSnapSceneFromBoxes(
  boxes: readonly CadSnapSceneBox[],
  cursor: Point,
  nodes: Point[] = [],
  limit = CAD_SNAP_SCENE_BOX_LIMIT,
): SnapScene {
  const scene: SnapScene = {
    segments: [],
    midpoints: [],
    perpendicularSegments: [],
    endpoints: [],
    centers: [],
    quadrants: [],
    geometricCenters: [],
    insertions: [],
    tangents: [],
    nodes,
  };
  const nearest = [...boxes]
    .map((box) => ({
      box,
      distance: Math.hypot(box.x + box.w / 2 - cursor.x, box.y + box.h / 2 - cursor.y),
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit);

  for (const { box } of nearest) {
    const geometry = rectGeometry(box);
    scene.segments!.push(...geometry.edges);
    scene.perpendicularSegments!.push(...geometry.edges);
    scene.midpoints!.push(
      ...geometry.edges.map((edge) => ({
        x: (edge.a.x + edge.b.x) / 2,
        y: (edge.a.y + edge.b.y) / 2,
      })),
    );
    scene.endpoints!.push(...geometry.corners);
    scene.centers!.push(geometry.center);
    scene.geometricCenters!.push(geometry.center);
    scene.insertions!.push(geometry.center);
  }
  return scene;
}

/**
 * Añade a la escena los trazos y puntos notables de unas entidades canónicas.
 *
 * `reference` es el punto desde el que se piden los enganches dependientes del
 * observador —la tangente de un círculo depende de desde dónde se mire—, y es
 * el ancla del elástico cuando la hay; si no, el propio cursor.
 *
 * Muta la escena que recibe en vez de devolver otra, y es deliberado: esto corre
 * en cada `pointermove` y fabricar una escena nueva por entidad sería basura que
 * el recolector acaba pagando en mitad de un arrastre.
 */
export function cadSnapSceneAddEntities(
  scene: SnapScene,
  entities: readonly CadNativeEntity[],
  reference: Point,
  segments = CAD_SNAP_SCENE_CURVE_SEGMENTS,
  document?: CadDocument,
): void {
  /**
   * ¿Se ha copiado ya `nodes`? Ver el empujón de los puntos de control.
   *
   * Copia AL VUELO y no de entrada: `nodes` suele ser el array vivo de puntos
   * del DXF de fondo, que puede tener decenas de miles de entradas, y copiarlo
   * en cada movimiento del ratón costaría más que todo el enganche junto.
   */
  let nodesCopied = false;

  // Los cubos que falten se crean AQUÍ. Sin esto, una escena a la que le falta
  // `centers` no fallaría: se saltaría los centros en silencio, y el usuario
  // vería un modo de OSNAP que simplemente no imanta sobre ciertas entidades.
  // Un `undefined` que se traga un modo entero es peor que una excepción.
  scene.segments ??= [];
  scene.midpoints ??= [];
  scene.perpendicularSegments ??= [];
  scene.endpoints ??= [];
  scene.centers ??= [];
  scene.quadrants ??= [];
  scene.tangents ??= [];
  scene.nodes ??= [];

  for (const entity of entities) {
    const adapter = CAD_ENTITY_REGISTRY.adapter(entity);
    for (const [pathIndex, path] of adapter.renderer
      .paths(entity, segments, document)
      .entries()) {
      // Un trazo cerrado tiene un tramo más que puntos: el que vuelve al
      // primero. Contarlo aquí es lo que permite que el motor sepa que el
      // último tramo y el primero son vecinos y no se crucen entre sí.
      const segmentCount =
        Math.max(0, path.points.length - 1) +
        (path.closed && path.points.length > 2 ? 1 : 0);
      const pathId = `${entity.id}:${pathIndex}`;
      for (let index = 1; index < path.points.length; index++)
        scene.segments!.push({
          a: path.points[index - 1],
          b: path.points[index],
          pathId,
          ordinal: index - 1,
          pathLength: segmentCount,
          closed: path.closed,
        });
      if (path.closed && path.points.length > 2)
        scene.segments!.push({
          a: path.points.at(-1)!,
          b: path.points[0],
          pathId,
          ordinal: segmentCount - 1,
          pathLength: segmentCount,
          closed: true,
        });
      // Sólo una LÍNEA aporta punto medio y pie de perpendicular semánticos.
      // Las cuerdas con que se tesela un arco no son aristas del dibujo, y
      // tratarlas como tales llenaría la pantalla de puntos medios que no
      // existen en el papel.
      if (entity.type === "line" && path.points.length === 2) {
        scene.midpoints!.push({
          x: (path.points[0].x + path.points[1].x) / 2,
          y: (path.points[0].y + path.points[1].y) / 2,
        });
        scene.perpendicularSegments!.push({
          a: path.points[0],
          b: path.points[1],
        });
      }
    }
    for (const snap of adapter.snaps.snaps(entity, reference)) {
      if (snap.kind === "center") scene.centers!.push(snap.point);
      else if (snap.kind === "control") {
        // FUGA CORREGIDA AL MOVER ESTO. El código de origen empujaba el punto
        // de control dentro de `scene.nodes`, que ERA el array vivo de puntos
        // del DXF de fondo. Cada `pointermove` sobre una spline le añadía
        // entradas para siempre: el array crecía sin tope durante la sesión y,
        // peor, los puntos de control de una entidad seguían imantando mucho
        // después de que el cursor se hubiera ido a otra parte del plano.
        if (!nodesCopied) {
          scene.nodes = [...(scene.nodes ?? [])];
          nodesCopied = true;
        }
        scene.nodes!.push(snap.point);
      } else if (snap.kind === "quadrant") scene.quadrants!.push(snap.point);
      else if (snap.kind === "tangent") scene.tangents!.push(snap.point);
      else scene.endpoints!.push(snap.point);
    }
  }
}
