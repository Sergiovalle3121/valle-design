import { BadRequestException } from '@nestjs/common';

export type PersistedCadDocument = Record<string, unknown>;

const MAX_BYTES = 8_000_000;
const MAX_ENTITIES = 100_000;
const MAX_BLOCKS = 2_000;
const MAX_CONSTRAINTS = 250_000;
const MAX_DEPTH = 64;

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
  const text = JSON.stringify(document);
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    throw new BadRequestException(`CadDocument excede ${MAX_BYTES} bytes.`);
  }
  return JSON.parse(text) as PersistedCadDocument;
}
