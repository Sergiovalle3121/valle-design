/**
 * El puente Visual LISP: `vlax-*`, `vla-get-*`/`vla-put-*` y `vlax-curve-*`.
 *
 * ## Qué es esto y qué NO es
 *
 * La mitad moderna de AutoLISP habla con AutoCAD por ActiveX: se pide el objeto
 * de la aplicación, se navega hasta el documento y se leen y escriben
 * PROPIEDADES de objetos COM. Aquí no hay ActiveX, no hay Windows y no hay un
 * ejecutable de AutoCAD al otro lado; hay un documento canónico en el
 * navegador.
 *
 * Lo que sí se puede sostener —y es lo que hace este módulo— es la mitad que
 * habla de ENTIDADES DEL DIBUJO. `(vla-get-Layer obj)` es una pregunta sobre el
 * documento y tiene respuesta exacta; `(vla-put-Layer obj "MUROS")` es una
 * mutación y sale por donde salen todas: `host.apply` con un `CadEntityCommand`.
 * No hay una segunda puerta de escritura, y por eso una rutina Visual LISP no
 * puede saltarse el historial ni el CAS: hereda la disciplina por construcción.
 *
 * Lo que NO tiene respuesta —el objeto de aplicación, `vlax-create-object`,
 * `vlax-invoke` sobre él y los reactores `vlr-*`— se declara fuera de alcance
 * con su motivo en `unavailable.ts`, que es donde vive la lista completa de lo
 * que este producto no hace del lenguaje.
 *
 * ## El objeto no cachea nada
 *
 * `LispVlaObject` lleva dentro el handle de la entidad y nada más (véase
 * `values.ts`). Cada `vla-get-*` va al documento del anfitrión en ese momento.
 * La alternativa —copiar las propiedades al crear el objeto— habría producido
 * la avería clásica del puente COM: la rutina cambia la capa con `command` y el
 * objeto que tenía en una variable sigue contestando la capa vieja.
 *
 * ## La escritura se COMPRUEBA
 *
 * Cada propiedad escribible declara, además del comando que produce, QUÉ tiene
 * que devolver la lectura después. Se aplica, se relee y se compara. No es
 * paranoia: el traductor DXF ignora en silencio los códigos que un tipo de
 * entidad no sabe atender, así que sin esta comprobación un
 * `vla-put-TextString` sobre una entidad no prevista devolvería el valor
 * escrito y no habría cambiado nada — el «éxito sin efecto» que la casa
 * prohíbe. Con ella, el día que alguien añada una propiedad a un tipo que el
 * traductor no atiende, la rutina se entera en el acto y con el nombre de la
 * propiedad.
 *
 * ## Los números son los del producto
 *
 * `vlax-curve-*` y las propiedades Area y Length no calculan geometría propia:
 * los contornos salen de `cadEntityContours` —el registro de adaptadores, el
 * MISMO que alimenta AREA, MASSPROP y REGION, y que ya sabe teselar el bulge de
 * una polilínea, una elipse recortada y una NURBS— y el área de
 * `cadEntityArea`, que toma la forma cerrada donde la hay (πr² para un círculo)
 * en vez del polígono de 192 lados. El punto a una distancia sale de
 * `pointAtDistance`, la misma función con la que DIVIDE y MEASURE reparten sus
 * marcas. Con geometría propia aquí, `(vlax-curve-getPointAtDist e 5.0)`
 * habría caído un pelo al lado de donde DIVIDE pone el poste, y nadie sabría
 * cuál de los dos manda.
 *
 * Se prefirió `inquiry/contours` a `geom-measure` justamente por eso: el
 * `polygonArea` de `geom-measure` mide el polígono teselado, y sobre un círculo
 * se queda un 0,014 % corto respecto del número que el comando AREA le enseña
 * al usuario en la misma pantalla.
 */
import { pointAtDistance } from "../../cad/divide-measure";
import { CAD_ENTITY_REGISTRY } from "../../cad/entity-runtime";
import { cadEntityArea } from "../../cad/inquiry/contours";
import { layerIdFromEname } from "../dxf/layer-record";
import { LispError } from "../errors";
import { printLisp } from "../printer";
import {
  NIL,
  T,
  bool,
  ename,
  isNumber,
  pointValue,
  properList,
  real,
  vlaObject,
  type LispCallContext,
  type LispValue,
} from "../values";
import { defsubr, type BuiltinTable } from "./define";
import { requireHost } from "./entities";
import {
  VLA_PROPERTIES,
  PROPERTY_BY_NAME,
  findProperty,
  idOfCurve,
  idOfObject,
  liveNativeEntity,
  modelPoint,
  propertyApplies,
  propertyNameOf,
  propertyWritable,
  readProperty,
  wantPoint,
  writeProperty,
} from "./vlax-properties";

