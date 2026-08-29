/**
 * De plantilla de layout a DOCUMENTO CAD completo.
 *
 * ## Por qué existe
 *
 * El catálogo de plantillas (`templates.ts`) es el mayor activo comercial del
 * producto que no se veía: 149 arranques mexicanos —casa habitación, taquería,
 * notaría, nave industrial— que hasta hoy solo existían como paleta dentro del
 * editor. La galería pública (/plantillas), sus renders, sus láminas PDF de
 * muestra y el modo demostración necesitan lo mismo: la plantilla convertida
 * en un `CadDocument` VÁLIDO y completo, por el mismo camino que usa el
 * producto, no por un dibujante paralelo que acabaría contradiciendo al motor.
 *
 * ## Qué reutiliza (todo)
 *
 * - `instantiateCadLayoutTemplate`: la MISMA instanciación que ejecuta el
 *   editor al aplicar una plantilla (escala, validaciones, avisos).
 * - `createCadStarterDocument`: el documento de arranque con capas de la norma
 *   mexicana, estilos de texto/cota anotativos y el cajetín con responsiva.
 * - Los assets se traducen a entidades NATIVAS del esquema (polilíneas,
 *   líneas, arcos, círculos, texto) con las convenciones del oficio: la
 *   puerta con su abatimiento en arco de 90°, la columna con su cruz, la
 *   escalera con sus huellas, el extintor como círculo. Nativas y no `box`
 *   a propósito: `box` es el legado del layout 3D que la proyección de plan,
 *   el DXF y la acotación NO dibujan; una polilínea la entienden el estudio,
 *   la proyección, el trazador y el intercambio por igual — y quien abra la
 *   plantilla puede acotar sus muros desde el primer minuto.
 *
 * ## Determinismo
 *
 * Sin `Date.now()`, sin aleatorios: los ids de entidad derivan del `ref` de la
 * plantilla. Dos llamadas producen el mismo JSON — es lo que permite que el
 * manifiesto de la galería detecte con un hash cuándo un render envejeció
 * respecto al motor, y que una spec afirme sobre las 149 sin flakiness.
 *
 * ## La escala de la lámina se ELIGE, no se hereda
 *
 * El starter trae 1:50 en A1, pero una cancha de fútbol no cabe a 1:50. Aquí
 * se hace lo que haría un dibujante: probar las escalas de la norma de menor a
 * mayor denominador y quedarse con la primera en la que el modelo entra en la
 * ventana de la lámina. La ventana del viewport se recoloca al pie del modelo
 * (`modelBounds` = huella de la plantilla) para que la lámina enseñe el plano
 * y no un rincón vacío.
 */
import type { CadDocument, CadEntity } from "./cad-document";
import {
  CAD_MEXICAN_SCALES,
  CAD_MEXICAN_TEXT_MM,
  CAD_MEXICAN_TEXT_STYLES,
} from "./standards/mexican-annotation";
import { cadAnnotativeModelHeight } from "./layout/annotative-scale";
import {
  createCadStarterDocument,
  type CadStarterTemplateId,
} from "./starter-templates";
import {
  getCadLayoutTemplate,
  instantiateCadLayoutTemplate,
  type CadLayoutTemplate,
  type CadLayoutTemplateId,
} from "./templates";

/**
 * Starter por categoría: define la disciplina del cajetín y las capas de norma
 * que acompañan al sustrato del editor. `taller` y `bodega` van sobre planta
 * arquitectónica: son plantas de local, no planos de instalaciones.
 */
const STARTER_BY_CATEGORY: Record<CadLayoutTemplate["category"], CadStarterTemplateId> = {
  arquitectura: "planta-arquitectonica",
  civil: "planta-de-conjunto",
  estructura: "plano-estructural",
  instalaciones: "plano-de-instalaciones",
  taller: "planta-arquitectonica",
  bodega: "planta-arquitectonica",
};

/** Margen del viewport alrededor de la huella, en mm de modelo. */
const MODEL_MARGIN_MM = 500;

/** Espacios que llevan su nombre rotulado en el plano. */
const LABELLED_KINDS = new Set(["room", "zone", "shell"]);

type Pt = { x: number; y: number };

