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
 * fuera de `lib/lisp/`, con lo que cada uno hace aquí. Cualquier dependencia
 * nueva hace fallar esta spec, que es exactamente el momento en el que alguien
 * tiene que justificar por qué el intérprete necesita alcanzar algo más del
 * programa. El inventario se imprime en cada corrida para que no envejezca en
 * silencio dentro de un comentario.
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

let checks = 0;

const here = path.dirname(fileURLToPath(import.meta.url));

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
   * Módulos de fuera de `lib/lisp/` que el subsistema importa, NORMALIZADOS a
   * su ruta desde `src/`: el especificador relativo cambia con la profundidad
   * del fichero (`../cad/x` frente a `../../cad/x`) y enumerar las dos formas
   * de cada módulo escondería el inventario detrás del ruido.
   *
   * Se enumeran exhaustivamente porque el valor de esta comprobación está en
   * que cambiarla duela: añadir una dependencia nueva obliga a editar esta
   * lista, y esa edición es lo que hace visible en el diff que el intérprete ha
   * empezado a depender de otra parte del programa.
   */
  const allowed = new Map<string, string>([
    // `rtos` reutiliza el MISMO formateador que las cotas: un plano no puede
    // tener dos verdades sobre cómo se escribe una medida.
    ["lib/cad/unit-format", "formato de longitudes de rtos"],
    // El modelo canónico y su ejecutor: tipos y funciones PURAS. La escritura
    // sigue saliendo por el puerto del anfitrión, nunca desde aquí.
    ["lib/cad/cad-document", "el documento canónico"],
    ["lib/cad/entity-commands", "el vocabulario de mutación canónico"],
    ["lib/cad/entity-runtime", "el registro de adaptadores por entidad"],
    // Las consultas BIM (`vd-areas`, `vd-carpinteria`, `vd-muros`) devuelven los
    // MISMOS números que enseña el producto. Es una lectura pura del documento
    // que la rutina ya alcanza con `entget`; la escritura sigue saliendo por
    // `host.apply`, que es la única puerta que hay.
    ["lib/cad/bim-schedule", "el cuadro de áreas y la tabla de cantidades derivados"],
    // El motor de comandos del producto: `command` lo CONDUCE en vez de
    // reimplementar un segundo intérprete de comandos.
    ["lib/cad/engine", "el registro de comandos del producto"],
  ]);

  const srcRoot = path.resolve(here, "../..");
  const seen = new Set<string>();
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
      const specifier = match[1];
      // El intérprete no puede depender de Node: viaja al navegador.
      assert.ok(
        !specifier.startsWith("node:"),
        `${path.relative(here, file)} importa ${specifier}: el intérprete no puede depender de Node.`,
      );
      checks += 1;
      // Los relativos que se quedan dentro de `lib/lisp/` son libres.
      const resolved = path.resolve(path.dirname(file), specifier);
      if (resolved.startsWith(here)) continue;
      // En forma POSIX: la allowlist se escribe con `/` y en Windows
      // `path.relative` devuelve `\`.
      const normalized = path.relative(srcRoot, resolved).split(path.sep).join("/");
      seen.add(normalized);
      assert.ok(
        allowed.has(normalized),
        `${path.relative(here, file)} importa ${specifier} (${normalized}), que no está en la ` +
          `lista de dependencias externas permitidas del subsistema LISP.`,
      );
      checks += 1;
    }
  }

  // El inventario sale por pantalla en cada corrida: es el número que impide
  // que «el intérprete está aislado» se convierta en un comentario viejo.
  console.log(`sandbox: dependencias externas en uso → ${[...seen].sort().join(", ") || "ninguna"}`);
}

console.log(`sandbox-surface: ${checks} aserciones verdes sobre ${files.length} módulos (sin red, sin DOM, sin eval del anfitrión, sin Node; dependencias externas enumeradas).`);
