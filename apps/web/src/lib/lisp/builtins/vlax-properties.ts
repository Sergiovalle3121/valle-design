/**
 * El puente Visual LISP, mitad de las PROPIEDADES: la tabla `vla-get-*` /
 * `vla-put-*` y lo que hace falta para llegar de un objeto a una entidad viva.
 *
 * Sale de `vlax.ts`, que con el puente entero pasaba de las 800 líneas que el
 * presupuesto de `scripts/cad/check-monolith-budget.mjs` deja a un archivo no
 * presupuestado. El corte no es por tamaño: es por junta natural. Aquí vive
 * TODO lo que sabe qué propiedades tiene una entidad de AutoCAD y cómo se
 * escriben; al otro lado quedan las curvas —que miden— y la instalación de los
 * builtins, que no necesitan conocer la tabla, sólo preguntarle.
 *
 * Las dos reglas del puente siguen viviendo donde se aplican, y son las de
 * `vlax.ts`:
 *
 *  - **La escritura sale por `host.apply`** con `CadEntityCommand` canónicos:
 *    `replace` por el único traductor DXF para la geometría, `presentation`
 *    para el color y el tipo de línea —el mismo comando que escriben COLOR,
 *    CHPROP y MATCHPROP—. No hay una segunda puerta.
 *  - **La escritura se RELEE.** Cada propiedad declara qué tiene que devolver
 *    la lectura después de escribirla; se aplica, se relee y se compara. Sin
 *    eso, un `vla-put-*` sobre un tipo que el traductor no atiende devolvería
 *    el valor escrito sin haber cambiado nada — el «éxito sin efecto» que la
 *    casa prohíbe. Ese guardia encontró un defecto real al construirse: el
 *    color PorBloque volvía como 7.
 */
import type { CadEntityPresentation } from "../../cad/cad-document";
import type { CadEntityCommand } from "../../cad/entity-commands";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../../cad/entity-runtime";
import {
  cadEntityArea,
} from "../../cad/inquiry/contours";
import { ACI_BY_BLOCK, ACI_BY_LAYER, aciToHex, hexToAci } from "../../cad/plot/aci-palette";
import { dxfInt, dxfList, dxfPoint, dxfReal, dxfString } from "../dxf/codes";
import { findLayerRecord, layerIdFromEname } from "../dxf/layer-record";
import { dxfPatchEntity } from "../dxf/to-entity";
import { LispError } from "../errors";
import { printLisp } from "../printer";
import {
  NIL,
  bool,
  equal,
  int,
  isNumber,
  list,
  pointOf,
  pointValue,
  properList,
  real,
  str,
  type LispHostServices,
  type LispPoint,
  type LispValue,
} from "../values";
import { wantInt, wantString } from "./define";
import { curveLength, expectedTypeName } from "./vlax-curves";

// ---------------------------------------------------------------------------
// De un valor a una entidad viva
// ---------------------------------------------------------------------------

/**
 * El id que hay dentro de un objeto VLA o de un ename.
 *
 * Las funciones `vlax-curve-*` aceptan las dos formas en AutoCAD y las rutinas
 * reales usan las dos en el mismo fichero, así que rechazar una sería inventar
 * una incompatibilidad. Las `vla-get-*`/`vla-put-*` sólo aceptan el objeto: son
 * propiedades de un objeto y pasarles un ename es un error del autor que
 * conviene leer pronto.
 */
export function idOfObject(value: LispValue, caller: string): string {
  if (value.t === "vla-object") return value.id;
  throw new LispError(
    `bad argument type: ${caller}: se esperaba un objeto VLA y llegó ${printLisp(value)}. ` +
      `Un nombre de entidad se convierte con (vlax-ename->vla-object e).`,
  );
}

export function idOfCurve(value: LispValue, caller: string): string {
  if (value.t === "vla-object" || value.t === "ename") return value.id;
  throw new LispError(
    `bad argument type: ${caller}: se esperaba un nombre de entidad o un objeto VLA y llegó ` +
      `${printLisp(value)}.`,
  );
}

