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
 * (line, point, circle, arc, lwpolyline, text, insert, ellipse). Lo no
 * escribible se declara en el manifiesto — el writer jamás emite a medias.
 */
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
      default:
        losses.push({
          code: "canonical-type-not-writable",
          entityId: id,
          sourceType: type,
          detail: `El writer AC1015 aún no emite "${type}"; la entidad queda declarada como pérdida de exportación.`,
          severity: "warning",
        });
    }
  }

  const layerNames = [...new Set(document.layers.map((l) => l.name || l.id))];
  return { entities, layerNames, lossManifest: losses };
}
