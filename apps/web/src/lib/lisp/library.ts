/**
 * La biblioteca `.lsp` de una organización: qué rutinas tiene, en qué versión,
 * y cuáles se cargan solas al abrir un dibujo.
 *
 * ## Lo que ESTÁ aquí y lo que NO
 *
 * Está la lógica entera: validación al subir, versionado monotónico, huella de
 * contenido para detectar cambios, inventario de los comandos `c:` que declara
 * cada fichero, y el orden de autocarga.
 *
 * NO está el almacenamiento. La persistencia por organización necesita un
 * endpoint `/v1/cad/*`, y el gate de contrato del repositorio exige igualdad de
 * conjuntos entre el OpenAPI, el SDK generado y el router de Nest: añadir uno
 * desde esta sesión rompería el gate para todo el mundo. Así que la persistencia
 * es un PUERTO (`LispLibraryStore`) con una implementación en memoria, y queda
 * dicho —aquí, en el PR y en la spec— que conectarla a la API es trabajo de otra
 * sesión, no algo que se haya dado por hecho.
 *
 * Sin ese puerto conectado, una organización que suba un `.lsp` lo tiene
 * mientras dure la pestaña. Es una limitación real y está declarada como tal;
 * lo que NO se ha hecho es fingir que persiste.
 *
 * ## Por qué se valida al SUBIR y no al ejecutar
 *
 * Un `.lsp` con un paréntesis sin cerrar no falla al cargarlo: falla la primera
 * vez que alguien teclea el comando, normalmente delante de un cliente. Validar
 * al subir convierte ese fallo en un mensaje con línea y columna en el momento
 * en que quien lo subió todavía tiene el fichero abierto.
 *
 * ## La huella no es un hash criptográfico, y se llama como lo que es
 *
 * `fingerprint` sirve para saber si el contenido CAMBIÓ —para no versionar dos
 * veces lo mismo— y para nada más. No se usa para integridad ni para
 * autenticidad, y por eso no se llama `sha256`: un nombre que promete garantías
 * criptográficas acaba usándose para eso.
 */
import { LispSyntaxError, readLispForms } from "./reader";
import { toArray, type LispValue } from "./values";

/** Tope por fichero. Una rutina de estudio grande ronda las 2.000 líneas. */
export const MAX_LSP_BYTES = 512 * 1024;
/** Tope por organización. Evita que una biblioteca crezca sin control. */
export const MAX_LIBRARY_FILES = 500;

export interface LispLibraryFile {
  /** Estable para el par (organización, nombre). */
  id: string;
  tenantId: string;
  /** Nombre del fichero tal y como lo subió el usuario: `cajetin.lsp`. */
  name: string;
  source: string;
  /** Monotónica: sube en cada contenido NUEVO, nunca baja ni se reutiliza. */
  version: number;
  fingerprint: string;
  updatedAt: string;
  updatedBy: string;
  /** Se carga sola al abrir un dibujo de la organización. */
  autoload: boolean;
  /** Comandos `c:` que declara. Es lo que la interfaz puede ofrecer. */
  commands: readonly string[];
}

/**
 * Puerto de persistencia. Síncrono a propósito: la implementación real lo
 * envolverá en el repositorio correspondiente, y hacerlo asíncrono aquí
 * obligaría a que la carga de la biblioteca contaminase de promesas el arranque
 * de la sesión LISP sin ninguna ganancia mientras no exista el endpoint.
 */
export interface LispLibraryStore {
  read(tenantId: string): readonly LispLibraryFile[];
  write(tenantId: string, files: readonly LispLibraryFile[]): void;
}

/** Implementación en memoria. Ver la nota de arriba sobre la persistencia. */
export class InMemoryLispLibraryStore implements LispLibraryStore {
  private readonly byTenant = new Map<string, LispLibraryFile[]>();

  read(tenantId: string): readonly LispLibraryFile[] {
    return this.byTenant.get(tenantId) ?? [];
  }

