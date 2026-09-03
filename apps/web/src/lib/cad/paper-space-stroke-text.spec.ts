/**
 * El texto de una `.shx`, convertido en trazos.
 *
 * Lo que se afirma son PROPIEDADES, no un dibujo concreto: que las cinco `.shx`
 * comunes se reconozcan escritas de las tres maneras que aparecen en un dibujo
 * ajeno, que una familia que no lo es se quede como texto, que los trazos midan
 * lo que dice la altura pedida, que el giro gire de verdad y que centrar
 * desplace media anchura REAL.
 */
import { strict as assert } from "node:assert";
import type { CadPoint2 } from "./cad-document";
import { cadStrokeFamilyFor, cadStrokeTextPaths } from "./paper-space-stroke-text";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};
const cerca = (actual: number, esperado: number, mensaje: string, tol = 1e-6) => {
  assert.ok(Math.abs(actual - esperado) <= tol, `${mensaje} (${actual} vs ${esperado})`);
  verdes += 1;
};

// --- 1 · las cinco .shx comunes, escritas como aparecen en un dibujo ajeno --
for (const nombre of ["txt", "txt.shx", "TXT.SHX", "romans", "ROMANS.shx", "isocp", "monotxt", "simplex"])
  ok(cadStrokeFamilyFor(nombre), `${nombre} se reconoce como familia de trazos`);

// --- 2 · lo que NO es una .shx conocida se queda como texto -----------------
for (const nombre of ["Arial", "Helvetica", undefined, "", "gdt.shx", "ltypeshp"])
  eq(cadStrokeFamilyFor(nombre), null, `${String(nombre)} no se convierte a trazos`);

// --- 3 · los trazos miden lo que dice la altura pedida ---------------------
{
  const familia = cadStrokeFamilyFor("romans.shx")!;
  const trazos = cadStrokeTextPaths(familia, {
    point: { x: 0, y: 0 },
    text: "A",
    size: 10,
    rotation: 0,
  });
  ok(trazos.length > 0, "una «A» produce trazos");
  const alturas = trazos.flat().map((p) => p.y);
  cerca(Math.max(...alturas), 10, "la mayúscula llega exactamente a la altura pedida", 1e-9);
  cerca(Math.min(...alturas), 0, "y arranca en la línea base", 1e-9);
}

// --- 4 · el giro gira, y alrededor de la línea base -----------------------
{
  const familia = cadStrokeFamilyFor("txt")!;
  const recto = cadStrokeTextPaths(familia, { point: { x: 100, y: 50 }, text: "I", size: 4, rotation: 0 });
  const girado = cadStrokeTextPaths(familia, { point: { x: 100, y: 50 }, text: "I", size: 4, rotation: 90 });
  ok(recto.length > 0 && girado.length > 0, "los dos producen trazos");
  const anchoRecto = Math.max(...recto.flat().map((p) => p.x)) - Math.min(...recto.flat().map((p) => p.x));
  const altoGirado = Math.max(...girado.flat().map((p) => p.y)) - Math.min(...girado.flat().map((p) => p.y));
  cerca(altoGirado, anchoRecto, "a 90° lo que era ancho pasa a ser alto", 1e-6);
}

// --- 5 · alinear corre la anchura de AVANCE real, no una estimacion -------
{
  const familia = cadStrokeFamilyFor("simplex")!;
  const trazos = (align?: "center" | "right") =>
    cadStrokeTextPaths(familia, { point: { x: 0, y: 0 }, text: "PLANTA", size: 5, rotation: 0, align });
  const izquierda = trazos();
  const centrado = trazos("center");
  const derecha = trazos("right");
  const minX = (paths: CadPoint2[][]) => Math.min(...paths.flat().map((p) => p.x));
  const maxX = (paths: CadPoint2[][]) => Math.max(...paths.flat().map((p) => p.x));
  const corrimientoCentro = minX(centrado) - minX(izquierda);
  const corrimientoDerecha = minX(derecha) - minX(izquierda);
  ok(corrimientoDerecha < 0, "alinear a la derecha corre el rotulo hacia atras");
  cerca(
    corrimientoCentro * 2,
    corrimientoDerecha,
    "centrar corre EXACTAMENTE media anchura de avance",
    1e-9,
  );
  cerca(
    maxX(centrado) - minX(centrado),
    maxX(izquierda) - minX(izquierda),
    "y el rotulo mide lo mismo que sin alinear",
    1e-9,
  );
  // La anchura de AVANCE incluye el hueco que queda tras la ultima letra —por
  // eso el centro de la TINTA no cae en el punto y el de la caja si—: alineado
  // a la derecha la tinta acaba antes del punto, nunca despues.
  ok(maxX(derecha) <= 0, "alineado a la derecha ninguna tinta pasa del punto");
  ok(maxX(derecha) > -5, "y el hueco que queda detras es menor que una letra");
}

// --- 6 · varias líneas bajan, no se apilan --------------------------------
{
  const familia = cadStrokeFamilyFor("isocp")!;
  const dos = cadStrokeTextPaths(familia, {
    point: { x: 0, y: 0 },
    text: "UNO\nDOS",
    size: 10,
    rotation: 0,
  });
  const ys = dos.flat().map((p) => p.y);
  ok(Math.min(...ys) < -10, "la segunda línea va POR DEBAJO de la primera");
}

// --- 7 · un texto vacío no produce nada, y no lanza ------------------------
eq(cadStrokeTextPaths(cadStrokeFamilyFor("txt")!, { point: { x: 0, y: 0 }, text: "", size: 3, rotation: 0 }).length, 0, "un texto vacío no dibuja");

// --- 8 · el marco del PLAN mide la Y hacia abajo --------------------------
{
  const familia = cadStrokeFamilyFor("romans")!;
  const arriba = cadStrokeTextPaths(familia, {
    point: { x: 0, y: 100 },
    text: "A",
    size: 10,
    rotation: 0,
    yDown: true,
  });
  const ys = arriba.flat().map((p) => p.y);
  cerca(Math.max(...ys), 100, "la linea base sigue siendo el punto", 1e-9);
  cerca(Math.min(...ys), 90, "y la mayuscula sube 10 mm HACIA ARRIBA del papel", 1e-9);

  const dos = cadStrokeTextPaths(familia, {
    point: { x: 0, y: 100 },
    text: "UNO\nDOS",
    size: 10,
    rotation: 0,
    yDown: true,
  });
  ok(
    Math.max(...dos.flat().map((p) => p.y)) > 100,
    "la segunda linea baja por el papel, que en el plan es +Y",
  );

  // Girar 90 grados es lo que hace un rotulo VERTICAL, y un rotulo vertical se
  // lee HACIA ARRIBA del papel: el avance tiene que ir a -Y en el marco del
  // plan, y las mayusculas quedar a la izquierda del punto.
  const girado = cadStrokeTextPaths(familia, {
    point: { x: 0, y: 0 },
    text: "PLANTA",
    size: 5,
    rotation: 90,
    yDown: true,
  });
  const puntos = girado.flat();
  ok(Math.min(...puntos.map((p) => p.y)) < -5, "a 90 grados el rotulo se lee hacia arriba");
  ok(
    Math.max(...puntos.map((p) => p.y)) <= 1e-9,
    "y ni un trazo baja por debajo de la linea base",
  );
  ok(
    Math.max(...puntos.map((p) => p.x)) <= 1e-9,
    "las mayusculas quedan del lado -X, no del otro",
  );
}

console.log(`paper-space-stroke-text: ${verdes} comprobaciones verdes`);