/**
 * La entidad NATIVA viva detrás de un id, o el error que lo explica.
 *
 * Tres negativas distintas, y las tres importan: la entidad borrada («ya no
 * está»), el registro de la tabla de capas —que `tblobjname` reparte y que NO
 * es un objeto VLA— y la proyección del editor histórico, que no tiene forma de
 * AutoCAD y para la que inventar propiedades sería contar una mentira.
 */
export function liveNativeEntity(
  host: LispHostServices,
  id: string,
  caller: string,
): CadNativeEntity {
  if (layerIdFromEname(id) !== null)
    throw new LispError(
      `${caller}: "${layerIdFromEname(id)}" es un registro de la tabla de capas, no una entidad ` +
        `del dibujo. Las capas se leen con (tblsearch "LAYER" …) y se cambian con ` +
        `(command "-LAYER" …).`,
    );
  const entity = host.entity(id);
  if (!entity)
    throw new LispError(
      `${caller}: la entidad ${id} ya no está en el dibujo. (vlax-erased-p obj) lo comprueba ` +
        `antes de preguntar.`,
    );
  if (!CAD_ENTITY_REGISTRY.supports(entity))
    throw new LispError(
      `${caller}: ${id} no es una entidad nativa del dibujo y no tiene propiedades de AutoCAD.`,
    );
  return entity;
}

// ---------------------------------------------------------------------------
// Las propiedades
// ---------------------------------------------------------------------------

/**
 * Lo que produce una escritura: los comandos canónicos que la aplican y el
 * valor que la lectura tiene que devolver después. Lo segundo es la mitad que
 * hace honesta a la primera.
 */
export interface VlaWrite {
  commands: CadEntityCommand[];
  expect: LispValue;
}

export interface VlaProperty {
  /** Capitalización de ActiveX: es la que se lee en `vla-get-<Prop>`. */
  readonly name: string;
  /** Tipos que la tienen. `null` = cualquier entidad nativa. */
  readonly types: readonly CadNativeEntity["type"][] | null;
  read(entity: CadNativeEntity, host: LispHostServices): LispValue;
  /** Tipos que además la ESCRIBEN. Sin esto, la propiedad es de sólo lectura. */
  readonly writableTypes?: readonly CadNativeEntity["type"][] | null;
  write?(entity: CadNativeEntity, value: LispValue, host: LispHostServices): VlaWrite;
  /** Por qué no se escribe. Se lee tal cual en el error de `vla-put-<Prop>`. */
  readonly readOnlyReason?: string;
}

/** Punto LISP a partir de un punto del modelo. */
export function modelPoint(point: { x: number; y: number; z?: number }): LispValue {
  return pointValue({ x: point.x, y: point.y, z: point.z ?? 0 });
}

export function wantPoint(value: LispValue, caller: string): LispPoint {
  const point = pointOf(value);
  if (!point)
    throw new LispError(
      `bad argument type: ${caller}: se esperaba un punto (una lista de dos o tres números) y ` +
        `llegó ${printLisp(value)}. (vlax-3d-point x y z) lo construye.`,
    );
  return point;
}

function wantPositive(value: LispValue, caller: string): number {
  if (!isNumber(value))
    throw new LispError(`bad argument type: ${caller}: se esperaba un número`);
  if (!(value.v > 0))
    throw new LispError(
      `${caller}: ${printLisp(value)} no es un tamaño válido; tiene que ser mayor que cero.`,
    );
  return value.v;
}

/** Sustituye la entidad entera tras pasar la lista DXF por el ÚNICO traductor. */
function patchCommand(entity: CadNativeEntity, entries: LispValue): CadEntityCommand[] {
  return [{ type: "replace", entityId: entity.id, entity: dxfPatchEntity(entity, entries) }];
}

/** La presentación actual con una parte sustituida. */
function presentationCommand(
  entity: CadNativeEntity,
  patch: CadEntityPresentation,
): CadEntityCommand[] {
  const merged: CadEntityPresentation = { ...entity.context?.presentation, ...patch };
  return [{ type: "presentation", entityId: entity.id, presentation: merged }];
}