  write(tenantId: string, files: readonly LispLibraryFile[]): void {
    this.byTenant.set(tenantId, [...files]);
  }
}

export interface LispValidationResult {
  ok: boolean;
  /** Mensaje con línea y columna cuando la sintaxis falla. */
  problem?: string;
  /** Comandos `c:` declarados, en el orden en que aparecen. */
  commands: string[];
  /** Funciones `defun` de cualquier clase; sirve para detectar colisiones. */
  definitions: string[];
}

/**
 * Valida un `.lsp` sin ejecutarlo. Leer NO ejecuta: el resultado son celdas
 * cons inertes. Es lo que permite validar el fichero de un tercero antes de
 * darle acceso a nada.
 */
export function validateLispSource(source: string): LispValidationResult {
  if (source.length > MAX_LSP_BYTES)
    return {
      ok: false,
      problem: `El fichero ocupa ${source.length} bytes y el máximo son ${MAX_LSP_BYTES}.`,
      commands: [],
      definitions: [],
    };

  let forms: LispValue[];
  try {
    forms = readLispForms(source);
  } catch (cause) {
    return {
      ok: false,
      problem:
        cause instanceof LispSyntaxError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : String(cause),
      commands: [],
      definitions: [],
    };
  }

  const commands: string[] = [];
  const definitions: string[] = [];
  for (const form of forms) {
    const items = toArray(form);
    if (items.length < 2) continue;
    const head = items[0];
    const name = items[1];
    if (head.t !== "sym" || head.name !== "DEFUN" || name.t !== "sym") continue;
    definitions.push(name.name);
    // `C:ALGO` es la convención con la que AutoLISP declara un comando
    // tecleable. Es lo único que la interfaz puede ofrecer al usuario: el resto
    // de `defun` son funciones internas de la rutina.
    if (name.name.startsWith("C:")) commands.push(name.name.slice(2));
  }

  return { ok: true, commands, definitions };
}

/**
 * Huella de contenido. FNV-1a de 64 bits, en dos mitades de 32 para no depender
 * de BigInt. Detecta cambios; NO es integridad ni autenticidad.
 */
