/**
 * PDFATTACH: el PDF como SUSTRATO sobre el que se calca.
 *
 * ## Para qué sirve de verdad
 *
 * A un despacho mexicano le llega el levantamiento del topógrafo, la lámina del
 * municipio o el plano escaneado de una casa de 1980. Cuando ese PDF no tiene
 * vectores —y un escaneo nunca los tiene— la única forma de digitalizarlo es
 * ponerlo debajo y dibujar encima. Eso es esto.
 *
 * ## Por qué NO es un xref y por qué se parece tanto
 *
 * Un xref proyecta el DOCUMENTO ajeno: bloques, capas y entidades que se
 * resuelven al dibujar. Un PDF no tiene documento que proyectar; tiene una
 * lámina que se coloca. Así que el mecanismo es el de una IMAGEN —una entidad
 * `image` apoyada en una definición de `document.imageDefinitions`, que es
 * exactamente la relación que un INSERT tiene con su bloque— y la CEREMONIA es
 * la de un xref: su capa propia, su estado de carga, su descarga sin perder la
 * ruta, su recorte y su gestor. `xref-workflow.ts` ya resolvió esa ceremonia y
 * aquí se sigue al pie de la letra en vez de inventar una segunda.
 *
 * Todo sale como LOTE de `CadEntityCommand`, por la misma razón que allí:
 * adjuntar son tres escrituras —la capa, la definición y la entidad— y como
 * transacciones sueltas una interrupción deja la capa creada y el sustrato no.
 *
 * ## La unidad nativa del sustrato es el PUNTO
 *
 * Un PDF no tiene píxeles. Su unidad es el punto PostScript, 1/72 de pulgada, y
 * eso es lo que se guarda en la definición y en el `size` de la entidad. El
 * factor `unitsPerPoint` es lo único que cambia al escalarlo, y por defecto vale
 * 0,352 8 — que coloca la lámina a TAMAÑO DE PAPEL. Es lo honesto: el PDF no
 * dice a qué escala se dibujó, y suponer 1:100 porque es lo más común pondría
 * una medida inventada en un plano.
 *
 * ## Escalar a medida conocida
 *
 * Es la operación que hace útil todo lo demás. El arquitecto designa dos puntos
 * del sustrato —dos extremos de un muro acotado en la lámina—, dice cuánto miden
 * de verdad, y TODO el sustrato se reescala alrededor del primero. Sin eso,
 * calcar encima produce un dibujo con la forma correcta y todas las medidas
 * equivocadas, que es el peor resultado posible.
 */
import type {
  CadDocument,
  CadEntity,
  CadLayerDef,
  CadPoint2,
  CadPoint3,
} from "../cad-document";
import type { CadImageDefinition } from "../cad-entities-v4";
import type { CadEntityCommand } from "../entity-commands";
import type { CadNativeEntity } from "../entity-runtime";
import { cadPointInsideBoundary, cadXclipRectangle, type CadXclip } from "../xref/xclip";
import { CAD_PDF_UNDERLAY_METADATA_KEY } from "./underlay-key";

type CadImageEntity = Extract<CadEntity, { type: "image" }>;

type CadPdfDocument = Pick<CadDocument, "entities" | "layers" | "imageDefinitions">;

/** Milímetros por punto PostScript: el sustrato a tamaño de papel. */
export const CAD_PDF_UNDERLAY_MM_PER_POINT = 25.4 / 72;

// La clave se define en `underlay-key.ts`, un módulo de veinte líneas que el
// editor puede importar sin traerse el parser entero (ver su cabecera). Se
// reexporta desde aquí para que quien ya la importaba siga haciéndolo igual.
export { CAD_PDF_UNDERLAY_METADATA_KEY } from "./underlay-key";

const safe = (value: string) =>
  value.trim().replace(/[^a-z0-9_.:-]+/gi, "-").slice(0, 96) || "pdf";

export const cadPdfUnderlayPrefix = (id: string) => `pdfunderlay:${safe(id)}`;
export const cadPdfUnderlayEntityId = (id: string) => `${cadPdfUnderlayPrefix(id)}:entity`;
export const cadPdfUnderlayDefinitionId = (id: string) => `${cadPdfUnderlayPrefix(id)}:def`;
export const cadPdfUnderlayLayerId = (id: string) => `${cadPdfUnderlayPrefix(id)}:layer`;