/** El índice ACI que este documento sabe contestar para una entidad. */
function colorIndexOf(entity: CadNativeEntity): number {
  const color = entity.context?.presentation?.color;
  if (color) {
    if (color.source === "explicit" && color.value) return hexToAci(color.value);
    if (color.source === "byBlock") return ACI_BY_BLOCK;
    return ACI_BY_LAYER;
  }
  // El TEXT heredado guarda su color en un campo propio, anterior a la
  // presentación. Se lee —si no, un rótulo rojo se declararía PorCapa— pero no
  // se escribe: la escritura va por la presentación, que es lo que editan
  // COLOR, CHPROP y MATCHPROP.
  if (entity.type === "text" && entity.color) return hexToAci(entity.color);
  return ACI_BY_LAYER;
}

/** El nombre de tipo de línea que se lee, con los dos heredados por su nombre. */
function linetypeNameOf(entity: CadNativeEntity): string {
  const linetype = entity.context?.presentation?.linetype;
  if (linetype?.source === "explicit" && linetype.value) return linetype.value;
  if (linetype?.source === "byBlock") return "ByBlock";
  return "ByLayer";
}

/** Los vértices de una polilínea como lista plana `(x1 y1 x2 y2 …)`. */
function polylineCoordinates(entity: Extract<CadNativeEntity, { type: "polyline" }>): LispValue {
  const numbers: LispValue[] = [];
  for (const vertex of entity.vertices) numbers.push(real(vertex.x), real(vertex.y));
  return list(numbers);
}

/**
 * La tabla de propiedades: UNA definición por propiedad, con sus tipos, su
 * lectura y —si la hay— su escritura. Los pares `vla-get-<Prop>` y
 * `vla-put-<Prop>` se GENERAN de aquí, así que una propiedad no puede existir
 * en `vlax-get` y faltar en `vla-get-`, ni leerse de una forma por una puerta y
 * de otra por la otra.
 */
