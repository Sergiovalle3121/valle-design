import type { Stats } from "node:fs";
import { lstat, open } from "node:fs/promises";

export const MAX_CANONICAL_JSON_BYTES = 4 * 1024 * 1024;

export interface CanonicalJsonDocument<T> {
  readonly value: T;
  readonly text: string;
  readonly bytes: Uint8Array;
}

export interface CanonicalJsonOptions {
  readonly requireLf?: boolean;
  readonly requireCanonicalLayout?: boolean;
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertBoundedRegularDocument(
  documentPath: string,
  stats: Stats,
  stage: string,
): number {
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`${documentPath}: JSON document must be a regular file`);
  }
  if (
    !Number.isSafeInteger(stats.size) ||
    stats.size < 0 ||
    stats.size > MAX_CANONICAL_JSON_BYTES
  ) {
    throw new Error(
      `${documentPath}: JSON document ${stage} size ${stats.size} exceeds the ${MAX_CANONICAL_JSON_BYTES}-byte limit`,
    );
  }
  return stats.size;
}

async function readBoundedDocument(documentPath: string): Promise<Buffer> {
  const initialStats = await lstat(documentPath);
  const initialSize = assertBoundedRegularDocument(
    documentPath,
    initialStats,
    "initial",
  );

  const handle = await open(documentPath, "r");
  try {
    const openedStats = await handle.stat();
    const openedSize = assertBoundedRegularDocument(
      documentPath,
      openedStats,
      "opened",
    );
    if (openedSize !== initialSize) {
      throw new Error(`${documentPath}: JSON document changed before its read`);
    }

    const bytes = Buffer.alloc(openedSize);
    let offset = 0;
    while (offset < openedSize) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        openedSize - offset,
        offset,
      );
      if (bytesRead === 0) {
        throw new Error(
          `${documentPath}: JSON document was truncated during read`,
        );
      }
      offset += bytesRead;
    }

    const sentinel = Buffer.alloc(1);
    const { bytesRead: extraBytes } = await handle.read(
      sentinel,
      0,
      1,
      openedSize,
    );
    const finalStats = await handle.stat();
    const finalSize = assertBoundedRegularDocument(
      documentPath,
      finalStats,
      "final",
    );
    if (extraBytes !== 0 || finalSize !== openedSize) {
      throw new Error(`${documentPath}: JSON document grew during read`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

export async function readCanonicalJson<T>(
  documentPath: string,
  options: CanonicalJsonOptions = {},
): Promise<CanonicalJsonDocument<T>> {
  const bytes = await readBoundedDocument(documentPath);
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    throw new Error(`${documentPath}: UTF-8 BOM is not allowed`);
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${documentPath}: document is not valid UTF-8`, {
      cause: error,
    });
  }

  const normalized = text.replace(/\r\n/g, "\n");
  if (normalized.includes("\r")) {
    throw new Error(`${documentPath}: bare carriage returns are not allowed`);
  }
  if (options.requireLf === true && normalized !== text) {
    throw new Error(`${documentPath}: LF line endings are required`);
  }
  if (!normalized.endsWith("\n") || normalized.endsWith("\n\n")) {
    throw new Error(
      `${documentPath}: document must end with exactly one line feed`,
    );
  }
  const lines = normalized.slice(0, -1).split("\n");
  if (lines.some((line) => /[\t ]$/u.test(line) || line.includes("\t"))) {
    throw new Error(
      `${documentPath}: tabs and trailing whitespace are not canonical JSON`,
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(normalized);
  } catch (error) {
    throw new Error(`${documentPath}: invalid JSON`, { cause: error });
  }

  if (
    options.requireCanonicalLayout !== false &&
    canonicalJson(value) !== normalized
  ) {
    throw new Error(
      `${documentPath}: JSON must use two-space canonical formatting and preserve property order`,
    );
  }

  return {
    value: value as T,
    text,
    bytes,
  };
}
