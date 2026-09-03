/**
 * UNA FUENTE DE TRAZOS QUE RESUELVE GLIFOS DE VERDAD — EN LOS TRES SITIOS.
 *
 * ## Por qué existe este fichero, y por qué se llama así
 *
 * `docs/competitive/rubric.json`, criterio `mtext.stroke-fonts`: «una fuente de
 * trazos (SHX o equivalente de dominio público) resuelve glifos de verdad en
 * vez de sustituirse». El criterio nombraba ESTA ruta como su evidencia y la
 * ruta no existía, así que el punto fallaba — que es exactamente lo que tenía
 * que pasar: el artefacto de fidelidad medía que TODA `.shx` se sustituía.
 *
 * Aquí se afirma lo que hacía falta afirmar, y en los tres sitios donde el
 * rótulo tiene que salir igual:
 *
 * 1. **el visor** — `resolveCadMTextFont` devuelve una familia de trazos para
 *    las cinco `.shx` comunes, y `entity-three.ts` la dibuja con la pluma;
 * 2. **la lámina** — el plan de publicación cambia el comando de texto por
 *    caminos (`plot-stroke-text.ts`), así que la previa enseña trazos;
 * 3. **el PDF** — los mismos caminos llegan a los bytes del archivo.
 *
 * Y se afirma que son GLIFOS y no un adorno: cada letra dibuja algo distinto,
 * el juego cubre lo que un plano mexicano escribe (ÁÉÍÓÚÜÑ ° ± Ø ¿ ¡), y un
 * carácter sin glifo sale como `?` —la misma conducta que AutoCAD con una
 * `.shx` incompleta— en vez de un hueco silencioso.
 *
 * ## Lo que este spec NO afirma, y por eso no se cobra
 *
 * Que las anchuras sean las del binario `.shx` de Autodesk. No lo son: son las
 * de Hershey, `mtext-fonts.ts` lo declara con `metricsDiffer: true` y el
 * informe de fuentes del trazado lo repite rótulo a rótulo. Interpretar el
 * formato `.shx` no está hecho y no se finge.
 */
import { strict as assert } from "node:assert";
import {
  CAD_HERSHEY_CAP_HEIGHT,
  cadHersheyGlyph,
  cadHersheyTextStrokes,
  type CadHersheyFamily,
} from "./fonts/hershey-fonts";
import { CAD_MTEXT_SCREEN_FONT_OPTIONS, resolveCadMTextFont } from "./mtext-fonts";
import { cadStrokeFamilyFor, cadStrokeTextPaths } from "./paper-space-stroke-text";
import { cadStrokeTextCommands } from "./plot/plot-stroke-text";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

/** Huella de un glifo: sus trazos redondeados, para poder compararlos. */
function huella(family: CadHersheyFamily, character: string): string {
  return JSON.stringify(cadHersheyGlyph(family, character).strokes);
}

// --- 1 · las cinco .shx comunes RESUELVEN, y dicen a qué ------------------
{
  const esperado: Record<string, string> = {
    "txt.shx": "Hershey Simplex",
    "simplex.shx": "Hershey Simplex",
    "romans.shx": "Hershey Roman Simplex",
    "isocp.shx": "Hershey ISO",
    "monotxt.shx": "Hershey Mono",
  };
  for (const [shx, familia] of Object.entries(esperado)) {
    const resuelta = resolveCadMTextFont(shx, CAD_MTEXT_SCREEN_FONT_OPTIONS);
    eq(resuelta.strokeFamily, familia, `${shx} se dibuja con ${familia}`);
    eq(resuelta.metricsDiffer, true, `${shx} declara que las anchuras NO son las suyas`);
    // El visor y la lámina preguntan por caminos distintos; tienen que
    // responder lo mismo, o la pantalla y el papel dejan de coincidir.
    eq(cadStrokeFamilyFor(shx), familia, `${shx}: el papel resuelve lo mismo que la pantalla`);
    eq(cadStrokeFamilyFor(`C:\\\\fuentes\\\\${shx.toUpperCase()}`), familia, `${shx} con ruta y en mayúsculas, también`);
  }
}

