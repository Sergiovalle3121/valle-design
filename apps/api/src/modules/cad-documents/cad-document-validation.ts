import { BadRequestException } from '@nestjs/common';
import { CAD_DOCUMENT_LIMITS } from '@valle-design/contracts';
/**
 * Las invariantes POR TIPO viven en `cad-entity-invariants.ts`: aquí se valida
 * la FORMA del documento y allí la GEOMETRÍA de cada entidad. `objectValue` y
 * `stringValue` se comparten desde allí para que no haya dos versiones de
 * «esto no es un objeto» que puedan divergir.
 */
import {
  assertNoNestedOpenings,
  assertOpeningHosts,
} from './cad-opening-invariants';
import {
  assertEntityInvariants,
  objectValue,
  stringValue,
} from './cad-entity-invariants';

export type PersistedCadDocument = Record<string, unknown>;

/**
 * Última versión de esquema que este servidor sabe validar.
 *
 * Sube CON el cliente, nunca después: el cliente escribe el número nuevo desde
 * el primer guardado, y un servidor que se quedara en el anterior convertiría
 * cada guardado en un 400 sin que nada estuviera roto. El 8 estrena la cámara
 * de la ventana gráfica, que valida `assertViewportView`; el 9 es puramente
 * aditivo — `frozen` en la capa y la sección opcional `layerStates`. El 10
 * también es puramente aditivo — siete campos opcionales-ausentes sobre
 * `dimension` (DIMTXT/DIMTXSTY/DIMCLRT/DIMCLRD/DIMCLRE/DIMTAD/DIMJUST, ver
 * `cad-entities-v10.ts` en el cliente): ninguno introduce una forma nueva que
 * este validador deba comprobar por campo, igual que `frozen`/`layerStates`
 * en el 9.
 *
 * Este número se quedó en 9 mientras el cliente ya llevaba semanas en 10
 * (`CAD_DOCUMENT_SCHEMA` en `cad-document-shared.ts`) — exactamente el modo
 * de fallo que este comentario lleva años advirtiendo: cualquier documento
 * que pasara por `migrateCadDocument` en el cliente (TODOS, al abrirse — ver
 * su comentario: escribe `meta.schema = CAD_DOCUMENT_SCHEMA` sin excepción)
 * y se guardara después, recibía un 400 sin que nada estuviera roto.
 * Encontrado y corregido dos veces, de forma independiente y por vías
 * distintas: durante la campaña 3D-M1 (ver
 * `docs/history/execution/CAMPANA_3D_M1_20260824.md` para la evidencia completa) y
 * durante el cierre M1 de DWG, ahí por un E2E real (API + Postgres, no
 * mockeado) al guardar un documento importado — el techo desactualizado no
 * era específico de DWG, afectaba cualquier guardado.
 */
// Los NÚMEROS viven en el contrato (`CAD_DOCUMENT_LIMITS`,
// @valle-design/contracts) y aquí sólo se consumen: este archivo llegó a
// redeclararlos y el espejo divergió sin que ningún gate lo viera
// (maxArchiveBytes bajó a 32 MiB aquí y el contrato siguió diciendo 128).
// Una cifra no vive en dos lugares. El razonamiento de cada techo acompaña
// al número en el contrato.
export const CAD_DOCUMENT_MAX_SCHEMA = CAD_DOCUMENT_LIMITS.maxSchema;
export const CAD_DOCUMENT_MAX_INLINE_BYTES = CAD_DOCUMENT_LIMITS.maxInlineBytes;
export const CAD_DOCUMENT_MAX_ARCHIVE_BYTES =
  CAD_DOCUMENT_LIMITS.maxArchiveBytes;