/** Rota un punto alrededor de un centro, en grados (sentido del editor). */
function rotatePoint(point: Pt, center: Pt, degrees: number): Pt {
  if (!degrees) return point;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

interface AssetLike {
  ref: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  layer: string;
}

/**
 * Un asset de plantilla → entidades nativas con la convención del oficio.
 *
 * La rotación se aplica a los VÉRTICES alrededor del centro del asset: las
 * entidades resultantes son geometría ya rotada, que es como viviría en un
 * DXF (una polilínea no guarda «su rotación», guarda sus puntos).
 */
function assetEntities(asset: AssetLike, idBase: string): CadEntity[] {
  const { x, y, w, h, layer } = asset;
  const center = { x: x + w / 2, y: y + h / 2 };
  const rot = asset.rotation ?? 0;
  const P = (px: number, py: number): Pt => rotatePoint({ x: px, y: py }, center, rot);

  const V = (px: number, py: number) => ({ ...P(px, py), z: 0 });
  const rect = (id: string): CadEntity => ({
    id,
    type: "polyline",
    vertices: [V(x, y), V(x + w, y), V(x + w, y + h), V(x, y + h)],
    closed: true,
    layer,
  });
  const line = (id: string, a: Pt, b: Pt): CadEntity => ({
    id,
    type: "line",
    start: { ...P(a.x, a.y), z: 0 },
    end: { ...P(b.x, b.y), z: 0 },
    layer,
  });

  switch (asset.kind) {
    case "door": {
      /**
       * Puerta en planta: hoja abierta a 90° + arco de abatimiento. La
       * bisagra va en el extremo del claro; el radio es el ancho del claro
       * (el lado LARGO del asset — el corto es el espesor del muro).
       */
      const along = w >= h;
      const span = along ? w : h;
      const hinge = along ? { x, y: y + h / 2 } : { x: x + w / 2, y };
      const leafEnd = along
        ? { x: hinge.x, y: hinge.y + span }
        : { x: hinge.x + span, y: hinge.y };
      const startAngle = along ? 0 : 90;
      const leaf = line(`${idBase}-hoja`, hinge, leafEnd);
      const swing: CadEntity = {
        id: `${idBase}-abatimiento`,
        type: "arc",
        center: { ...P(hinge.x, hinge.y), z: 0 },
        radius: span,
        startAngle: startAngle + rot,
        endAngle: startAngle + 90 + rot,
        layer,
      };
      /** Jambas: el corte del muro a cada lado del claro, para que el vano se lea. */
      const jambA = along
        ? line(`${idBase}-jamba-a`, { x, y }, { x, y: y + h })
        : line(`${idBase}-jamba-a`, { x, y }, { x: x + w, y });
      const jambB = along
        ? line(`${idBase}-jamba-b`, { x: x + w, y }, { x: x + w, y: y + h })
        : line(`${idBase}-jamba-b`, { x, y: y + h }, { x: x + w, y: y + h });
      return [jambA, jambB, leaf, swing];
    }
    case "window":
      /** Ventana: el claro con su línea de cristal al centro. */
      return [
        rect(`${idBase}-claro`),
        w >= h
          ? line(`${idBase}-cristal`, { x, y: y + h / 2 }, { x: x + w, y: y + h / 2 })
          : line(`${idBase}-cristal`, { x: x + w / 2, y }, { x: x + w / 2, y: y + h }),
      ];
    case "column":
      /** Columna estructural: sección con su cruz de ejes. */
      return [
        rect(`${idBase}-seccion`),
        line(`${idBase}-eje-a`, { x, y }, { x: x + w, y: y + h }),
        line(`${idBase}-eje-b`, { x: x + w, y }, { x, y: y + h }),
      ];
    case "stair": {
      /** Escalera: caja + huellas cada ~280 mm sobre el eje largo. */
      const out: CadEntity[] = [rect(`${idBase}-caja`)];
      const along = w >= h;
      const length = along ? w : h;
      const treads = Math.max(3, Math.min(18, Math.floor(length / 280)));
      for (let i = 1; i < treads; i += 1) {
        const t = (length * i) / treads;
        out.push(
          along
            ? line(`${idBase}-huella-${i}`, { x: x + t, y }, { x: x + t, y: y + h })
            : line(`${idBase}-huella-${i}`, { x, y: y + t }, { x: x + w, y: y + t }),
        );
      }
      return out;
    }
    case "fire-extinguisher":
      /** Extintor: círculo, como en un plano de protección civil. */
      return [
        {
          id: `${idBase}-cuerpo`,
          type: "circle",
          center: { ...P(center.x, center.y), z: 0 },
          radius: Math.min(w, h) / 2,
          layer,
        },
      ];
    case "wc":
      /** Mueble sanitario: contorno + taza. */
      return [
        rect(`${idBase}-contorno`),
        {
          id: `${idBase}-taza`,
          type: "circle",
          center: { ...P(center.x, center.y), z: 0 },
          radius: Math.min(w, h) * 0.3,
          layer,
        },
      ];
    default:
      return [rect(idBase)];
  }
}

export interface CadTemplateDocumentResult {
  document: CadDocument;
  template: CadLayoutTemplate;
  /** Denominador elegido para la lámina (p. ej. 100 para 1:100). */
  scaleDenominator: number;
  /** Avisos de la instanciación (idénticos a los del editor). */
  warnings: string[];
}

/**
 * La primera escala de la norma en la que la huella entra en la ventana de la
 * lámina. Se recorre de más fina a más gruesa: el plano se enseña tan grande
 * como la lámina permita, que es como se elige la escala en un restirador.
 */
function fitMexicanScale(
  footprintW: number,
  footprintH: number,
  paperW: number,
  paperH: number,
): number {
  const candidates = [...CAD_MEXICAN_SCALES]
    .map((scale) => scale.denominator)
    .sort((a, b) => a - b);
  for (const denominator of candidates) {
    if (footprintW / denominator <= paperW && footprintH / denominator <= paperH) {
      return denominator;
    }
  }
  return candidates[candidates.length - 1];
}

/** Construye el documento completo de una plantilla del catálogo. */
export function buildCadTemplateDocument(
  templateId: CadLayoutTemplateId,
): CadTemplateDocumentResult {
  const template = getCadLayoutTemplate(templateId);
  if (!template) {
    throw new Error(`No existe la plantilla «${templateId}» en el catálogo.`);
  }

  /**
   * `gridSize: 1` = SIN redondeo de rejilla: la instanciación a tamaño base
   * debe ser fiel al catálogo al milímetro. El snap a rejilla existe para
   * cuando el editor mezcla una plantilla con un dibujo que ya tiene su
   * rejilla; aquí redondear a 100 mm movía los barrenos de una pieza de
   * 400 mm fuera de su huella (lo delató el spec).
   */
  const generated = instantiateCadLayoutTemplate(templateId, {
    width: template.baseWidth,
    height: template.baseHeight,
    gridSize: 1,
  });

  const base = createCadStarterDocument({
    templateId: STARTER_BY_CATEGORY[template.category],
    title: template.label,
    project: template.label,
  });

  const paperViewport = base.paperSpaces[0]?.viewports?.[0];
  const paperW = paperViewport?.paperBounds?.width ?? 811;
  const paperH = paperViewport?.paperBounds?.height ?? 524;
  const scaleDenominator = fitMexicanScale(
    template.baseWidth + MODEL_MARGIN_MM * 2,
    template.baseHeight + MODEL_MARGIN_MM * 2,
    paperW,
    paperH,
  );
  /**
   * La altura del rótulo es ANOTATIVA: la misma función que usa la norma para
   * que un texto de 2,5 mm sobre el papel mida lo que toque en el modelo según
   * la escala de la lámina. Sin esto, las notas de una cancha a 1:200 saldrían
   * ilegibles y las de un consultorio a 1:50 gigantes.
   */
  const noteHeight = cadAnnotativeModelHeight(
    CAD_MEXICAN_TEXT_MM.rotulo,
    scaleDenominator,
    "mm",
  );

  /**
   * Los CONECTORES de la plantilla (flujos persona/material) NO se dibujan:
   * son metadatos de proceso del layout, y un plano arquitectónico no traza
   * líneas centro-a-centro entre locales. El dato no se pierde — sigue en el
   * catálogo y el editor de layout lo enseña donde toca.
   */
  const entities: CadEntity[] = [];
  for (const asset of generated.assets) {
    entities.push(...assetEntities(asset, `tpl-${asset.ref}`));
  }

  /**
   * Rótulo de local: los espacios con nombre lo llevan como texto de norma.
   * El cascarón perimetral NO se rotula: su rótulo caería al centro del plano,
   * encima del local que ocupe esa zona — un plano real rotula locales, no la
   * envolvente.
   */
  const labelMinArea = template.baseWidth * template.baseHeight * 0.003;
  for (const asset of generated.assets) {
    if (!LABELLED_KINDS.has(asset.kind)) continue;
    if (asset.tags.includes("shell") || asset.tags.includes("gross-area")) continue;
    if (asset.w * asset.h < labelMinArea) continue;
    entities.push({
      id: `tpl-lb-${asset.ref}`,
      type: "text",
      x: asset.x + asset.w / 2,
      y: asset.y + asset.h / 2,
      text: asset.label.toUpperCase(),
      layer: "TEXTO",
      style: CAD_MEXICAN_TEXT_STYLES.rotulo,
      height: noteHeight,
    });
  }

  for (const annotation of generated.annotations) {
    entities.push({
      id: `tpl-nt-${annotation.ref}`,
      type: "text",
      x: annotation.x,
      y: annotation.y,
      text: annotation.text,
      layer: "TEXTO",
      style: CAD_MEXICAN_TEXT_STYLES.rotulo,
      height: noteHeight,
    });
  }

  const modelBounds = {
    x: -MODEL_MARGIN_MM,
    y: -MODEL_MARGIN_MM,
    width: template.baseWidth + MODEL_MARGIN_MM * 2,
    height: template.baseHeight + MODEL_MARGIN_MM * 2,
  };

  const document: CadDocument = {
    ...base,
    meta: {
      ...base.meta,
      footprintW: template.baseWidth,
      footprintH: template.baseHeight,
      // Rejilla proporcional al objeto: 100 mm para una planta, 10 mm para
      // una pieza de taller. Es la rejilla que el estudio muestra al abrir.
      gridSize: template.baseWidth >= 4000 ? 100 : 10,
    },
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    history: [{ version: 1, label: `Plantilla del catálogo: ${template.label}` }],
    paperSpaces: base.paperSpaces.map((space, index) =>
      index === 0
        ? {
            ...space,
            viewports: (space.viewports ?? []).map((viewport) => ({
              ...viewport,
              modelBounds,
              scale: scaleDenominator,
              annotationScale: scaleDenominator,
            })),
          }
        : space,
    ),
  };

  return {
    document,
    template,
    scaleDenominator,
    warnings: generated.warnings,
  };
}
