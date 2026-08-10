/**
 * Primitivas del esquema 4 → entidades del documento canónico.
 *
 * Es la vuelta exacta de `dxf-schema4-primitives.ts`, y la simetría es el
 * contrato: lo que se exporta tiene que volver a entrar como el MISMO tipo, no
 * como geometría suelta que se le parezca.
 *
 * ## La proyección y los vectores
 *
 * Un punto se proyecta; un VECTOR, no. La dirección de un XLINE, los ejes U y V
 * de una imagen y el ángulo de un ATTDEF van por la parte LINEAL de la
 * proyección (`mappedVector`, `projectedAngle`): proyectar la punta de un
 * vector le sumaría la traslación y lo mandaría a otro sitio del plano.
 *
 * `projectedAngle` devuelve grados en `(−180, 180]` y el runtime normaliza a
 * `[0, 360)`: una rotación de 270 vuelve como −90 y las dos son la misma. Quien
 * compare ángulos, que lo haga MÓDULO 360.
 */
import type { CadEntity } from "./cad-document";
import type { CadDxfPrimitive } from "./dxf-import";
import {
  mappedVector,
  point3,
  projectedAngle,
  type CadDxfProjection,
} from "./dxf-projection";

/**
 * Construye la entidad canónica de una primitiva del esquema 4, o `null` si la
 * primitiva no es de este esquema.
 */
export function schema4PrimitiveToEntity(
  primitive: CadDxfPrimitive,
  id: string,
  projection: CadDxfProjection,
  context: CadEntity["context"],
): CadEntity | null {
  const payload = primitive.schema4;
  if (!payload || payload.kind !== primitive.kind) return null;
  const anchor = primitive.points[0];
  const layer = primitive.layer;

  if (payload.kind === "point" && anchor)
    return {
      id,
      type: "point",
      position: point3(projection.point(anchor)),
      ...(payload.style === undefined ? {} : { style: payload.style }),
      ...(payload.size === undefined ? {} : { size: payload.size }),
      layer,
      context,
    };

  if ((payload.kind === "xline" || payload.kind === "ray") && anchor) {
    const direction = mappedVector(projection, anchor, payload.direction);
    if (!direction.x && !direction.y) return null;
    return {
      id,
      type: payload.kind,
      basePoint: point3(projection.point(anchor)),
      direction: point3(direction),
      layer,
      context,
    };
  }

  if (payload.kind === "solid" && primitive.points.length >= 3)
    return {
      id,
      type: "solid",
      points: primitive.points.slice(0, 4).map((point) => point3(projection.point(point))),
      layer,
      context,
    };

  if (payload.kind === "wipeout" && primitive.points.length >= 3)
    return {
      id,
      type: "wipeout",
      boundary: primitive.points.map((point) => point3(projection.point(point))),
      ...(payload.frame === undefined ? {} : { frame: payload.frame }),
      layer,
      context,
    };

  if (payload.kind === "image" && anchor)
    return {
      id,
      type: "image",
      definition: payload.definition.key,
      insertion: point3(projection.point(anchor)),
      uVector: point3(mappedVector(projection, anchor, payload.uVector)),
      vVector: point3(mappedVector(projection, anchor, payload.vVector)),
      size: { width: payload.pixelWidth, height: payload.pixelHeight },
      ...(payload.brightness === undefined ? {} : { brightness: payload.brightness }),
      ...(payload.contrast === undefined ? {} : { contrast: payload.contrast }),
      ...(payload.fade === undefined ? {} : { fade: payload.fade }),
      ...(payload.showImage === undefined ? {} : { showImage: payload.showImage }),
      ...(payload.clipBoundary?.length
        ? { clipBoundary: payload.clipBoundary.map((point) => point3(projection.point(point))) }
        : {}),
      layer,
      context,
    };

  if (payload.kind === "attdef" && anchor)
    return {
      id,
      type: "attdef",
      tag: payload.tag,
      ...(payload.prompt === undefined ? {} : { prompt: payload.prompt }),
      ...(payload.defaultValue === undefined ? {} : { defaultValue: payload.defaultValue }),
      insertion: point3(projection.point(anchor)),
      ...(payload.height === undefined ? {} : { height: payload.height }),
      // El ángulo pasa por la proyección: bajo un espejo o un giro, un atributo
      // que conserva su rotación de origen sale torcido respecto del dibujo.
      ...(payload.rotation === undefined
        ? {}
        : { rotation: projectedAngle(projection, anchor, 1, payload.rotation) }),
      ...(payload.style === undefined ? {} : { style: payload.style }),
      ...(payload.alignment === undefined ? {} : { alignment: payload.alignment }),
      ...(payload.invisible === undefined ? {} : { invisible: payload.invisible }),
      ...(payload.constant === undefined ? {} : { constant: payload.constant }),
      ...(payload.verify === undefined ? {} : { verify: payload.verify }),
      ...(payload.preset === undefined ? {} : { preset: payload.preset }),
      ...(payload.lockPosition === undefined ? {} : { lockPosition: payload.lockPosition }),
      layer,
      context,
    };

  // TABLE no vuelve como tabla: se exportó como geometría a propósito y el
  // manifiesto de pérdidas lo declara. Devolver aquí una tabla reconstruida a
  // ojo sería peor que decir la verdad.
  return null;
}