const MAX_ENTITIES = CAD_DOCUMENT_LIMITS.maxEntities;
const MAX_BLOCKS = CAD_DOCUMENT_LIMITS.maxBlocks;
const MAX_CONSTRAINTS = CAD_DOCUMENT_LIMITS.maxConstraints;
const MAX_PAPER_SPACES = CAD_DOCUMENT_LIMITS.maxPaperSpaces;
const MAX_VIEWPORTS_PER_PAPER_SPACE =
  CAD_DOCUMENT_LIMITS.maxViewportsPerPaperSpace;
const MAX_PUBLICATIONS = CAD_DOCUMENT_LIMITS.maxEmbeddedPublications;
const MAX_CAD_VERSIONS = CAD_DOCUMENT_LIMITS.maxCollaborationVersions;
const MAX_REVIEW_THREADS = CAD_DOCUMENT_LIMITS.maxReviewThreads;
const MAX_REVIEW_LINKS = CAD_DOCUMENT_LIMITS.maxReviewLinks;
const MAX_COLLABORATION_AUDIT_EVENTS =
  CAD_DOCUMENT_LIMITS.maxCollaborationAuditEvents;
const MAX_DEPTH = CAD_DOCUMENT_LIMITS.maxNestingDepth;

function finitePositive(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

const VIEWPORT_VIEW_KINDS = new Set(['plan', 'elevation', 'section', 'detail']);

function finiteVector(
  value: unknown,
): { x: number; y: number; z: number } | null {
  const point = objectValue(value);
  if (!point) return null;
  const { x, y, z } = point as { x: unknown; y: unknown; z: unknown };
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof z !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    return null;
  }
  return { x, y, z };
}

function vectorLength(v: { x: number; y: number; z: number }): number {
  return Math.hypot(v.x, v.y, v.z);
}

/**
 * La CÁMARA de una ventana gráfica (esquema 8).
 *
 * Se valida en la frontera y no sólo en el cliente porque una cámara
 * degenerada —dirección nula, o una vertical paralela a la mirada— no produce
 * un dibujo feo: no produce NINGÚN dibujo, y el fallo aparece al trazar, lejos
 * del guardado que lo metió. Es exactamente el caso que la regla de fallo
 * cerrado existe para atajar: se rechaza al entrar, con el motivo.
 *
 * El campo es opcional a propósito. Un documento del esquema 7 llega sin él y
 * la migración del cliente le escribe la planta explícita al abrirlo; exigirlo
 * aquí rechazaría al guardar documentos que nunca han pasado por esa puerta,
 * como los que fabrica un importador o un seed.
 */
function assertViewportView(rawView: unknown): void {
  if (rawView === undefined) return;
  const view = objectValue(rawView);
  if (!view) {
    throw new BadRequestException(
      'CadDocument viewport view debe ser un objeto.',
    );
  }
  if (view.projection !== 'parallel') {
    throw new BadRequestException(
      'CadDocument sólo admite ventanas con proyección paralela.',
    );
  }
  if (typeof view.kind !== 'string' || !VIEWPORT_VIEW_KINDS.has(view.kind)) {
    throw new BadRequestException(
      'CadDocument requiere una clase de vista conocida en cada ventana.',
    );
  }
  const target = finiteVector(view.target);
  const direction = finiteVector(view.direction);
  const up = finiteVector(view.up);
  if (!target || !direction || !up) {
    throw new BadRequestException(
      'CadDocument requiere target, direction y up finitos en la vista de la ventana.',
    );
  }
  const directionLength = vectorLength(direction);
  const upLength = vectorLength(up);
  if (!(directionLength > 0) || !(upLength > 0)) {
    throw new BadRequestException(
      'CadDocument rechaza vistas con dirección o vertical de longitud cero.',
    );
  }
  // Vertical paralela a la mirada: el «arriba» del papel no queda definido y
  // la vista no se puede componer. Se mide con el coseno para que la prueba no
  // dependa de la escala con que llegaran los vectores.
  const cosine =
    (direction.x * up.x + direction.y * up.y + direction.z * up.z) /
    (directionLength * upLength);
  if (Math.abs(cosine) > 1 - 1e-9) {
    throw new BadRequestException(
      'CadDocument rechaza vistas cuya vertical es paralela a la dirección de mirada.',
    );
  }
  if (view.kind === 'section') {
    const plane = objectValue(view.sectionPlane);
    const normal = plane ? finiteVector(plane.normal) : null;
    if (
      !plane ||
      !finiteVector(plane.origin) ||
      !normal ||
      !(vectorLength(normal) > 0)
    ) {
      throw new BadRequestException(
        'CadDocument requiere un plano de corte válido en las ventanas de sección.',
      );
    }
  }
}

