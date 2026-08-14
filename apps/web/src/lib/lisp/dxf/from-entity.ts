/**
 * `CadEntity` → lista de códigos DXF. La mitad de lectura del traductor.
 *
 * Ésta es la superficie por la que TODA rutina ve el dibujo. Si miente, no
 * falla nada: las rutinas producen basura plausible. Por eso el módulo prefiere
 * DECIR QUE NO —omitir un código que no sabe representar, o rechazar la
 * entidad— antes que inventarse un valor razonable.
 *
 * ## Tres decisiones que se toman aquí y hay que conocer
 *
 * **El color.** El modelo canónico guarda el color explícito como `#rrggbb`.
 * El código 62 de DXF es un índice ACI (1-255), y no existe una biyección con
 * el RGB: convertir habría cambiado el color del dibujo al ir y volver. Se
 * emite `(62 . 256)` —BYLAYER— más `(420 . <rgb>)`, que es el color verdadero
 * de 24 bits del propio DXF y es exacto. Una rutina que lea 62 ve BYLAYER, que
 * es cierto en el sentido en que el índice ACI puede serlo.
 *
 * **Los ángulos de ARC van en GRADOS.** El resto de AutoLISP habla en radianes,
 * pero los códigos 50 y 51 de un arco son grados, y así los lee cualquier
 * rutina portada. El modelo canónico ya los guarda en grados, así que no hay
 * conversión — pero está escrito aquí porque es justo el sitio donde alguien
 * «arreglaría» una inconsistencia que no lo es.
 *
 * **Los bulges se emiten sólo cuando NO son cero**, como AutoCAD. Emitirlos
 * siempre parece más regular y rompe el recorrido posicional que hacen las
 * rutinas para leer el bulge del vértice N.
 */
import type { CadEntity, CadEntityContext } from "../../cad/cad-document";
import type { CadNativeEntity } from "../../cad/entity-runtime";
import { int, list, real, type LispValue } from "../values";
import {
  dxfEname,
  dxfInt,
  dxfList,
  dxfPoint,
  dxfReal,
  dxfString,
} from "./codes";

/** Tipo DXF de cada entidad nativa. */
const DXF_TYPE: Record<CadNativeEntity["type"], string> = {
  line: "LINE",
  polyline: "LWPOLYLINE",
  circle: "CIRCLE",
  arc: "ARC",
  ellipse: "ELLIPSE",
  spline: "SPLINE",
  mtext: "MTEXT",
  hatch: "HATCH",
  dimension: "DIMENSION",
  mleader: "MULTILEADER",
  insert: "INSERT",
  // Esquema 4. Los nombres son los del propio DXF; que el exportador todavía no
  // los escriba no cambia CÓMO se llaman, y dejar el mapa incompleto haría que
  // AutoLISP devolviera `undefined` como tipo de entidad.
  point: "POINT",
  xline: "XLINE",
  ray: "RAY",
  solid: "SOLID",
  wipeout: "WIPEOUT",
  image: "IMAGE",
  attdef: "ATTDEF",
  table: "ACAD_TABLE",
  // Esquema 5. `3DSOLID` y `REGION` son los nombres de DXF; el exportador
  // todavía no los escribe, pero un mapa incompleto haría que AutoLISP
  // devolviera `undefined` como tipo de entidad.
  solid3d: "3DSOLID",
  region: "REGION",
  // Esquema 6. `AEC_WALL` es el nombre con el que AutoCAD Architecture emite
  // sus muros; el DXF plano no tiene entidad de muro y nuestra exportación lo
  // degrada a polilínea, pero AutoLISP debe nombrar lo que la entidad ES.
  wall: "AEC_WALL",
};

export function dxfTypeOf(entity: CadNativeEntity): string {
  return DXF_TYPE[entity.type];
}