export const VLA_PROPERTIES: readonly VlaProperty[] = [
  {
    name: "Layer",
    types: null,
    read: (entity) => str(entity.layer),
    write: (entity, value, host) => {
      const wanted = wantString(value).v;
      const layer = findLayerRecord(host.layers(), wanted);
      // AutoCAD también se niega: una entidad en una capa que no está en la
      // tabla es un dibujo roto —no se puede apagar, ni congelar, ni trazar con
      // su pluma— y el defecto aparecería mucho más tarde, al plotear.
      if (!layer)
        throw new LispError(
          `vla-put-Layer: la capa "${wanted}" no existe en este dibujo. Se crea con ` +
            `(command "-LAYER" "N" "${wanted}" ""), que es la ruta que produce el comando ` +
            `canónico de capa y un solo paso de deshacer.`,
        );
      return {
        commands: patchCommand(entity, dxfList([dxfString(8, layer.name)])),
        expect: str(layer.name),
      };
    },
  },
  {
    name: "Color",
    types: null,
    read: (entity) => int(colorIndexOf(entity)),
    write: (entity, value) => {
      const aci = wantInt(value);
      if (aci < 0 || aci > 256)
        throw new LispError(
          `vla-put-Color: ${aci} no es un color de AutoCAD. El índice va de 1 a 255; 0 es ` +
            `PorBloque y 256 PorCapa.`,
        );
      if (aci === ACI_BY_LAYER || aci === ACI_BY_BLOCK) {
        const source = aci === ACI_BY_LAYER ? ("byLayer" as const) : ("byBlock" as const);
        return {
          commands: presentationCommand(entity, { color: { source } }),
          expect: int(aci),
        };
      }
      /**
       * El documento guarda COLOR (`#rrggbb`), no índice, y la tabla ACI tiene
       * entradas que comparten RGB —el 10 con el 1, el 50 con el 2, y así hasta
       * el 255 con el 7—. Escribir el 10 y leer el 1 no es un fallo de este
       * puente: es la misma pérdida que ya tiene el trazado, con la MISMA
       * tabla, y por eso lo esperado se calcula con ella en vez de darla por
       * reversible.
       */
      const hex = aciToHex(aci);
      return {
        commands: presentationCommand(entity, { color: { source: "explicit", value: hex } }),
        expect: int(hexToAci(hex)),
      };
    },
  },
  {
    name: "Linetype",
    types: null,
    read: (entity) => str(linetypeNameOf(entity)),
    write: (entity, value) => {
      const wanted = wantString(value).v.trim();
      const upper = wanted.toUpperCase();
      const scale = entity.context?.presentation?.linetype?.scale;
      if (upper === "BYLAYER" || upper === "PORCAPA")
        return {
          commands: presentationCommand(entity, {
            linetype: { source: "byLayer", ...(scale === undefined ? {} : { scale }) },
          }),
          expect: str("ByLayer"),
        };
      if (upper === "BYBLOCK" || upper === "PORBLOQUE")
        return {
          commands: presentationCommand(entity, {
            linetype: { source: "byBlock", ...(scale === undefined ? {} : { scale }) },
          }),
          expect: str("ByBlock"),
        };
      return {
        commands: presentationCommand(entity, {
          linetype: { source: "explicit", value: wanted, ...(scale === undefined ? {} : { scale }) },
        }),
        expect: str(wanted),
      };
    },
  },
  {
    name: "LinetypeScale",
    types: null,
    // Sin escala explícita, 1.0: es lo que contesta AutoCAD y lo que hace que
    // `(* (vla-get-LinetypeScale o) (getvar "LTSCALE"))` dé el número correcto.
    read: (entity) => real(entity.context?.presentation?.linetype?.scale ?? 1),
    write: (entity, value) => {
      const scale = wantPositive(value, "vla-put-LinetypeScale");
      const linetype = entity.context?.presentation?.linetype;
      return {
        commands: presentationCommand(entity, {
          linetype: { ...(linetype ?? { source: "byLayer" as const }), scale },
        }),
        expect: real(scale),
      };
    },
  },
  {
    name: "TextString",
    types: ["text", "mtext"],
    read: (entity) => str((entity as { text: string }).text),
    write: (entity, value) => {
      const text = wantString(value).v;
      return { commands: patchCommand(entity, dxfList([dxfString(1, text)])), expect: str(text) };
    },
  },
  {
    name: "Height",
    types: ["text", "mtext"],
    // La altura ausente vale 1.0, la misma decisión que toma `textbox`: es la
    // unidad, no un tamaño inventado.
    read: (entity) => real((entity as { height?: number }).height ?? 1),
    write: (entity, value) => {
      const height = wantPositive(value, "vla-put-Height");
      return { commands: patchCommand(entity, dxfList([dxfReal(40, height)])), expect: real(height) };
    },
  },
  {
    name: "InsertionPoint",
    types: ["text", "mtext", "insert"],
    read: (entity) =>
      entity.type === "text"
        ? modelPoint({ x: entity.x, y: entity.y })
        : modelPoint((entity as { insertion: { x: number; y: number; z?: number } }).insertion),
    write: (entity, value) => {
      const point = wantPoint(value, "vla-put-InsertionPoint");
      return {
        commands: patchCommand(entity, dxfList([dxfPoint(10, point)])),
        expect: modelPoint(point),
      };
    },
  },
  {
    name: "StartPoint",
    types: ["line", "arc"],
    read: (entity) =>
      entity.type === "line"
        ? modelPoint(entity.start)
        : modelPoint(arcPoint(entity as ArcEntity, (entity as ArcEntity).startAngle)),
    writableTypes: ["line"],
    readOnlyReason:
      "el punto de arranque de un arco es CONSECUENCIA de su centro, su radio y su ángulo " +
      "inicial; moverlo a mano dejaría el arco sin definir. Se cambia con vla-put-Center, " +
      "vla-put-Radius o con (command \"ARCO\" …).",
    write: (entity, value) => {
      const point = wantPoint(value, "vla-put-StartPoint");
      return {
        commands: patchCommand(entity, dxfList([dxfPoint(10, point)])),
        expect: modelPoint(point),
      };
    },
  },
  {
    name: "EndPoint",
    types: ["line", "arc"],
    read: (entity) =>
      entity.type === "line"
        ? modelPoint(entity.end)
        : modelPoint(arcPoint(entity as ArcEntity, (entity as ArcEntity).endAngle)),
    writableTypes: ["line"],
    readOnlyReason:
      "el punto final de un arco es consecuencia de su centro, su radio y su ángulo final. " +
      "Véase vla-put-StartPoint.",
    write: (entity, value) => {
      const point = wantPoint(value, "vla-put-EndPoint");
      return {
        commands: patchCommand(entity, dxfList([dxfPoint(11, point)])),
        expect: modelPoint(point),
      };
    },
  },
  {
    name: "Center",
    types: ["circle", "arc", "ellipse"],
    read: (entity) => modelPoint((entity as { center: { x: number; y: number; z?: number } }).center),
    write: (entity, value) => {
      const point = wantPoint(value, "vla-put-Center");
      return {
        commands: patchCommand(entity, dxfList([dxfPoint(10, point)])),
        expect: modelPoint(point),
      };
    },
  },
  {
    name: "Radius",
    types: ["circle", "arc"],
    read: (entity) => real((entity as { radius: number }).radius),
    write: (entity, value) => {
      const radius = wantPositive(value, "vla-put-Radius");
      return { commands: patchCommand(entity, dxfList([dxfReal(40, radius)])), expect: real(radius) };
    },
  },
  {
    name: "Closed",
    types: ["polyline", "spline"],
    read: (entity) => bool((entity as { closed: boolean }).closed),
    writableTypes: ["polyline"],
    readOnlyReason:
      "cerrar una SPLINE cambia su vector de nudos y su continuidad en la unión, no una " +
      "bandera: el traductor DXF de este producto no transporta esa regeneración. Se cierra " +
      "con (command \"EDITPOL\" …).",
    write: (entity, value) => {
      const closed = value.t !== "nil";
      return {
        commands: patchCommand(entity, dxfList([dxfInt(70, closed ? 1 : 0)])),
        expect: bool(closed),
      };
    },
  },
  {
    name: "Coordinates",
    types: ["polyline"],
    read: (entity) => polylineCoordinates(entity as Extract<CadNativeEntity, { type: "polyline" }>),
    write: (entity, value) => {
      const polyline = entity as Extract<CadNativeEntity, { type: "polyline" }>;
      const items = properList(value);
      if (!items || !items.every(isNumber) || items.length < 4 || items.length % 2 !== 0)
        throw new LispError(
          `vla-put-Coordinates: se esperaba una lista PLANA de coordenadas con un número par de ` +
            `elementos y al menos dos vértices, como '(0 0 10 0 10 10). Llegó ` +
            `${printLisp(value)}.`,
        );
      const numbers = items.map((item) => (item as { v: number }).v);
      const entries: LispValue[] = [];
      const expected: LispValue[] = [];
      for (let index = 0; index * 2 < numbers.length; index += 1) {
        const x = numbers[index * 2];
        const y = numbers[index * 2 + 1];
        entries.push(dxfPoint(10, { x, y }));
        // El bulge del vértice N se CONSERVA cuando el número de vértices no
        // cambia: mover los puntos de una polilínea con tramos curvos no debe
        // enderezarlos en silencio. Si la rutina cambia el número de vértices,
        // los bulges dejan de tener a qué tramo pertenecer y no se reponen.
        const bulge =
          numbers.length === polyline.vertices.length * 2
            ? polyline.vertices[index].bulge
            : undefined;
        if (bulge) entries.push(dxfReal(42, bulge));
        expected.push(real(x), real(y));
      }
      return { commands: patchCommand(entity, dxfList(entries)), expect: list(expected) };
    },
  },
  {
    name: "Area",
    types: ["polyline", "circle", "arc", "ellipse", "spline", "hatch", "solid", "region"],
    read: (entity, host) => {
      const measured = cadEntityArea(entity, CAD_ENTITY_REGISTRY, host.document());
      if (!measured)
        throw new LispError(
          `vla-get-Area: ${expectedTypeName(entity)} no encierra un área medible en este dibujo.`,
        );
      return real(measured.area);
    },
    readOnlyReason:
      "el área es el RESULTADO de la geometría, no un dato que se guarde: escribirla obligaría " +
      "a decidir qué vértice mover para que cuadre. Se cambia moviendo la geometría " +
      "(vla-put-Coordinates, vla-put-Radius) o con los comandos de edición.",
  },
  {
    name: "Length",
    types: ["line", "polyline", "arc", "circle", "ellipse", "spline"],
    read: (entity, host) => real(curveLength(entity, host, "vla-get-Length")),
    readOnlyReason:
      "la longitud es el resultado de la geometría. Un tramo se alarga con vla-put-EndPoint o " +
      "con (command \"ALARGA\" …).",
  },
];