/**
 * La ficha del sustrato, guardada como JSON en los metadatos de la entidad.
 *
 * Va en metadatos por lo mismo que el recorte de `XCLIP`: `CadEntity` no tiene
 * campo para «qué página de qué PDF es esto», y los metadatos son el bolsillo
 * que el esquema ya ofrece. Lo que SÍ tiene campo propio —el desvanecido, el
 * recorte, la colocación— vive en su campo y no aquí duplicado, porque dos
 * verdades sobre lo mismo acaban discrepando.
 */
export interface CadPdfUnderlay {
  /** Página adjuntada, 1-based. */
  page: number;
  pageCount: number;
  /** Tamaño de la página en PUNTOS, con el giro del PDF ya aplicado. */
  pageWidthPt: number;
  pageHeightPt: number;
  /** Giro que declaraba la página y que ya está incorporado al tamaño. */
  pageRotation: number;
  fileName: string;
  uri: string;
  contentHash?: string;
  /** Unidades de dibujo por punto. Lo que cambia al escalar a medida conocida. */
  unitsPerPoint: number;
  /** `true` cuando el sustrato está bloqueado para poder dibujar encima. */
  locked: boolean;
  status: "loaded" | "unloaded" | "not_found";
}

/** Una página del PDF, tal como la devuelve `readCadPdfPageList`. */
export interface CadPdfUnderlayPage {
  number: number;
  widthMm: number;
  heightMm: number;
  rotate: number;
}

export interface CadPdfUnderlaySource {
  /** Dónde vive el archivo. Se guarda para poder recargarlo. */
  uri: string;
  fileName: string;
  pages: readonly CadPdfUnderlayPage[];
  contentHash?: string;
  tenantId?: string;
  assetId?: string;
}

export interface CadPdfAttachInput {
  id: string;
  source: CadPdfUnderlaySource;
  /** Página a adjuntar, 1-based. Por defecto la primera. */
  page?: number;
  /** Dónde cae la esquina inferior izquierda de la lámina. */
  insertion?: Partial<CadPoint3>;
  /** Giro del sustrato en el dibujo, en radianes. */
  rotation?: number;
  /** Multiplicador sobre el tamaño de papel. 1 = tamaño real de la lámina. */
  scale?: number;
  /** Desvanecido 0–100. 0 es opaco. */
  fade?: number;
  /** `false` deja el sustrato editable. Por defecto se BLOQUEA. */
  locked?: boolean;
  /** Nombre de la capa. Por defecto se deriva del archivo. */
  layerName?: string;
}

const finite = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Number(value) : fallback;

/** Lee la ficha del sustrato de una entidad, o `null` si no lo es. */
export function cadPdfUnderlayOf(entity: Pick<CadEntity, "context">): CadPdfUnderlay | null {
  const raw = entity.context?.metadata?.[CAD_PDF_UNDERLAY_METADATA_KEY];
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as CadPdfUnderlay;
    if (!Number.isFinite(parsed.pageWidthPt) || !Number.isFinite(parsed.pageHeightPt)) return null;
    if (!Number.isFinite(parsed.unitsPerPoint) || parsed.unitsPerPoint <= 0) return null;
    return parsed;
  } catch {
    // Una ficha ilegible NO puede hacer desaparecer el sustrato del gestor: se
    // devuelve `null` y la entidad sigue ahí como una imagen cualquiera, que es
    // exactamente lo que es. Al revés —tratarla como sustrato roto y borrarla—
    // perdería el trabajo por un JSON corrupto.
    return null;
  }
}

const writeUnderlay = (entityId: string, underlay: CadPdfUnderlay | null): CadEntityCommand => ({
  type: "metadata",
  entityId,
  patch: {
    [CAD_PDF_UNDERLAY_METADATA_KEY]: underlay ? JSON.stringify(underlay) : null,
  },
});

/** El sustrato de un documento, por id o por nombre de archivo. */
export function cadFindPdfUnderlay(
  document: Pick<CadDocument, "entities">,
  key: string,
): { entity: CadImageEntity; underlay: CadPdfUnderlay } | null {
  const needle = key.trim().toLocaleLowerCase();
  const candidates = document.entities.filter(
    (entity): entity is CadImageEntity => entity.type === "image",
  );
  for (const entity of candidates) {
    const underlay = cadPdfUnderlayOf(entity);
    if (!underlay) continue;
    if (
      entity.id === key ||
      entity.id === cadPdfUnderlayEntityId(key) ||
      underlay.fileName.toLocaleLowerCase() === needle
    )
      return { entity, underlay };
  }
  return null;
}