function inspect(value: unknown, maxBytes: number, depth = 0): void {
  if (depth > MAX_DEPTH) {
    throw new BadRequestException(
      'CadDocument excede la profundidad permitida.',
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new BadRequestException('CadDocument contiene números no finitos.');
  }
  if (typeof value === 'string' && value.length > maxBytes) {
    throw new BadRequestException(
      'CadDocument contiene una cadena demasiado grande.',
    );
  }
  if (Array.isArray(value)) {
    for (const item of value) inspect(item, maxBytes, depth + 1);
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (key.length > 128)
        throw new BadRequestException(
          'CadDocument contiene una clave demasiado larga.',
        );
      inspect(nested, maxBytes, depth + 1);
    }
  }
}

/** Tope de definiciones de imagen: un catálogo, no un almacén de archivos. */
const MAX_IMAGE_DEFINITIONS = 500;

/**
 * Catálogo de imágenes del esquema 4, y las IMAGE que lo referencian.
 *
 * Es la misma clase de comprobación que ya se le hacía a los bloques: una
 * inserción que apunta a una definición inexistente no es un documento «raro»,
 * es una referencia rota que el editor no puede resolver y que sólo se
 * descubre cuando alguien abre el plano.
 *
 * `uri` se exige ABSOLUTO y con esquema. Una ruta local del navegador
 * (`C:\\...`) es a la vez una filtración de la máquina de quien dibujó y una
 * referencia que ningún otro usuario podrá resolver.
 */
function assertImageDefinitions(document: PersistedCadDocument): void {
  const definitions = document.imageDefinitions;
  const known = new Set<string>();
  if (definitions !== undefined) {
    if (!Array.isArray(definitions)) {
      throw new BadRequestException(
        'CadDocument imageDefinitions debe ser un arreglo.',
      );
    }
    if (definitions.length > MAX_IMAGE_DEFINITIONS) {
      throw new BadRequestException(
        `CadDocument admite máximo ${MAX_IMAGE_DEFINITIONS} definiciones de imagen.`,
      );
    }
    for (const raw of definitions) {
      const definition = objectValue(raw);
      const id = stringValue(definition?.id).trim();
      if (!id || id.length > 128 || known.has(id)) {
        throw new BadRequestException(
          'CadDocument requiere ids de definición de imagen únicos y no vacíos.',
        );
      }
      known.add(id);
      const uri = stringValue(definition?.uri).trim();
      if (!uri || !/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) {
        throw new BadRequestException(
          `CadDocument: la definición de imagen ${id} necesita un URI absoluto de asset.`,
        );
      }
      if (
        !finitePositive(definition?.pixelWidth) ||
        !finitePositive(definition?.pixelHeight)
      ) {
        throw new BadRequestException(
          `CadDocument: la definición de imagen ${id} necesita un tamaño en píxeles positivo.`,
        );
      }
    }
  }

  const entities = document.entities;
  if (!Array.isArray(entities)) return;
  for (const raw of entities) {
    const entity = objectValue(raw);
    if (entity?.type !== 'image') continue;
    const definition = stringValue(entity.definition).trim();
    if (!known.has(definition)) {
      throw new BadRequestException(
        `CadDocument: la imagen ${stringValue(entity.id) || '(sin id)'} referencia la definición inexistente ${definition || '(vacía)'}.`,
      );
    }
  }
}

