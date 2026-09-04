/**
 * Dirección CANÓNICO → DWG, extraída de `canonical.ts` cuando el intake del
 * ensamblado R2010+ (2026-08-31) empujó ese archivo por encima del presupuesto
 * de monolito. Es una unidad con sentido propio: la traducción de vuelta, con
 * sus pérdidas simétricas a las de la ida.
 */
import type { DwgAttribEntity, DwgPoint3 } from "../model/entity-geometry.js";
import type {
  CanonicalCadDocumentJson,
  CanonicalLossEntry,
  CanonicalToDwgEntity,
  CanonicalToDwgResult,
} from "./canonical.js";
import {
  ANCLAJES_MEDIDOS,
  ANCLAJE_POR_ALINEACION,
  ANCLAJE_POR_DEFECTO,
} from "./canonical-mtext-anchor.js";

/**
 * Proyecta un documento canónico al modelo neutral ESCRIBIBLE del writer
 * (line, point, circle, arc, lwpolyline, text, insert, ellipse y el HATCH de
 * relleno sólido). Lo no escribible se declara en el manifiesto — el writer
 * jamás emite a medias.
 */
/**
 * Las clases cuyo bloqueo NO está en el writer sino en el documento canónico:
 * el formato pide campos que el canónico no transporta, así que escribirlas
 * exigiría inventárselos. Se separan del «aún no implementado» porque son dos
 * problemas distintos con dos soluciones distintas — y porque decir que el
 * writer no sabe hacer algo que sí sabe es, sencillamente, falso.
 */
const BLOQUEADAS_POR_EL_CANONICO: Readonly<Record<string, string>> = Object.freeze({
  dimension:
    'El documento canónico de una cota lleva sus puntos y su texto, pero no el VALOR MEDIDO que la cota muestra ni el resto del cuerpo que el formato pide, y colapsa las dos formas de cota angular (por tres puntos y por dos líneas) en una sola, que tienen cuerpos distintos: no hay forma de saber cuál escribir. Escribirla exigiría inventar el número y elegir una forma al azar.',
  leader:
    'El documento canónico no modela la directriz (LEADER) en absoluto: no hay nada que proyectar al writer. El decodificador sí la lee, así que la pérdida es de la ida al canónico, no de la lectura del archivo.',
});


/**
 * La definición de trama que la entidad canónica trae, o `undefined` si no
 * trae una utilizable.
 *
 * POR QUÉ SE VALIDA AQUÍ Y NO SE CONFÍA. `CanonicalCadDocumentJson.entities`
 * es `Record<string, unknown>`: cualquiera puede poner cualquier cosa en
 * `patternDefinition`. Una línea a medias no daría un patrón feo — daría un
 * recuento que no cuadra con lo que sigue, y el cuerpo entero se
 * desincroniza. Se acepta la forma COMPLETA o ninguna.
 *
 * Los ángulos vienen en RADIANES, como todos los del canónico. Es lo que el
 * archivo lleva: el ANSI31 de los dos sombreados con trama del corpus
 * admitido guarda 0.7853981633974483 en la línea de definición, y el DXF del
 * oráculo del mismo bundle escribe 53 = 45.0 para esa misma línea.
 */
