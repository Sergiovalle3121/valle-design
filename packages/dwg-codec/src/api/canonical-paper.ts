/**
 * LA HOJA: cómo un espacio papel del documento canónico llega al archivo.
 *
 * Hasta el 2026-09-04 `CanonicalCadDocumentJson.paperSpaces` era `never[]` —el
 * tipo decía, literalmente, «aquí no cabe nada»— y el adaptador del producto
 * lo vaciaba declarando la pérdida `paper-spaces-not-written`. No era una
 * carencia del writer: el archivo mínimo escribía el BLOCK_RECORD
 * `*Paper_Space`, su BLOCK/ENDBLK y el LAYOUT «Layout1» desde la ola 3, pero
 * ninguna entidad podía caer ahí porque toda la cadena de entidades era una
 * sola y era la del modelo.
 *
 * ALCANCE DE ESTA OLA, ESTRECHO A PROPÓSITO: UNA hoja —el archivo tiene UN
 * «Layout1»— con UNA ventana rectangular. Lo demás se declara como pérdida
 * con su código propio, nunca en silencio:
 * - hojas más allá de la primera (`paper-space-beyond-first-not-written`);
 * - ventanas más allá de la primera de esa hoja
 *   (`paper-space-extra-viewport-not-written`);
 * - una ventana cuyo rectángulo no tiene área (`paper-space-viewport-empty`).
 *
 * LO QUE **NO** ES UNA PÉRDIDA: una hoja sin ventanas. Sus entidades —el
 * cajetín, el marco, los rótulos— siguen viajando a la hoja; lo único que no
 * hay es una vista del modelo dentro de ella.
 *
 * POR QUÉ VIVE APARTE de `canonical-to-dwg.ts`: aquel módulo traduce ENTIDADES
 * una por una y ya está en su presupuesto de líneas; esto traduce la ESTRUCTURA
 * de la hoja, que es otra cosa y con otro vocabulario (rectángulos de papel,
 * rectángulos de modelo y una cámara), y además lo necesita `canonical.ts`
 * sólo para el tipo.
 */
import type { DwgViewportEntity } from "../model/entity-geometry.js";
import type { CanonicalLossEntry, CanonicalToDwgEntity } from "./canonical.js";