/**
 * Referencias de RESTRICCIONES y PARÁMETROS.
 *
 * Borrar una entidad sin retirar sus restricciones dejaba referencias
 * colgantes que el solver sólo podía reportar como issue y que la frontera
 * persistía sin protesta. El cliente actual las retira en la MISMA transacción
 * del borrado y sanea documentos heredados al abrirlos; aquí se rechaza el
 * resto: una restricción que apunta a una entidad inexistente es la misma
 * clase de corrupción que un draw order huérfano.
 */
function assertConstraintReferences(
  document: PersistedCadDocument,
  entityIds: Set<string>,
): void {
  const constraints = document.constraints;
  if (!Array.isArray(constraints)) return;
  const parameterNames = new Set<string>();
  if (Array.isArray(document.parameters)) {
    for (const raw of document.parameters) {
      const name = stringValue(objectValue(raw)?.name).trim();
      if (name) parameterNames.add(name);
    }
  }
  for (const raw of constraints) {
    const constraint = objectValue(raw);
    const id = stringValue(constraint?.id) || '(sin id)';
    const referenced = constraint?.entityIds;
    if (!Array.isArray(referenced) || referenced.length === 0) {
      throw new BadRequestException(
        `CadDocument: la restricción ${id} necesita entityIds no vacíos.`,
      );
    }
    for (const target of referenced) {
      if (typeof target !== 'string' || !entityIds.has(target)) {
        throw new BadRequestException(
          `CadDocument: la restricción ${id} referencia la entidad inexistente ${
            typeof target === 'string' && target ? target : '(inválida)'
          }.`,
        );
      }
    }
    const parameter = constraint?.parameter;
    if (parameter !== undefined && parameter !== null) {
      if (typeof parameter !== 'string' || !parameterNames.has(parameter)) {
        throw new BadRequestException(
          `CadDocument: la restricción ${id} referencia el parámetro inexistente ${
            typeof parameter === 'string' && parameter
              ? parameter
              : '(inválido)'
          }.`,
        );
      }
    }
  }
}

/**
 * Integridad REFERENCIAL.
 *
 * El orden de dibujo que apunta a entidades inexistentes, o un bloque que se
 * contiene a sí mismo, no son documentos «raros»: son documentos corruptos que
 * cuelgan el editor al renderizar o explotar. Se rechazan en la frontera.
 */
