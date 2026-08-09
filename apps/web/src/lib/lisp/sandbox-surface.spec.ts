/**
 * La superficie del sandbox, comprobada sobre el CÓDIGO FUENTE.
 *
 * «Una rutina de un tercero no puede salir a la red ni alcanzar el DOM» no se
 * demuestra con un test que intente hacerlo: el intérprete no expone ninguna
 * función que lo permita, así que el test pasaría por no existir la función, y
 * seguiría pasando el día que alguien la añadiera con otro nombre.
 *
 * Lo que sí se puede demostrar es lo de arriba: que NINGÚN módulo del
 * subsistema menciona `fetch`, `eval` de JavaScript, `XMLHttpRequest`, el DOM,
 * el almacenamiento local ni `process`. Si no está en el código, no hay forma de
 * llegar allí desde LISP — porque el único código que corre por una rutina es
 * este código.
 *
 * Y una segunda comprobación, más útil todavía: la LISTA COMPLETA de imports
 * fuera de `lib/lisp/`. Ahora mismo son dos módulos puros del CAD. Cualquier
 * dependencia nueva hace fallar esta spec, que es exactamente el momento en el
 * que alguien tiene que justificar por qué el intérprete necesita alcanzar algo
 * más del programa.
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";

let checks = 0;

const here = path.dirname(new URL(import.meta.url).pathname);

function sourceFiles(directory: string, into: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(absolute, into);
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    // Las specs quedan fuera: son código de PRUEBA, no viajan al navegador, y
    // esta misma spec necesita `fs` para leer el árbol.
    if (entry.name.endsWith(".spec.ts")) continue;
    into.push(absolute);
  }
  return into;
}

const files = sourceFiles(here);
assert.ok(files.length >= 10, `se esperaban módulos que auditar y se encontraron ${files.length}`);
checks += 1;

// --- nada que salga del intérprete ------------------------------------------------
{
  const forbidden: Array<[RegExp, string]> = [
    [/\bfetch\s*\(/, "salida a la red con fetch"],
    [/\bXMLHttpRequest\b/, "salida a la red con XMLHttpRequest"],
    [/\bWebSocket\b/, "salida a la red con WebSocket"],
    [/\bnavigator\s*\.\s*sendBeacon\b/, "salida a la red con sendBeacon"],
    [/\beval\s*\(/, "el eval del anfitrión"],
    [/\bnew\s+Function\b/, "construcción dinámica de funciones"],
    [/\bimport\s*\(/, "import dinámico"],
    [/\brequire\s*\(/, "require dinámico"],
    [/\bdocument\s*\.\s*(?:createElement|querySelector|getElementById|body|cookie)\b/, "acceso al DOM"],
    [/\bwindow\s*\./, "acceso al objeto window"],
    [/\bglobalThis\s*\./, "acceso al ámbito global"],
    [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/, "almacenamiento del navegador"],
    [/\bprocess\s*\./, "acceso al proceso de Node"],
  ];

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const [pattern, what] of forbidden) {
      const match = pattern.exec(source);
      assert.equal(
        match,
        null,
        `${path.relative(here, file)} menciona ${what}: «${match?.[0] ?? ""}». El subsistema LISP no puede alcanzar nada de eso.`,
      );
      checks += 1;
    }
  }
}

// --- la lista COMPLETA de dependencias externas ------------------------------------
{
  /**
   * Módulos de fuera de `lib/lisp/` que el subsistema importa. Se enumeran
   * exhaustivamente porque el valor de esta comprobación está en que cambiarla
   * duela: añadir una dependencia nueva obliga a editar esta lista, y esa
   * edición es lo que hace visible en el diff que el intérprete ha empezado a
   * depender de otra parte del programa.
   */
  const allowed = new Set([
    // Formato de longitudes: `rtos` reutiliza el MISMO formateador que las
    // cotas para que un plano no tenga dos verdades sobre cómo se escribe una
    // medida. Módulo puro, sin dependencias del editor.
    "../../cad/unit-format",
    // El modelo canónico y el ejecutor de comandos: sólo TIPOS y funciones
    // puras. La escritura sigue saliendo por el puerto del anfitrión.
    "../cad-document",
    "../cad/cad-document",
    "../cad/entity-commands",
    "../cad/entity-runtime",
    "../cad/engine",
    "../cad/transform2d",
    "../../cad/cad-document",
    "../../cad/entity-commands",
    "../../cad/entity-runtime",
  ]);

  const seen = new Set<string>();
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
      const specifier = match[1];
      // Node builtins no aparecen en el código de producción del subsistema.
      assert.ok(
        !specifier.startsWith("node:"),
        `${path.relative(here, file)} importa ${specifier}: el intérprete no puede depender de Node.`,
      );
      checks += 1;
      // Los relativos que se quedan dentro de `lib/lisp/` son libres.
      const resolved = path.resolve(path.dirname(file), specifier);
      if (resolved.startsWith(here)) continue;
      seen.add(specifier);
      assert.ok(
        allowed.has(specifier),
        `${path.relative(here, file)} importa ${specifier}, que no está en la lista de dependencias externas permitidas.`,
      );
      checks += 1;
    }
  }

  // El inventario sale por pantalla en cada corrida: es el número que impide
  // que «el intérprete está aislado» se convierta en un comentario viejo.
  console.log(`sandbox: dependencias externas en uso → ${[...seen].sort().join(", ") || "ninguna"}`);
}

console.log(`sandbox-surface: ${checks} aserciones verdes sobre ${files.length} módulos (sin red, sin DOM, sin eval del anfitrión, sin Node; dependencias externas enumeradas).`);
