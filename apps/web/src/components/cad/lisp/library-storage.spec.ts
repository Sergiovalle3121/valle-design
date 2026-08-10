/**
 * La biblioteca `.lsp` que SOBREVIVE a cerrar la pestaña.
 *
 * Y el límite, dicho antes que nada: esto persiste en el NAVEGADOR, no en el
 * servidor. Guardarla por organización de verdad exige un endpoint
 * `/v1/cad/lisp/*`, y `packages/contracts` está asignado a otra sesión en esta
 * ola. La razón completa está en la cabecera de `library-storage.ts`.
 *
 * Lo que sí se prueba aquí es todo lo que decide si esa persistencia se puede
 * confiar: que dos organizaciones no se ven, que un almacén corrupto no
 * envenena la sesión, que la cuota agotada NO pierde la rutina en silencio, y
 * que un almacén manipulado no puede presentar la biblioteca de otro.
 */
import { strict as assert } from "node:assert";
import { uploadLispFile } from "@/lib/lisp/library";
import {
  BrowserLispLibraryStore,
  MAX_LIBRARY_BYTES,
  lispLibraryKey,
  type KeyValueStorage,
} from "./library-storage";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
function eq<T>(actual: T, expected: T, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

/** `localStorage` de mentira, con la opción de fallar como el de verdad. */
class FakeStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("QuotaExceededError");
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const SOURCE = `(defun c:CAJETIN () (princ "cajetín"))`;

function upload(store: BrowserLispLibraryStore, tenantId: string, name: string, source: string) {
  return uploadLispFile(store, {
    tenantId,
    name,
    source,
    updatedBy: "sergio",
    now: "2026-01-01T00:00:00.000Z",
    autoload: true,
  });
}

// --- lo subido sobrevive a construir el almacén otra vez -------------------------
{
  const storage = new FakeStorage();
  const first = new BrowserLispLibraryStore(storage);
  const result = upload(first, "estudio", "cajetin.lsp", SOURCE);
  ok(result.ok, "se sube");

  // Un almacén NUEVO sobre el mismo `localStorage` es lo que pasa al recargar.
  const reopened = new BrowserLispLibraryStore(storage);
  const files = reopened.read("estudio");
  eq(files.length, 1, "y al recargar la página sigue estando");
  eq(files[0].name, "cajetin.lsp", "con su nombre");
  eq(files[0].version, 1, "su versión");
  eq(files[0].updatedBy, "sergio", "quién la subió");
  eq(files[0].updatedAt, "2026-01-01T00:00:00.000Z", "y cuándo");
  eq(files[0].commands, ["CAJETIN"], "y el comando que aporta");
  eq(files[0].source, SOURCE, "el fuente intacto, que es lo que se ejecuta");
}

// --- el versionado monotónico atraviesa la recarga --------------------------------
{
  const storage = new FakeStorage();
  upload(new BrowserLispLibraryStore(storage), "estudio", "cajetin.lsp", SOURCE);
  const second = new BrowserLispLibraryStore(storage);
  const changed = upload(second, "estudio", "cajetin.lsp", `${SOURCE}\n(princ)`);
  ok(changed.ok && changed.file.version === 2, "un contenido nuevo sube a la v2 tras recargar");
  const same = upload(new BrowserLispLibraryStore(storage), "estudio", "cajetin.lsp", `${SOURCE}\n(princ)`);
  ok(same.ok && same.file.version === 2 && same.unchanged, "y el mismo contenido no versiona");
}

// --- dos organizaciones no se ven -------------------------------------------------
{
  const storage = new FakeStorage();
  const store = new BrowserLispLibraryStore(storage);
  upload(store, "estudio-a", "a.lsp", SOURCE);
  upload(store, "estudio-b", "b.lsp", SOURCE);
  eq(store.read("estudio-a").map((file) => file.name), ["a.lsp"], "cada una ve la suya");
  eq(store.read("estudio-b").map((file) => file.name), ["b.lsp"], "y sólo la suya");
  ok(
    storage.map.has(lispLibraryKey("estudio-a")) && storage.map.has(lispLibraryKey("estudio-b")),
    "en claves distintas del almacén",
  );
}

// --- un almacén manipulado no puede presentar la biblioteca de otro ---------------
{
  const storage = new FakeStorage();
  storage.map.set(
    lispLibraryKey("victima"),
    JSON.stringify([
      {
        id: "x",
        tenantId: "otra-organizacion",
        name: "colado.lsp",
        source: SOURCE,
        version: 1,
        fingerprint: "0",
        updatedAt: "2026-01-01T00:00:00.000Z",
        updatedBy: "quien-sea",
        autoload: true,
        commands: ["CAJETIN"],
      },
    ]),
  );
  const files = new BrowserLispLibraryStore(storage).read("victima");
  eq(files[0].tenantId, "victima", "la organización se reescribe con la de la clave leída");
}

// --- corrupción: se descarta lo roto y se DICE ------------------------------------
{
  const storage = new FakeStorage();
  storage.map.set(lispLibraryKey("estudio"), "{ esto no es json");
  const broken = new BrowserLispLibraryStore(storage);
  eq(broken.read("estudio").length, 0, "un almacén ilegible se lee como biblioteca vacía");
  ok(broken.problems.some((problem) => problem.operation === "read"), "y el problema se apunta");

  const storage2 = new FakeStorage();
  storage2.map.set(
    lispLibraryKey("estudio"),
    JSON.stringify([{ name: "sin-fuente.lsp" }, { id: "y", name: "b.lsp", source: SOURCE, version: 3, fingerprint: "f", updatedAt: "t", updatedBy: "u", commands: [] }]),
  );
  const partial = new BrowserLispLibraryStore(storage2);
  const files = partial.read("estudio");
  eq(files.length, 1, "una entrada a medias se descarta y la sana se conserva");
  eq(files[0].name, "b.lsp", "que es la que estaba entera");
  ok(
    partial.problems.some((problem) => /descartaron 1/.test(problem.message)),
    "y se dice cuántas se descartaron, en vez de dejar un undefined suelto",
  );
}

// --- la cuota agotada NO pierde la rutina en silencio -----------------------------
{
  const storage = new FakeStorage();
  const store = new BrowserLispLibraryStore(storage);
  storage.failWrites = true;
  let thrown: string | null = null;
  try {
    upload(store, "estudio", "cajetin.lsp", SOURCE);
  } catch (cause) {
    thrown = cause instanceof Error ? cause.message : String(cause);
  }
  ok(thrown !== null, "escribir con la cuota agotada FALLA en vez de tragárselo");
  ok(/NO se pudo guardar/.test(thrown ?? ""), "y el mensaje dice exactamente qué pasó");
  eq(
    store.read("estudio").length,
    1,
    "pero la rutina queda usable en esta sesión: perderla además del guardado sería doble castigo",
  );
  ok(store.problems.some((problem) => problem.operation === "write"), "el problema queda apuntado");
}

// --- el tope por organización se comprueba antes de tocar el navegador ------------
{
  const storage = new FakeStorage();
  const store = new BrowserLispLibraryStore(storage);
  const huge = `(defun c:GRANDE () (princ "${"x".repeat(MAX_LIBRARY_BYTES)}"))`;
  let thrown: string | null = null;
  try {
    upload(store, "estudio", "grande.lsp", huge);
  } catch (cause) {
    thrown = cause instanceof Error ? cause.message : String(cause);
  }
  // El fichero pasa del tope POR FICHERO de `library.ts` o del tope por
  // organización de aquí; en los dos casos se rechaza antes de escribir.
  ok(
    thrown !== null || store.read("estudio").length === 0,
    "una biblioteca que no cabe se rechaza sin dejar el almacén a medias",
  );
  eq(storage.map.size, 0, "y sin haber escrito nada en el navegador");
}

// --- vaciar ------------------------------------------------------------------------
{
  const storage = new FakeStorage();
  const store = new BrowserLispLibraryStore(storage);
  upload(store, "estudio", "cajetin.lsp", SOURCE);
  store.clear("estudio");
  eq(store.read("estudio").length, 0, "vaciar deja la biblioteca vacía");
  eq(storage.map.has(lispLibraryKey("estudio")), false, "y borra la clave del almacén");
}

console.log(
  `library-storage: ${checks} aserciones verdes (sobrevive a la recarga con versión, autor y ` +
    `fecha; organizaciones aisladas; almacén manipulado reescrito a la clave leída; corrupción ` +
    `descartada y reportada; cuota agotada que falla diciéndolo sin perder la rutina). ` +
    `LÍMITE DECLARADO: la persistencia es del NAVEGADOR, no del servidor — el endpoint ` +
    `/v1/cad/lisp/* es de otra sesión y el puerto LispLibraryStore queda listo para él.`,
);