/** Un rectángulo del documento canónico: esquina inferior izquierda y tamaño. */
export interface CanonicalRectJson {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Una VENTANA del documento canónico. `paperBounds` es el hueco recortado en
 * la hoja y `modelBounds` el trozo del modelo que se ve por él; de los dos
 * sale la escala, que por eso NO viaja como número aparte (dos fuentes para
 * un mismo hecho acaban discrepando).
 *
 * `viewDirection` va del OJO a la escena, como en el documento del producto.
 * El archivo la guarda al revés —del objetivo al ojo—, y esa inversión la
 * hace este módulo en un solo sitio.
 */
export interface CanonicalPaperViewportJson {
  readonly id?: string;
  readonly paperBounds: CanonicalRectJson;
  readonly modelBounds: CanonicalRectJson;
  readonly viewDirection?: { readonly x: number; readonly y: number; readonly z: number };
}

/** Una HOJA del documento canónico, con lo que se dibuja sobre ella. */
export interface CanonicalPaperSpaceJson {
  readonly id: string;
  readonly name: string;
  /** Ids de las entidades del documento que se dibujan SOBRE la hoja. */
  readonly entityIds?: readonly string[];
  readonly viewports?: readonly CanonicalPaperViewportJson[];
}

/**
 * Los VALORES QUE UN PRODUCTOR REAL ESCRIBE en una ventana de planta a escala,
 * medidos en las dos de `23-layout-viewport` (`VALLE-CORPUS-VIEWPORT-PAPEL`).
 * No son defaults de gusto: son lo que un archivo ajeno lleva, y por eso se
 * copian en vez de inventarse.
 */
const VALORES_MEDIDOS = Object.freeze({
  twistAngle: 0,
  lensLength: 50,
  frontClip: 0,
  backClip: 0,
  snapAngle: 0,
  snapBase: Object.freeze({ x: 0, y: 0 }),
  snapSpacing: Object.freeze({ x: 10, y: 10 }),
  gridSpacing: Object.freeze({ x: 10, y: 10 }),
  circleZoom: 100,
  statusFlags: 0,
  renderMode: 0,
  ucsAtOrigin: 0,
  ucsPerViewport: 1,
  ucsOrigin: Object.freeze({ x: 0, y: 0, z: 0 }),
  ucsXAxis: Object.freeze({ x: 1, y: 0, z: 0 }),
  ucsYAxis: Object.freeze({ x: 0, y: 1, z: 0 }),
  ucsElevation: 0,
  ucsOrthoViewType: 0,
});

export interface CanonicalPaperProjection {
  /** Ids de las entidades del documento que caen en la HOJA. */
  readonly paperEntityIds: ReadonlySet<string>;
  /** La ventana de la hoja, lista para el writer; vacío si no hay ninguna. */
  readonly viewports: readonly CanonicalToDwgEntity[];
  readonly losses: readonly CanonicalLossEntry[];
}

/**
 * Proyecta los espacios papel del documento canónico: qué entidades van a la
 * hoja y qué VIEWPORT la mira.
 *
 * Determinista y sin efectos: mismas hojas → mismas entidades y mismas
 * pérdidas, en el mismo orden.
 */
export function canonicalPaperSpaceProjection(
  paperSpaces: readonly CanonicalPaperSpaceJson[],
): CanonicalPaperProjection {
  const losses: CanonicalLossEntry[] = [];
  const viewports: CanonicalToDwgEntity[] = [];
  const paperEntityIds = new Set<string>();
  if (!Array.isArray(paperSpaces) || paperSpaces.length === 0) {
    return { paperEntityIds, viewports, losses };
  }
  const hoja = paperSpaces[0]!;
  if (paperSpaces.length > 1) {
    // EL ARCHIVO TIENE UN «Layout1» Y UNO SOLO. Escribir la segunda hoja
    // encima de la primera daría un dibujo que no existe en ningún sitio, así
    // que se declara y se deja fuera entera —con sus entidades—.
    losses.push({
      code: "paper-space-beyond-first-not-written",
      sourceType: "PAPER_SPACE",
      detail: `El documento tiene ${paperSpaces.length} hojas y el DWG de esta ola escribe UNA («Layout1»): se escribe "${hoja.name}" y las otras ${paperSpaces.length - 1} quedan fuera del archivo (siguen intactas en el documento, en el PDF y en el DXF).`,
      severity: "warning",
    });
  }
  for (const id of hoja.entityIds ?? []) paperEntityIds.add(String(id));

  const ventanas = hoja.viewports ?? [];
  if (ventanas.length > 1) {
    losses.push({
      code: "paper-space-extra-viewport-not-written",
      sourceType: "PAPER_SPACE",
      detail: `La hoja "${hoja.name}" tiene ${ventanas.length} ventanas y esta ola escribe UNA: se escribe la primera y las otras ${ventanas.length - 1} quedan fuera. Varias ventanas por hoja es «todavía no», no un límite del formato.`,
      severity: "warning",
    });
  }
  const ventana = ventanas[0];
  if (ventana !== undefined) {
    const entity = viewportEntityOf(ventana);
    if (entity === undefined) {
      losses.push({
        code: "paper-space-viewport-empty",
        entityId: ventana.id ?? hoja.id,
        sourceType: "PAPER_SPACE",
        detail: `La ventana de la hoja "${hoja.name}" no declara un rectángulo con área finita en el papel y en el modelo; una ventana sin área no recorta nada, así que la hoja se escribe sin ella en vez de con una ventana que ningún lector puede dibujar.`,
        severity: "warning",
      });
    } else {
      viewports.push({
        canonicalId: ventana.id ?? `${hoja.id}:viewport`,
        // LA VENTANA VA EN LA CAPA "0". Es donde la ponen las dos del corpus
        // ajeno, y el documento canónico no le da capa propia a una ventana.
        layerName: "0",
        space: "paper",
        entity,
      });
    }
  }
  return { paperEntityIds, viewports, losses };
}

/**
 * La entidad VIEWPORT de una ventana canónica, o `undefined` si su rectángulo
 * no sirve.
 *
 * LOS TRES CAMPOS QUE SE CALCULAN, y de dónde salen:
 * - `center`, `width` y `height` son el rectángulo de PAPEL tal cual;
 * - `viewCenter` y `viewHeight` son el rectángulo de MODELO: el centro que la
 *   ventana enseña y la altura del trozo que entra. De su cociente con la
 *   altura de papel sale la escala, y por eso la escala no se escribe aparte;
 * - `viewDirection` es la dirección de mirada INVERTIDA: el documento la
 *   guarda del ojo a la escena y el archivo del objetivo al ojo. Sin esa
 *   inversión un alzado saldría mirando desde el lado contrario.
 */
function viewportEntityOf(
  ventana: CanonicalPaperViewportJson,
): DwgViewportEntity | undefined {
  const papel = ventana.paperBounds;
  const modelo = ventana.modelBounds;
  if (!rectangleIsUsable(papel) || !rectangleIsUsable(modelo)) return undefined;
  const mirada = ventana.viewDirection ?? { x: 0, y: 0, z: -1 };
  if (
    !Number.isFinite(mirada.x) ||
    !Number.isFinite(mirada.y) ||
    !Number.isFinite(mirada.z)
  ) {
    return undefined;
  }
  const centroModelo = Object.freeze({
    x: modelo.x + modelo.width / 2,
    y: modelo.y + modelo.height / 2,
  });
  return Object.freeze({
    kind: "viewport" as const,
    center: Object.freeze({
      x: papel.x + papel.width / 2,
      y: papel.y + papel.height / 2,
      z: 0,
    }),
    width: papel.width,
    height: papel.height,
    // El OBJETIVO de la vista se deja en el origen, como las dos del corpus:
    // quien ancla lo que se ve es `viewCenter`, y poner el objetivo en otro
    // sitio movería la vista dos veces.
    viewTarget: Object.freeze({ x: 0, y: 0, z: 0 }),
    viewDirection: miradaInvertida(mirada),
    twistAngle: VALORES_MEDIDOS.twistAngle,
    viewHeight: modelo.height,
    lensLength: VALORES_MEDIDOS.lensLength,
    frontClip: VALORES_MEDIDOS.frontClip,
    backClip: VALORES_MEDIDOS.backClip,
    snapAngle: VALORES_MEDIDOS.snapAngle,
    viewCenter: centroModelo,
    snapBase: VALORES_MEDIDOS.snapBase,
    snapSpacing: VALORES_MEDIDOS.snapSpacing,
    gridSpacing: VALORES_MEDIDOS.gridSpacing,
    circleZoom: VALORES_MEDIDOS.circleZoom,
    // CERO CAPAS CONGELADAS. Sus handles viajarían en el flujo final y el
    // writer no los emite todavía; congelar capas por ventana es «todavía no»
    // y el writer falla CERRADO si alguien pide otro número.
    frozenLayerCount: 0,
    statusFlags: VALORES_MEDIDOS.statusFlags,
    styleSheetBytes: Object.freeze([]),
    renderMode: VALORES_MEDIDOS.renderMode,
    ucsAtOrigin: VALORES_MEDIDOS.ucsAtOrigin,
    ucsPerViewport: VALORES_MEDIDOS.ucsPerViewport,
    ucsOrigin: VALORES_MEDIDOS.ucsOrigin,
    ucsXAxis: VALORES_MEDIDOS.ucsXAxis,
    ucsYAxis: VALORES_MEDIDOS.ucsYAxis,
    ucsElevation: VALORES_MEDIDOS.ucsElevation,
    ucsOrthoViewType: VALORES_MEDIDOS.ucsOrthoViewType,
  });
}

/**
 * La dirección de mirada INVERTIDA, sin ceros negativos.
 *
 * El `+ 0` no es ruido: negar el 0 de una vista de planta —(0,0,−1) es la
 * mirada de toda ventana de planta— da −0, y −0 sí llega al archivo como −0.0
 * porque el emisor BD lo distingue del 0.0. Ningún productor real escribe eso,
 * y `-0 + 0` es exactamente 0. Se hace en UN sitio porque la inversión ocurre
 * en las dos direcciones del mapeo.
 */
function miradaInvertida(direction: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}): { readonly x: number; readonly y: number; readonly z: number } {
  return Object.freeze({
    x: -direction.x + 0,
    y: -direction.y + 0,
    z: -direction.z + 0,
  });
}

