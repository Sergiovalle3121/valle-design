import { BadRequestException } from '@nestjs/common';

export type PersistedCadDocument = Record<string, unknown>;

const MAX_BYTES = 8_000_000;
const MAX_ENTITIES = 100_000;
const MAX_BLOCKS = 2_000;
const MAX_CONSTRAINTS = 250_000;
const MAX_PAPER_SPACES = 500;
const MAX_VIEWPORTS_PER_PAPER_SPACE = 32;
const MAX_PUBLICATIONS = 1_000;
const MAX_DEPTH = 64;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finitePositive(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function inspect(value: unknown, depth = 0): void {
  if (depth > MAX_DEPTH) {
    throw new BadRequestException(
      'CadDocument excede la profundidad permitida.',
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new BadRequestException('CadDocument contiene números no finitos.');
  }
  if (typeof value === 'string' && value.length > MAX_BYTES) {
    throw new BadRequestException(
      'CadDocument contiene una cadena demasiado grande.',
    );
  }
  if (Array.isArray(value)) {
    for (const item of value) inspect(item, depth + 1);
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (key.length > 128)
        throw new BadRequestException(
          'CadDocument contiene una clave demasiado larga.',
        );
      inspect(nested, depth + 1);
    }
  }
}

export function validateCadDocumentPayload(
  value: unknown,
): PersistedCadDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('cadDocument debe ser un objeto.');
  }
  inspect(value);
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
  const text = JSON.stringify(document);
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    throw new BadRequestException(`CadDocument excede ${MAX_BYTES} bytes.`);
  }
  return JSON.parse(text) as PersistedCadDocument;
}
