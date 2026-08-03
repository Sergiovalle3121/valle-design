import { BadRequestException } from '@nestjs/common';

export type PersistedCadDocument = Record<string, unknown>;

export const CAD_DOCUMENT_MAX_INLINE_BYTES = 8_000_000;
export const CAD_DOCUMENT_MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_ENTITIES = 100_000;
const MAX_BLOCKS = 2_000;
const MAX_CONSTRAINTS = 250_000;
const MAX_PAPER_SPACES = 500;
const MAX_VIEWPORTS_PER_PAPER_SPACE = 32;
const MAX_PUBLICATIONS = 1_000;
const MAX_CAD_VERSIONS = 12;
const MAX_REVIEW_THREADS = 500;
const MAX_REVIEW_LINKS = 20;
const MAX_COLLABORATION_AUDIT_EVENTS = 500;
const MAX_DEPTH = 64;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finitePositive(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
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

/** Toda coordenada numérica debe ser finita: un NaN envenena bounds e índices. */
function assertFiniteNumbers(node: unknown, entityId: string, depth = 0): void {
  if (depth > 12 || node === null || typeof node !== 'object') return;
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new BadRequestException(
          `CadDocument: la entidad ${entityId} contiene un número no finito.`,
        );
      }
    } else if (typeof value === 'object') {
      assertFiniteNumbers(value, entityId, depth + 1);
    }
  }
}

/**
 * Invariantes discriminadas POR ENTIDAD.
 *
 * Los límites de tamaño, profundidad y conteo no impiden persistir geometría
 * imposible: un radio negativo, un NaN o una polilínea de un solo vértice
 * cruzaban la frontera y rompían render, índice espacial y exportación más
 * tarde, lejos de su causa. Aquí se falla CERRADO y en el punto de entrada.
 */
function assertEntityInvariants(entities: unknown[]): void {
  for (const raw of entities) {
    const entity = raw as Record<string, unknown>;
    const id = String(entity.id);
    const type = entity.type;
    assertFiniteNumbers(entity, id);

    if (type === 'circle' || type === 'arc') {
      const radius = entity.radius;
      if (typeof radius !== 'number' || !(radius > 0)) {
        throw new BadRequestException(
          `CadDocument: ${String(type)} ${id} requiere un radio positivo.`,
        );
      }
    }

    if (type === 'polyline') {
      const vertices = entity.vertices;
      if (!Array.isArray(vertices) || vertices.length < 2) {
        throw new BadRequestException(
          `CadDocument: la polilínea ${id} requiere al menos 2 vértices.`,
        );
      }
    }

    if (type === 'spline') {
      const controlPoints = entity.controlPoints;
      const degree = entity.degree;
      if (!Array.isArray(controlPoints) || controlPoints.length < 2) {
        throw new BadRequestException(
          `CadDocument: la spline ${id} requiere al menos 2 puntos de control.`,
        );
      }
      if (
        typeof degree !== 'number' ||
        !Number.isInteger(degree) ||
        degree < 1 ||
        degree >= controlPoints.length
      ) {
        throw new BadRequestException(
          `CadDocument: la spline ${id} tiene un grado incompatible con sus puntos de control.`,
        );
      }
      const weights = entity.weights;
      if (weights !== undefined) {
        if (
          !Array.isArray(weights) ||
          weights.length !== controlPoints.length
        ) {
          throw new BadRequestException(
            `CadDocument: la spline ${id} tiene pesos que no corresponden a sus puntos de control.`,
          );
        }
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
  }

  // Recursión de bloques: un ciclo cuelga render, explode y purge.
  const blocks = (document as unknown as Record<string, unknown>).blocks;
  if (!Array.isArray(blocks)) return;
  const children = new Map<string, string[]>();
  for (const rawBlock of blocks) {
    const block = rawBlock as Record<string, unknown> | null;
    const blockId = typeof block?.id === 'string' ? block.id : '';
    if (!blockId) continue;
    const nested = Array.isArray(block?.entities)
      ? (block.entities as Record<string, unknown>[])
          .filter((child) => child?.type === 'insert')
          .map((child) => String(child.block))
      : [];
    children.set(blockId, nested);
  }
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
  if (!Number.isInteger(schema) || schema < 1 || schema > 3) {
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
  assertEntityInvariants(entities);
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
