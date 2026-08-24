/**
 * Síntesis de peticiones de TEXTO para DIMENSION, MLEADER e INSERT.
 *
 * El MTEXT literal no necesita este módulo: convertirlo en petición de quads
 * ES su camino completo, y `buildTileChunk` (pipeline.ts) lo resuelve inline.
 * Cota, mleader e insert son distintos — dibujan su geometría de línea
 * (flechas, guía, contorno del bloque) ADEMÁS de un rótulo, y ese rótulo sale
 * de derivar geometría propia (`buildCadDimensionGeometry`,
 * `buildCadMleaderGeometry`, `resolveCadInsert`) antes de poder situar el
 * texto. Ese cálculo previo es lo que separaba este trozo del resto del bucle
 * de teselado y lo hacía digno de vivir aparte.
 *
 * Réplica MÍNIMA de lo que ya resuelve `entity-three.ts` para el color de una
 * cota (`cadDimensionTextContext`) y el aplanado de hijos de bloque
 * (`buildCadNativeObject`): no se importa de ahí porque ese módulo arrastra
 * THREE y este carril, como el pipeline que lo llama, es puro — el mismo
 * reparto que separa `line-batch.ts` de `line-batch-three.ts`.
 *
 * Funciones libres y sin estado propio: cada una recibe el array de destino y
 * las piezas del pipeline que necesita —profundidad, origen flotante, un
 * resolutor de color—, nunca la clase entera. `styleOf` sólo pide el color: al
 * pipeline le basta pasar su `CadRenderStyleResolver` tal cual, porque
 * `CadLineStyle` ya trae ese campo.
 */
import type { CadDocument } from "../cad-document";
import type { CadNativeEntity } from "../entity-runtime";
import { buildCadDimensionGeometry } from "../associative-dimension";
import { buildCadMleaderGeometry } from "../associative-mleader";
import { resolveCadInsert } from "../professional-blocks";
import type { CadRenderOrigin } from "./tessellation-cache";
import type { CadTextQuadRequest } from "./text-atlas";
import { cadRenderMark, cadRenderStage } from "./render-profile";

/** Sólo el color importa aquí. El pipeline pasa su `CadRenderStyleResolver` tal cual. */
type CadRenderTextColorResolver = (entity: CadNativeEntity) => { color: number };

/**
 * MTEXT literal: no dibuja nada más, así que convertirlo en petición de quads
 * ES su camino completo — el llamador no tesela nada para él (ver el
 * `continue` en `buildTileChunk`).
 */
export function pushCadMtextTextRequest(
  textRequests: CadTextQuadRequest[],
  entity: Extract<CadNativeEntity, { type: "mtext" }>,
  depth: number,
  origin: CadRenderOrigin,
  styleOf: CadRenderTextColorResolver,
): void {
  const textStarted = cadRenderMark();
  textRequests.push({
    text: entity.text,
    fontKey: entity.fontFamily ?? "Arial",
    fontSize: entity.height ?? 120,
    x: entity.insertion.x - origin.x,
    y: entity.insertion.y - origin.y,
    rotationDeg: entity.rotation ?? 0,
    color: styleOf(entity).color,
    depth,
  });
  cadRenderStage("textRequest", textStarted);
}

/**
 * DIMCLRT: el color del RÓTULO de la cota puede diferir del de sus líneas.
 * Réplica mínima de `cadDimensionTextContext` (entity-three.ts) — no se
 * importa de ahí porque ese módulo arrastra THREE y este carril es puro.
 */