/** `#rrggbb` → entero de 24 bits del código 420. `null` si no es un hex. */
export function rgbToTrueColor(color: string): number | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(color.trim());
  return match ? Number.parseInt(match[1], 16) : null;
}

export function trueColorToRgb(value: number): string {
  const clamped = Math.max(0, Math.min(0xffffff, Math.trunc(value)));
  return `#${clamped.toString(16).padStart(6, "0")}`;
}

/**
 * Los códigos comunes a toda entidad: nombre, tipo, subclase, capa y las
 * propiedades de presentación. `AcDbEntity` se emite porque AutoCAD lo emite y
 * hay rutinas que cuentan pares para saltarse la cabecera.
 */
function commonCodes(entity: CadNativeEntity): (LispValue | null)[] {
  const context: CadEntityContext | undefined = entity.context;
  const presentation = context?.presentation;
  const items: (LispValue | null)[] = [
    dxfEname(entity.id),
    dxfString(0, dxfTypeOf(entity)),
    context?.handle ? dxfString(5, context.handle) : null,
    dxfString(100, "AcDbEntity"),
    dxfString(8, entity.layer),
  ];

  const linetype = presentation?.linetype;
  if (linetype?.source === "explicit" && linetype.value) items.push(dxfString(6, linetype.value));
  if (linetype?.scale !== undefined) items.push(dxfReal(48, linetype.scale));

  const lineweight = presentation?.lineweight;
  if (lineweight?.source === "explicit" && lineweight.value !== undefined)
    items.push(dxfInt(370, lineweight.value));

  const color = presentation?.color;
  if (color?.source === "explicit" && color.value) {
    const trueColor = rgbToTrueColor(color.value);
    // 256 es BYLAYER. Se emite igualmente para que `(assoc 62 ed)` nunca
    // devuelva nil —muchas rutinas no lo comprueban— y el color real viaja
    // en 420, que sí es exacto.
    items.push(dxfInt(62, 256));
    if (trueColor !== null) items.push(dxfInt(420, trueColor));
  } else if (color?.source === "byBlock") {
    items.push(dxfInt(62, 0));
  } else {
    items.push(dxfInt(62, 256));
  }

  return items;
}

function subclass(name: string): LispValue {
  return dxfString(100, name);
}

/**
 * Traduce una entidad nativa. Devuelve `null` para lo que el registro nativo no
 * reclama (círculos y cotas heredados), porque esas entidades no son geometría
 * de AutoCAD y fabricarles una lista DXF sería exactamente la mentira que este
 * módulo existe para no contar.
 */