type ArcEntity = Extract<CadNativeEntity, { type: "arc" }>;

/** Punto del arco a un ángulo dado, en GRADOS: los códigos 50/51 son grados. */
function arcPoint(entity: ArcEntity, degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: entity.center.x + entity.radius * Math.cos(radians),
    y: entity.center.y + entity.radius * Math.sin(radians),
  };
}

export const PROPERTY_BY_NAME = new Map<string, VlaProperty>(
  VLA_PROPERTIES.map((property) => [property.name.toUpperCase(), property]),
);

/** ¿Tiene esta entidad esta propiedad? `null` en `types` significa que sí. */
export function propertyApplies(property: VlaProperty, entity: CadNativeEntity): boolean {
  return property.types === null || property.types.includes(entity.type);
}

export function propertyWritable(property: VlaProperty, entity: CadNativeEntity): boolean {
  if (!property.write) return false;
  if (property.writableTypes == null) return true;
  return property.writableTypes.includes(entity.type);
}

/**
 * El nombre de la propiedad tal como lo escribió la rutina. `vlax-get` acepta
 * la cadena `"Layer"` y el símbolo `'Layer`, y las dos formas están en el
 * código publicado; el símbolo llega ya en mayúsculas porque los símbolos se
 * internan así, y por eso la tabla se indexa en mayúsculas.
 */
