/**
 * Entidades del esquema 4 → primitiva DXF.
 *
 * La geometría va en `points`, como en cualquier primitiva; lo que no es
 * geometría va en `schema4`. Ver `dxf-schema4.ts` para por qué entran por el
 * canal de las primitivas y no por ocho listas nuevas del modelo.
 *
 * Este módulo NO decide qué se pierde: sólo traduce. Lo que no se puede
 * traducir devuelve `null` y quien lo declara es el manifiesto de pérdidas.
 */
import type { CadDocument, CadEntity, CadImageDefinition } from "./cad-document";
import { cadImageFileName, cadImageIsEmbedded } from "./image-geometry";
import type { CadDxfPoint, CadDxfPrimitive } from "./dxf-import";
import type { CadDxfSchema4Payload } from "./dxf-schema4";

const flat = (point: { x: number; y: number }): CadDxfPoint => ({
  x: point.x,
  y: point.y,
});

/**
 * Clave de la imagen en `ACAD_IMAGE_DICT`.
 *
 * Es el `id` de la definición y no su nombre porque es lo que referencian las
 * entidades: al reimportar, el enlace IMAGE → IMAGEDEF → clave tiene que
 * devolver exactamente el mismo `definition` que tenía la entidad.
 */
export function imageDictionaryKey(definition: CadImageDefinition): string {
  return definition.id;
}

export function cadEntityToSchema4Primitive(
  entity: CadEntity,
  document?: Pick<CadDocument, "imageDefinitions">,
): CadDxfPrimitive | null {
  const build = (
    points: CadDxfPoint[],
    schema4: CadDxfSchema4Payload,
  ): CadDxfPrimitive => ({
    kind: schema4.kind,
    layer: entity.layer,
    points,
    schema4,
  });

  if (entity.type === "point")
    return build([flat(entity.position)], {
      kind: "point",
      ...(entity.style === undefined ? {} : { style: entity.style }),
      ...(entity.size === undefined ? {} : { size: entity.size }),
    });

  if (entity.type === "xline" || entity.type === "ray") {
    if (!entity.direction.x && !entity.direction.y) return null;
    return build([flat(entity.basePoint)], {
      kind: entity.type,
      direction: flat(entity.direction),
    });
  }

  if (entity.type === "solid") {
    if (entity.points.length < 3) return null;
    return build(entity.points.slice(0, 4).map(flat), { kind: "solid" });
  }

  if (entity.type === "wipeout") {
    if (entity.boundary.length < 3) return null;
    return build(entity.boundary.map(flat), {
      kind: "wipeout",
      ...(entity.frame === undefined ? {} : { frame: entity.frame }),
    });
  }

  if (entity.type === "image") {
    const definition = (document?.imageDefinitions ?? []).find(
      (candidate) => candidate.id === entity.definition,
    );
    // Sin definición no hay IMAGEDEF que escribir, y una IMAGE que apunta a un
    // manejador inexistente rompe el fichero para quien lo abra. Se descarta y
    // el manifiesto lo dice con nombre y apellidos.
    if (!definition) return null;
    return build([flat(entity.insertion)], {
      kind: "image",
      uVector: flat(entity.uVector),
      vVector: flat(entity.vVector),
      pixelWidth: entity.size.width,
      pixelHeight: entity.size.height,
      ...(entity.brightness === undefined ? {} : { brightness: entity.brightness }),
      ...(entity.contrast === undefined ? {} : { contrast: entity.contrast }),
      ...(entity.fade === undefined ? {} : { fade: entity.fade }),
      ...(entity.showImage === undefined ? {} : { showImage: entity.showImage }),
      ...(entity.clipBoundary?.length
        ? { clipBoundary: entity.clipBoundary.map(flat) }
        : {}),
      definition: {
        key: imageDictionaryKey(definition),
        // Una imagen que viaja dentro del dibujo (`data:`, Ola H) va al DXF
        // por su NOMBRE: el grupo 1 es una ruta, y diez megabytes de base64
        // no son una ruta. El manifiesto de pérdidas dice qué archivo guardar.
        path: cadImageIsEmbedded(definition) ? cadImageFileName(definition) : definition.uri,
        pixelWidth: definition.pixelWidth,
        pixelHeight: definition.pixelHeight,
        ...(definition.loaded === undefined ? {} : { loaded: definition.loaded }),
      },
    });
  }

  if (entity.type === "attdef")
    return build([flat(entity.insertion)], {
      kind: "attdef",
      tag: entity.tag,
      ...(entity.prompt === undefined ? {} : { prompt: entity.prompt }),
      ...(entity.defaultValue === undefined ? {} : { defaultValue: entity.defaultValue }),
      ...(entity.height === undefined ? {} : { height: entity.height }),
      ...(entity.rotation === undefined ? {} : { rotation: entity.rotation }),
      ...(entity.style === undefined ? {} : { style: entity.style }),
      ...(entity.alignment === undefined ? {} : { alignment: entity.alignment }),
      ...(entity.invisible === undefined ? {} : { invisible: entity.invisible }),
      ...(entity.constant === undefined ? {} : { constant: entity.constant }),
      ...(entity.verify === undefined ? {} : { verify: entity.verify }),
      ...(entity.preset === undefined ? {} : { preset: entity.preset }),
      ...(entity.lockPosition === undefined ? {} : { lockPosition: entity.lockPosition }),
    });

  if (entity.type === "table") {
    if (entity.rows < 1 || entity.columns < 1) return null;
    return build([flat(entity.insertion)], {
      kind: "table",
      rows: entity.rows,
      columns: entity.columns,
      rowHeights: [...entity.rowHeights],
      columnWidths: [...entity.columnWidths],
      cells: entity.cells.map((cell) => ({ ...cell })),
      ...(entity.rotation === undefined ? {} : { rotation: entity.rotation }),
      ...(entity.style === undefined ? {} : { style: entity.style }),
    });
  }

  return null;
}
