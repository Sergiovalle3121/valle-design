/**
 * GATE DE LOCALIZADORES — los presets de cámara se piden por la fixture.
 *
 * ## El fallo que este gate existe para impedir
 *
 * Los seis presets de cámara nacen de UNA constante,
 * `CAD_CAMERA_VIEW_PRESET_BUTTONS` (`components/cad/viewport/camera-view-presets.ts`),
 * y la consumen DOS superficies: la barra superior del estudio
 * (`Layout3DEditor.tsx`) y el `CadViewCube`. Que compartan el `title` es
 * correcto y deliberado: misma acción, mismo nombre, que es lo que un usuario
 * espera.
 *
 * El efecto colateral no lo es. El día que entró el ViewCube,
 * `page.getByTitle(/Vista superior/)` pasó a resolver a DOS elementos y
 * Playwright, en modo estricto, se niega. Reventó diecinueve archivos de la
 * suite de golpe, sin un solo defecto de producto.
 *
 * Y no se vio, porque la suite ya no cabía en su presupuesto de CI y el job se
 * CANCELABA: cancelado no es fallo, así que nada se puso rojo y las regresiones
 * viajaron a `main`. El reparto en fragmentos arregla el presupuesto; este gate
 * arregla la causa, para que un tercer sitio con el mismo título cueste un rojo
 * barato de dos segundos en vez de una corrida entera sin veredicto.
 *
 * ## La regla
 *
 * Dentro de `apps/web/e2e/`, `getByTitle` NO puede nombrar un título de preset
 * de cámara —ni el de «Ajustar a la planta», que la misma fixture gobierna—
 * fuera de `e2e/fixtures/camera-preset.ts`.
 *
 * Los títulos NO están escritos aquí: se leen de la constante de producto. Si
 * mañana se añade un séptimo preset, queda cubierto sin tocar este archivo. Una
 * lista copiada a mano se desincroniza y acaba dando permiso justo a lo que
 * debía prohibir.
 *
 * El gate se mira también a sí mismo: la fixture tiene que ACOTAR sus dos
 * llamadas a un contenedor. Una fixture que llame a `page.getByTitle` a secas
 * reintroduce la ambigüedad en el único sitio autorizado a tenerla.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const rel = (p) => path.relative(root, p).split(path.sep).join("/");

const FUENTE_DE_PRESETS =
  "apps/web/src/components/cad/viewport/camera-view-presets.ts";
const RAIZ_E2E = "apps/web/e2e";
const FIXTURE = "apps/web/e2e/fixtures/camera-preset.ts";

/**
 * Título del control de encuadre. No sale de la constante porque no es un
 * preset —es el botón de «ajustar»— pero lo gobierna la misma fixture y por
 * tanto la misma regla. Se declara con su motivo en vez de colarse.
 */
const TITULO_DE_ENCUADRE = "Ajustar a la planta";

const fallos = [];

// ── Los títulos, leídos del producto ────────────────────────────────────────
const fuente = fs.readFileSync(path.join(root, FUENTE_DE_PRESETS), "utf8");
const bloque = fuente.match(
  /CAD_CAMERA_VIEW_PRESET_BUTTONS[\s\S]*?=\s*\[([\s\S]*?)\n\];/,
);
if (!bloque) {
  console.error(
    `check:e2e-camera-preset — no pude leer CAD_CAMERA_VIEW_PRESET_BUTTONS en ${FUENTE_DE_PRESETS}.`,
  );
  console.error(
    "El gate deriva los títulos del producto a propósito. Si la constante cambió de forma, " +
      "actualice este lector — NO copie los títulos a mano.",
  );
  process.exit(1);
}
const titulos = [...bloque[1].matchAll(/,\s*"([^"]+)"\s*,/g)].map((m) => m[1]);
if (titulos.length === 0) {
  console.error(
    "check:e2e-camera-preset — la constante de presets no expuso ni un título; el gate no puede vigilar nada.",
  );
  process.exit(1);
}

/** Fragmentos que, dentro de un `getByTitle`, delatan un preset. */
const vigilados = [...titulos, TITULO_DE_ENCUADRE];

// ── El barrido de la suite ──────────────────────────────────────────────────
const IGNORADOS = new Set([".artifacts", ".report", ".test-results"]);