function assertReferentialIntegrity(
  document: PersistedCadDocument,
  entityIds: Set<string>,
): void {
  const modelSpace = (document as unknown as Record<string, unknown>)
    .modelSpace as { entityIds?: unknown } | undefined;
  const drawOrder = modelSpace?.entityIds;
  if (drawOrder !== undefined) {
    if (!Array.isArray(drawOrder)) {
      throw new BadRequestException(
        'CadDocument modelSpace.entityIds debe ser un arreglo.',
      );
    }
    const seen = new Set<string>();
    for (const rawId of drawOrder) {
      const id = typeof rawId === 'string' ? rawId : '';
      if (!entityIds.has(id)) {
        throw new BadRequestException(
          `CadDocument: el orden de dibujo referencia la entidad inexistente ${id || '(vacía)'}.`,
        );
      }
      if (seen.has(id)) {
        throw new BadRequestException(
          `CadDocument: la entidad ${id} aparece dos veces en el orden de dibujo.`,
        );
      }
      seen.add(id);
    }
    // Una entidad que existe pero NO está en el orden de dibujo no se dibuja
    // jamás: está en el documento, ocupa memoria, viaja en cada guardado y el
    // usuario no puede verla ni seleccionarla. Cuando el documento declara su
    // orden, ese orden tiene que cubrirlo entero.
    for (const id of entityIds) {
      if (!seen.has(id)) {
        throw new BadRequestException(
          `CadDocument: la entidad ${id} existe pero no se dibuja: falta en el orden de dibujo.`,
        );
      }
    }
  }

  // Recursión de bloques: un ciclo cuelga render, explode y purge.
  const blocks = (document as unknown as Record<string, unknown>).blocks;
  if (!Array.isArray(blocks)) return;
  const children = new Map<string, string[]>();
  for (const rawBlock of blocks) {
    const block = objectValue(rawBlock);
    const blockId = typeof block?.id === 'string' ? block.id.trim() : '';
    // Un bloque sin id se saltaba en silencio: sus entidades no se validaban,
    // su recursión no se exploraba y ningún INSERT podía resolverlo.
    if (!blockId || blockId.length > 128) {
      throw new BadRequestException(
        'CadDocument requiere ids de bloque no vacíos.',
      );
    }
    // Dos bloques con el mismo id hacen impredecible qué resuelve un INSERT.
    if (children.has(blockId)) {
      throw new BadRequestException(
        `CadDocument: el id de bloque ${blockId} está duplicado.`,
      );
    }
    const nested = Array.isArray(block?.entities)
      ? (block.entities as unknown[])
          .map((child) => objectValue(child))
          .filter((child) => child?.type === 'insert')
          .map((child) => stringValue(child?.block))
      : [];
    children.set(blockId, nested);
  }

  /**
   * Un INSERT que apunta a un bloque INEXISTENTE es una referencia rota: el
   * editor no puede resolverlo y el explode produce nada. Antes no se
   * comprobaba en ninguno de los dos niveles — los INSERT de primer nivel ni
   * siquiera se recorrían, y un id desconocido dentro de un bloque se marcaba
   * `done` sin error.
   */
  const assertInsertResolves = (blockName: string, from: string) => {
    if (!blockName || !children.has(blockName)) {
      throw new BadRequestException(
        `CadDocument: ${from} referencia el bloque inexistente ${blockName || '(vacío)'}.`,
      );
    }
  };
  const topLevelEntities = (document as unknown as Record<string, unknown>)
    .entities;
  if (Array.isArray(topLevelEntities)) {
    for (const raw of topLevelEntities) {
      const entity = objectValue(raw);
      if (entity?.type !== 'insert') continue;
      assertInsertResolves(
        stringValue(entity.block),
        `el INSERT ${stringValue(entity.id)}`,
      );
    }
  }
  for (const [blockId, nested] of children)
    for (const child of nested)
      assertInsertResolves(child, `el bloque ${blockId}`);

  const state = new Map<string, 'visiting' | 'done'>();
  const walk = (blockId: string): void => {
    const mark = state.get(blockId);
    if (mark === 'done') return;
    if (mark === 'visiting') {
      throw new BadRequestException(
        `CadDocument: el bloque ${blockId} se contiene a sí mismo (recursión ilegal).`,
      );
    }
    state.set(blockId, 'visiting');
    for (const child of children.get(blockId) ?? []) walk(child);
    state.set(blockId, 'done');
  };
  for (const blockId of children.keys()) walk(blockId);
}