export function cadPdfUnderlayLayer(id: string, name: string): CadLayerDef {
  return {
    id: cadPdfUnderlayLayerId(id),
    name: `PDF-${safe(name)}`,
    // Un gris apagado: el sustrato es fondo, y una capa de fondo con color vivo
    // compite con lo que se dibuja encima, que es justo lo contrario de para lo
    // que sirve.
    color: "#8a8a8a",
    visible: true,
    // Bloqueada de nacimiento. Es la diferencia entre calcar cómodo y pasarse la
    // tarde designando por error la lámina de fondo en vez del muro nuevo.
    locked: true,
    plot: false,
  };
}

/**
 * Órdenes que ADJUNTAN el PDF: capa, definición y entidad, en una transacción.
 *
 * La entidad nace con `drawOrder: "back"`. No es un detalle: un sustrato al
 * frente tapa el dibujo, y el usuario acabaría dibujando a ciegas. Es la misma
 * decisión que toma un HATCH y por la misma razón.
 */
export function cadPdfAttachCommands(
  document: CadPdfDocument,
  input: CadPdfAttachInput,
): CadEntityCommand[] {
  const page = input.page ?? 1;
  const info = input.source.pages.find((candidate) => candidate.number === page);
  if (!info)
    throw new Error(
      `El PDF tiene ${input.source.pages.length} página(s) y se pidió la ${page}.`,
    );
  const entityId = cadPdfUnderlayEntityId(input.id);
  if (document.entities.some((entity) => entity.id === entityId))
    throw new Error(`El PDF ${input.id} ya está adjuntado.`);

  const scale = finite(input.scale, 1);
  if (scale <= 0) throw new Error("La escala del sustrato tiene que ser mayor que cero.");
  const unitsPerPoint = CAD_PDF_UNDERLAY_MM_PER_POINT * scale;
  // El tamaño llega en milímetros de papel; la unidad nativa del sustrato es el
  // punto, así que se convierte UNA vez y aquí.
  const pageWidthPt = info.widthMm / CAD_PDF_UNDERLAY_MM_PER_POINT;
  const pageHeightPt = info.heightMm / CAD_PDF_UNDERLAY_MM_PER_POINT;

  const rotation = finite(input.rotation, 0);
  const insertion: CadPoint3 = {
    x: finite(input.insertion?.x, 0),
    y: finite(input.insertion?.y, 0),
    z: finite(input.insertion?.z, 0),
  };

  const definition: CadImageDefinition = {
    id: cadPdfUnderlayDefinitionId(input.id),
    name: `${input.source.fileName} · p.${page}`,
    uri: input.source.uri,
    // «Píxeles» es el nombre del campo; el contenido son PUNTOS, que es la
    // unidad real del archivo. Se redondea al alza para no declarar una lámina
    // más pequeña de lo que es.
    pixelWidth: Math.ceil(pageWidthPt),
    pixelHeight: Math.ceil(pageHeightPt),
    loaded: true,
    ...(input.source.contentHash ? { contentHash: input.source.contentHash } : {}),
    ...(input.source.tenantId ? { tenantId: input.source.tenantId } : {}),
    ...(input.source.assetId ? { assetId: input.source.assetId } : {}),
  };

  const layer = cadPdfUnderlayLayer(input.id, input.layerName ?? input.source.fileName);
  const locked = input.locked !== false;
  const underlay: CadPdfUnderlay = {
    page,
    pageCount: input.source.pages.length,
    pageWidthPt,
    pageHeightPt,
    pageRotation: info.rotate,
    fileName: input.source.fileName,
    uri: input.source.uri,
    ...(input.source.contentHash ? { contentHash: input.source.contentHash } : {}),
    unitsPerPoint,
    locked,
    status: "loaded",
  };

  const entity: CadImageEntity = {
    id: entityId,
    type: "image",
    definition: definition.id,
    insertion,
    ...vectorsFor(unitsPerPoint, rotation),
    size: { width: pageWidthPt, height: pageHeightPt },
    fade: Math.max(0, Math.min(100, finite(input.fade, 0))),
    showImage: true,
    layer: layer.id,
    context: {
      editable: !locked,
      metadata: { [CAD_PDF_UNDERLAY_METADATA_KEY]: JSON.stringify(underlay) },
      ...(input.source.tenantId && input.source.assetId
        ? {
            businessLink: {
              tenantId: input.source.tenantId,
              entityType: "cadPdfUnderlay",
              entityId: input.source.assetId,
            },
          }
        : {}),
    },
  };

  return [
    { type: "layer", op: "upsert", layer: { ...layer, locked } },
    { type: "image-definition", definition },
    { type: "insert", entity: entity as CadNativeEntity, drawOrder: "back" },
  ];
}

