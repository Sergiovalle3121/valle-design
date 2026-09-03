/**
 * QUÉ CUERPOS ENTRAN EN UN APLANADO — INCLUIDOS LOS MUROS DEL ARQUITECTO.
 *
 * ## El defecto que cierra, medido
 *
 * `docs/competitive/distancia-autocad-completo-20260901.md`, defecto (c) del
 * área «de 3D a documentación»: *«el único camino con oculta exacta (FLATSHOT)
 * RECHAZA los muros, así que el modelo del arquitecto no puede usarlo»*. Y era
 * literal: `solidsOf` sólo recogía `entity.type === "solid3d"`, y una planta de
 * arquitectura no tiene un solo `solid3d` — sus muros, columnas y mobiliario
 * son `box` con su `kind`, que es lo que el visor 3D lleva extruyendo desde
 * siempre. El resultado era una orden que respondía «no hay sólidos» sobre un
 * modelo lleno de ellos.
 *
 * ## De dónde sale la altura, y por qué se PIDE en vez de suponerse
 *
 * Un `box` no guarda altura: el visor la saca de su catálogo de arquetipos
 * (`assetMeta(kind).height`, 3.000 mm para un muro). Ese catálogo vive en la
 * capa de componentes y este módulo es de `lib/`, así que la altura se pide por
 * una función que inyecta quien la tiene. Cablear aquí una tabla propia sería
 * tener DOS verdades sobre lo que mide un muro, y la primera vez que el
 * catálogo cambiara, el alzado dejaría de coincidir con el modelo que se ve.
 *
 * La BASE es `context.elevation` cuando el objeto la trae —campo que ya
 * existía— y 0 cuando no. Nada de campos nuevos.
 *
 * ## Lo que NO entra, y se cuenta
 *
 * Una entidad plana —una línea, un texto, un sombreado— no tiene volumen y no
 * proyecta ocultas: se queda fuera y la orden dice cuántas se quedaron y por
 * qué. Un objeto cuyo `kind` no tiene altura declarada tampoco entra, y también
 * se cuenta. Un aplanado que se come la mitad del modelo en silencio es peor
 * que uno que no sale: parece un alzado, se acota, y el muro que falta no se
 * echa de menos hasta que está replanteado.
 */
import type { CadEntity, CadPoint2 } from "./cad-document";
import { solid3dBody } from "./solid3d-build";
import { extrudeProfile, type BrepBody } from "../brep";

type CadBoxEntity = Extract<CadEntity, { type: "box" }>;
type CadStationEntity = Extract<CadEntity, { type: "station" }>;
type CadPrismEntity = CadBoxEntity | CadStationEntity;

/**
 * Lados con los que se aproxima un objeto redondo.
 *
 * Una columna cilíndrica no tiene caras planas y el solucionador de ocultas
 * trabaja con caras planas: se aproxima con un polígono. Veinticuatro lados
 * dejan un error de flecha del 0,86 % del radio —una columna de 40 cm se sale
 * 1,7 mm—, que a la escala de un alzado no se ve y no multiplica el coste.
 * El número se declara aquí para que quien mida sepa contra qué mide.
 */
export const CAD_FLATSHOT_ROUND_SIDES = 24;

export interface CadFlatshotSkipped {
  entityId: string;
  reason: string;
}

export interface CadFlatshotBodies {
  bodies: BrepBody[];
  /** Lo que no entró, con su motivo. Nunca se calla. */
  skipped: CadFlatshotSkipped[];
}

/** La altura de extrusión de un objeto por su `kind`, o `null` si no la tiene. */
export type CadObjectHeightResolver = (kind: string) => number | null;

