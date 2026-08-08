/**
 * MIRROR sobre entidades canónicas.
 *
 * EL HUECO. El motor tenía MOVE, ROTATE, SCALE y COPY nativos, y ningún MIRROR.
 * Es de las órdenes más usadas de un CAD 2D: media planta simétrica se dibuja
 * una vez.
 *
 * POR QUÉ NO ES UN `transform` MÁS. `CadEntityTransform` es
 * `{ translation, rotationDeg, scale, origin }`: una SEMEJANZA, y todas
 * conservan la orientación. Una reflexión la invierte, y eso no se cuela como
 * un `scale` negativo — el adaptador de círculo ya hace `radius *
 * Math.abs(scale)`, que descarta el signo, y un arco reflejado necesita además
 * intercambiar sus ángulos. Por eso vive aquí y no en el runtime de entidades.
 *
 * FAIL-CLOSED, como OFFSET. Devuelve un resultado explícito y nunca refleja «lo
 * que sabe» dejando el resto sin tocar: media planta reflejada y media no es un
 * plano roto, y encima silencioso.
 */
import { commitChange, type CadDocument, type CadEntity, type CadPoint3 } from './cad-document';

export interface MirrorAxis {
  a: { x: number; y: number };
  b: { x: number; y: number };
}

export type MirrorRejection =
  | 'degenerate-axis'
  | 'mirrored-text-undecided'
  | 'unsupported-entity';

export type MirrorEntityResult =
  | { ok: true; entity: CadEntity }
  | { ok: false; reason: MirrorRejection };

/** Mensaje concreto por rechazo. El editor no inventa texto por su cuenta. */
export const MIRROR_REJECTION_MESSAGE: Record<MirrorRejection, string> = {
  'degenerate-axis':
    'El eje de simetría necesita dos puntos distintos: con uno solo no hay recta sobre la que reflejar.',
  'mirrored-text-undecided':
    'MIRROR todavía no refleja texto, cotas ni directrices. Un texto reflejado sale del revés, y decidir si debe quedar legible o espejado es la variable MIRRTEXT de AutoCAD: una decisión de producto sin tomar. Reflejar la geometría y dejar los rótulos a medias sería peor.',
  'unsupported-entity':
    'MIRROR admite líneas, polilíneas, círculos, arcos, elipses y splines. Esta entidad no: reflejarla exigiría reinterpretar campos que no describen geometría pura.',
};

const EPS = 1e-12;

/** Reflexión de un punto sobre la recta que pasa por `a` con dirección `a→b`. */
function reflectPoint(point: CadPoint3, axis: MirrorAxis): CadPoint3 {
  const theta = Math.atan2(axis.b.y - axis.a.y, axis.b.x - axis.a.x);
  const dx = point.x - axis.a.x;
  const dy = point.y - axis.a.y;
  const cos2 = Math.cos(2 * theta);
  const sin2 = Math.sin(2 * theta);
  return {
    x: axis.a.x + cos2 * dx + sin2 * dy,
    y: axis.a.y + sin2 * dx - cos2 * dy,
    z: point.z,
  };
}

/** Reflexión de un VECTOR (sin trasladar): sólo depende del ángulo del eje. */
function reflectVector(vector: CadPoint3, axis: MirrorAxis): CadPoint3 {
  const theta = Math.atan2(axis.b.y - axis.a.y, axis.b.x - axis.a.x);
  const cos2 = Math.cos(2 * theta);
  const sin2 = Math.sin(2 * theta);
  return {
    x: cos2 * vector.x + sin2 * vector.y,
    y: sin2 * vector.x - cos2 * vector.y,
    z: vector.z,
  };
}

const norm360 = (value: number) => ((value % 360) + 360) % 360;

function axisIsDegenerate(axis: MirrorAxis): boolean {
  return Math.hypot(axis.b.x - axis.a.x, axis.b.y - axis.a.y) <= EPS;
}

/**
 * Por qué NO se puede reflejar esta entidad, o `null` si sí se puede.
 *
 * Existe aparte para que la interfaz pueda preguntar «¿se puede?» sin construir
 * la entidad reflejada, y sobre todo para que la lista de tipos admitidos viva
 * en UN solo sitio: una copia en la compuerta se separaría de ésta en cuanto se
 * añadiese un tipo.
 */
export function mirrorRejectionFor(entity: CadEntity): MirrorRejection | null {
  switch (entity.type) {
    case 'line':
    case 'circle':
    case 'arc':
    case 'polyline':
    case 'ellipse':
    case 'spline':
      return null;
    case 'text':
    case 'mtext':
    case 'dimension':
    case 'mleader':
      return 'mirrored-text-undecided';
    default:
      return 'unsupported-entity';
  }
}

/**
 * Refleja UNA entidad canónica y devuelve la copia reflejada con un id nuevo.
 *
 * Las dos reglas que no son obvias:
 *
 * - ARCO. Barre en sentido antihorario de `startAngle` a `endAngle`. Reflejar
 *   invierte el barrido, así que los ángulos no sólo se transforman (2θ − a):
 *   además se INTERCAMBIAN. Sin intercambiarlos sale el arco complementario —
 *   justo el trozo de circunferencia que no existía.
 * - POLILÍNEA. El `bulge` lleva SIGNO: dice hacia qué lado se comba el tramo.
 *   Reflejar los vértices sin invertirlo deja los arcos combados al revés.
 */