/**
 * `uVector` y `vVector`: cuánto mide UN punto del PDF en el dibujo, con el giro
 * dentro.
 *
 * Son vectores y no una escala más un ángulo a propósito: bajo una transformada
 * van por la parte lineal, así que reflejar el sustrato lo deja realmente
 * espejado en vez de girado, que es lo que pasaría con un ángulo suelto.
 */
function vectorsFor(unitsPerPoint: number, rotation: number): Pick<CadImageEntity, "uVector" | "vVector"> {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    uVector: { x: cos * unitsPerPoint, y: sin * unitsPerPoint, z: 0 },
    vVector: { x: -sin * unitsPerPoint, y: cos * unitsPerPoint, z: 0 },
  };
}

/** Escala y giro que llevan dentro los vectores de una entidad. */
export function cadPdfUnderlayPlacement(entity: CadImageEntity): {
  unitsPerPoint: number;
  rotation: number;
} {
  const unitsPerPoint = Math.hypot(entity.uVector.x, entity.uVector.y) || 1;
  return { unitsPerPoint, rotation: Math.atan2(entity.uVector.y, entity.uVector.x) };
}

function replaceEntity(entity: CadImageEntity): CadEntityCommand {
  return { type: "replace", entityId: entity.id, entity: entity as CadNativeEntity };
}

function found(
  document: Pick<CadDocument, "entities">,
  id: string,
): { entity: CadImageEntity; underlay: CadPdfUnderlay } {
  const target = cadFindPdfUnderlay(document, id);
  if (!target) throw new Error(`No hay ningún PDF adjuntado con el nombre o el id «${id}».`);
  return target;
}

/** DESADJUNTAR: se va la lámina, su definición y su capa. */
export function cadPdfDetachCommands(document: CadPdfDocument, id: string): CadEntityCommand[] {
  const { entity } = found(document, id);
  const commands: CadEntityCommand[] = [{ type: "delete", entityId: entity.id }];
  // La capa queda VACÍA en este mismo lote —la única entidad que la ocupaba se
  // borra arriba— así que se retira. Dejarla llenaría el gestor de capas de
  // restos de sustratos que ya nadie usa.
  if (document.layers.some((layer) => layer.id === entity.layer))
    commands.push({
      type: "layer",
      op: "delete",
      name: document.layers.find((layer) => layer.id === entity.layer)!.name,
      reassignTo: document.layers.find((layer) => layer.id !== entity.layer)?.name ?? "0",
    });
  return commands;
}

/**
 * DESCARGAR conserva la ficha y la ruta: sólo deja de mostrarse.
 *
 * Es lo que permite trabajar sin el peso del sustrato en pantalla y volver a
 * cargarlo sin ir a buscar el archivo, exactamente como un xref descargado.
 */
export function cadPdfUnloadCommands(document: CadPdfDocument, id: string): CadEntityCommand[] {
  const { entity, underlay } = found(document, id);
  if (underlay.status === "unloaded") return [];
  return [
    replaceEntity({ ...entity, showImage: false }),
    writeUnderlay(entity.id, { ...underlay, status: "unloaded" }),
  ];
}

export function cadPdfReloadCommands(document: CadPdfDocument, id: string): CadEntityCommand[] {
  const { entity, underlay } = found(document, id);
  return [
    replaceEntity({ ...entity, showImage: true }),
    writeUnderlay(entity.id, { ...underlay, status: "loaded" }),
  ];
}