function canonicalHatchPattern(value: unknown):
  | {
      angle: number;
      scale: number;
      double: boolean;
      lines: readonly {
        angle: number;
        basePoint: { x: number; y: number };
        offset: { x: number; y: number };
        dashes: readonly number[];
      }[];
    }
  | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const source = value as {
    angle?: unknown;
    scale?: unknown;
    double?: unknown;
    lines?: unknown;
  };
  if (
    !Number.isFinite(source.angle) ||
    !Number.isFinite(source.scale) ||
    typeof source.double !== "boolean" ||
    !Array.isArray(source.lines) ||
    source.lines.length === 0
  ) {
    return undefined;
  }
  const lines = [];
  for (const raw of source.lines as unknown[]) {
    const line = raw as {
      angle?: unknown;
      basePoint?: { x?: unknown; y?: unknown };
      offset?: { x?: unknown; y?: unknown };
      dashes?: unknown;
    };
    const point = (candidate: { x?: unknown; y?: unknown } | undefined) =>
      candidate !== undefined &&
      Number.isFinite(candidate.x) &&
      Number.isFinite(candidate.y)
        ? Object.freeze({ x: Number(candidate.x), y: Number(candidate.y) })
        : undefined;
    const basePoint = point(line.basePoint);
    const offset = point(line.offset);
    const dashes = Array.isArray(line.dashes) ? (line.dashes as unknown[]) : [];
    if (
      !Number.isFinite(line.angle) ||
      basePoint === undefined ||
      offset === undefined ||
      dashes.some((dash) => !Number.isFinite(dash))
    ) {
      return undefined;
    }
    lines.push(
      Object.freeze({
        angle: Number(line.angle),
        basePoint,
        offset,
        dashes: Object.freeze(dashes.map((dash) => Number(dash))),
      }),
    );
  }
  return {
    angle: Number(source.angle),
    scale: Number(source.scale),
    double: source.double,
    lines: Object.freeze(lines),
  };
}

/**
 * Los ATTRIB de un INSERT a partir de `positionedAttributes` del canónico.
 *
 * POR QUÉ SE VALIDA Y NO SE CONFÍA, igual que la trama del HATCH: la entidad
 * canónica es `Record<string, unknown>`, y un atributo a medias no daría un
 * rótulo feo — daría un ATTRIB con un campo ausente y el cuerpo del archivo
 * desincronizado desde ese bit. Se acepta el atributo COMPLETO o ninguno; el
 * que no cumple se salta y quien llama declara la diferencia de recuento.
 *
 * LO QUE NO VIAJA Y POR QUÉ. Las banderas del atributo se escriben a 0 y la
 * longitud de campo también: el hecho registrado da su DISPOSICIÓN (RC y BS
 * en esa posición) pero no su semántica, y los cinco ATTRIB del corpus
 * admitido las traen a cero, así que no hay nada medido que permita traducir
 * «invisible» a un número. Escribir un 1 «porque suele ser invisible» sería
 * inventar una semántica, que es justo lo que este laboratorio no hace.
 */
function canonicalPositionedAttributes(value: unknown): readonly DwgAttribEntity[] {
  if (!Array.isArray(value)) return [];
  const attributes: DwgAttribEntity[] = [];
  for (const raw of value as unknown[]) {
    const source = raw as {
      tag?: unknown;
      value?: unknown;
      insertion?: { x?: unknown; y?: unknown; z?: unknown };
      height?: unknown;
      rotation?: unknown;
    };
    const tag = typeof source.tag === "string" ? source.tag : "";
    const insertion = source.insertion;
    if (
      tag.length === 0 ||
      insertion === undefined ||
      !Number.isFinite(insertion.x) ||
      !Number.isFinite(insertion.y)
    ) {
      continue;
    }
    const height = Number(source.height ?? 0);
    const rotation = Number(source.rotation ?? 0);
    if (!(height > 0) || !Number.isFinite(rotation)) continue;
    const bytes = (text: string): readonly number[] =>
      Object.freeze([...text].map((c) => c.charCodeAt(0) & 0xff));
    attributes.push(
      Object.freeze({
        kind: "attrib" as const,
        insertion: Object.freeze({ x: Number(insertion.x), y: Number(insertion.y) }),
        elevation: undefined,
        alignment: undefined,
        thickness: 0,
        extrusion: Object.freeze({ x: 0, y: 0, z: 1 }),
        obliqueAngle: undefined,
        rotation: rotation === 0 ? undefined : rotation,
        height,
        widthFactor: undefined,
        valueBytes: bytes(
          typeof source.value === "string" ? source.value : String(source.value ?? ""),
        ),
        generation: undefined,
        horizontalAlignment: undefined,
        verticalAlignment: undefined,
        tagBytes: bytes(tag),
        fieldLength: 0,
        attributeFlags: 0,
      }),
    );
  }
  return Object.freeze(attributes);
}