export function cadEntityToDxf(entity: CadEntity): LispValue | null {
  switch (entity.type) {
    case "line":
      return dxfList([
        ...commonCodes(entity),
        subclass("AcDbLine"),
        dxfPoint(10, entity.start),
        dxfPoint(11, entity.end),
      ]);

    case "circle":
      // El círculo HEREDADO (el que lleva `legacy`) es la proyección de un
      // asset del editor antiguo, no un CIRCLE de AutoCAD.
      if (entity.legacy) return null;
      return dxfList([
        ...commonCodes(entity),
        subclass("AcDbCircle"),
        dxfPoint(10, entity.center),
        dxfReal(40, entity.radius),
      ]);

    case "arc":
      return dxfList([
        ...commonCodes(entity),
        subclass("AcDbCircle"),
        dxfPoint(10, entity.center),
        dxfReal(40, entity.radius),
        subclass("AcDbArc"),
        // GRADOS, no radianes: es lo que dice DXF para 50 y 51.
        dxfReal(50, entity.startAngle),
        dxfReal(51, entity.endAngle),
      ]);

    case "polyline": {
      const items: (LispValue | null)[] = [
        ...commonCodes(entity),
        subclass("AcDbPolyline"),
        dxfInt(90, entity.vertices.length),
        dxfInt(70, entity.closed ? 1 : 0),
      ];
      for (const vertex of entity.vertices) {
        items.push(dxfPoint(10, vertex));
        // Sólo cuando hay curvatura, como AutoCAD: el recorrido posicional de
        // las rutinas cuenta con que un vértice recto no tenga su 42.
        if (vertex.bulge) items.push(dxfReal(42, vertex.bulge));
      }
      return dxfList(items);
    }

    case "ellipse":
      return dxfList([
        ...commonCodes(entity),
        subclass("AcDbEllipse"),
        dxfPoint(10, entity.center),
        // El 11 de una elipse es el semieje mayor RELATIVO al centro, no un
        // punto absoluto. El modelo canónico ya lo guarda así.
        dxfPoint(11, entity.majorAxis),
        dxfReal(40, entity.ratio),
        dxfReal(41, entity.startParameter),
        dxfReal(42, entity.endParameter),
      ]);

    case "spline": {
      const items: (LispValue | null)[] = [
        ...commonCodes(entity),
        subclass("AcDbSpline"),
        // Bit 1: cerrada. Bit 8: planar — toda la geometría del documento lo es.
        dxfInt(70, (entity.closed ? 1 : 0) | 8),
        dxfInt(71, entity.degree),
        dxfInt(72, entity.knots.length),
        dxfInt(73, entity.controlPoints.length),
      ];
      for (const knot of entity.knots) items.push(dxfReal(40, knot));
      for (const point of entity.controlPoints) items.push(dxfPoint(10, point));
      for (const weight of entity.weights ?? []) items.push(dxfReal(41, weight));
      return dxfList(items);
    }

    case "mtext":
      return dxfList([
        ...commonCodes(entity),
        subclass("AcDbMText"),
        dxfPoint(10, entity.insertion),
        dxfString(1, entity.text),
        entity.height === undefined ? null : dxfReal(40, entity.height),
        entity.width === undefined ? null : dxfReal(41, entity.width),
        entity.rotation === undefined ? null : dxfReal(50, entity.rotation),
        entity.style ? dxfString(7, entity.style) : null,
        dxfInt(71, mtextAttachment(entity.alignment)),
      ]);

    case "insert":
      return dxfList([
        ...commonCodes(entity),
        subclass("AcDbBlockReference"),
        dxfString(2, entity.block),
        dxfPoint(10, entity.insertion),
        dxfReal(41, entity.scale.x),
        dxfReal(42, entity.scale.y),
        dxfReal(43, entity.scale.z),
        dxfReal(50, entity.rotation),
      ]);

    case "hatch":
      return dxfList([
        ...commonCodes(entity),
        subclass("AcDbHatch"),
        dxfString(2, entity.pattern),
        dxfInt(70, entity.solid ? 1 : 0),
        dxfInt(71, entity.associative ? 1 : 0),
        dxfInt(91, entity.boundaries.length),
        entity.scale === undefined ? null : dxfReal(41, entity.scale),
        entity.angle === undefined ? null : dxfReal(52, entity.angle),
        entity.origin ? dxfPoint(43, entity.origin) : null,
        // Los contornos van como listas de puntos por bucle. No es la
        // codificación literal de AutoCAD —que anida tipos de arista— pero es
        // fiel a lo que el documento canónico guarda: polilíneas cerradas.
        ...entity.boundaries.map((boundary) =>
          list([int(93), ...boundary.flatMap((point) => [real(point.x), real(point.y)])])),
      ]);

    case "dimension":
      // La cota HEREDADA (sin `dimensionKind`) es una anotación del editor
      // antiguo, no una DIMENSION de AutoCAD.
      if (!entity.dimensionKind) return null;
      return dxfList([
        ...commonCodes(entity),
        subclass("AcDbDimension"),
        dxfPoint(10, { ...entity.a, z: 0 }),
        dxfPoint(13, { ...entity.a, z: 0 }),
        dxfPoint(14, { ...entity.b, z: 0 }),
        entity.c ? dxfPoint(11, { ...entity.c, z: 0 }) : null,
        dxfInt(70, dimensionTypeCode(entity.dimensionKind)),
        entity.text === undefined ? null : dxfString(1, entity.text),
        entity.style ? dxfString(3, entity.style) : null,
        entity.radius === undefined ? null : dxfReal(40, entity.radius),
        /**
         * EXTENSIÓN de Valle Design, y conviene saberlo: en DXF la
         * asociatividad de una cota vive en un diccionario de extensión que
         * `entget` no devuelve, así que en AutoCAD no hay forma cómoda de
         * preguntarla desde LISP. Aquí el modelo canónico la tiene como campo
         * de primera clase, y ocultarla haría IMPOSIBLE la rutina de
         * comprobación de norma más pedida que existe: «dime qué cotas se han
         * desasociado». Se expone como 290 (asociativa) y 291 (rota).
         *
         * Son de SÓLO LECTURA: `entmod` no las aplica. Cambiar la
         * asociatividad tiene su propio comando canónico
         * (`dimension-association`) porque además regenera la cota, y fingir
         * que un par DXF puede hacer eso sería la mentira de siempre.
         */
        dxfInt(290, entity.associative ? 1 : 0),
        dxfInt(291, entity.associationStatus === "broken" ? 1 : 0),
      ]);

    case "mleader":
      return dxfList([
        ...commonCodes(entity),
        subclass("AcDbMLeader"),
        dxfString(1, entity.text),
        dxfPoint(10, entity.textPosition),
        entity.textHeight === undefined ? null : dxfReal(40, entity.textHeight),
        entity.style ? dxfString(3, entity.style) : null,
        dxfInt(70, entity.associative ? 1 : 0),
        // Cada línea de directriz como una lista de puntos, misma decisión que
        // en HATCH: fiel al documento, no a la codificación anidada del DXF.
        ...(entity.leaderLines ?? [entity.vertices]).map((leader) =>
          list([int(304), ...leader.flatMap((point) => [real(point.x), real(point.y)])])),
      ]);

    case "text":
      // El TEXT heredado sí tiene forma DXF honesta, y hay rutinas de
      // numeración de ejes que lo esperan.
      return dxfList([
        dxfEname(entity.id),
        dxfString(0, "TEXT"),
        dxfString(100, "AcDbEntity"),
        dxfString(8, entity.layer),
        subclass("AcDbText"),
        dxfPoint(10, { x: entity.x, y: entity.y, z: 0 }),
        dxfString(1, entity.text),
        entity.height === undefined ? null : dxfReal(40, entity.height),
        entity.rotation === undefined ? null : dxfReal(50, entity.rotation),
        entity.style ? dxfString(7, entity.style) : null,
      ]);

    default:
      // `box`, `station`, `connector`: proyecciones del editor histórico. No
      // son entidades de AutoCAD y no se les inventa una.
      return null;
  }
}

/** `alignment` del modelo → código 71 de MTEXT (1 = superior izquierda). */
function mtextAttachment(alignment: string | undefined): number {
  const order = [
    "top-left", "top-center", "top-right",
    "middle-left", "middle-center", "middle-right",
    "bottom-left", "bottom-center", "bottom-right",
  ];
  const index = alignment ? order.indexOf(alignment) : 0;
  return index < 0 ? 1 : index + 1;
}

const DIMENSION_TYPE_CODES: Record<string, number> = {
  linear: 0,
  aligned: 1,
  angular: 2,
  diameter: 3,
  radius: 4,
  ordinate: 6,
  "arc-length": 8,
};

export function dimensionTypeCode(kind: string): number {
  return DIMENSION_TYPE_CODES[kind] ?? 0;
}

export function dimensionKindFromCode(code: number): string | null {
  const found = Object.entries(DIMENSION_TYPE_CODES).find(([, value]) => value === (code & 0x0f));
  return found ? found[0] : null;
}
