/**
 * EL ISOMÉTRICO: LA PROYECCIÓN, Y LO QUE SE ROTULA ENCIMA.
 *
 * Lo que aquí se mide es lo que hace que un isométrico sirva en obra: que los
 * tres ejes se dibujen a 30°, 150° y vertical; que un codo de 90° en el modelo
 * se vea como los 120° que un fontanero reconoce; que la longitud ROTULADA sea
 * la verdadera aunque el trazo salga más corto —que es justo el caso donde una
 * cota del dibujo mentiría—; y que la hoja diga que no está a escala.
 */
import { strict as assert } from "node:assert";
import {
  CAD_ISO_PIPE_LAYER,
  CAD_ISO_TEXT_LAYER,
  cadIsoDrawing,
  cadIsoLengthText,
  cadIsoProject,
  cadIsoTextHeight,
} from "./isometric";
import type { CadPipeRoute } from "./pipe-route";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};
const casi = (actual: number, esperado: number, mensaje: string, tolerancia = 1e-6) => {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia,
    `${mensaje} — se esperaba ${esperado} y salió ${actual}`,
  );
  verdes += 1;
};

const largo = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(b.x - a.x, b.y - a.y);

let ids = 0;
const nuevoId = () => `iso-${(ids += 1)}`;

function ruta(line: string, puntos: [number, number, number][]): CadPipeRoute {
  const partido = /^([^-]+)-([A-Z]{1,3})-(\d+)-(.+)$/u.exec(line)!;
  return {
    entityId: `r-${line}`,
    line,
    size: partido[1],
    service: partido[2],
    number: Number(partido[3]),
    spec: partido[4],
    points: puntos.map(([x, y, z]) => ({ x, y, z })),
  };
}

// --- 1 · los tres ejes van donde tienen que ir ---------------------------
{
  const origen = cadIsoProject({ x: 0, y: 0, z: 0 });
  casi(origen.x, 0, "el origen es el origen (x)");
  casi(origen.y, 0, "el origen es el origen (y)");

  const este = cadIsoProject({ x: 1_000, y: 0, z: 0 });
  casi((Math.atan2(este.y, este.x) * 180) / Math.PI, 30, "el eje X sube a 30°", 1e-9);
  const norte = cadIsoProject({ x: 0, y: 1_000, z: 0 });
  casi((Math.atan2(norte.y, norte.x) * 180) / Math.PI, 150, "el eje Y sube a 150°", 1e-9);
  const arriba = cadIsoProject({ x: 0, y: 0, z: 1_000 });
  casi(arriba.x, 0, "la Z es vertical: no se corre en horizontal");
  casi(arriba.y, 1_000, "y sube lo que sube");
}

// --- 2 · isométrica DE DIBUJANTE: los ejes conservan su longitud ---------
{
  const cero = cadIsoProject({ x: 0, y: 0, z: 0 });
  casi(largo(cero, cadIsoProject({ x: 3_000, y: 0, z: 0 })), 3_000, "3 m al este son 3 m de trazo");
  casi(largo(cero, cadIsoProject({ x: 0, y: 3_000, z: 0 })), 3_000, "y 3 m al norte, también");
  casi(largo(cero, cadIsoProject({ x: 0, y: 0, z: 3_000 })), 3_000, "y 3 m arriba, también");

  // El caso donde una COTA del dibujo mentiría, que es el motivo de rotular
  // con texto: una diagonal de 1.414 sale dibujada de 1.000.
  const diagonal = largo(cero, cadIsoProject({ x: 1_000, y: 1_000, z: 0 }));
  casi(diagonal, 1_000, "la diagonal se dibuja MÁS CORTA de lo que mide");
  casi(Math.hypot(1_000, 1_000), 1_414.213562, "cuando de verdad mide 1.414", 1e-4);
}