export function validateCadDocumentPayload(
  value: unknown,
  options: { maxBytes?: number } = {},
): PersistedCadDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('cadDocument debe ser un objeto.');
  }
  const maxBytes = options.maxBytes ?? CAD_DOCUMENT_MAX_INLINE_BYTES;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < CAD_DOCUMENT_MAX_INLINE_BYTES ||
    maxBytes > CAD_DOCUMENT_MAX_ARCHIVE_BYTES
  ) {
    throw new BadRequestException('Límite de CadDocument inválido.');
  }
  inspect(value, maxBytes);
  const document = value as PersistedCadDocument;
  const meta = document.meta as Record<string, unknown> | undefined;
  const schema = Number(meta?.schema);
  // El esquema 4 estrena POINT, XLINE, RAY, SOLID, WIPEOUT, IMAGE, ATTDEF y
  // TABLE. Aceptar el 4 no es opcional: el cliente ya escribe documentos con
  // ese número, y rechazarlos convertiría cada guardado en un 400.
  if (
    !Number.isInteger(schema) ||
    schema < 1 ||
    schema > CAD_DOCUMENT_MAX_SCHEMA
  ) {
    throw new BadRequestException('CadDocument schema no soportado.');
  }
  const entities = document.entities;
  if (!Array.isArray(entities) || entities.length > MAX_ENTITIES) {
    throw new BadRequestException(
      `CadDocument admite máximo ${MAX_ENTITIES} entidades.`,
    );
  }
  const ids = new Set<string>();
  for (const entity of entities) {
    const rawId =
      entity && typeof entity === 'object'
        ? (entity as Record<string, unknown>).id
        : null;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length > 128 || ids.has(id)) {
      throw new BadRequestException(
        'CadDocument requiere ids de entidad únicos y no vacíos.',
      );
    }
    ids.add(id);
  }
  if (Array.isArray(document.blocks) && document.blocks.length > MAX_BLOCKS) {
    throw new BadRequestException(
      `CadDocument admite máximo ${MAX_BLOCKS} bloques.`,
    );
  }
  if (
    Array.isArray(document.constraints) &&
    document.constraints.length > MAX_CONSTRAINTS
  ) {
    throw new BadRequestException(
      `CadDocument admite máximo ${MAX_CONSTRAINTS} restricciones.`,
    );
  }
  const paperSpaces = document.paperSpaces;
  if (paperSpaces !== undefined && !Array.isArray(paperSpaces)) {
    throw new BadRequestException(
      'CadDocument paperSpaces debe ser un arreglo.',
    );
  }
  if (Array.isArray(paperSpaces)) {
    if (paperSpaces.length > MAX_PAPER_SPACES) {
      throw new BadRequestException(
        `CadDocument admite máximo ${MAX_PAPER_SPACES} espacios de papel.`,
      );
    }
    const paperSpaceIds = new Set<string>();
    for (const rawSpace of paperSpaces) {
      const space = objectValue(rawSpace);
      const id = typeof space?.id === 'string' ? space.id.trim() : '';
      if (!id || id.length > 128 || paperSpaceIds.has(id)) {
        throw new BadRequestException(
          'CadDocument requiere ids de espacio de papel únicos y no vacíos.',
        );
      }
      paperSpaceIds.add(id);
      const page = objectValue(space?.page);
      if (!finitePositive(page?.width) || !finitePositive(page?.height)) {
        throw new BadRequestException(
          'CadDocument requiere dimensiones de papel finitas y positivas.',
        );
      }
      const viewports = space?.viewports;
      if (viewports !== undefined && !Array.isArray(viewports)) {
        throw new BadRequestException(
          'CadDocument viewports debe ser un arreglo.',
        );
      }
      if (
        Array.isArray(viewports) &&
        viewports.length > MAX_VIEWPORTS_PER_PAPER_SPACE
      ) {
        throw new BadRequestException(
          `CadDocument admite máximo ${MAX_VIEWPORTS_PER_PAPER_SPACE} viewports por hoja.`,
        );
      }
      const viewportIds = new Set<string>();
      for (const rawViewport of Array.isArray(viewports) ? viewports : []) {
        const viewport = objectValue(rawViewport);
        const viewportId =
          typeof viewport?.id === 'string' ? viewport.id.trim() : '';
        if (
          !viewportId ||
          viewportId.length > 128 ||
          viewportIds.has(viewportId)
        ) {
          throw new BadRequestException(
            'CadDocument requiere ids de viewport únicos y no vacíos por hoja.',
          );
        }
        viewportIds.add(viewportId);
        if (!finitePositive(viewport?.scale)) {
          throw new BadRequestException(
            'CadDocument requiere escalas de viewport finitas y positivas.',
          );
        }
        for (const boundsName of ['paperBounds', 'modelBounds']) {
          const bounds = objectValue(viewport?.[boundsName]);
          if (
            !finitePositive(bounds?.width) ||
            !finitePositive(bounds?.height)
          ) {
            throw new BadRequestException(
              'CadDocument requiere bounds de viewport finitos y positivos.',
            );
          }
        }
        assertViewportView(viewport?.view);
      }
    }
  }
  const publications = document.publications;
  if (publications !== undefined && !Array.isArray(publications)) {
    throw new BadRequestException(
      'CadDocument publications debe ser un arreglo.',
    );
  }
  if (Array.isArray(publications)) {
    if (publications.length > MAX_PUBLICATIONS) {
      throw new BadRequestException(
        `CadDocument admite máximo ${MAX_PUBLICATIONS} publicaciones.`,
      );
    }
    for (const rawPublication of publications) {
      const publication = objectValue(rawPublication);
      if (
        typeof publication?.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(publication.sha256) ||
        !finitePositive(publication.bytes) ||
        !Array.isArray(publication.paperSpaceIds) ||
        publication.paperSpaceIds.length === 0
      ) {
        throw new BadRequestException(
          'CadDocument contiene un registro de publicación inválido.',
        );
      }
    }
  }
  const collaboration = document.collaboration;
  if (collaboration !== undefined) {
    const state = objectValue(collaboration);
    if (!state) {
      throw new BadRequestException(
        'CadDocument collaboration debe ser un objeto.',
      );
    }
    const boundedArrays: Array<[string, unknown, number]> = [
      ['versions', state.versions, MAX_CAD_VERSIONS],
      ['threads', state.threads, MAX_REVIEW_THREADS],
      ['reviewLinks', state.reviewLinks, MAX_REVIEW_LINKS],
      ['audit', state.audit, MAX_COLLABORATION_AUDIT_EVENTS],
    ];
    for (const [name, value, limit] of boundedArrays) {
      if (!Array.isArray(value) || value.length > limit) {
        throw new BadRequestException(
          `CadDocument collaboration.${name} admite máximo ${limit} registros.`,
        );
      }
    }
    for (const rawLink of state.reviewLinks as unknown[]) {
      const link = objectValue(rawLink);
      // FASE DE TRANSICIÓN: `token` YA NO es obligatorio ni admisible como
      // fuente de verdad. Los documentos heredados que aún lo traen siguen
      // VALIDANDO (no se rompe la lectura de nada persistido), pero el valor
      // se redacta antes de devolver o volver a persistir el documento —
      // ver `redactCadDocumentSecrets`. La autoridad del review link vive en
      // `cad_review_sessions.token_hash`, no en este JSON.
      if (
        typeof link?.id !== 'string' ||
        !link.id ||
        link.id.length > 128 ||
        link.readOnly !== true ||
        (link.token !== undefined &&
          (typeof link.token !== 'string' ||
            link.token.length < 16 ||
            link.token.length > 256))
      ) {
        throw new BadRequestException(
          'CadDocument contiene un enlace de revisión inválido.',
        );
      }
    }
    for (const rawThread of state.threads as unknown[]) {
      const thread = objectValue(rawThread);
      if (
        typeof thread?.id !== 'string' ||
        !thread.id ||
        thread.id.length > 128 ||
        typeof thread?.body !== 'string' ||
        !thread.body.trim() ||
        thread.body.length > 1_000 ||
        !['open', 'resolved'].includes(String(thread.status))
      ) {
        throw new BadRequestException(
          'CadDocument contiene un comentario de revisión inválido.',
        );
      }
    }
  }
  // Las capas DECLARADAS son la referencia para comprobar `entity.layer`. Un
  // documento que no las trae (heredado, o mínimo) no se rechaza por eso.
  const rawLayers = document.layers;
  let declaredLayers: Set<string> | null = null;
  if (rawLayers !== undefined) {
    if (!Array.isArray(rawLayers)) {
      throw new BadRequestException('CadDocument layers debe ser un arreglo.');
    }
    if (rawLayers.length) {
      declaredLayers = new Set<string>();
      for (const rawLayer of rawLayers) {
        const layer = objectValue(rawLayer);
        const layerId = typeof layer?.id === 'string' ? layer.id : '';
        if (!layerId || layerId.length > 128 || declaredLayers.has(layerId)) {
          throw new BadRequestException(
            'CadDocument requiere ids de capa únicos y no vacíos.',
          );
        }
        declaredLayers.add(layerId);
      }
    }
  }
  assertEntityInvariants(entities, declaredLayers);
  // Las entidades ANIDADAS en un bloque son geometría igual que las de primer
  // nivel: no pasaban por ninguna invariante, así que un radio negativo dentro
  // de un bloque cruzaba la frontera sin más.
  if (Array.isArray(document.blocks)) {
    for (const rawBlock of document.blocks) {
      const block = objectValue(rawBlock);
      if (!Array.isArray(block?.entities)) continue;
      assertEntityInvariants(
        block.entities as unknown[],
        declaredLayers,
        `el bloque ${stringValue(block?.id) || '(sin id)'}`,
        false,
      );
      assertNoNestedOpenings(
        block.entities as unknown[],
        `el bloque ${stringValue(block?.id) || '(sin id)'}`,
      );
    }
  }
  assertImageDefinitions(document);
  // El alojamiento de los huecos se comprueba sobre las entidades de PRIMER
  // NIVEL: un hueco es una afirmación sobre otra entidad del mismo dibujo.
  assertOpeningHosts(entities);
  assertConstraintReferences(document, ids);
  assertReferentialIntegrity(document, ids);
  const text = JSON.stringify(document);
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new BadRequestException(`CadDocument excede ${maxBytes} bytes.`);
  }
  // La redacción se aplica sobre el CLON (nunca sobre la entrada del llamador)
  // y por eso vive en el único punto por el que TODO documento canónico cruza
  // la frontera: entrada (guardado / archivo gzip / proyección legacy) y
  // salida (`hydrateCadDocument`, que valida ambas ramas — inline y blob).
  return redactCadDocumentSecrets(JSON.parse(text) as PersistedCadDocument);
}