/** Desvanecido 0–100. Es lo que deja ver el dibujo por encima del sustrato. */
export function cadPdfUnderlayFadeCommands(
  document: CadPdfDocument,
  id: string,
  fade: number,
): CadEntityCommand[] {
  const { entity } = found(document, id);
  if (!Number.isFinite(fade) || fade < 0 || fade > 100)
    throw new Error("El desvanecido del sustrato va de 0 a 100.");
  return [replaceEntity({ ...entity, fade })];
}

/**
 * BLOQUEAR o desbloquear el sustrato.
 *
 * Bloquea la CAPA, no sólo la entidad: es lo que impide designarlo por error al
 * arrastrar una ventana de selección sobre el dibujo, que es donde de verdad
 * estorba. La ficha guarda el estado para que el gestor lo enseñe sin tener que
 * ir a mirar la tabla de capas.
 */
export function cadPdfUnderlayLockCommands(
  document: CadPdfDocument,
  id: string,
  locked: boolean,
): CadEntityCommand[] {
  const { entity, underlay } = found(document, id);
  const layer = document.layers.find((candidate) => candidate.id === entity.layer);
  const commands: CadEntityCommand[] = [];
  if (layer) commands.push({ type: "layer", op: "upsert", layer: { ...layer, locked } });
  commands.push(
    replaceEntity({ ...entity, context: { ...entity.context, editable: !locked } }),
    writeUnderlay(entity.id, { ...underlay, locked }),
  );
  return commands;
}

/**
 * PDFCLIP: recortar la lámina para enseñar sólo la parte que interesa.
 *
 * ## Por qué NO usa el bolsillo de metadatos de XCLIP
 *
 * Una entidad `image` SÍ tiene campo de recorte en el esquema —`clipBoundary`,
 * en coordenadas de la definición— mientras que un INSERT no lo tiene y por eso
 * `XCLIP` tuvo que guardarlo en metadatos. Escribir en el campo real es mejor:
 * lo ve el render, lo ve la exportación y no hace falta que nadie recuerde una
 * clave. Lo que SÍ se reutiliza de `xclip.ts` es su geometría —el rectángulo por
 * dos esquinas y el «¿está dentro este punto?»—, que es la parte difícil y la
 * que no tiene ningún sentido escribir dos veces.
 *
 * El contorno llega en coordenadas de MUNDO, que es como el usuario lo designa,
 * y se convierte a coordenadas de la lámina aquí.
 */
export function cadPdfClipCommands(
  document: CadPdfDocument,
  id: string,
  boundary: readonly CadPoint2[],
  options: { inverted?: boolean } = {},
): CadEntityCommand[] {
  const { entity } = found(document, id);
  if (boundary.length < 3)
    throw new Error("Un contorno de recorte necesita al menos tres vértices.");
  if (options.inverted)
    // Un recorte INVERTIDO sobre una lámina exigiría un contorno con agujero, que
    // `clipBoundary` no sabe expresar. Se rechaza en vez de guardarlo y enseñar
    // lo contrario de lo que el usuario pidió.
    throw new Error(
      "El recorte invertido no está disponible en un sustrato de PDF: recorta la zona que quieres ver.",
    );

  const local = boundary.map((point) => worldToPage(entity, point));
  const inside = local.filter(
    (point) =>
      point.x >= -1 &&
      point.y >= -1 &&
      point.x <= entity.size.width + 1 &&
      point.y <= entity.size.height + 1,
  );
  if (inside.length === 0)
    throw new Error("El contorno de recorte no toca la lámina: no quedaría nada visible.");

  return [
    replaceEntity({
      ...entity,
      clipBoundary: local.map((point) => ({ x: point.x, y: point.y, z: 0 })),
    }),
  ];
}

export function cadPdfDeleteClipCommands(document: CadPdfDocument, id: string): CadEntityCommand[] {
  const { entity } = found(document, id);
  const next = { ...entity };
  delete next.clipBoundary;
  return [replaceEntity(next)];
}

/** De coordenadas del dibujo a coordenadas de la lámina, en puntos. */
export function worldToPage(entity: CadImageEntity, point: CadPoint2): CadPoint2 {
  const dx = point.x - entity.insertion.x;
  const dy = point.y - entity.insertion.y;
  const { unitsPerPoint, rotation } = cadPdfUnderlayPlacement(entity);
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  return {
    x: (dx * cos - dy * sin) / unitsPerPoint,
    y: (dx * sin + dy * cos) / unitsPerPoint,
  };
}