function* archivos(dir) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORADOS.has(entrada.name)) continue;
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) yield* archivos(completo);
    else if (entrada.name.endsWith(".ts")) yield completo;
  }
}

/**
 * `getByTitle(` … `)` con su argumento. El argumento llega en dos formas —
 * literal `"..."` y expresión regular `/.../`— y en la práctica es un TROZO del
 * título, no el título entero: los goldens escriben `/Vista superior/` para
 * apuntar a «Vista superior (planta)».
 *
 * Por eso la comparación va en las DOS direcciones. Buscar el título dentro del
 * argumento —el error obvio— no encuentra nada: fue la primera versión de este
 * gate y pasaba en verde sobre los diecinueve archivos rotos.
 */
const LLAMADA = /getByTitle\(([^)]*)\)/g;

/** Texto literal de un argumento de localizador, sin sus delimitadores. */
function textoDelArgumento(argumento) {
  const limpio = argumento.trim();
  const cuerpo =
    limpio.match(/^\/(.*)\/[gimsuy]*$/)?.[1] ??
    limpio.match(/^["'`](.*)["'`]$/)?.[1] ??
    null;
  // Sin delimitadores reconocibles es una variable o una expresión: no se puede
  // decidir estáticamente y el gate no inventa. `null` = no vigilado.
  if (cuerpo === null) return null;
  // Las escapes de regex (`\(planta\)`) no forman parte del texto buscado.
  const texto = cuerpo.replace(/\\(.)/g, "$1").trim();
  // Un fragmento de una o dos letras haría `includes` verdadero contra
  // cualquier cosa y convertiría el gate en ruido.
  return texto.length >= 3 ? texto : null;
}

let revisados = 0;
for (const archivo of archivos(path.join(root, RAIZ_E2E))) {
  const ruta = rel(archivo);
  const esFixture = ruta === FIXTURE;
  const lineas = fs.readFileSync(archivo, "utf8").split("\n");
  revisados += 1;

  lineas.forEach((linea, i) => {
    // Un comentario que MENCIONA el título es prosa legítima y abundante: los
    // goldens explican por qué encuadran. Sólo interesa la llamada real.
    const codigo = linea.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
    for (const llamada of codigo.matchAll(LLAMADA)) {
      const texto = textoDelArgumento(llamada[1]);
      if (texto === null) continue;
      // En las dos direcciones: el argumento suele ser un trozo del título
      // («Vista superior» → «Vista superior (planta)»), pero también puede
      // traerlo entero o de más.
      const acertado = vigilados.find(
        (t) => t.includes(texto) || texto.includes(t),
      );
      if (!acertado) continue;

      if (!esFixture) {
        fallos.push(
          `${ruta}:${i + 1} — getByTitle(«${acertado}») fuera de la fixture. ` +
            `Use topView(page) / fitFootprint(page) de ${FIXTURE}.`,
        );
        continue;
      }
      // Dentro de la fixture: la llamada tiene que ir ACOTADA a un contenedor,
      // nunca colgando de `page`.
      const antes = codigo.slice(0, llamada.index);
      if (/(?:^|[^.\w])page\s*\.\s*$/.test(antes)) {
        fallos.push(
          `${ruta}:${i + 1} — la fixture llama a page.getByTitle(«${acertado}») sin acotar. ` +
            "Acótela al contenedor (getByTestId) o vuelve la ambigüedad que este gate persigue.",
        );
      }
    }
  });
}

if (fallos.length > 0) {
  console.error(
    `check:e2e-camera-preset — ${fallos.length} localizador(es) ambiguo(s) de preset de cámara:`,
  );
  for (const f of fallos) console.error(`  · ${f}`);
  console.error(
    "\nMotivo: la barra superior y el ViewCube comparten estos títulos a propósito, " +
      "así que un getByTitle sin acotar resuelve a dos elementos y Playwright se niega.",
  );
  process.exit(1);
}

console.log(
  `check:e2e-camera-preset OK — ${titulos.length} título(s) de preset vigilado(s) ` +
    `sobre ${revisados} archivo(s) de e2e; todas las llamadas pasan por la fixture.`,
);