/** Un rectángulo sirve si sus cuatro números son finitos y tiene área. */
function rectangleIsUsable(rect: CanonicalRectJson | undefined): boolean {
  if (typeof rect !== "object" || rect === null) return false;
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

/**
 * LA VUELTA: la hoja que el ARCHIVO trae, proyectada al documento canónico.
 *
 * Existe por el gemelo `-publico` del arnés del oráculo. Ese arnés escribe
 * cada caso DOS veces —por el writer interno y por `writeCanonicalDwg`
 * después de pasar por el canónico— y compara los dos contra el MISMO DXF
 * regenerado. Sin esta función el gemelo público del caso `hoja-con-ventana`
 * perdería la ventana por el camino, que es exactamente el defecto que la ola
 * del sombreado con trama descubrió con el suyo.
 *
 * LO QUE EL ARCHIVO NO GUARDA Y AQUÍ SE DERIVA: el ANCHO del rectángulo de
 * modelo. El VIEWPORT guarda el centro de vista y la ALTURA de vista, no el
 * ancho: el ancho lo fija el hueco del papel, porque la ventana enseña una
 * región con la misma proporción que ella. Derivarlo de la proporción es
 * reconstruir el mismo rectángulo cuando entró de esa forma —y esa es la que
 * escribe `canonicalPaperSpaceProjection`—, no inventarlo.
 */
export function canonicalPaperSpaceFromDwg(hoja: {
  readonly viewports: readonly DwgViewportEntity[];
  readonly entityIds: readonly string[];
}): readonly CanonicalPaperSpaceJson[] {
  if (hoja.viewports.length === 0 && hoja.entityIds.length === 0) return [];
  return [
    Object.freeze({
      // «Layout1» es el nombre del ÚNICO layout que el archivo mínimo escribe
      // y el que el corpus trae; no se inventa uno.
      id: "layout1",
      name: "Layout1",
      entityIds: Object.freeze([...hoja.entityIds]),
      viewports: Object.freeze(
        hoja.viewports.map((ventana, index) =>
          Object.freeze({
            id: `layout1:viewport${index + 1}`,
            paperBounds: Object.freeze({
              x: ventana.center.x - ventana.width / 2,
              y: ventana.center.y - ventana.height / 2,
              width: ventana.width,
              height: ventana.height,
            }),
            modelBounds: Object.freeze({
              x:
                ventana.viewCenter.x -
                (ventana.viewHeight * (ventana.width / ventana.height)) / 2,
              y: ventana.viewCenter.y - ventana.viewHeight / 2,
              width: ventana.viewHeight * (ventana.width / ventana.height),
              height: ventana.viewHeight,
            }),
            // El archivo guarda la dirección del OBJETIVO AL OJO y el
            // documento del ojo a la escena: la misma inversión que hace la
            // ida, en el mismo módulo, para que no puedan separarse.
            viewDirection: miradaInvertida(ventana.viewDirection),
          }),
        ),
      ),
    }),
  ];
}
