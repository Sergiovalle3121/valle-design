/**
 * Persistencia de la biblioteca `.lsp`. Lo que se pudo hacer, y lo que no.
 *
 * ## Por qué vive AQUÍ y no en `lib/lisp/`
 *
 * Porque toca `localStorage`, y el subsistema LISP tiene prohibido alcanzar
 * nada del navegador: `sandbox-surface.spec.ts` lee el código fuente de
 * `lib/lisp/` y falla si aparece red, DOM o almacenamiento. Ese gate no es
 * burocracia — es la única razón por la que se puede afirmar que la rutina de un
 * tercero no llega a ningún sitio. El puerto (`LispLibraryStore`) se queda en el
 * subsistema; el adaptador que sabe del navegador se queda en el anfitrión, que
 * es donde el navegador existe.
 *
 * ## Lo que NO se pudo hacer, dicho primero
 *
 * Guardar las rutinas EN EL SERVIDOR, por organización, exige un endpoint
 * `/v1/cad/lisp/*`. El gate de contrato del repositorio (`check:cad-contract`)
 * exige igualdad de conjuntos entre el OpenAPI, el SDK generado y el router de
 * Nest, y `packages/contracts` está asignado a otra sesión en esta ola: añadir
 * un endpoint desde aquí rompería el gate para todas las demás.
 *
 * Se miró si alguno de los endpoints existentes servía. `/v1/cad/blocks` es el
 * único almacén por organización que hay, y guarda definiciones de bloque:
 * geometría con punto base y entidades. Meter el texto de un `.lsp` en la
 * descripción o en las palabras clave de un bloque sería un almacén clandestino
 * que se rompe el día que alguien valide ese campo, y dejaría la biblioteca
 * mezclada con los bloques en la interfaz de bloques. No se ha hecho.
 *
 * ## Lo que SÍ se hace
 *
 * La biblioteca persiste en el NAVEGADOR, con la clave por organización, y con
 * todo lo que `library.ts` ya sabía calcular: versión monotónica, quién lo subió
 * y cuándo, huella de contenido, e inventario de comandos `c:`. Es persistencia
 * de verdad —cerrar la pestaña ya no pierde las rutinas— y es persistencia
 * LOCAL: quien abra el mismo dibujo en otro ordenador no las tiene.
 *
 * Esa frontera está donde debe: el puerto `LispLibraryStore` no cambia. El día
 * que exista el endpoint, se escribe un `ApiLispLibraryStore` con las mismas
 * dos funciones y nada de lo que está encima se entera.
 *
 * ## Por qué el almacén entra INYECTADO
 *
 * `localStorage` no existe en Node, y la mitad del valor de este módulo es
 * poder probar la corrupción, la cuota agotada y el aislamiento entre
 * organizaciones sin navegador. Se recibe un puerto de cuatro métodos y la
 * fábrica del navegador es una línea.
 */
import type { LispLibraryFile, LispLibraryStore } from "@/lib/lisp/library";

/** Lo que este módulo necesita de `localStorage`, y nada más. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Prefijo de las claves. Versionado para poder migrar sin pisar lo anterior. */
export const LISP_LIBRARY_KEY_PREFIX = "valle.cad.lisp.v1";

/**
 * Tope por organización. `localStorage` da entre 5 y 10 MB para TODO el origen
 * —donde también viven el recovery del CAD y el workspace—, así que la
 * biblioteca no puede quedarse con todo. Por encima de esto se dice que no al
 * subir, que es recuperable; llegar a la cuota del navegador no lo es.
 */
export const MAX_LIBRARY_BYTES = 1_500_000;

export function lispLibraryKey(tenantId: string): string {
  return `${LISP_LIBRARY_KEY_PREFIX}:${tenantId || "anon"}`;
}

/** Qué le pasó al almacén. La interfaz lo enseña en vez de tragárselo. */
export interface LispStorageProblem {
  tenantId: string;
  operation: "read" | "write";
  message: string;
}

export class BrowserLispLibraryStore implements LispLibraryStore {
  /**
   * Caché en memoria por organización. No es una optimización: es lo que hace
   * que una lectura siga funcionando después de que la escritura fallara por
   * cuota. Sin ella, el usuario vería desaparecer de la lista la rutina que
   * acaba de subir, y creería que se subió mal en vez de que no se pudo guardar.
   */
  private readonly cache = new Map<string, LispLibraryFile[]>();
  readonly problems: LispStorageProblem[] = [];

  constructor(private readonly storage: KeyValueStorage) {}

  read(tenantId: string): readonly LispLibraryFile[] {
    const cached = this.cache.get(tenantId);
    if (cached) return cached;
    const files = this.hydrate(tenantId);
    this.cache.set(tenantId, files);
    return files;
  }