/**
 * REDACCIÓN DE SECRETOS del documento canónico.
 *
 * `collaboration.reviewLinks[].token` fue durante una fase un token en CLARO
 * generado por el navegador y persistido dentro del JSON del documento: una
 * segunda fuente de verdad, insegura, paralela a la real
 * (`cad_review_sessions.token_hash`, server-owned). Quien tuviera permiso de
 * LECTURA sobre el documento se llevaba los tokens de compartición de todos
 * los enlaces — incluido el invitado que entra por `/v1/cad/review/context`.
 *
 * Aquí se elimina el valor y se conserva SOLO metadato no sensible
 * (`id`, `label`, `readOnly`, `createdAt/By`, `expiresAt`, `revokedAt`) más
 * `hasToken: true` cuando el documento heredado traía uno. Se recorre el árbol
 * completo porque `collaboration.versions[].document` puede anidar estado de
 * colaboración de snapshots antiguos.
 *
 * Mutación IN SITU deliberada: el llamador entrega un clon recién creado.
 */
export function redactCadDocumentSecrets<T>(document: T): T {
  redactNode(document, 0);
  return document;
}

function redactNode(value: unknown, depth: number): void {
  if (depth > MAX_DEPTH || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) redactNode(item, depth + 1);
    return;
  }
  const node = value as Record<string, unknown>;
  const links = node.reviewLinks;
  if (Array.isArray(links)) {
    for (const rawLink of links) {
      const link = objectValue(rawLink);
      if (!link || !('token' in link)) continue;
      delete link.token;
      link.hasToken = true;
    }
  }
  for (const nested of Object.values(node)) redactNode(nested, depth + 1);
}