// --- 2 · son glifos DISTINTOS, no un adorno repetido ----------------------
{
  const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const huellas = new Set([...letras].map((letra) => huella("Hershey Simplex", letra)));
  eq(huellas.size, letras.length, "las 36 letras y dígitos dibujan 36 cosas distintas");
  const interrogante = huella("Hershey Simplex", "?");
  for (const letra of letras)
    ok(huella("Hershey Simplex", letra) !== interrogante, `${letra} no es el glifo de relleno`);
}

// --- 3 · lo que un plano mexicano escribe, cubierto ------------------------
{
  const propios = "ÁÉÍÓÚÜÑáéíóúüñ°±Ø¿¡";
  const interrogante = huella("Hershey Simplex", "?");
  for (const caracter of propios)
    ok(
      huella("Hershey Simplex", caracter) !== interrogante,
      `«${caracter}» tiene glifo propio y no cae en el de relleno`,
    );
  // Y lo que NO tiene glifo sale como «?», que es lo que hace AutoCAD con una
  // .shx incompleta: un hueco callado parecería contenido que no está.
  eq(huella("Hershey Simplex", "漢"), interrogante, "un carácter sin glifo sale como «?», no como un hueco");
}

// --- 4 · el monoespaciado de MONOTXT es de verdad monoespaciado -----------
{
  const anchos = new Set([..."IWMil1"].map((letra) => cadHersheyGlyph("Hershey Mono", letra).advance));
  eq(anchos.size, 1, "en Hershey Mono todas las letras avanzan lo mismo");
  ok(
    new Set([..."IWMil1"].map((letra) => cadHersheyGlyph("Hershey Simplex", letra).advance)).size > 1,
    "y en la proporcional no, que es la diferencia entre las dos",
  );
}

// --- 5 · el glifo mide lo que se le pide -----------------------------------
{
  const { strokes } = cadHersheyTextStrokes("Hershey Roman Simplex", "H", 2.5);
  const ys = strokes.flat().map((punto) => punto.y);
  ok(Math.abs(Math.max(...ys) - 2.5) < 1e-9, "una mayúscula de 2,5 mm mide 2,5 mm");
  eq(CAD_HERSHEY_CAP_HEIGHT, 21, "la retícula Hershey se declara, para quien tenga que escalar");
}

// --- 6 · en la LÁMINA el rótulo deja de ser texto y pasa a ser trazos ------
{
  const comando = {
    kind: "text" as const,
    entityId: "rotulo",
    viewportId: "vp",
    point: { x: 10, y: 20 },
    text: "NIVEL ±0.00",
    size: 2.5,
    rotation: 0,
    color: "#000000",
  };
  const trazado = cadStrokeTextCommands(comando, new Map([["rotulo", "isocp.shx"]]));
  ok(trazado && trazado.length > 0, "el rótulo de la lámina se convierte en caminos");
  ok(
    trazado!.every((entrada) => entrada.kind === "path" && entrada.points.length >= 2),
    "y cada camino tiene al menos dos puntos: son trazos de pluma, no puntos sueltos",
  );
  eq(
    cadStrokeTextCommands(comando, new Map([["rotulo", "Arial"]])),
    null,
    "una Arial NO se convierte: el PDF perdería texto buscable y no ganaría nada",
  );
}

// --- 7 · el «±» del renglón anterior llegó a los trazos, no se cayó -------
{
  const familia = cadStrokeFamilyFor("isocp")!;
  const con = cadStrokeTextPaths(familia, { point: { x: 0, y: 0 }, text: "±", size: 3, rotation: 0 });
  ok(con.length >= 2, "el símbolo ± dibuja sus dos trazos");
}

console.log(`stroke-font-resolution: ${verdes} comprobaciones verdes`);
