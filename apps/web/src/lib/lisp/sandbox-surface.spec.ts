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
    // La tabla de variables de sistema, la MISMA que teclea SETVAR. `getvar` y
    // `setvar` la consultan en vez de tener su propia verdad: con dos tablas,
    // el `(setvar "OSMODE" 0)` de una rutina no apagaría lo que el dibujante
    // tiene puesto y el prólogo de despacho —`(setvar "CMDECHO" 0)`— seguiría
    // matando la rutina en su línea 2. Es una lectura y una escritura de
    // SESIÓN, tipada y validada por la propia tabla; el documento se sigue
    // escribiendo sólo por `host.apply`.
    ["lib/cad/system-variables", "la tabla de variables de sistema de getvar/setvar"],
    // `osnap` conduce el MOTOR DE CAPTURA del producto —el mismo que imana el
    // cursor del editor— en vez de calcular puntos notables por su cuenta. Con
    // geometría propia, la rutina engancharía un milímetro al lado de donde
    // engancha el ratón, y nadie sabría cuál de los dos manda.
    ["lib/cad/snap-engine", "el motor de referencia a objetos que resuelve osnap"],
    ["lib/cad/snap-scene", "la escena de captura: de las entidades a los puntos notables"],
    ["lib/cad/osnap-bits", "los nombres de los modos de captura, los mismos que traduce OSMODE"],
    // `textbox` mide con el MISMO medidor que dibuja el rótulo. Estimando el
    // ancho aquí, el recuadro que dibuja la rutina y el texto que pinta el
    // editor discreparían en el plano impreso, que es donde se ve.
    ["lib/cad/mtext-layout", "la medida del ancho de un rótulo para textbox"],
    // El color de la capa se publica como índice ACI con la misma conversión
    // que usa el trazado. Una aproximación propia haría que el (62) que lee una
    // rutina y la pluma que sale por la CTB fueran dos números distintos. El
    // puente Visual LISP usa la MISMA tabla para vla-get-Color/vla-put-Color:
    // con dos conversiones, el color que escribe una rutina y el que ve el
    // dibujante serían dos.
    ["lib/cad/plot/aci-palette", "el índice ACI del color, en el registro de capa y en vla-*-Color"],
    /**
     * El puente Visual LISP (`vlax-curve-*`, las propiedades Area y Length)
     * mide con la geometría DEL PRODUCTO, no con una propia.
     *
     * `inquiry/contours` es de donde AREA, MASSPROP y REGION sacan los
     * contornos de una entidad —del registro de adaptadores, que ya sabe
     * teselar el bulge de una polilínea y una NURBS— y su área, con la forma
     * cerrada donde la hay (πr² para un círculo). Con `geom-measure` en su
     * lugar, `(vlax-curve-getArea c)` habría contestado el polígono de 192
     * lados y se habría quedado un 0,014 % por debajo del número que el comando
     * AREA le enseña al usuario en la misma pantalla; ésa es la razón por la que
     * la dependencia es ésta y no aquélla.
     *
     * `divide-measure` aporta `pointAtDistance`, la función con la que DIVIDE y
     * MEASURE reparten sus marcas: `(vlax-curve-getPointAtDist e d)` tiene que
     * caer donde DIVIDE pone el poste, no un pelo al lado.
     *
     * Las dos son LECTURAS puras del documento. La escritura del puente sigue
     * saliendo por `host.apply`, que es la única puerta que hay.
     */
    ["lib/cad/inquiry/contours", "los contornos y el área de una entidad, los mismos que mide AREA"],
    ["lib/cad/divide-measure", "el punto a una distancia de la curva, el mismo que reparte DIVIDE"],
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
