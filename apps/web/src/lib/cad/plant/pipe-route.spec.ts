/**
 * LA RUTA 3D Y LOS ACCESORIOS QUE IMPLICA.
 *
 * Lo que se mide aquí no es «que el módulo compile»: es que la longitud sea la
 * de TRES dimensiones —un montante de 2 m no es cero metros de tubo—, que un
 * codo aparezca donde la ruta gira y con los grados que gira, que una te salga
 * donde un ramal muere sobre el cuerpo de otra línea y no donde dos tuberías se
 * cruzan sin tocarse, y que una reducción necesite dos diámetros distintos
 * punta con punta. Un accesorio de más es material comprado de más.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "../cad-document";
import { CAD_PL_LINE, CAD_PL_SERVICE, CAD_PL_SPEC } from "./line-numbers";
import {
  CAD_PL_ROUTE,
  CAD_PL_ROUTE_MARK,
  cadPipeFittingLabel,
  cadPipeFittings,
  cadPipeRouteFindings,
  cadPipeRouteLength,
  cadPipeRoutesOf,
  cadPipeTurnAngle,
} from "./pipe-route";

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

type Punto = [number, number, number];

function ruta(
  id: string,
  line: string,
  puntos: Punto[],
  extra: Record<string, string> = {},
): CadDocument["entities"][number] {
  const partido = /^([^-]+)-([A-Z]{1,3})-\d+-(.+)$/u.exec(line)!;
  return {
    id,
    type: "polyline",
    vertices: puntos.map(([x, y, z]) => ({ x, y, z })),
    closed: false,
    layer: "TU-RUTA",
    context: {
      metadata: {
        [CAD_PL_LINE]: line,
        [CAD_PL_SERVICE]: partido[2],
        [CAD_PL_SPEC]: partido[3],
        [CAD_PL_ROUTE]: CAD_PL_ROUTE_MARK,
        ...extra,
      },
    },
  } as unknown as CadDocument["entities"][number];
}

const doc = (entities: CadDocument["entities"][number][]) => ({ entities });

// --- 1 · sólo es ruta lo que se declara ruta -----------------------------
{
  const conMarca = ruta("r1", '6"-P-1001-CS150', [
    [0, 0, 0],
    [10_000, 0, 0],
  ]);
  const sinMarca = {
    ...conMarca,
    id: "r2",
    context: { metadata: { [CAD_PL_LINE]: '6"-P-1002-CS150' } },
  } as unknown as CadDocument["entities"][number];
  const leidas = cadPipeRoutesOf(doc([conMarca, sinMarca]));
  eq(leidas.length, 1, "el trazo del P&ID sin marca de ruta NO es una ruta 3D");
  eq(leidas[0].size, '6"', "el diámetro sale del número de línea");
  eq(leidas[0].spec, "CS150", "y la especificación viaja con ella");

  // Un número ilegible no compone una ruta: la lista de materiales diría
  // «tubo undefined».
  const ilegible = ruta("r3", '6"-P-1003-CS150', [
    [0, 0, 0],
    [1, 0, 0],
  ]);
  (ilegible as { context: { metadata: Record<string, string> } }).context.metadata[CAD_PL_LINE] =
    "TUBERIA GRANDE";
  eq(cadPipeRoutesOf(doc([ilegible])).length, 0, "un número ilegible no compone una ruta");
}

// --- 2 · la longitud es de TRES dimensiones ------------------------------
{
  // 3 m al este, 4 m al norte y 12 m hacia arriba: 3-4-5 y luego 5-12-13.
  casi(
    cadPipeRouteLength([
      { x: 0, y: 0, z: 0 },
      { x: 3_000, y: 4_000, z: 0 },
    ]),
    5_000,
    "el tramo horizontal mide su hipotenusa",
  );
  casi(
    cadPipeRouteLength([
      { x: 0, y: 0, z: 0 },
      { x: 3_000, y: 4_000, z: 12_000 },
    ]),
    13_000,
    "y el que sube mide en 3D: un montante NO es cero metros de tubo",
  );
}

// --- 3 · el ángulo del giro, con los casos que rompen el coseno ----------
{
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 1_000, y: 0, z: 0 };
  casi(cadPipeTurnAngle(a, b, { x: 2_000, y: 0, z: 0 }), 0, "recto es cero grados");
  casi(cadPipeTurnAngle(a, b, { x: 1_000, y: 1_000, z: 0 }), 90, "el giro en planta");
  casi(cadPipeTurnAngle(a, b, { x: 1_000, y: 0, z: 1_000 }), 90, "y el montante también gira 90°");
  casi(cadPipeTurnAngle(a, b, { x: 2_000, y: 1_000, z: 0 }), 45, "un 45 es un 45");
  eq(cadPipeTurnAngle(a, b, b), 0, "un tramo de longitud cero no gira: no revienta");
}

// --- 4 · los codos salen de los vértices ---------------------------------
{
  const codo = ruta("c1", '6"-P-1001-CS150', [
    [0, 0, 0],
    [10_000, 0, 0],
    [10_000, 8_000, 0],
    [10_000, 8_000, 3_000],
  ]);
  const accesorios = cadPipeFittings(cadPipeRoutesOf(doc([codo])));
  eq(accesorios.length, 2, "dos vértices que giran, dos codos");
  ok(
    accesorios.every((pieza) => pieza.kind === "codo" && Math.round(pieza.angle ?? 0) === 90),
    "los dos de 90°, y el segundo es el que sube: el montante lleva su codo",
  );
  eq(cadPipeFittingLabel(accesorios[0]), 'Codo 90° 6"', "y se nombra como se compra");

  const recta = ruta("c2", '6"-P-1002-CS150', [
    [0, 0, 0],
    [5_000, 0, 0],
    [10_000, 0, 0],
  ]);
  eq(
    cadPipeFittings(cadPipeRoutesOf(doc([recta]))).length,
    0,
    "un vértice que NO gira no es un codo: sería material comprado de más",
  );
}

// --- 5 · la te, y lo que NO es una te ------------------------------------
{
  const cabezal = ruta("t1", '6"-P-1001-CS150', [
    [0, 0, 0],
    [20_000, 0, 0],
  ]);
  const ramal = ruta("t2", '4"-P-1002-CS150', [
    [10_000, 0, 0],
    [10_000, 5_000, 0],
  ]);
  const conTe = cadPipeFittings(cadPipeRoutesOf(doc([cabezal, ramal])));
  const tes = conTe.filter((pieza) => pieza.kind === "te");
  eq(tes.length, 1, "el ramal que muere sobre el cabezal es una te");
  eq(tes[0].size, '6"', "y la te es del diámetro del CABEZAL: es la pieza que se corta sobre él");

  // Dos tuberías que se cruzan a cotas distintas NO se tocan.
  const cruce = ruta("t3", '4"-P-1003-CS150', [
    [10_000, -5_000, 3_000],
    [10_000, 5_000, 3_000],
  ]);
  eq(
    cadPipeFittings(cadPipeRoutesOf(doc([cabezal, cruce]))).filter((p) => p.kind === "te").length,
    0,
    "un cruce a otra cota no es una te: en 2D lo parecería y por eso la ruta es 3D",
  );

  // Punta con punta del mismo diámetro es un empalme recto, no una te.
  const sigue = ruta("t4", '6"-P-1004-CS150', [
    [20_000, 0, 0],
    [30_000, 0, 0],
  ]);
  eq(
    cadPipeFittings(cadPipeRoutesOf(doc([cabezal, sigue]))).length,
    0,
    "punta con punta e igual diámetro no es accesorio",
  );
}

// --- 6 · la reducción necesita DOS diámetros -----------------------------
{
  const grande = ruta("d1", '6"-P-1001-CS150', [
    [0, 0, 0],
    [10_000, 0, 0],
  ]);
  const chico = ruta("d2", '4"-P-1002-CS150', [
    [10_000, 0, 0],
    [16_000, 0, 0],
  ]);
  const piezas = cadPipeFittings(cadPipeRoutesOf(doc([grande, chico])));
  const reducciones = piezas.filter((pieza) => pieza.kind === "reduccion");
  eq(reducciones.length, 1, "una sola reducción, no una por cada punta");
  eq(cadPipeFittingLabel(reducciones[0]), 'Reducción 6" × 4"', "se nombra con los dos diámetros");
}

// --- 7 · los hallazgos, que se cazan sin catálogo ------------------------
{
  const partida = [
    ruta("h1", '6"-P-1001-CS150', [
      [0, 0, 0],
      [10_000, 0, 0],
    ]),
    ruta("h2", '6"-P-1001-SS300', [
      [10_000, 0, 0],
      [20_000, 0, 0],
    ]),
  ];
  const hallazgos = cadPipeRouteFindings(cadPipeRoutesOf(doc(partida)));
  ok(
    hallazgos.some(
      (h) => h.kind === "especificacion-partida" && /la línea P-1001 usa CS150 y SS300/.test(h.detail),
    ),
    `la MISMA línea (servicio y correlativo) con dos especificaciones: ${hallazgos.map((h) => h.detail).join(" / ")}`,
  );

  // Y el caso que NO es un defecto: la misma línea que reduce de 6" a 4".
  const reduce = [
    ruta("h1b", '6"-P-1005-CS150', [
      [0, 0, 0],
      [10_000, 0, 0],
    ]),
    ruta("h2b", '4"-P-1005-CS150', [
      [10_000, 0, 0],
      [16_000, 0, 0],
    ]),
  ];
  eq(
    cadPipeRouteFindings(cadPipeRoutesOf(doc(reduce))).length,
    0,
    "una línea que cambia de diámetro NO es un defecto: para eso está la reducción",
  );

  const raro = ruta("h3", '6"-P-1002-CS150', [
    [0, 0, 0],
    [10_000, 0, 0],
    [16_000, 3_000, 0],
  ]);
  const deMedida = cadPipeRouteFindings(cadPipeRoutesOf(doc([raro])));
  ok(
    deMedida.some((h) => h.kind === "codo-a-medida" && /26\.6°/.test(h.detail)),
    `un giro que no es 45 ni 90 se avisa con sus grados: ${deMedida.map((h) => h.detail).join(" / ")}`,
  );

  const plana = ruta("h4", '6"-P-1003-CS150', [
    [0, 0, 2_000],
    [10_000, 0, 2_000],
    [10_000, 5_000, 2_000],
  ]);
  ok(
    cadPipeRouteFindings(cadPipeRoutesOf(doc([plana]))).some((h) => h.kind === "ruta-plana"),
    "una ruta entera a la misma cota casi siempre es una elevación olvidada",
  );

  const limpia = ruta("h5", '6"-P-1004-CS150', [
    [0, 0, 0],
    [10_000, 0, 0],
    [10_000, 0, 3_000],
  ]);
  eq(
    cadPipeRouteFindings(cadPipeRoutesOf(doc([limpia]))).length,
    0,
    "y una ruta correcta no inventa hallazgos",
  );
}

console.log(
  `Ruta 3D de tubería: ${verdes} comprobaciones verdes — la longitud es la de tres dimensiones, el codo sale del vértice que gira, la te del ramal que muere sobre el cabezal y la reducción de dos diámetros punta con punta`,
);
