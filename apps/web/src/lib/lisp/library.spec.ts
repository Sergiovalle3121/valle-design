/**
 * La biblioteca `.lsp` por organización.
 *
 * Y una aclaración que esta spec deja por escrito para que no se lea de más:
 * lo que se prueba aquí es la LÓGICA —validación, versionado, autocarga,
 * inventario de comandos, colisiones—, con un almacén en memoria. La
 * persistencia real necesita un endpoint `/v1/cad/*` y el gate de contrato del
 * repositorio exige igualdad de conjuntos entre OpenAPI, SDK y router de Nest;
 * añadirlo desde aquí bloquearía a las demás sesiones. Está dicho en
 * `library.ts` y en el PR: conectarlo es trabajo de otra sesión.
 */
import { strict as assert } from "node:assert";
import {
  InMemoryLispLibraryStore,
  MAX_LIBRARY_FILES,
  autoloadOrder,
  commandInventory,
  fingerprintLispSource,
  removeLispFile,
  uploadLispFile,
  validateLispSource,
} from "./library";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
function eq<T>(actual: T, expected: T, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const GOOD = `
(defun vd:aux (a b) (+ a b))
(defun c:CAJETIN ( / p) (princ "cajetín"))
(defun c:EJES () (princ "ejes"))
`;

// --- validar NO ejecuta -----------------------------------------------------------
{
  const validation = validateLispSource(GOOD);
  ok(validation.ok, "un fichero correcto valida");
  eq(validation.commands, ["CAJETIN", "EJES"], "y declara sus dos comandos c:");
  eq(validation.definitions, ["VD:AUX", "C:CAJETIN", "C:EJES"], "con el inventario de funciones");

  // Validar un fichero que borraría el dibujo no borra nada: leer no ejecuta.
  const destructive = validateLispSource('(entdel (entnext)) (command "ERASE" (ssget "X") "")');
  ok(destructive.ok, "un fichero destructivo también valida: validar es LEER, no ejecutar");
}

// --- un fichero roto se RECHAZA, con línea y columna --------------------------------
{
  const validation = validateLispSource("(defun c:x ( / p)\n  (princ \"sin cerrar\")");
  ok(!validation.ok, "un paréntesis sin cerrar no valida");
  ok(/línea \d+, columna \d+/.test(validation.problem ?? ""), `y dice dónde: ${validation.problem}`);

  const store = new InMemoryLispLibraryStore();
  const upload = uploadLispFile(store, {
    tenantId: "t1",
    name: "roto.lsp",
    source: "(defun c:x (",
    updatedBy: "sergio",
    now: "2026-01-01T00:00:00.000Z",
  });
  ok(!upload.ok, "y no se sube");
  eq(store.read("t1").length, 0, "la biblioteca sigue vacía: no se guarda ni «en borrador»");
}

// --- versionado monotónico, y el mismo contenido NO crea versión ----------------------
{
  const store = new InMemoryLispLibraryStore();
  const first = uploadLispFile(store, {
    tenantId: "t1", name: "cajetin.lsp", source: GOOD, updatedBy: "sergio",
    now: "2026-01-01T00:00:00.000Z", autoload: true,
  });
  ok(first.ok, "la primera subida funciona");
  eq(first.ok && first.file.version, 1, "y nace en la versión 1");
  eq(first.ok && first.created, true, "marcada como creación");

  const same = uploadLispFile(store, {
    tenantId: "t1", name: "cajetin.lsp", source: GOOD, updatedBy: "sergio",
    now: "2026-01-02T00:00:00.000Z",
  });
  eq(same.ok && same.file.version, 1, "subir el MISMO contenido no crea versión nueva");
  eq(same.ok && same.unchanged, true, "y se dice que no cambió");

  const changed = uploadLispFile(store, {
    tenantId: "t1", name: "cajetin.lsp", source: `${GOOD}\n(defun c:NUEVO () nil)`,
    updatedBy: "ana", now: "2026-01-03T00:00:00.000Z",
  });
  eq(changed.ok && changed.file.version, 2, "un contenido distinto sí sube la versión");
  eq(changed.ok && changed.file.updatedBy, "ana", "con quien lo cambió");
  eq(changed.ok && changed.file.autoload, true, "y conservando la autocarga que ya tenía");
  eq(changed.ok && changed.file.commands, ["CAJETIN", "EJES", "NUEVO"], "y el inventario al día");
  eq(store.read("t1").length, 1, "sigue habiendo un solo fichero, no dos");
}

// --- las organizaciones no se ven entre sí -----------------------------------------------
{
  const store = new InMemoryLispLibraryStore();
  uploadLispFile(store, { tenantId: "a", name: "x.lsp", source: GOOD, updatedBy: "u", now: "t" });
  uploadLispFile(store, { tenantId: "b", name: "x.lsp", source: GOOD, updatedBy: "u", now: "t" });
  eq(store.read("a").length, 1, "cada organización tiene su fichero");
  eq(store.read("b").length, 1, "y la otra el suyo");
  eq(store.read("a")[0].id !== store.read("b")[0].id, true, "con identidades distintas");
}

// --- nombres admisibles ----------------------------------------------------------------------
{
  const store = new InMemoryLispLibraryStore();
  for (const name of ["../../etc/passwd", "sin-extension", "x.js", "", "a/b.lsp"]) {
    const result = uploadLispFile(store, {
      tenantId: "t", name, source: GOOD, updatedBy: "u", now: "t",
    });
    ok(!result.ok, `"${name}" no debe admitirse como nombre`);
  }
  ok(uploadLispFile(store, { tenantId: "t", name: "Cajetín-A3 v2.lsp", source: GOOD, updatedBy: "u", now: "t" }).ok,
    "pero un nombre corriente con espacios, acentos y guiones sí");
}

// --- la huella detecta cambios ------------------------------------------------------------------
{
  eq(fingerprintLispSource("(a)") === fingerprintLispSource("(a)"), true, "misma entrada, misma huella");
  eq(fingerprintLispSource("(a)") === fingerprintLispSource("(b)"), false, "entradas distintas, huellas distintas");
  // El orden importa: dos ficheros con las mismas funciones en distinto orden
  // NO son el mismo fichero, porque el orden de definición decide quién gana.
  eq(
    fingerprintLispSource("(defun a () 1)(defun b () 2)") ===
      fingerprintLispSource("(defun b () 2)(defun a () 1)"),
    false,
    "el orden de las definiciones cambia la huella",
  );
}

// --- autocarga: orden estable y colisiones REPORTADAS ---------------------------------------------
{
  const store = new InMemoryLispLibraryStore();
  // Se suben en orden inverso al alfabético a propósito.
  uploadLispFile(store, {
    tenantId: "t", name: "zeta.lsp", source: "(defun c:COMUN () 'zeta)",
    updatedBy: "u", now: "t", autoload: true,
  });
  uploadLispFile(store, {
    tenantId: "t", name: "alfa.lsp", source: "(defun c:COMUN () 'alfa) (defun c:SOLO () nil)",
    updatedBy: "u", now: "t", autoload: true,
  });
  uploadLispFile(store, {
    tenantId: "t", name: "manual.lsp", source: "(defun c:MANUAL () nil)",
    updatedBy: "u", now: "t", autoload: false,
  });

  eq(autoloadOrder(store, "t").map((file) => file.name), ["alfa.lsp", "zeta.lsp"],
    "la autocarga va por nombre, no por fecha de subida: si no, la biblioteca funcionaría según el historial");

  const inventory = commandInventory(store, "t");
  eq(inventory.commands.get("COMUN"), "zeta.lsp", "gana el fichero que se carga después");
  eq(inventory.commands.get("MANUAL"), undefined, "lo que no se autocarga no está en el inventario");
  eq(inventory.collisions, [{ command: "COMUN", files: ["alfa.lsp", "zeta.lsp"] }],
    "y la colisión se REPORTA: dos proveedores declarando el mismo comando cuesta días de diagnosticar");
}

// --- borrar -----------------------------------------------------------------------------------------
{
  const store = new InMemoryLispLibraryStore();
  uploadLispFile(store, { tenantId: "t", name: "x.lsp", source: GOOD, updatedBy: "u", now: "t" });
  eq(removeLispFile(store, "t", "X.LSP"), true, "borrar no distingue mayúsculas en el nombre");
  eq(store.read("t").length, 0, "y el fichero desaparece");
  eq(removeLispFile(store, "t", "x.lsp"), false, "borrar lo que no está devuelve false");
}

// --- topes --------------------------------------------------------------------------------------------
{
  const store = new InMemoryLispLibraryStore();
  const files = Array.from({ length: MAX_LIBRARY_FILES }, (_, index) => ({
    id: `id${index}`, tenantId: "t", name: `f${index}.lsp`, source: "", version: 1,
    fingerprint: "x", updatedAt: "t", updatedBy: "u", autoload: false, commands: [],
  }));
  store.write("t", files);
  const overflow = uploadLispFile(store, {
    tenantId: "t", name: "uno-mas.lsp", source: GOOD, updatedBy: "u", now: "t",
  });
  ok(!overflow.ok, "pasado el tope de ficheros, no se admite otro");

  const huge = validateLispSource("x".repeat(600 * 1024));
  ok(!huge.ok, "un fichero por encima del tope de tamaño se rechaza antes de leerlo");
}

console.log(`library: ${checks} aserciones verdes (validar es leer y no ejecutar, versión monotónica, mismo contenido no versiona, autocarga en orden estable, colisiones reportadas). La persistencia real es un PUERTO sin conectar: exige un endpoint /v1/cad/* y queda para otra sesión.`);