  write(tenantId: string, files: readonly LispLibraryFile[]): void {
    const next = [...files];
    const payload = JSON.stringify(next);
    if (payload.length > MAX_LIBRARY_BYTES)
      throw new Error(
        `La biblioteca de rutinas ocuparía ${payload.length} bytes y el máximo son ` +
          `${MAX_LIBRARY_BYTES}. Borra alguna rutina antes de subir esta.`,
      );
    // La caché se actualiza ANTES de tocar el almacén: si el navegador rechaza
    // la escritura, la sesión en curso conserva la rutina y el usuario recibe
    // un error que dice exactamente eso, en vez de perderla sin aviso.
    this.cache.set(tenantId, next);
    try {
      this.storage.setItem(lispLibraryKey(tenantId), payload);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.problems.push({ tenantId, operation: "write", message });
      throw new Error(
        `La rutina quedó cargada en esta sesión pero NO se pudo guardar: ${message}`,
      );
    }
  }

  /** Vacía la biblioteca de una organización, almacén incluido. */
  clear(tenantId: string): void {
    this.cache.set(tenantId, []);
    try {
      this.storage.removeItem(lispLibraryKey(tenantId));
    } catch (cause) {
      this.problems.push({
        tenantId,
        operation: "write",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  /**
   * Lee y VALIDA. Un almacén corrupto —otra versión del producto, una edición a
   * mano, medio JSON— se trata como biblioteca vacía y se apunta el problema.
   * Dejar entrar un objeto a medias haría que el fallo apareciese mucho después,
   * al invocar un comando, en forma de `undefined` donde iba una cadena.
   */
  private hydrate(tenantId: string): LispLibraryFile[] {
    let raw: string | null;
    try {
      raw = this.storage.getItem(lispLibraryKey(tenantId));
    } catch (cause) {
      this.problems.push({
        tenantId,
        operation: "read",
        message: cause instanceof Error ? cause.message : String(cause),
      });
      return [];
    }
    if (!raw) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      this.problems.push({
        tenantId,
        operation: "read",
        message: `El almacén no es JSON válido: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
      return [];
    }
    if (!Array.isArray(parsed)) {
      this.problems.push({ tenantId, operation: "read", message: "El almacén no es una lista." });
      return [];
    }

    const files: LispLibraryFile[] = [];
    let rejected = 0;
    for (const candidate of parsed) {
      const file = asLibraryFile(candidate, tenantId);
      if (file) files.push(file);
      else rejected += 1;
    }
    if (rejected > 0)
      this.problems.push({
        tenantId,
        operation: "read",
        message: `Se descartaron ${rejected} entradas con forma inesperada.`,
      });
    return files;
  }
}

/** Comprobación de forma. Estricta a propósito; véase `hydrate`. */
function asLibraryFile(value: unknown, tenantId: string): LispLibraryFile | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const text = (key: string): string | null =>
    typeof record[key] === "string" ? (record[key] as string) : null;
  const id = text("id");
  const name = text("name");
  const source = text("source");
  const fingerprint = text("fingerprint");
  const updatedAt = text("updatedAt");
  const updatedBy = text("updatedBy");
  const version = record.version;
  if (!id || !name || source === null || !fingerprint || !updatedAt || !updatedBy) return null;
  if (typeof version !== "number" || !Number.isFinite(version) || version < 1) return null;
  const commands = Array.isArray(record.commands)
    ? record.commands.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    id,
    // La organización se REESCRIBE con la que se está leyendo. La clave del
    // almacén ya la separa; hacer caso al campo permitiría que un almacén
    // manipulado presentase la biblioteca de otra organización.
    tenantId,
    name,
    source,
    version,
    fingerprint,
    updatedAt,
    updatedBy,
    autoload: record.autoload === true,
    commands,
  };
}

/**
 * El almacén del navegador, si lo hay. En SSR y en Node no lo hay, y devolver
 * `null` deja que quien monta decida —la memoria sirve— en vez de reventar al
 * importar el módulo.
 */
export function browserKeyValueStorage(): KeyValueStorage | null {
  try {
    if (typeof globalThis === "undefined") return null;
    const candidate = (globalThis as { localStorage?: KeyValueStorage }).localStorage;
    if (!candidate) return null;
    // Safari en navegación privada TIENE `localStorage` y lanza al escribir. Se
    // comprueba escribiendo, porque comprobar que el objeto existe no dice nada.
    const probe = `${LISP_LIBRARY_KEY_PREFIX}:probe`;
    candidate.setItem(probe, "1");
    candidate.removeItem(probe);
    return candidate;
  } catch {
    return null;
  }
}