export function fingerprintLispSource(source: string): string {
  let low = 0x811c9dc5;
  let high = 0x01000193;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    low = Math.imul(low ^ code, 0x01000193) >>> 0;
    high = Math.imul(high ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `${low.toString(16).padStart(8, "0")}${high.toString(16).padStart(8, "0")}`;
}

export interface LispUploadRequest {
  tenantId: string;
  name: string;
  source: string;
  updatedBy: string;
  /** Instante de la subida. Inyectado: las specs no dependen del reloj. */
  now: string;
  autoload?: boolean;
}

export type LispUploadResult =
  | { ok: true; file: LispLibraryFile; created: boolean; unchanged: boolean }
  | { ok: false; problem: string };

/**
 * Sube o reemplaza un fichero de la biblioteca de una organización.
 *
 * Tres reglas que se comprueban en su spec:
 *
 *  - Un fichero con sintaxis rota se RECHAZA. No se guarda ni «en borrador».
 *  - Subir el MISMO contenido no crea versión nueva. Un historial en el que la
 *    v7 y la v8 son idénticas no dice nada sobre qué cambió y cuándo.
 *  - La versión es monotónica por fichero, así que dos organizaciones no se
 *    pisan y una revisión siempre se puede citar por número.
 */
export function uploadLispFile(
  store: LispLibraryStore,
  request: LispUploadRequest,
): LispUploadResult {
  const validation = validateLispSource(request.source);
  if (!validation.ok)
    return { ok: false, problem: `${request.name}: ${validation.problem ?? "no se pudo leer"}` };

  const name = request.name.trim();
  /**
   * El nombre lo escribe el usuario y acaba en una interfaz y en un almacén, así
   * que se filtra por lo que NO puede llevar —separadores de ruta, `..`, los
   * caracteres que Windows prohíbe— en vez de por una lista de caracteres
   * permitidos. Un `[\w .-]` habría rechazado `Cajetín-A3.lsp`, que es un
   * nombre perfectamente corriente en un estudio de habla hispana.
   */
  if (
    name.length < 5 ||
    name.length > 120 ||
    !/\.lsp$/i.test(name) ||
    /[/\\:*?"<>|\u0000-\u001f]/.test(name) ||
    name.includes("..")
  )
    return {
      ok: false,
      problem: `"${request.name}" no es un nombre de fichero .lsp admisible.`,
    };

  const files = [...store.read(request.tenantId)];
  const existing = files.find((file) => file.name.toLowerCase() === name.toLowerCase());
  if (!existing && files.length >= MAX_LIBRARY_FILES)
    return {
      ok: false,
      problem: `La biblioteca ya tiene ${files.length} ficheros, que es el máximo.`,
    };

  const fingerprint = fingerprintLispSource(request.source);
  if (existing && existing.fingerprint === fingerprint) {
    // Mismo contenido: se refresca el metadato de autocarga si cambió, pero la
    // versión NO sube.
    const autoload = request.autoload ?? existing.autoload;
    const refreshed = { ...existing, autoload };
    store.write(request.tenantId, files.map((file) => (file.id === existing.id ? refreshed : file)));
    return { ok: true, file: refreshed, created: false, unchanged: true };
  }

  const file: LispLibraryFile = {
    id: existing?.id ?? `lsp:${request.tenantId}:${name.toLowerCase()}`,
    tenantId: request.tenantId,
    name,
    source: request.source,
    version: (existing?.version ?? 0) + 1,
    fingerprint,
    updatedAt: request.now,
    updatedBy: request.updatedBy,
    autoload: request.autoload ?? existing?.autoload ?? false,
    commands: validation.commands,
  };

  store.write(
    request.tenantId,
    existing ? files.map((entry) => (entry.id === existing.id ? file : entry)) : [...files, file],
  );
  return { ok: true, file, created: !existing, unchanged: false };
}

export function removeLispFile(store: LispLibraryStore, tenantId: string, name: string): boolean {
  const files = store.read(tenantId);
  const remaining = files.filter((file) => file.name.toLowerCase() !== name.toLowerCase());
  if (remaining.length === files.length) return false;
  store.write(tenantId, remaining);
  return true;
}

/**
 * Ficheros de autocarga en ORDEN ESTABLE (por nombre). El orden importa: una
 * rutina puede llamar a una función definida en otro fichero, y si el orden
 * dependiera de cuándo se subió cada uno, la biblioteca funcionaría o no según
 * el historial de la organización.
 */
export function autoloadOrder(store: LispLibraryStore, tenantId: string): readonly LispLibraryFile[] {
  return store
    .read(tenantId)
    .filter((file) => file.autoload)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Comandos `c:` que la organización tiene disponibles, con el fichero que los
 * declara. Cuando dos ficheros declaran el mismo, gana el que se carga después
 * —el orden de autocarga— y aquí se REPORTAN los dos, porque una colisión
 * silenciosa entre la rutina de dos proveedores es de las cosas que más tiempo
 * cuestan diagnosticar.
 */
export function commandInventory(
  store: LispLibraryStore,
  tenantId: string,
): { commands: Map<string, string>; collisions: Array<{ command: string; files: string[] }> } {
  const owners = new Map<string, string[]>();
  for (const file of autoloadOrder(store, tenantId))
    for (const command of file.commands)
      owners.set(command, [...(owners.get(command) ?? []), file.name]);

  const commands = new Map<string, string>();
  const collisions: Array<{ command: string; files: string[] }> = [];
  for (const [command, files] of owners) {
    commands.set(command, files[files.length - 1]);
    if (files.length > 1) collisions.push({ command, files });
  }
  return { commands, collisions };
}
