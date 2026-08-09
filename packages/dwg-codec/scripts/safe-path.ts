import type { Stats } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type SafePathKind = "file" | "directory";

const WINDOWS_FORBIDDEN_SEGMENT_CHARACTERS = /[<>:"\\|?*\u0000-\u001f\u007f]/u;
const WINDOWS_RESERVED_DEVICE_NAME =
  /^(?:AUX|CLOCK\$|COM[1-9\u00b9\u00b2\u00b3]|CON|CONIN\$|CONOUT\$|LPT[1-9\u00b9\u00b2\u00b3]|NUL|PRN)(?:\..*)?$/iu;

export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function requiredLstat(path: string, label: string): Promise<Stats> {
  try {
    return await lstat(path);
  } catch (error) {
    throw new Error(
      `${label}: required path does not exist or is inaccessible`,
      {
        cause: error,
      },
    );
  }
}

function assertContained(
  rootPath: string,
  candidatePath: string,
  label: string,
): void {
  const relativePath = relative(rootPath, candidatePath);
  if (
    relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) &&
      relativePath !== ".." &&
      !isAbsolute(relativePath))
  ) {
    return;
  }
  throw new Error(`${label}: path escapes its required root`);
}

export function caseFold(value: string): string {
  return value.normalize("NFC").toLowerCase();
}

export function assertUniqueCaseFolded(
  values: readonly string[],
  label: string,
): void {
  const seen = new Map<string, string>();
  for (const value of values) {
    const key = caseFold(value);
    const previous = seen.get(key);
    if (previous !== undefined) {
      throw new Error(
        `${label}: duplicate values under case folding: ${JSON.stringify(previous)} and ${JSON.stringify(value)}`,
      );
    }
    seen.set(key, value);
  }
}

export function assertPortableRelativePath(
  relativePath: string,
  label: string,
): void {
  if (
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath !== relativePath.normalize("NFC")
  ) {
    throw new Error(
      `${label}: path must be a normalized portable relative path`,
    );
  }
  const segments = relativePath.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new Error(`${label}: dot and empty path segments are forbidden`);
  }
  if (
    segments.some(
      (segment) =>
        WINDOWS_FORBIDDEN_SEGMENT_CHARACTERS.test(segment) ||
        segment.endsWith(".") ||
        segment.endsWith(" ") ||
        WINDOWS_RESERVED_DEVICE_NAME.test(segment),
    )
  ) {
    throw new Error(`${label}: path contains a non-portable Win32 segment`);
  }
}

export async function resolveSafeExistingPath(
  rootPath: string,
  relativePath: string,
  expectedKind: SafePathKind,
  label = relativePath,
): Promise<string> {
  assertPortableRelativePath(relativePath, label);

  const lexicalRoot = resolve(rootPath);
  const lexicalCandidate = resolve(lexicalRoot, ...relativePath.split("/"));
  assertContained(lexicalRoot, lexicalCandidate, label);

  const rootStats = await requiredLstat(lexicalRoot, label);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error(`${label}: required root must be a real directory`);
  }

  let cursor = lexicalRoot;
  let candidateStats = rootStats;
  for (const segment of relativePath.split("/")) {
    cursor = resolve(cursor, segment);
    candidateStats = await requiredLstat(cursor, label);
    if (candidateStats.isSymbolicLink()) {
      throw new Error(`${label}: symbolic links and junctions are forbidden`);
    }
  }

  if (
    (expectedKind === "file" && !candidateStats.isFile()) ||
    (expectedKind === "directory" && !candidateStats.isDirectory())
  ) {
    throw new Error(`${label}: expected an existing ${expectedKind}`);
  }

  const physicalRoot = await realpath(lexicalRoot);
  const physicalCandidate = await realpath(lexicalCandidate);
  assertContained(physicalRoot, physicalCandidate, label);
  return physicalCandidate;
}

export interface WalkRegularFilesOptions {
  readonly ignoredDirectories?: readonly string[];
  readonly forbiddenEntryNames?: readonly string[];
}

export async function walkRegularFiles(
  rootPath: string,
  options: WalkRegularFilesOptions = {},
): Promise<readonly string[]> {
  const absoluteRoot = resolve(rootPath);
  const rootStats = await requiredLstat(absoluteRoot, rootPath);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error(`${rootPath}: walk root must be a real directory`);
  }

  const files: string[] = [];
  const visit = async (
    absoluteDirectory: string,
    prefix: string,
  ): Promise<void> => {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => compareCodeUnits(left.name, right.name));
    for (const entry of entries) {
      const relativePath =
        prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const absolutePath = resolve(absoluteDirectory, entry.name);
      if (
        options.forbiddenEntryNames?.some(
          (name) => caseFold(name) === caseFold(entry.name),
        )
      ) {
        throw new Error(`${relativePath}: forbidden entry name`);
      }
      if (entry.isSymbolicLink()) {
        throw new Error(
          `${relativePath}: symbolic links and junctions are forbidden`,
        );
      }
      if (entry.isDirectory()) {
        if (!options.ignoredDirectories?.includes(relativePath)) {
          await visit(absolutePath, relativePath);
        }
      } else if (entry.isFile()) {
        files.push(relativePath);
      } else {
        throw new Error(
          `${relativePath}: only regular files and directories are allowed`,
        );
      }
    }
  };

  await visit(absoluteRoot, "");
  return files;
}