/** `true` si el punto del dibujo cae dentro de la parte visible de la lámina. */
export function cadPdfUnderlayContains(entity: CadImageEntity, point: CadPoint2): boolean {
  const local = worldToPage(entity, point);
  if (local.x < 0 || local.y < 0 || local.x > entity.size.width || local.y > entity.size.height)
    return false;
  if (!entity.clipBoundary?.length) return true;
  return cadPointInsideBoundary(local, entity.clipBoundary);
}

/** Rectángulo de recorte por dos esquinas, en coordenadas de mundo. */
export const cadPdfClipRectangle = cadXclipRectangle;

/** El recorte de la lámina expresado como el contorno que ya conoce `XCLIP`. */
export function cadPdfClipAsXclip(entity: CadImageEntity): CadXclip | null {
  if (!entity.clipBoundary?.length) return null;
  return { boundary: entity.clipBoundary.map((point) => ({ x: point.x, y: point.y })), enabled: true };
}

export interface CadPdfScaleToDistanceResult {
  commands: CadEntityCommand[];
  /** Cuánto medía en el dibujo lo designado, antes de escalar. */
  measured: number;
  /** El factor aplicado. `2` significa que el sustrato duplicó su tamaño. */
  factor: number;
  /** La escala resultante, en unidades de dibujo por punto de PDF. */
  unitsPerPoint: number;
}

/**
 * ESCALAR A MEDIDA CONOCIDA: la operación que hace útil calcar.
 *
 * El arquitecto designa dos puntos sobre la lámina —los extremos de una cota que
 * el plano ya lleva escrita— y dice cuánto miden de verdad. Todo el sustrato se
 * reescala alrededor del PRIMER punto, que se queda quieto: así lo que el
 * usuario acaba de señalar sigue debajo del cursor y no hay que buscarlo otra
 * vez al otro lado de la pantalla.
 *
 * Falla cerrado ante los dos casos que producirían una escala absurda: dos
 * puntos que son el mismo —división por cero— y una medida real de cero o
 * negativa. Un factor inventado aquí escala el plano ENTERO y no se nota hasta
 * que alguien acota.
 */
export function cadPdfScaleToDistanceCommands(
  document: CadPdfDocument,
  id: string,
  from: CadPoint2,
  to: CadPoint2,
  realDistance: number,
): CadPdfScaleToDistanceResult {
  const { entity, underlay } = found(document, id);
  const measured = Math.hypot(to.x - from.x, to.y - from.y);
  if (!(measured > 1e-9))
    throw new Error(
      "Los dos puntos designados son el mismo: designa los extremos de algo que tenga longitud.",
    );
  if (!Number.isFinite(realDistance) || realDistance <= 0)
    throw new Error("La medida real tiene que ser un número mayor que cero.");

  const factor = realDistance / measured;
  const { unitsPerPoint, rotation } = cadPdfUnderlayPlacement(entity);
  const scaled = unitsPerPoint * factor;
  // La inserción se mueve para que `from` se quede quieto: es un homotecia de
  // centro `from`. Escalar sin mover el origen desplazaría la lámina entera y el
  // punto que el usuario acaba de designar acabaría fuera de la pantalla.
  const insertion: CadPoint3 = {
    x: from.x + (entity.insertion.x - from.x) * factor,
    y: from.y + (entity.insertion.y - from.y) * factor,
    z: entity.insertion.z,
  };

  return {
    commands: [
      replaceEntity({ ...entity, insertion, ...vectorsFor(scaled, rotation) }),
      writeUnderlay(entity.id, { ...underlay, unitsPerPoint: scaled }),
    ],
    measured,
    factor,
    unitsPerPoint: scaled,
  };
}

