import { BadRequestException } from '@nestjs/common';
import { ValidateBy, type ValidationOptions } from 'class-validator';

export const MAX_CAD_COMMENT_ANCHOR_BYTES = 16 * 1024;
export const MAX_CAD_COMMENT_ANCHOR_DEPTH = 6;
export const MAX_CAD_COMMENT_ANCHOR_FIELDS = 256;
export const MAX_CAD_COMMENT_ANCHOR_ARRAY_ITEMS = 128;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_KEY_BYTES = 128;

/** Devuelve null cuando el ancla es JSON seguro y acotado. */
export function cadCommentAnchorProblem(value: unknown): string | null {
  if (!isPlainRecord(value)) return 'debe ser un objeto JSON';

  const seen = new WeakSet<object>();
  let fields = 0;
  let arrayItems = 0;

  const inspect = (node: unknown, depth: number): string | null => {
    if (node === null || typeof node === 'boolean') return null;
    if (typeof node === 'number') {
      return Number.isFinite(node) ? null : 'contiene un número no finito';
    }
    if (typeof node === 'string') {
      return Buffer.byteLength(node, 'utf8') <= MAX_CAD_COMMENT_ANCHOR_BYTES
        ? null
        : 'contiene una cadena demasiado grande';
    }
    if (typeof node !== 'object') {
      return 'sólo puede contener valores JSON';
    }
    if (depth > MAX_CAD_COMMENT_ANCHOR_DEPTH) {
      return `supera la profundidad máxima de ${MAX_CAD_COMMENT_ANCHOR_DEPTH}`;
    }
    if (seen.has(node)) return 'contiene una referencia circular';
    seen.add(node);

    if (Array.isArray(node)) {
      arrayItems += node.length;
      if (arrayItems > MAX_CAD_COMMENT_ANCHOR_ARRAY_ITEMS) {
        return `supera ${MAX_CAD_COMMENT_ANCHOR_ARRAY_ITEMS} elementos de arreglo`;
      }
      for (const item of node) {
        const problem = inspect(item, depth + 1);
        if (problem) return problem;
      }
      return null;
    }

    if (!isPlainRecord(node)) return 'contiene un objeto no JSON';
    let keys: string[];
    try {
      keys = Object.keys(node);
    } catch {
      return 'no se puede inspeccionar de forma segura';
    }
    fields += keys.length;
    if (fields > MAX_CAD_COMMENT_ANCHOR_FIELDS) {
      return `supera ${MAX_CAD_COMMENT_ANCHOR_FIELDS} campos`;
    }
    for (const key of keys) {
      if (
        FORBIDDEN_KEYS.has(key) ||
        Buffer.byteLength(key, 'utf8') > MAX_KEY_BYTES
      ) {
        return 'contiene un nombre de campo no permitido';
      }
      let child: unknown;
      try {
        child = node[key];
      } catch {
        return 'contiene un campo que no se puede leer de forma segura';
      }
      const problem = inspect(child, depth + 1);
      if (problem) return problem;
    }
    return null;
  };

  const shapeProblem = inspect(value, 0);
  if (shapeProblem) return shapeProblem;
  try {
    const serialized = JSON.stringify(value);
    if (
      typeof serialized !== 'string' ||
      Buffer.byteLength(serialized, 'utf8') > MAX_CAD_COMMENT_ANCHOR_BYTES
    ) {
      return `supera ${MAX_CAD_COMMENT_ANCHOR_BYTES} bytes serializados`;
    }
  } catch {
    return 'no se puede serializar como JSON';
  }
  return null;
}

/** Barrera de dominio para callers que no pasan por el DTO HTTP. */
export function assertCadCommentAnchor(
  value: unknown,
): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  const problem = cadCommentAnchorProblem(value);
  if (problem) {
    throw new BadRequestException({
      code: 'cad_comment_anchor_invalid',
      message: `El ancla del comentario ${problem}.`,
    });
  }
  return value as Record<string, unknown>;
}

/** Decorador class-validator para las dos superficies de comentarios. */
export function IsCadCommentAnchor(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isCadCommentAnchor',
      validator: {
        validate: (value: unknown) =>
          value === undefined ||
          value === null ||
          cadCommentAnchorProblem(value) === null,
        defaultMessage: () =>
          `anchor debe ser JSON seguro de hasta ${MAX_CAD_COMMENT_ANCHOR_BYTES} bytes`,
      },
    },
    validationOptions,
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