export function cadDimensionTextColor(
  entity: Extract<CadNativeEntity, { type: "dimension" }>,
  styleOf: CadRenderTextColorResolver,
): number {
  if (entity.textColor && /^#[0-9a-f]{6}$/i.test(entity.textColor))
    return Number.parseInt(entity.textColor.slice(1), 16);
  return styleOf(entity).color;
}

/**
 * Cota: deriva su geometría para situar el rótulo y, si hay dónde ponerlo, lo
 * añade a `textRequests`. Sin geometría (cota degenerada) no añade nada — el
 * dibujo de línea, que sigue su propio camino en el llamador, tampoco la tendrá.
 */
export function pushCadDimensionTextRequest(
  textRequests: CadTextQuadRequest[],
  entity: Extract<CadNativeEntity, { type: "dimension" }>,
  depth: number,
  origin: CadRenderOrigin,
  styleOf: CadRenderTextColorResolver,
): void {
  const dimension = buildCadDimensionGeometry(entity);
  if (!dimension) return;
  const textStarted = cadRenderMark();
  textRequests.push({
    text: dimension.label,
    fontKey: "Arial",
    // DIMTXT, con el mismo respaldo que `buildCadNativeObject`: una cota sin
    // altura propia hereda `arrowSize * 0.55`, como siempre.
    fontSize: Math.max(1, entity.textHeight ?? (entity.arrowSize ?? 180) * 0.55),
    x: dimension.textAnchor.x - origin.x,
    y: dimension.textAnchor.y - origin.y,
    rotationDeg: dimension.textAngle,
    color: cadDimensionTextColor(entity, styleOf),
    depth,
  });
  cadRenderStage("textRequest", textStarted);
}

/** Mleader: mismo patrón, sin variante de color propia — hereda la del estilo. */
export function pushCadMleaderTextRequest(
  textRequests: CadTextQuadRequest[],
  entity: Extract<CadNativeEntity, { type: "mleader" }>,
  depth: number,
  origin: CadRenderOrigin,
  styleOf: CadRenderTextColorResolver,
): void {
  if (!entity.text.trim()) return;
  const geometry = buildCadMleaderGeometry(entity);
  if (!geometry) return;
  const textStarted = cadRenderMark();
  textRequests.push({
    text: entity.text,
    fontKey: entity.fontFamily ?? "Arial",
    fontSize: entity.textHeight ?? 120,
    x: geometry.textAnchor.x - origin.x,
    y: geometry.textAnchor.y - origin.y,
    rotationDeg: entity.textRotation ?? 0,
    color: styleOf(entity).color,
    depth,
  });
  cadRenderStage("textRequest", textStarted);
}

/**
 * Insert: cada hijo TEXT/MTEXT resuelto del bloque aporta su propia petición.
 * `styleOf` se consulta POR HIJO —no una vez para el insert— porque el estilo
 * puede depender de la capa del hijo, no de la del insert que lo contiene.
 */
export function pushCadInsertTextRequests(
  textRequests: CadTextQuadRequest[],
  entity: Extract<CadNativeEntity, { type: "insert" }>,
  document: CadDocument,
  depth: number,
  origin: CadRenderOrigin,
  styleOf: CadRenderTextColorResolver,
): void {
  for (const child of resolveCadInsert(document, entity).entities) {
    if (child.type !== "text" && child.type !== "mtext") continue;
    // Mismo aplanado que `buildCadNativeObject`: un TEXT hijo de un bloque no
    // tiene adaptador propio, así que viaja como el MTEXT sintético que ya
    // sabe pintar el resto del pipeline de texto.
    const nativeChild: Extract<CadNativeEntity, { type: "mtext" }> =
      child.type === "mtext"
        ? child
        : {
            id: child.id,
            type: "mtext",
            insertion: { x: child.x, y: child.y, z: 0 },
            text: child.text,
            height: child.height,
            rotation: child.rotation,
            style: child.style,
            layer: child.layer,
            context: child.context,
          };
    if (!nativeChild.text.trim()) continue;
    const textStarted = cadRenderMark();
    textRequests.push({
      text: nativeChild.text,
      fontKey: nativeChild.fontFamily ?? "Arial",
      fontSize: nativeChild.height ?? 120,
      x: nativeChild.insertion.x - origin.x,
      y: nativeChild.insertion.y - origin.y,
      rotationDeg: nativeChild.rotation ?? 0,
      color: styleOf(nativeChild).color,
      depth,
    });
    cadRenderStage("textRequest", textStarted);
  }
}