export function canonicalDocumentToDwgEntities(
  document: CanonicalCadDocumentJson,
): CanonicalToDwgResult {
  const losses: CanonicalLossEntry[] = [];
  const entities: CanonicalToDwgEntity[] = [];
  const canonicalPoint = (value: unknown): DwgPoint3 => {
    const p = value as { x?: number; y?: number; z?: number };
    return Object.freeze({ x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 });
  };
  const defaultExtrusion = Object.freeze({ x: 0, y: 0, z: 1 });

  for (const raw of document.entities) {
    const type = raw["type"] as string;
    const id = String(raw["id"] ?? "");
    const layerName = String(raw["layer"] ?? "0");
    switch (type) {
      case "line":
        entities.push({
          canonicalId: id,
          layerName,
          entity: Object.freeze({
            kind: "line" as const,
            start: canonicalPoint(raw["start"]),
            end: canonicalPoint(raw["end"]),
            thickness: 0,
            extrusion: defaultExtrusion,
          }),
        });
        break;
      case "circle":
        entities.push({
          canonicalId: id,
          layerName,
          entity: Object.freeze({
            kind: "circle" as const,
            center: canonicalPoint(raw["center"]),
            radius: Number(raw["radius"] ?? 0),
            thickness: 0,
            extrusion: defaultExtrusion,
          }),
        });
        break;
      case "arc":
        entities.push({
          canonicalId: id,
          layerName,
          entity: Object.freeze({
            kind: "arc" as const,
            center: canonicalPoint(raw["center"]),
            radius: Number(raw["radius"] ?? 0),
            thickness: 0,
            extrusion: defaultExtrusion,
            startAngle: Number(raw["startAngle"] ?? 0),
            endAngle: Number(raw["endAngle"] ?? 0),
          }),
        });
        break;
      // El `CadPointEntity` real del producto (apps/web/src/lib/cad/
      // cad-entities-v4.ts) guarda la posición en el mismo campo "position"
      // que ya usa el espejo DWG→canónico (línea ~361 de este archivo); no
      // lleva `xAxisAngle` (ese campo es propio del formato, sin equivalente
      // de producto todavía), así que por defecto es 0 — igual que `style`/
      // `size` del punto de producto no tienen equivalente aquí y se pierden
      // en esta dirección, simétrico a como ya se pierden thickness/extrusion/
      // xAxisAngle al proyectar DWG→canónico.
      case "point":
        entities.push({
          canonicalId: id,
          layerName,
          entity: Object.freeze({
            kind: "point" as const,
            position: canonicalPoint(raw["position"]),
            thickness: 0,
            extrusion: defaultExtrusion,
            xAxisAngle: Number(raw["xAxisAngle"] ?? 0),
          }),
        });
        break;
      case "polyline": {
        const vertices =
          (raw["vertices"] as { x: number; y: number; bulge?: number }[]) ?? [];
        const bulges = vertices.map((v) => v.bulge ?? 0);
        const anyBulge = bulges.some((b) => b !== 0);
        entities.push({
          canonicalId: id,
          layerName,
          entity: Object.freeze({
            kind: "lwpolyline" as const,
            closed: Boolean(raw["closed"]),
            vertices: Object.freeze(
              vertices.map((v) => Object.freeze({ x: v.x, y: v.y })),
            ),
            bulges: anyBulge ? Object.freeze(bulges) : undefined,
            widths: undefined,
            constantWidth: undefined,
            elevation: undefined,
            thickness: undefined,
            extrusion: undefined,
          }),
        });
        break;
      }
      case "text":
        entities.push({
          canonicalId: id,
          layerName,
          entity: Object.freeze({
            kind: "text" as const,
            insertion: Object.freeze({
              x: Number(raw["x"] ?? 0),
              y: Number(raw["y"] ?? 0),
            }),
            elevation: undefined,
            alignment: undefined,
            thickness: 0,
            extrusion: defaultExtrusion,
            obliqueAngle: undefined,
            rotation:
              raw["rotation"] === undefined
                ? undefined
                : Number(raw["rotation"]),
            height: Number(raw["height"] ?? 1),
            widthFactor: undefined,
            valueBytes: Object.freeze(
              [...String(raw["text"] ?? "")].map((c) => c.charCodeAt(0) & 0xff),
            ),
            generation: undefined,
            horizontalAlignment: undefined,
            verticalAlignment: undefined,
          }),
        });
        break;
      case "mtext": {
        // El anclaje sale de la alineación que el editor YA modela y que el
        // documento canónico YA transporta; sólo faltaba traducirla, y para
        // traducirla había que medir qué significa cada número. Ausente, se
        // escribe el anclaje 1 —arriba-izquierda, el mismo defecto del
        // editor— y se declara.
        const alineacion = raw["alignment"];
        const anclaje =
          typeof alineacion === "string" && alineacion in ANCLAJE_POR_ALINEACION
            ? (ANCLAJE_POR_ALINEACION[alineacion] as number)
            : ANCLAJE_POR_DEFECTO;
        if (!ANCLAJES_MEDIDOS.has(anclaje)) {
          losses.push({
            code: "mtext-attachment-unmeasured",
            entityId: id,
            sourceType: "mtext",
            detail: `La alineación "${String(alineacion)}" se escribe como anclaje ${anclaje}. La correspondencia entre alineación y anclaje está MEDIDA contra el oráculo DXF sólo en los anclajes 1 y 5, que son los que ejerce el corpus admitido; para este valor la identidad es la única hipótesis que sobrevive, pero no hay medición que la respalde.`,
            severity: "warning",
          });
        }
        // Lo que el cuerpo DWG pide y NO es dato del origen sino decisión de
        // autoría. Los extents son la caja calculada del texto ya compuesto:
        // este writer no compone texto, así que los escribe a cero —valor que
        // el propio corpus atestigua en archivos de un productor real— y lo
        // dice, en vez de fabricar una medida que no midió.
        losses.push({
          code: "mtext-authoring-defaults",
          entityId: id,
          sourceType: "mtext",
          detail:
            "El documento canónico no transporta la caja calculada del texto (extents) ni el estilo de interlineado: se escriben extents a cero y estilo 1, los valores que el corpus admitido observa en archivos reales. La dirección de dibujo se escribe 1, constante en las cinco parejas medidas.",
          severity: "info",
        });
        const rotacion = Number(raw["rotation"] ?? 0);
        const factor = Number(raw["lineSpacing"] ?? 1);
        entities.push({
          canonicalId: id,
          layerName,
          entity: Object.freeze({
            kind: "mtext" as const,
            insertion: canonicalPoint(raw["insertion"]),
            extrusion: defaultExtrusion,
            // El eje X es el INVERSO EXACTO de la proyección de ida, que
            // obtiene la rotación con `atan2` sobre este mismo vector. No es
            // una convención elegida aquí: es la vuelta de la que ya existe.
            xAxisDirection: Object.freeze({
              x: Math.cos(rotacion),
              y: Math.sin(rotacion),
              z: 0,
            }),
            rectWidth: Number(raw["width"] ?? 0),
            height: Number(raw["height"] ?? 1),
            attachment: anclaje,
            drawingDirection: 1,
            extentsHeight: 0,
            extentsWidth: 0,
            valueBytes: Object.freeze(
              [...String(raw["text"] ?? "")].map((c) => c.charCodeAt(0) & 0xff),
            ),
            lineSpacingStyle: 1,
            lineSpacingFactor: Number.isFinite(factor) && factor > 0 ? factor : 1,
            trailingBit: 0 as const,
          }),
        });
        break;
      }
      // EL RÓTULO VIAJA CON SU BLOQUE (2026-09-04). Hasta este corte todo
      // INSERT salía con `attributesFollow: false` y el cuadro de rótulo se
      // exportaba MUDO: el bloque llegaba, su texto no. Los ATTRIB salen de
      // `positionedAttributes`, que YA trae la geometría de cada etiqueta.
      case "insert": {
        const posicionados = raw["positionedAttributes"];
        const atributos = canonicalPositionedAttributes(posicionados);
        const declarados = Array.isArray(posicionados) ? posicionados.length : 0;
        if (declarados > atributos.length) {
          losses.push({
            code: "insert-attribute-incomplete",
            entityId: id,
            sourceType: "insert",
            detail: `El INSERT "${id}" declara ${declarados} atributo(s) con geometría y sólo ${atributos.length} traen los cuatro campos que el archivo pide (etiqueta, valor, inserción y altura positiva): los incompletos no se escriben, porque un ATTRIB a medias desincroniza el cuerpo entero.`,
            severity: "warning",
          });
        }
        // Lo que el ATTRIB del formato lleva y el canónico NO puede traducir
        // todavía: la bandera de invisible y la alineación del texto. No es
        // una carencia del canónico —las trae— sino de la MEDICIÓN: los cinco
        // ATTRIB del corpus admitido traen banderas y alineación a cero, así
        // que no hay con qué comprobar la traducción. Se declara.
        if (
          Array.isArray(posicionados) &&
          posicionados.some((attribute) => {
            const a = attribute as { invisible?: unknown; alignment?: unknown };
            return a?.invisible === true || typeof a?.alignment === "string";
          })
        ) {
          losses.push({
            code: "attrib-flags-not-measured",
            entityId: id,
            sourceType: "insert",
            detail: `Algún atributo del INSERT "${id}" pide ser invisible o llevar alineación; el archivo guarda las dos cosas en códigos cuya SEMÁNTICA no está medida contra ningún archivo ajeno (los cinco ATTRIB del corpus admitido los traen a cero), así que se escriben visibles y sin alineación en vez de adivinar el número.`,
            severity: "info",
          });
        }
        // UN MAPA PLANO SIN SU GEMELO POSICIONADO NO SE DIBUJA AL AZAR. El
        // mapa dice qué vale cada etiqueta pero no dónde va; deducir la
        // posición desde la definición del bloque pondría el texto en un
        // sitio distinto del que el usuario ve en pantalla, que es el defecto
        // que el exportador DXF ya documenta. Se declara la pérdida.
        const planos = raw["attributes"];
        if (
          atributos.length === 0 &&
          typeof planos === "object" &&
          planos !== null &&
          Object.keys(planos as Record<string, unknown>).length > 0
        ) {
          losses.push({
            code: "insert-attributes-without-geometry",
            entityId: id,
            sourceType: "insert",
            detail: `El INSERT "${id}" trae ${Object.keys(planos as Record<string, unknown>).length} atributo(s) en el mapa plano pero ninguno con geometría (\`positionedAttributes\`): el mapa dice qué vale cada etiqueta y no dónde se dibuja, así que el bloque se escribe sin su rótulo en vez de colocar el texto en un sitio inventado.`,
            severity: "warning",
          });
        }
        entities.push({
          canonicalId: id,
          layerName,
          blockName: String(raw["block"] ?? ""),
          ...(atributos.length === 0 ? {} : { attributes: atributos }),
          entity: Object.freeze({
            kind: "insert" as const,
            position: canonicalPoint(raw["insertion"]),
            scale: canonicalPoint(raw["scale"] ?? { x: 1, y: 1, z: 1 }),
            rotation: Number(raw["rotation"] ?? 0),
            extrusion: defaultExtrusion,
            attributesFollow: atributos.length > 0,
          }),
        });
        break;
      }
      // ELLIPSE (2026-09-01). El writer interno la emitía desde hace olas
      // —`emitEllipse` es espejo campo a campo de `decodeEllipse`— pero ESTE
      // camino, el público, la mandaba al `default` de abajo y la declaraba
      // «no escribible». No era una carencia del writer sino de la traducción:
      // el canónico llega con los cinco campos que el DWG necesita y nadie los
      // enrutaba. Los cinco mapean uno a uno, sin convertir nada.
      case "ellipse": {
        // La EXTRUSIÓN es el único campo que el DWG pide y el canónico NO
        // lleva: la ida (`canonical.ts`) la descarta al proyectar. Se emite el
        // plano XY, que es lo que el producto dibuja y lo que traen las dos
        // elipses del corpus, y SE DECLARA: una elipse que en su archivo de
        // origen viviera en un plano inclinado vuelve tumbada, y eso el
        // usuario tiene que leerlo en el manifiesto y no descubrirlo abriendo
        // el DXF.
        losses.push({
          code: "ellipse-extrusion-not-carried",
          entityId: id,
          sourceType: "ellipse",
          detail:
            "El documento canónico no transporta la extrusión de una elipse: se escribe en el plano XY (0,0,1). Si la elipse venía de un archivo con el plano inclinado, ese plano no se conserva.",
          severity: "info",
        });
        entities.push({
          canonicalId: id,
          layerName,
          entity: Object.freeze({
            kind: "ellipse" as const,
            center: canonicalPoint(raw["center"]),
            majorAxisEndpoint: canonicalPoint(raw["majorAxis"]),
            extrusion: defaultExtrusion,
            axisRatio: Number(raw["ratio"] ?? 1),
            startAngle: Number(raw["startParameter"] ?? 0),
            endAngle: Number(raw["endParameter"] ?? 0),
          }),
        });
        break;
      }
      // HATCH, SÓLIDO Y DE PATRÓN (2026-09-04). El sólido viaja desde el
      // 2026-09-01. El de patrón lleva, después de los contornos, un bloque
      // que el sólido no tiene —ángulo, escala, doble trama y las líneas de
      // definición con sus trazos— y ese bloque SIGUE sin deducirse de los
      // contornos: lo que cambió es que ahora puede VIAJAR con la entidad
      // canónica, en `patternDefinition`, resuelto por quien sí tiene una
      // tabla de patrones propia (el producto: `hatch-pattern-table.ts`).
      // Este módulo no puede resolverlo por su cuenta —el laboratorio no
      // importa el producto, ADR-0007— así que hace lo único honesto: si la
      // definición llegó, la escribe; si no llegó, la declara.
      case "hatch": {
        const solid = raw["solid"] === true;
        const pattern = solid
          ? undefined
          : canonicalHatchPattern(raw["patternDefinition"]);
        if (!solid && pattern === undefined) {
          losses.push({
            code: "hatch-pattern-definition-missing",
            entityId: id,
            sourceType: "hatch",
            detail: `El sombreado "${String(raw["pattern"] ?? "")}" no es de relleno sólido y la entidad canónica no trae la definición de su trama (ángulo, escala y líneas con sus trazos): ese bloque no se deduce de los contornos, así que se declara en vez de inventar una trama que el archivo diría tuya.`,
            severity: "warning",
          });
          break;
        }
        const boundaries = Array.isArray(raw["boundaries"])
          ? (raw["boundaries"] as unknown[])
          : [];
        const paths = boundaries
          .map((boundary) =>
            Array.isArray(boundary) ? (boundary as unknown[]) : [],
          )
          .filter((vertices) => vertices.length >= 2)
          .map((vertices) =>
            Object.freeze({
              kind: "polyline" as const,
              // El bit de POLILÍNEA lo pone el emisor, que es quien conoce su
              // valor: duplicarlo aquí sería una segunda definición de lo
              // mismo.
              flags: 0,
              closed: true,
              vertices: Object.freeze(
                vertices.map((v) => {
                  const p = v as { x?: number; y?: number };
                  return Object.freeze({ x: p.x ?? 0, y: p.y ?? 0 });
                }),
              ),
              bulges: Object.freeze([]),
              boundaryObjectCount: 0,
            }),
          );
        if (paths.length === 0) {
          losses.push({
            code: "hatch-without-boundary",
            entityId: id,
            sourceType: "hatch",
            detail:
              "El sombreado no trae ningún contorno con al menos dos vértices: un HATCH sin contorno no es una figura, así que no se emite.",
            severity: "warning",
          });
          break;
        }
        // Lo que el canónico NO lleva y el cuerpo DWG pide. No son datos
        // perdidos del origen sino decisiones de autoría —como la extrusión
        // de la elipse—, y aun así se declaran: quien reexporte un sombreado
        // asociativo de un archivo ajeno tiene que leer que dejó de serlo.
        losses.push({
          code: "hatch-authoring-defaults",
          entityId: id,
          sourceType: "hatch",
          detail:
            "El documento canónico no transporta asociatividad, estilo, tipo de patrón ni puntos semilla de un sombreado: se escribe no asociativo, con estilo y tipo 0 y sin semillas.",
          severity: "info",
        });
        entities.push({
          canonicalId: id,
          layerName,
          entity: Object.freeze({
            kind: "hatch" as const,
            // La cota sale del primer vértice: el canónico la reparte por
            // punto al leer, y el cuerpo DWG la quiere una sola vez.
            elevation: Number(
              (paths[0]?.vertices[0] as { z?: number } | undefined)?.z ?? 0,
            ),
            extrusion: defaultExtrusion,
            nameBytes: Object.freeze(
              [...String(raw["pattern"] ?? "SOLID")].map(
                (c) => c.charCodeAt(0) & 0xff,
              ),
            ),
            solidFill: solid,
            associative: false,
            paths: Object.freeze(paths),
            style: 0,
            // TIPO DE PATRÓN: el canónico no lo transporta y se escribe 0,
            // como el estilo — ya declarado en `hatch-authoring-defaults`. Se
            // deja igual para el sólido y para el de trama a propósito: los
            // dos archivos reales del corpus llevan 1 y nosotros escribimos
            // 0, y esa diferencia se REGISTRA en la bitácora en vez de
            // corregirse a ojo, porque qué hace un lector ajeno con ese
            // número no lo dice ningún hecho medido todavía (ADR-0007).
            patternType: 0,
            angle: pattern?.angle,
            scaleOrSpacing: pattern?.scale,
            doubleHatch: pattern?.double,
            definitionLines: pattern?.lines,
            pixelSize: undefined,
            seedPoints: Object.freeze([]),
          }),
        });
        break;
      }
      default: {
        // POR QUÉ NO SE ESCRIBE, DE VERDAD (2026-09-02). Hasta este corte toda
        // clase no enrutada recibía el mismo mensaje: «el writer AC1015 aún no
        // emite X». Para `mtext` era FALSO —el writer la emite desde hace olas,
        // `emitMText` es espejo de `decodeMText`— y para `dimension` y `leader`
        // era engañoso: señalaba al writer cuando el que no llega es el
        // DOCUMENTO CANÓNICO. Son dos bloqueos distintos con dos soluciones
        // distintas, y el usuario lee esto en su manifiesto de pérdidas.
        const razon = BLOQUEADAS_POR_EL_CANONICO[type];
        losses.push({
          code: razon ? "canonical-schema-insufficient" : "canonical-type-not-writable",
          entityId: id,
          sourceType: type,
          detail:
            razon ??
            `El writer AC1015 aún no emite "${type}"; la entidad queda declarada como pérdida de exportación.`,
          severity: "warning",
        });
        break;
      }
    }
  }

  const layerNames = [...new Set(document.layers.map((l) => l.name || l.id))];
  return { entities, layerNames, lossManifest: losses };
}