export function propertyNameOf(value: LispValue, caller: string): string {
  if (value.t === "str") return value.v;
  if (value.t === "sym") return value.name;
  throw new LispError(
    `bad argument type: ${caller}: el nombre de la propiedad es una cadena o un símbolo, y ` +
      `llegó ${printLisp(value)}.`,
  );
}

export function findProperty(name: string, caller: string): VlaProperty {
  const property = PROPERTY_BY_NAME.get(name.toUpperCase());
  if (!property)
    throw new LispError(
      `${caller}: este puente no sabe responder la propiedad "${name}". Las que sí: ` +
        `${VLA_PROPERTIES.map((item) => item.name).join(", ")}. El resto de la entidad se lee ` +
        `con (entget e), que devuelve TODOS sus códigos DXF.`,
    );
  return property;
}

export function readProperty(
  host: LispHostServices,
  entity: CadNativeEntity,
  property: VlaProperty,
  caller: string,
): LispValue {
  if (!propertyApplies(property, entity))
    throw new LispError(
      `${caller}: un ${expectedTypeName(entity)} no tiene la propiedad ${property.name}.`,
    );
  return property.read(entity, host);
}

/**
 * Escribe una propiedad: comando canónico por `host.apply`, y RELECTURA para
 * comprobar que quedó escrita. Devuelve nil, como `vlax-put-property`.
 */
export function writeProperty(
  host: LispHostServices,
  entity: CadNativeEntity,
  property: VlaProperty,
  value: LispValue,
  caller: string,
): LispValue {
  if (!propertyApplies(property, entity))
    throw new LispError(
      `${caller}: un ${expectedTypeName(entity)} no tiene la propiedad ${property.name}.`,
    );
  if (!propertyWritable(property, entity) || !property.write)
    throw new LispError(
      `${caller}: ${property.name} es de sólo lectura en un ${expectedTypeName(entity)}: ` +
        `${property.readOnlyReason ?? "esta versión no la escribe."}`,
    );
  const { commands, expect } = property.write(entity, value, host);
  host.apply(commands, `LISP vla-put-${property.name}`);
  const after = host.entity(entity.id);
  if (!after || !CAD_ENTITY_REGISTRY.supports(after))
    throw new LispError(`${caller}: la entidad ${entity.id} desapareció al escribir.`);
  const written = property.read(after, host);
  // La comprobación que impide el «éxito sin efecto». La tolerancia es la del
  // redondeo de un doble, no un margen de diseño: lo escrito y lo leído son el
  // mismo número, o la escritura no llegó.
  if (!equal(written, expect, 1e-9))
    throw new LispError(
      `${caller}: la escritura de ${property.name} no llegó al documento (se pidió ` +
        `${printLisp(expect)} y quedó ${printLisp(written)}). Es un defecto de este puente, ` +
        `no de la rutina.`,
    );
  return NIL;
}
