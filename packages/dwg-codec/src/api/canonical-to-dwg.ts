/**
 * Dirección CANÓNICO → DWG, extraída de `canonical.ts` cuando el intake del
 * ensamblado R2010+ (2026-08-31) empujó ese archivo por encima del presupuesto
 * de monolito. Es una unidad con sentido propio: la traducción de vuelta, con
 * sus pérdidas simétricas a las de la ida.
 */
import type { DwgPoint3 } from "../model/entity-geometry.js";
import type {
  CanonicalCadDocumentJson,
  CanonicalLossEntry,
  CanonicalToDwgEntity,
  CanonicalToDwgResult,
} from "./canonical.js";

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
  mtext:
    'El writer AC1015 SÍ emite MTEXT; lo que no llega es el documento canónico, que no transporta la alineación ni el interlineado que el editor sí modela. Enrutarla hoy los aplanaría en silencio, así que se declara la pérdida en vez de entregar el texto mal compuesto.',
  dimension:
    'El documento canónico de una cota lleva sus puntos y su texto, pero no el VALOR MEDIDO que la cota muestra ni el resto del cuerpo que el formato pide, y colapsa las dos formas de cota angular (por tres puntos y por dos líneas) en una sola, que tienen cuerpos distintos: no hay forma de saber cuál escribir. Escribirla exigiría inventar el número y elegir una forma al azar.',
  leader:
    'El documento canónico no modela la directriz (LEADER) en absoluto: no hay nada que proyectar al writer. El decodificador sí la lee, así que la pérdida es de la ida al canónico, no de la lectura del archivo.',
});

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
      case "insert":
        entities.push({
          canonicalId: id,
          layerName,
          blockName: String(raw["block"] ?? ""),
          entity: Object.freeze({
            kind: "insert" as const,
            position: canonicalPoint(raw["insertion"]),
            scale: canonicalPoint(raw["scale"] ?? { x: 1, y: 1, z: 1 }),
            rotation: Number(raw["rotation"] ?? 0),
            extrusion: defaultExtrusion,
            attributesFollow: false,
          }),
        });
        break;
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
      // HATCH DE RELLENO SÓLIDO (2026-09-01). Sólo el sólido, y por una razón
      // de formato, no de pereza: el cuerpo de un HATCH con patrón lleva
      // después de los contornos un bloque —ángulo, escala, doble trama y las
      // líneas de definición con sus trazos— que el sólido no tiene y que NO
      // se deduce de los contornos. El canónico transporta el NOMBRE del
      // patrón, no su geometría, así que escribir uno con patrón exigiría
      // inventársela. Se declara y no se emite.
      case "hatch": {
        if (raw["solid"] !== true) {
          losses.push({
            code: "hatch-pattern-not-writable",
            entityId: id,
            sourceType: "hatch",
            detail: `El sombreado "${String(raw["pattern"] ?? "")}" no es de relleno sólido: el documento canónico lleva el NOMBRE del patrón pero no su definición (ángulo, escala y líneas con sus trazos), y esa definición no se deduce de los contornos. Se declara en vez de inventarla.`,
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
            solidFill: true,
            associative: false,
            paths: Object.freeze(paths),
            style: 0,
            patternType: 0,
            angle: undefined,
            scaleOrSpacing: undefined,
            doubleHatch: undefined,
            definitionLines: undefined,
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