export function mirrorCanonicalEntity(
  entity: CadEntity,
  axis: MirrorAxis,
  options: { newId: () => string },
): MirrorEntityResult {
  if (axisIsDegenerate(axis)) return { ok: false, reason: 'degenerate-axis' };
  const rejection = mirrorRejectionFor(entity);
  if (rejection) return { ok: false, reason: rejection };
  const id = options.newId();

  switch (entity.type) {
    case 'line':
      return {
        ok: true,
        entity: {
          ...entity,
          id,
          start: reflectPoint(entity.start, axis),
          end: reflectPoint(entity.end, axis),
        },
      };

    case 'circle':
      return {
        ok: true,
        entity: { ...entity, id, center: reflectPoint(entity.center, axis) },
      };

    case 'arc': {
      const theta = Math.atan2(axis.b.y - axis.a.y, axis.b.x - axis.a.x);
      const twice = (theta * 360) / Math.PI; // 2θ en grados
      return {
        ok: true,
        entity: {
          ...entity,
          id,
          center: reflectPoint(entity.center, axis),
          // Intercambiados: el antiguo FIN reflejado es el nuevo INICIO.
          startAngle: norm360(twice - entity.endAngle),
          endAngle: norm360(twice - entity.startAngle),
        },
      };
    }

    case 'polyline':
      return {
        ok: true,
        entity: {
          ...entity,
          id,
          vertices: entity.vertices.map((vertex) => {
            const reflected = reflectPoint(vertex, axis);
            // Un tramo recto sigue recto: no se le inventa un bulge 0.
            if (vertex.bulge === undefined) return { ...vertex, ...reflected };
            return { ...vertex, ...reflected, bulge: -vertex.bulge };
          }),
        },
      };

    case 'ellipse':
      return {
        ok: true,
        entity: {
          ...entity,
          id,
          center: reflectPoint(entity.center, axis),
          majorAxis: reflectVector(entity.majorAxis, axis),
          // El eje menor se deriva girando el mayor 90° ANTIHORARIO. Al
          // reflejar, ese giro pasa a ser horario, así que el parámetro se
          // recorre al revés: el rango [s,e] se convierte en [−e,−s].
          startParameter: -entity.endParameter,
          endParameter: -entity.startParameter,
        },
      };

    case 'spline':
      // Una reflexión es afín, y una curva NURBS es una combinación afín de sus
      // puntos de control: reflejarlos refleja la curva exactamente. Nudos,
      // grado y pesos no cambian.
      return {
        ok: true,
        entity: {
          ...entity,
          id,
          controlPoints: entity.controlPoints.map((point) => reflectPoint(point, axis)),
          knots: [...entity.knots],
          weights: entity.weights ? [...entity.weights] : undefined,
        },
      };

    default:
      // Inalcanzable: `mirrorRejectionFor` ya ha filtrado todo lo demás arriba.
      // Se deja como red de seguridad para que añadir un tipo admitido allí sin
      // implementarlo aquí falle cerrado en vez de devolver la entidad sin
      // reflejar.
      return { ok: false, reason: 'unsupported-entity' };
  }
}

/**
 * Refleja una selección entera como UNA entrada de historial.
 *
 * `keepOriginal` distingue las dos formas de la orden en AutoCAD: conservar el
 * original (simetría) o borrarlo (voltear). Si alguna entidad de la selección
 * no se puede reflejar, no se refleja NINGUNA: la operación es todo o nada.
 */
export function applyCadMirror(
  document: CadDocument,
  input: {
    entityIds: string[];
    axis: MirrorAxis;
    keepOriginal: boolean;
    newId: (index: number) => string;
  },
): CadDocument {
  if (!input.entityIds.length) throw new Error('MIRROR necesita al menos una entidad seleccionada.');
  if (axisIsDegenerate(input.axis)) throw new Error(MIRROR_REJECTION_MESSAGE['degenerate-axis']);

  const byId = new Map(document.entities.map((entity) => [entity.id, entity]));
  const sources = input.entityIds.map((entityId) => {
    const found = byId.get(entityId);
    if (!found) throw new Error(`MIRROR no encuentra la entidad ${entityId} en el documento.`);
    return found;
  });

  const mirrored: CadEntity[] = [];
  sources.forEach((source, index) => {
    const result = mirrorCanonicalEntity(source, input.axis, {
      newId: () => input.newId(index),
    });
    if (!result.ok) throw new Error(MIRROR_REJECTION_MESSAGE[result.reason]);
    if (byId.has(result.entity.id))
      throw new Error(`MIRROR no puede usar el id ${result.entity.id}: ya existe en el documento.`);
    mirrored.push(result.entity);
  });

  const removed = input.keepOriginal ? new Set<string>() : new Set(input.entityIds);
  const kept = document.entities.filter((entity) => !removed.has(entity.id));
  const keptOrder = document.modelSpace.entityIds.filter((entityId) => !removed.has(entityId));

  return commitChange({
    ...document,
    entities: [...kept, ...mirrored],
    // Los reflejos se dibujan AL FRENTE y no reordenan lo que ya había.
    modelSpace: { entityIds: [...keptOrder, ...mirrored.map((entity) => entity.id)] },
  }, `mirror:${input.entityIds.join(',')}:${input.keepOriginal ? 'keep' : 'move'}`);
}