/** Mover, girar o escalar el sustrato a mano. */
export function cadPdfUnderlayTransformCommands(
  document: CadPdfDocument,
  id: string,
  change: { move?: CadPoint2; rotate?: number; scale?: number; about?: CadPoint2 },
): CadEntityCommand[] {
  const { entity, underlay } = found(document, id);
  const { unitsPerPoint, rotation } = cadPdfUnderlayPlacement(entity);
  const factor = finite(change.scale, 1);
  if (factor <= 0) throw new Error("La escala del sustrato tiene que ser mayor que cero.");
  const turn = finite(change.rotate, 0);
  const pivot = change.about ?? { x: entity.insertion.x, y: entity.insertion.y };

  // Girar y escalar alrededor del mismo punto, en un solo paso: encadenar dos
  // transformadas parciales acumularía error de redondeo en cada llamada, y un
  // sustrato que se descoloca poco a poco es más difícil de detectar que uno que
  // se descoloca de golpe.
  const dx = entity.insertion.x - pivot.x;
  const dy = entity.insertion.y - pivot.y;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const insertion: CadPoint3 = {
    x: pivot.x + (dx * cos - dy * sin) * factor + finite(change.move?.x, 0),
    y: pivot.y + (dx * sin + dy * cos) * factor + finite(change.move?.y, 0),
    z: entity.insertion.z,
  };
  const scaled = unitsPerPoint * factor;
  return [
    replaceEntity({ ...entity, insertion, ...vectorsFor(scaled, rotation + turn) }),
    writeUnderlay(entity.id, { ...underlay, unitsPerPoint: scaled }),
  ];
}

export interface CadPdfUnderlayRow {
  id: string;
  fileName: string;
  page: number;
  pageCount: number;
  status: CadPdfUnderlay["status"];
  locked: boolean;
  fade: number;
  clipped: boolean;
  /** Tamaño que ocupa en el dibujo, en unidades del documento. */
  width: number;
  height: number;
  /** Escala frente al tamaño de papel. 1 = la lámina mide lo que mide en papel. */
  scale: number;
  layerId: string;
}

/**
 * El GESTOR: lo que el arquitecto ve en el panel de referencias.
 *
 * Devuelve el ancho y el alto que el sustrato ocupa DE VERDAD en el dibujo, no
 * el de la página. Es el número que permite darse cuenta de que la lámina está a
 * una escala absurda antes de haber calcado media planta encima.
 */
export function cadPdfUnderlayList(
  document: Pick<CadDocument, "entities">,
): CadPdfUnderlayRow[] {
  const rows: CadPdfUnderlayRow[] = [];
  for (const entity of document.entities) {
    if (entity.type !== "image") continue;
    const underlay = cadPdfUnderlayOf(entity);
    if (!underlay) continue;
    const { unitsPerPoint } = cadPdfUnderlayPlacement(entity);
    rows.push({
      id: entity.id,
      fileName: underlay.fileName,
      page: underlay.page,
      pageCount: underlay.pageCount,
      status: underlay.status,
      locked: underlay.locked,
      fade: entity.fade ?? 0,
      clipped: (entity.clipBoundary?.length ?? 0) >= 3,
      width: entity.size.width * unitsPerPoint,
      height: entity.size.height * unitsPerPoint,
      scale: unitsPerPoint / CAD_PDF_UNDERLAY_MM_PER_POINT,
      layerId: entity.layer,
    });
  }
  return rows.sort((a, b) => a.fileName.localeCompare(b.fileName) || a.page - b.page);
}

/** Cambia de página sin volver a adjuntar. Conserva sitio, escala y recorte. */
export function cadPdfUnderlayPageCommands(
  document: CadPdfDocument,
  id: string,
  page: number,
  pages: readonly CadPdfUnderlayPage[],
): CadEntityCommand[] {
  const { entity, underlay } = found(document, id);
  const info = pages.find((candidate) => candidate.number === page);
  if (!info) throw new Error(`El PDF no tiene la página ${page}.`);
  const pageWidthPt = info.widthMm / CAD_PDF_UNDERLAY_MM_PER_POINT;
  const pageHeightPt = info.heightMm / CAD_PDF_UNDERLAY_MM_PER_POINT;
  const changedSize =
    Math.abs(pageWidthPt - underlay.pageWidthPt) > 0.5 ||
    Math.abs(pageHeightPt - underlay.pageHeightPt) > 0.5;
  return [
    replaceEntity({
      ...entity,
      size: { width: pageWidthPt, height: pageHeightPt },
      // Un recorte hecho sobre OTRA página no significa nada en esta: se retira
      // en vez de aplicarlo a ciegas y esconder media lámina nueva.
      ...(changedSize && entity.clipBoundary ? { clipBoundary: undefined } : {}),
    }),
    writeUnderlay(entity.id, {
      ...underlay,
      page,
      pageWidthPt,
      pageHeightPt,
      pageRotation: info.rotate,
    }),
  ];
}