/** El rectángulo del objeto en coordenadas de mundo, con su giro aplicado. */
function rectangleOf(entity: CadPrismEntity): CadPoint2[] {
  const cx = entity.x + entity.w / 2;
  const cy = entity.y + entity.h / 2;
  const radians = ((entity.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    { x: -entity.w / 2, y: -entity.h / 2 },
    { x: entity.w / 2, y: -entity.h / 2 },
    { x: entity.w / 2, y: entity.h / 2 },
    { x: -entity.w / 2, y: entity.h / 2 },
  ].map((corner) => ({
    x: cx + corner.x * cos - corner.y * sin,
    y: cy + corner.x * sin + corner.y * cos,
  }));
}

/** La elipse del objeto, aproximada por un polígono de lados declarados. */
function ellipseOf(entity: CadPrismEntity): CadPoint2[] {
  const cx = entity.x + entity.w / 2;
  const cy = entity.y + entity.h / 2;
  const radians = ((entity.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const points: CadPoint2[] = [];
  for (let index = 0; index < CAD_FLATSHOT_ROUND_SIDES; index += 1) {
    const angle = (index / CAD_FLATSHOT_ROUND_SIDES) * Math.PI * 2;
    const px = (entity.w / 2) * Math.cos(angle);
    const py = (entity.h / 2) * Math.sin(angle);
    points.push({ x: cx + px * cos - py * sin, y: cy + px * sin + py * cos });
  }
  return points;
}

/** La planta del objeto: rectángulo, o polígono si es redondo. */
export function cadFlatshotFootprint(entity: CadPrismEntity): CadPoint2[] {
  const round = entity.type === "box" && entity.shape === "circle";
  return round ? ellipseOf(entity) : rectangleOf(entity);
}

/**
 * El prisma de un objeto de planta, o `null` si no se puede construir.
 *
 * `height` llega ya resuelta por quien tiene el catálogo. Una altura no
 * positiva o un objeto sin área no producen cuerpo: no se inventa un volumen.
 */
export function cadFlatshotPrism(
  entity: CadPrismEntity,
  height: number,
  base = 0,
): BrepBody | null {
  if (!(height > 0)) return null;
  if (!(Math.abs(entity.w) > 1e-9) || !(Math.abs(entity.h) > 1e-9)) return null;
  const footprint = cadFlatshotFootprint(entity);
  const body = extrudeProfile({
    profile: { outer: footprint.map((point) => ({ x: point.x, y: point.y })) },
    height,
  });
  if (base === 0) return body;
  // La cota del objeto, cuando la trae, sube el prisma entero. `extrudeProfile`
  // siempre arranca en z = 0 del marco, así que se traslada aquí en vez de
  // fabricar un marco desplazado: el resultado es el mismo y no hay que
  // enseñarle un sistema de referencia nuevo a nadie.
  return {
    ...body,
    vertices: body.vertices.map((vertex) => ({
      ...vertex,
      point: { ...vertex.point, z: vertex.point.z + base },
    })),
  };
}

/**
 * Los cuerpos que hay que aplanar, y lo que se quedó fuera con su motivo.
 *
 * Acepta lo que un dibujo REAL tiene: los sólidos B-rep y los objetos de planta
 * con volumen. Todo lo demás se cuenta.
 */
export function cadFlatshotBodies(
  entities: readonly CadEntity[],
  heightFor: CadObjectHeightResolver,
): CadFlatshotBodies {
  const bodies: BrepBody[] = [];
  const skipped: CadFlatshotSkipped[] = [];
  for (const entity of entities) {
    if (entity.type === "solid3d") {
      bodies.push(solid3dBody(entity));
      continue;
    }
    if (entity.type !== "box" && entity.type !== "station") {
      skipped.push({
        entityId: entity.id,
        reason: `${entity.type.toUpperCase()} no tiene volumen: no proyecta ocultas.`,
      });
      continue;
    }
    const kind = entity.type === "box" ? entity.kind : "station";
    const height = heightFor(kind);
    if (height === null || !(height > 0)) {
      skipped.push({
        entityId: entity.id,
        reason: `«${kind}» no declara altura: sin ella no se puede levantar un volumen.`,
      });
      continue;
    }
    const prism = cadFlatshotPrism(entity, height, entity.context?.elevation ?? 0);
    if (!prism) {
      skipped.push({ entityId: entity.id, reason: `«${kind}» no tiene área en planta.` });
      continue;
    }
    bodies.push(prism);
  }
  return { bodies, skipped };
}