import {
  closestOnCurve,
  curveContour,
  expectedTypeName,
  measuredPoints,
  polylineLength,
} from "./vlax-curves";

// ---------------------------------------------------------------------------
// La instalación
// ---------------------------------------------------------------------------

/** Cobro de una lectura que tesela: no es gratis y el presupuesto lo nota. */
function chargeCurve(ctx: LispCallContext, points: readonly unknown[]): void {
  ctx.charge(points.length + 8);
}

export function installVlax(table: BuiltinTable): void {
  // --- ida y vuelta entre los dos mundos ---------------------------------

  /**
   * `(vlax-ename->vla-object e)`. NO comprueba que la entidad exista, igual que
   * AutoCAD: envolver un nombre es barato y quien quiera saber si sigue viva
   * tiene `vlax-erased-p`. Sí rechaza el registro de la tabla de capas, que no
   * es una entidad del dibujo.
   */
  defsubr(table, "vlax-ename->vla-object", 1, 1, (args, ctx) => {
    // Sin dibujo no hay entidad que envolver, y decirlo aquí es mejor que
    // decirlo tres líneas más abajo, donde el autor ya no sabe qué lo produjo.
    requireHost(ctx, "vlax-ename->vla-object");
    if (args[0].t !== "ename")
      throw new LispError(
        `bad argument type: vlax-ename->vla-object: se esperaba un nombre de entidad y llegó ` +
          `${printLisp(args[0])}.`,
      );
    const id = args[0].id;
    if (layerIdFromEname(id) !== null)
      throw new LispError(
        `vlax-ename->vla-object: un registro de la tabla de capas no es un objeto del dibujo. ` +
          `Las capas se leen con (tblsearch "LAYER" …).`,
      );
    return vlaObject(id);
  });

  /** El camino de vuelta. Cierra el viaje de ida sin perder identidad. */
  defsubr(table, "vlax-vla-object->ename", 1, 1, (args) =>
    ename(idOfObject(args[0], "vlax-vla-object->ename")));

  defsubr(table, "vlax-object-p", 1, 1, (args) => bool(args[0].t === "vla-object"));

  /**
   * `vlax-erased-p` es la razón por la que aquí no hay punteros colgantes: el
   * objeto sigue siendo válido cuando la entidad ya no está, y preguntarlo
   * contesta T en vez de reventar.
   */
  defsubr(table, "vlax-erased-p", 1, 1, (args, ctx) => {
    const host = requireHost(ctx, "vlax-erased-p");
    const id = idOfCurve(args[0], "vlax-erased-p");
    return bool(host.entity(id) === undefined);
  });

  /**
   * `vlax-release-object` es un no-op HONESTO y no una promesa: no hay puntero
   * COM que soltar porque el objeto no es más que el handle de la entidad. Está
   * porque las rutinas la llaman en su bloque de limpieza y que faltara sería un
   * «no function definition» justo cuando la rutina va a terminar bien.
   */
  defsubr(table, "vlax-release-object", 1, 1, () => NIL);

  // --- variantes que aquí no lo son --------------------------------------

  /**
   * En AutoCAD, una propiedad de tipo punto viaja como VARIANTE que envuelve un
   * SAFEARRAY, y por eso las rutinas escriben
   * `(vlax-safearray->list (vlax-variant-value (vlax-get-property o 'StartPoint)))`.
   * Aquí el valor ya es el valor: un punto es la lista de tres reales que usa
   * todo el resto del lenguaje. Estas dos funciones son, por tanto, la
   * IDENTIDAD, y estarlo hace que esa línea de la rutina corra sin tocarla.
   *
   * No es un adorno: sin ellas, media biblioteca publicada moriría en la línea
   * siguiente a la que sí funciona, que es la peor forma de fallar.
   */
  defsubr(table, "vlax-variant-value", 1, 1, (args) => args[0]);

  defsubr(table, "vlax-safearray->list", 1, 1, (args) => {
    if (properList(args[0]) === null)
      throw new LispError(
        `bad argument type: vlax-safearray->list: se esperaba una lista y llegó ` +
          `${printLisp(args[0])}. En este producto una propiedad de varios valores ya llega ` +
          `como lista, así que esta función es la identidad.`,
      );
    return args[0];
  });

  /**
   * `(vlax-3d-point x y z)` o `(vlax-3d-point punto)`: lo que las rutinas
   * escriben para pasar un punto a `vla-put-*`. Devuelve la lista de tres
   * reales, que es lo que este puente espera.
   */
  defsubr(table, "vlax-3d-point", 1, 3, (args) => {
    if (args.length === 1) {
      const point = wantPoint(args[0], "vlax-3d-point");
      return pointValue(point);
    }
    const numbers = args.map((arg) => {
      if (!isNumber(arg))
        throw new LispError(`bad argument type: vlax-3d-point: se esperaban números`);
      return arg.v;
    });
    return pointValue({ x: numbers[0], y: numbers[1], z: numbers[2] ?? 0 });
  });

  // --- propiedades por nombre --------------------------------------------

  const getProperty = (args: LispValue[], ctx: LispCallContext, caller: string): LispValue => {
    const host = requireHost(ctx, caller);
    const entity = liveNativeEntity(host, idOfObject(args[0], caller), caller);
    const property = findProperty(propertyNameOf(args[1], caller), caller);
    ctx.charge(4);
    return readProperty(host, entity, property, caller);
  };

  const putProperty = (args: LispValue[], ctx: LispCallContext, caller: string): LispValue => {
    const host = requireHost(ctx, caller);
    const entity = liveNativeEntity(host, idOfObject(args[0], caller), caller);
    const property = findProperty(propertyNameOf(args[1], caller), caller);
    ctx.charge(8);
    return writeProperty(host, entity, property, args[2], caller);
  };

  defsubr(table, "vlax-get-property", 2, 2, (args, ctx) =>
    getProperty(args, ctx, "vlax-get-property"));
  defsubr(table, "vlax-put-property", 3, 3, (args, ctx) =>
    putProperty(args, ctx, "vlax-put-property"));
  // `vlax-get`/`vlax-put` son la forma corta, y en AutoCAD moderno además la
  // que devuelve LISTAS en vez de safearrays. Aquí las dos hacen lo mismo
  // porque aquí no hay safearrays; que sean la misma implementación es lo que
  // impide que una de las dos se quede atrás.
  defsubr(table, "vlax-get", 2, 2, (args, ctx) => getProperty(args, ctx, "vlax-get"));
  defsubr(table, "vlax-put", 3, 3, (args, ctx) => putProperty(args, ctx, "vlax-put"));

  /**
   * `(vlax-property-available-p obj "Radius" [T])` — con el tercer argumento,
   * si además se puede ESCRIBIR. Es la comprobación con la que una rutina
   * recorre una selección heterogénea sin reventar en el primer objeto que no
   * es un círculo.
   */
  defsubr(table, "vlax-property-available-p", 2, 3, (args, ctx) => {
    const host = requireHost(ctx, "vlax-property-available-p");
    const entity = liveNativeEntity(
      host,
      idOfObject(args[0], "vlax-property-available-p"),
      "vlax-property-available-p",
    );
    const property = PROPERTY_BY_NAME.get(
      propertyNameOf(args[1], "vlax-property-available-p").toUpperCase(),
    );
    if (!property || !propertyApplies(property, entity)) return NIL;
    const forWriting = args.length > 2 && args[2].t !== "nil";
    return bool(!forWriting || propertyWritable(property, entity));
  });

  // --- los pares vla-get-<Prop> / vla-put-<Prop> --------------------------

  /**
   * Se GENERAN de la misma tabla. Escribirlos a mano habría multiplicado por
   * treinta las oportunidades de que `vla-get-Layer` y `(vlax-get obj 'Layer)`
   * acabaran contestando cosas distintas.
   */
  for (const property of VLA_PROPERTIES) {
    const getter = `vla-get-${property.name}`;
    defsubr(table, getter, 1, 1, (args, ctx) => {
      const host = requireHost(ctx, getter);
      const entity = liveNativeEntity(host, idOfObject(args[0], getter), getter);
      ctx.charge(4);
      return readProperty(host, entity, property, getter);
    });

    const setter = `vla-put-${property.name}`;
    defsubr(table, setter, 2, 2, (args, ctx) => {
      const host = requireHost(ctx, setter);
      const entity = liveNativeEntity(host, idOfObject(args[0], setter), setter);
      ctx.charge(8);
      return writeProperty(host, entity, property, args[1], setter);
    });
  }

  // --- la familia vlax-curve-* -------------------------------------------

  const curveOf = (value: LispValue, ctx: LispCallContext, caller: string) => {
    const host = requireHost(ctx, caller);
    const entity = liveNativeEntity(host, idOfCurve(value, caller), caller);
    const contour = curveContour(entity, host, caller);
    const points = measuredPoints(contour);
    chargeCurve(ctx, points);
    return { host, entity, contour, points };
  };

  defsubr(table, "vlax-curve-getStartPoint", 1, 1, (args, ctx) => {
    const { points } = curveOf(args[0], ctx, "vlax-curve-getStartPoint");
    return modelPoint(points[0]);
  });

  defsubr(table, "vlax-curve-getEndPoint", 1, 1, (args, ctx) => {
    const { points } = curveOf(args[0], ctx, "vlax-curve-getEndPoint");
    return modelPoint(points[points.length - 1]);
  });

  /**
   * `(vlax-curve-getPointAtDist curva d)` → el punto a esa distancia recorrida
   * desde el arranque, o nil si la distancia se sale de la curva.
   *
   * Devolver nil fuera de rango es lo que hace AutoCAD y lo que distingue esta
   * función de `pointAtDistance`, que RECORTA a los extremos porque a DIVIDE le
   * conviene. Recortar aquí en silencio dejaría a la rutina colocando la marca
   * en el extremo y creyendo que la puso donde pidió.
   */
  defsubr(table, "vlax-curve-getPointAtDist", 2, 2, (args, ctx) => {
    const caller = "vlax-curve-getPointAtDist";
    const { points } = curveOf(args[0], ctx, caller);
    if (!isNumber(args[1]))
      throw new LispError(`bad argument type: ${caller}: la distancia es un número`);
    const distance = args[1].v;
    const total = polylineLength(points);
    if (distance < -1e-9 || distance > total + 1e-9) return NIL;
    return modelPoint(pointAtDistance(points, distance).point);
  });

  /**
   * El inverso: la distancia recorrida hasta un punto DE LA CURVA. Un punto que
   * no cae sobre ella devuelve nil, como el original — y ésa es la
   * comprobación con la que una rutina descarta los puntos que no le sirven.
   */
  defsubr(table, "vlax-curve-getDistAtPoint", 2, 2, (args, ctx) => {
    const caller = "vlax-curve-getDistAtPoint";
    const { points } = curveOf(args[0], ctx, caller);
    const target = wantPoint(args[1], caller);
    const closest = closestOnCurve(points, target);
    const offset = Math.hypot(closest.point.x - target.x, closest.point.y - target.y);
    /**
     * La tolerancia NO es 1e-9. Una curva llega aquí teselada en 192 lados, y
     * un punto que está exactamente sobre el arco cae hasta un cuarto de
     * milésima fuera de la cuerda que lo aproxima. Con tolerancia de doble,
     * `(vlax-curve-getDistAtPoint arco (vlax-curve-getStartPoint arco))`
     * contestaría nil sobre su propio punto de arranque. Se mide en relación al
     * tamaño de la curva, que es lo que hace que la regla valga igual en un
     * plano en milímetros y en uno de topografía.
     */
    const tolerance = Math.max(1e-9, polylineLength(points) * 1e-4);
    if (offset > tolerance) return NIL;
    return real(closest.distanceAlong);
  });

  /**
   * `(vlax-curve-getClosestPointTo curva punto)`. El tercer argumento de
   * AutoCAD —extender la curva más allá de sus extremos— no se admite: aquí la
   * curva es su teselación, y prolongar una NURBS teselada daría un punto que
   * no está sobre la curva verdadera. Se dice en vez de aproximarlo.
   */
  defsubr(table, "vlax-curve-getClosestPointTo", 2, 3, (args, ctx) => {
    const caller = "vlax-curve-getClosestPointTo";
    const { points } = curveOf(args[0], ctx, caller);
    const target = wantPoint(args[1], caller);
    if (args.length > 2 && args[2].t !== "nil")
      throw new LispError(
        `${caller}: la extensión de la curva más allá de sus extremos no está disponible. La ` +
          `curva se mide sobre su teselación, y prolongarla devolvería un punto que no está ` +
          `sobre la curva real. Sin ese argumento, el punto más cercano DE la curva sí es exacto.`,
      );
    return modelPoint(closestOnCurve(points, target).point);
  });

  /**
   * El área que encierra la curva. La misma que enseña el comando AREA, con su
   * misma regla: una curva ABIERTA se cierra por la cuerda para poder medirla,
   * que es lo que hace AutoCAD y por lo que el área de un arco es la del
   * segmento circular y no la del sector.
   */
  defsubr(table, "vlax-curve-getArea", 1, 1, (args, ctx) => {
    const caller = "vlax-curve-getArea";
    const host = requireHost(ctx, caller);
    const entity = liveNativeEntity(host, idOfCurve(args[0], caller), caller);
    curveContour(entity, host, caller);
    ctx.charge(24);
    const measured = cadEntityArea(entity, CAD_ENTITY_REGISTRY, host.document());
    if (!measured)
      throw new LispError(
        `${caller}: un ${expectedTypeName(entity)} no encierra un área medible en este dibujo.`,
      );
    return real(measured.area);
  });

  defsubr(table, "vlax-curve-isClosed", 1, 1, (args, ctx) => {
    const caller = "vlax-curve-isClosed";
    const host = requireHost(ctx, caller);
    const entity = liveNativeEntity(host, idOfCurve(args[0], caller), caller);
    const contour = curveContour(entity, host, caller);
    // Círculo y elipse completa son cerrados POR NATURALEZA aunque su contorno
    // llegue como cadena abierta de puntos; la polilínea lo dice ella misma.
    if (entity.type === "circle") return T;
    return bool(contour.closed);
  });

}