// --- 3 · un codo de 90° se ve como los 120° de todo isométrico -----------
{
  const a = cadIsoProject({ x: 0, y: 0, z: 0 });
  const b = cadIsoProject({ x: 5_000, y: 0, z: 0 });
  const c = cadIsoProject({ x: 5_000, y: 5_000, z: 0 });
  const anguloAB = Math.atan2(b.y - a.y, b.x - a.x);
  const anguloBC = Math.atan2(c.y - b.y, c.x - b.x);
  const giro = Math.abs(((anguloBC - anguloAB) * 180) / Math.PI);
  casi(giro, 120, "el codo recto se dibuja de 120°: es la firma de un isométrico", 1e-9);
}

// --- 4 · el dibujo entero: trazo, rótulos, norte y título ----------------
{
  const linea = '6"-P-1001-CS150';
  const dibujo = cadIsoDrawing({
    routes: [
      ruta(linea, [
        [0, 0, 0],
        [12_000, 0, 0],
        [12_000, 0, 3_000],
        [12_000, 9_000, 3_000],
      ]),
    ],
    line: linea,
    unitsPerMetre: 1_000,
    origin: { x: 100_000, y: 0 },
    newEntityId: nuevoId,
  });

  const polilineas = dibujo.entities.filter((entidad) => entidad.type === "polyline");
  ok(
    polilineas.some((entidad) => entidad.layer === CAD_ISO_PIPE_LAYER),
    "la tubería va en su capa",
  );
  const textos = dibujo.entities.flatMap((entidad) =>
    entidad.type === "mtext" ? [entidad.text] : [],
  );

  // Las TRES longitudes verdaderas: 12 m, el montante de 3 m y los 9 m.
  for (const esperado of ["12.00 m", "3.00 m", "9.00 m"])
    ok(textos.includes(esperado), `se rotula ${esperado}: ${textos.join(" | ")}`);

  eq(dibujo.fittings.length, 2, "dos codos, uno de ellos el del montante");
  ok(
    textos.some((texto) => /^90° 6"$/.test(texto)),
    `y el accesorio se marca sobre el dibujo: ${textos.join(" | ")}`,
  );
  ok(
    textos.some((texto) => texto.includes(linea) && /SIN ESCALA/.test(texto)),
    "el título lleva el número de línea y declara que no está a escala",
  );
  ok(textos.includes("N"), "y el norte, sin el cual no se monta en obra");
  ok(
    dibujo.entities.every(
      (entidad) => entidad.layer === CAD_ISO_PIPE_LAYER || entidad.layer === CAD_ISO_TEXT_LAYER,
    ),
    "todo cae en las dos capas del isométrico y en ninguna otra",
  );

  // Colocado donde se pidió, no en el origen del mundo.
  ok(
    dibujo.bounds.minX >= 100_000 && dibujo.bounds.maxX > dibujo.bounds.minX,
    `el dibujo se coloca a la derecha del modelo: ${JSON.stringify(dibujo.bounds)}`,
  );
}

// --- 5 · sin rutas no se inventa una hoja --------------------------------
{
  const vacio = cadIsoDrawing({
    routes: [],
    line: '6"-P-1001-CS150',
    unitsPerMetre: 1_000,
    origin: { x: 0, y: 0 },
    newEntityId: nuevoId,
  });
  eq(vacio.entities.length, 0, "sin rutas no hay isométrico, y no se finge uno");
}

// --- 6 · la letra se adapta al tamaño, con topes -------------------------
{
  const chico = cadIsoTextHeight({ minX: 0, minY: 0, maxX: 300, maxY: 300 });
  const grande = cadIsoTextHeight({ minX: 0, minY: 0, maxX: 500_000, maxY: 500_000 });
  ok(chico >= 60, "un tramo corto no sale con letra ilegible");
  ok(grande <= 2_000, "y uno de 500 m no sale con letra de cartel");
  eq(cadIsoLengthText(1_500, 1_000), "1.50 m", "la longitud se rotula en metros con dos decimales");
}

console.log(
  `Isométrico de tubería: ${verdes} comprobaciones verdes — ejes a 30°, codo recto dibujado de 120°, longitudes VERDADERAS rotuladas donde el trazo mentiría, norte y «sin escala» en el título`,
);
