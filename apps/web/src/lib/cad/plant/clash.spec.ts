/**
 * CHOQUES DE LA TUBERÍA CONTRA LO CONSTRUIDO.
 *
 * Lo que se mide aquí no es que el módulo compile: es que la MISMA tubería
 * cambie de veredicto al cambiar de cota —atravesar el muro es un choque duro
 * con su profundidad, cruzarlo por el vano de la puerta no lo es y se informa—,
 * que cinco milímetros de la cara sean holgura insuficiente y quinientos no
 * sean nada, que por encima de la altura del muro no haya nada que decir, que
 * dos rutas que se cruzan sin tocarse no sean un choque y dos que se solapan
 * sí, y que un vano que NO encaja en su anfitrión no reste — fallo cerrado, el
 * mismo criterio que el sólido del muro.
 *
 * La distancia se comprueba contra el número exacto, no contra un «hay
 * choque»: una arista de la caja mide `hypot(300, 200)` y eso es lo que tiene
 * que salir. Un booleano no distingue un roce de un empotramiento, y esa
 * distinción es toda la orden.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "../cad-document";
import {
  CAD_PL_CLASH_CLEARANCE_MM,
  cadPipeClashClearance,
  cadPipeClashReport,
  cadPipeClashSummary,
  cadPipeNominalMillimetres,
  cadSegmentBoxDistance,
} from "./clash";
import { CAD_PL_LINE, CAD_PL_SERVICE, CAD_PL_SPEC } from "./line-numbers";
import { CAD_PL_ROUTE, CAD_PL_ROUTE_MARK } from "./pipe-route";

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

type Entidad = CadDocument["entities"][number];
type Punto = [number, number, number];

function ruta(id: string, line: string, puntos: Punto[]): Entidad {
  const partido = /^([^-]+(?:-\d+\/\d+)?)-([A-Z]{1,3})-\d+-(.+)$/u.exec(line)!;
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
      },
    },
  } as unknown as Entidad;
}

/** El muro de todas las pruebas: 10 m de largo, 200 de grueso, 3 m de alto. */
const muro = (id = "w1"): Entidad =>
  ({
    id,
    type: "wall",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 10_000, y: 0, z: 0 },
    thickness: 200,
    height: 3_000,
    layer: "MUROS",
  }) as unknown as Entidad;

/** Puerta centrada en el muro: 900 de ancho, 2100 de alto, a ras de suelo. */
const puerta = (id = "v1", host = "w1", extra: Record<string, number> = {}): Entidad =>
  ({
    id,
    type: "opening",
    kind: "door",
    hostId: host,
    position: 5_000,
    width: 900,
    height: 2_100,
    sill: 0,
    swing: "left",
    hinge: "start",
    layer: "MUROS",
    ...extra,
  }) as unknown as Entidad;

const doc = (entities: Entidad[]) => ({ entities });
const RADIO_6 = 76.2; // 6" × 25,4 / 2
const RADIO_4 = 50.8;

// --- 1 · el diámetro es el NOMINAL, y sale de las pulgadas ----------------
{
  casi(cadPipeNominalMillimetres('6"') ?? -1, 152.4, '6" son 152,4 mm nominales');
  casi(cadPipeNominalMillimetres('1-1/2"') ?? -1, 38.1, "una pulgada y media son 38,1 mm");
  casi(cadPipeNominalMillimetres('3/4"') ?? -1, 19.05, "tres cuartos son 19,05 mm");
  eq(cadPipeNominalMillimetres("6"), null, "sin comilla no es una medida en pulgadas");
  eq(cadPipeNominalMillimetres("DN150"), null, "y una medida métrica no se adivina");
  eq(cadPipeClashClearance("mm"), CAD_PL_CLASH_CLEARANCE_MM, "en milímetros, la holgura es la constante");
  eq(cadPipeClashClearance("cm"), 5, "en centímetros son 5 unidades de dibujo: la misma distancia");
}

// --- 2 · atravesar el muro es un choque duro, con su profundidad ----------
{
  const atraviesa = ruta("r1", '6"-P-1001-CS150', [
    [2_000, -1_000, 2_500],
    [2_000, 1_000, 2_500],
  ]);
  const informe = cadPipeClashReport(doc([muro(), puerta(), atraviesa]));
  const contraMuro = informe.clashes.filter((choque) => choque.againstKind === "muro");
  eq(contraMuro.length, 1, "un renglón por par ruta-muro, no uno por tramo");
  eq(contraMuro[0].kind, "choque-duro", "una tubería dentro del muro es un choque duro");
  // El eje llega al centro del grueso: 100 de muro más el radio nominal.
  casi(contraMuro[0].depth ?? 0, 100 + RADIO_6, "la profundidad es medio grueso más el radio", 0.011);
  casi(contraMuro[0].gap, -(100 + RADIO_6), "y la separación es esa misma, en negativo", 0.011);
  eq(contraMuro[0].againstId, "w1", "se dice contra QUÉ se choca");
  casi(contraMuro[0].at.x, 2_000, "y dónde, en el mundo");
  casi(contraMuro[0].at.y, 0, "en el corazón del muro");
  casi(contraMuro[0].at.z, 2_500, "a la cota de la tubería");
  ok(/atraviesa el muro w1/.test(contraMuro[0].detail), `el renglón se lee: ${contraMuro[0].detail}`);
}

// --- 3 · la MISMA tubería a la cota del vano NO choca, y se informa -------
{
  const porElVano = ruta("r1", '6"-P-1001-CS150', [
    [5_000, -1_000, 1_000],
    [5_000, 1_000, 1_000],
  ]);
  const informe = cadPipeClashReport(doc([muro(), puerta(), porElVano]));
  eq(
    informe.clashes.filter((choque) => choque.kind === "choque-duro").length,
    0,
    "pasar por el vano de la puerta no es chocar con el muro",
  );
  eq(
    informe.clashes.filter((choque) => choque.kind === "holgura-insuficiente").length,
    0,
    "y con 450 de jamba a cada lado tampoco falta holgura",
  );
  const pasos = informe.clashes.filter((choque) => choque.kind === "paso-por-hueco");
  eq(pasos.length, 1, "pero SÍ se informa de que cruza el muro");
  eq(pasos[0].againstId, "v1", "y por qué hueco: el de la puerta, con su identificador");
  ok(/no choca, se informa/.test(pasos[0].detail), `informado, no acusado: ${pasos[0].detail}`);

  // Sin la puerta, exactamente la misma tubería sí choca. Es la prueba de que
  // lo que la salva es el vano y no una casualidad de la cota.
  const sinPuerta = cadPipeClashReport(doc([muro(), porElVano]));
  eq(sinPuerta.clashes.length, 1, "quitada la puerta, la misma ruta tiene un renglón");
  eq(sinPuerta.clashes[0].kind, "choque-duro", "y es un choque duro contra el muro macizo");
}

// --- 4 · cinco milímetros es holgura insuficiente; quinientos, nada -------
{
  const cerca = ruta("r1", '6"-P-1001-CS150', [
    [1_000, 100 + RADIO_6 + 5, 1_500],
    [3_000, 100 + RADIO_6 + 5, 1_500],
  ]);
  const informe = cadPipeClashReport(doc([muro(), puerta(), cerca]));
  eq(informe.clashes.length, 1, "rozar el muro se cuenta");
  eq(informe.clashes[0].kind, "holgura-insuficiente", "5 mm no es un choque: es una holgura que falta");
  casi(informe.clashes[0].gap, 5, "y la separación real se dice, no se redondea a «choca»", 0.011);
  eq(informe.clashes[0].depth, undefined, "sin interpenetración no hay profundidad que declarar");

  const lejos = ruta("r1", '6"-P-1001-CS150', [
    [1_000, 100 + RADIO_6 + 500, 1_500],
    [3_000, 100 + RADIO_6 + 500, 1_500],
  ]);
  eq(
    cadPipeClashReport(doc([muro(), puerta(), lejos])).clashes.length,
    0,
    "a 500 de la cara no hay nada que decir",
  );

  // La holgura es DECLARADA: con 1000 exigidos, esa misma tubería falta.
  eq(
    cadPipeClashReport(doc([muro(), puerta(), lejos]), { clearance: 1_000 }).clashes[0]?.kind,
    "holgura-insuficiente",
    "quien declara su holgura obtiene su respuesta",
  );
}

// --- 5 · por encima de la altura del muro, limpia -------------------------
{
  const porEncima = ruta("r1", '6"-P-1001-CS150', [
    [7_000, -1_000, 4_000],
    [7_000, 1_000, 4_000],
  ]);
  const informe = cadPipeClashReport(doc([muro(), puerta(), porEncima]));
  eq(informe.clashes.length, 0, "un muro de 3 m no estorba a una tubería a la cota 4 m");
  eq(informe.obstacles, 1, "y el muro se leyó: no es que no hubiera nada que comprobar");
  ok(/sin choques/.test(cadPipeClashSummary(informe)), "el resumen lo dice con el denominador");
}

// --- 6 · la distancia es exacta también contra una ARISTA -----------------
{
  // Montante a 300 del testero y a 300 del eje: lo más cerca es la arista
  // vertical del muro, y la distancia es la hipotenusa, no una coordenada.
  const montante = ruta("r1", '6"-P-1001-CS150', [
    [-300, -300, 0],
    [-300, -300, 3_000],
  ]);
  const informe = cadPipeClashReport(doc([muro(), montante]), { clearance: 1_000 });
  eq(informe.clashes.length, 1, "la arista también es muro");
  casi(
    informe.clashes[0].gap,
    Math.hypot(300, 200) - RADIO_6,
    "la distancia a la arista es la hipotenusa exacta",
    0.011,
  );
}

// --- 6-bis · «exacta» quiere decir exacta: contra un muestreo denso -------
{
  // Un muestreo de N puntos sobre el segmento sólo puede dar un valor MAYOR o
  // igual que el mínimo verdadero. Si la fórmula cerrada nunca lo supera y
  // además queda por debajo de él en algún caso —el vértice de la cuadrática
  // cae entre dos muestras—, es que está resolviendo el mínimo y no probando.
  const caja = { min: { x: 0, y: -100, z: 0 }, max: { x: 10_000, y: 100, z: 3_000 } };
  let semilla = 20_260_904;
  const azar = () => {
    // Congruencial: la prueba tiene que dar el mismo veredicto mañana.
    semilla = (semilla * 1_103_515_245 + 12_345) % 2_147_483_648;
    return semilla / 2_147_483_648;
  };
  const punto = (): [number, number, number] => [
    (azar() - 0.2) * 14_000,
    (azar() - 0.5) * 2_000,
    (azar() - 0.2) * 5_000,
  ];
  let peorExceso = 0;
  let mejorAhorro = 0;
  for (let caso = 0; caso < 400; caso += 1) {
    const [ax, ay, az] = punto();
    const [bx, by, bz] = punto();
    const a = { x: ax, y: ay, z: az };
    const b = { x: bx, y: by, z: bz };
    const cerrada = cadSegmentBoxDistance(a, b, caja).distance;
    let muestreado = Infinity;
    const N = 4_000;
    for (let i = 0; i <= N; i += 1) {
      const t = i / N;
      const p = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
      };
      const qx = Math.max(caja.min.x - p.x, p.x - caja.max.x);
      const qy = Math.max(caja.min.y - p.y, p.y - caja.max.y);
      const qz = Math.max(caja.min.z - p.z, p.z - caja.max.z);
      const valor =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) +
        Math.min(Math.max(qx, qy, qz), 0);
      if (valor < muestreado) muestreado = valor;
    }
    peorExceso = Math.max(peorExceso, cerrada - muestreado);
    mejorAhorro = Math.max(mejorAhorro, muestreado - cerrada);
  }
  ok(
    peorExceso <= 1e-9,
    `la fórmula cerrada nunca da más que 4001 muestras (exceso máximo ${peorExceso})`,
  );
  ok(
    mejorAhorro > 1e-6,
    `y en algún caso da MENOS que el muestreo, que es lo que distingue resolver de probar (ahorro máximo ${mejorAhorro})`,
  );
}

// --- 7 · ruta contra ruta: cruzarse no es chocar, solaparse sí ------------
{
  const principal = ruta("a", '6"-P-1001-CS150', [
    [0, 0, 5_000],
    [10_000, 0, 5_000],
  ]);
  const cruza = ruta("b", '4"-P-1002-CS150', [
    [5_000, -5_000, 5_400],
    [5_000, 5_000, 5_400],
  ]);
  eq(
    cadPipeClashReport(doc([principal, cruza])).clashes.length,
    0,
    "dos rutas que se cruzan con 400 de separación no se tocan",
  );

  const solapa = ruta("b", '4"-P-1002-CS150', [
    [5_000, -5_000, 5_050],
    [5_000, 5_000, 5_050],
  ]);
  const informe = cadPipeClashReport(doc([principal, solapa]));
  eq(informe.clashes.length, 1, "y dos que se solapan sí");
  eq(informe.clashes[0].kind, "choque-duro", "el solape es un choque duro");
  eq(informe.clashes[0].againstKind, "ruta", "contra otra ruta, no contra estructura");
  casi(
    informe.clashes[0].depth ?? 0,
    RADIO_6 + RADIO_4 - 50,
    "y la profundidad es lo que los dos radios se meten uno en otro",
    0.011,
  );
}

// --- 8 · un empalme NO es un choque --------------------------------------
{
  const cabezal = ruta("a", '6"-P-1001-CS150', [
    [0, 0, 0],
    [10_000, 0, 0],
  ]);
  const ramal = ruta("b", '4"-P-1002-CS150', [
    [5_000, 0, 0],
    [5_000, 5_000, 0],
  ]);
  eq(
    cadPipeClashReport(doc([cabezal, ramal])).clashes.length,
    0,
    "una te se toca a propósito: acusarla llenaría el informe de falsos",
  );
}

// --- 9 · un sólido del dibujo, por su caja envolvente ---------------------
{
  const solido = {
    id: "s1",
    type: "solid3d",
    nodes: [
      {
        id: "n1",
        op: "box",
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1_000, y: 1_000, z: 1_000 },
      },
    ],
    root: "n1",
    layer: "0",
  } as unknown as Entidad;

  const dentro = ruta("r1", '6"-P-1001-CS150', [
    [-1_000, 500, 500],
    [2_000, 500, 500],
  ]);
  const informe = cadPipeClashReport(doc([solido, dentro]));
  eq(informe.clashes.length, 1, "una tubería metida en un sólido es un choque");
  eq(informe.clashes[0].againstKind, "solido", "y se dice que es contra un sólido");
  casi(informe.clashes[0].depth ?? 0, 500 + RADIO_6, "con su profundidad", 0.011);

  const fuera = ruta("r1", '6"-P-1001-CS150', [
    [-1_000, 2_000, 500],
    [2_000, 2_000, 500],
  ]);
  eq(
    cadPipeClashReport(doc([solido, fuera])).clashes.length,
    0,
    "y a 1000 de su cara no hay nada",
  );
}

// --- 10 · un vano que NO encaja no resta: fallo cerrado -------------------
{
  // Antepecho 2000 + altura 1500 = 3500 sobre un muro de 3000: el hueco no
  // cabe verticalmente, no se recorta en el sólido del muro y tampoco aquí.
  const imposible = puerta("v1", "w1", { sill: 2_000, height: 1_500 });
  const porElHueco = ruta("r1", '6"-P-1001-CS150', [
    [5_000, -1_000, 2_500],
    [5_000, 1_000, 2_500],
  ]);
  const informe = cadPipeClashReport(doc([muro(), imposible, porElHueco]));
  eq(informe.clashes.length, 1, "el vano imposible no abre un paso");
  eq(informe.clashes[0].kind, "choque-duro", "así que la tubería choca con el muro macizo");

  // El mismo hueco, esta vez con altura que sí cabe: la tubería pasa.
  const cabe = puerta("v1", "w1", { sill: 2_000, height: 900 });
  const pasa = cadPipeClashReport(doc([muro(), cabe, porElHueco]));
  eq(pasa.clashes.length, 1, "con el hueco válido queda un solo renglón");
  eq(pasa.clashes[0].kind, "paso-por-hueco", "y es el paso informado, no un choque");
}

// --- 11 · el filtro por ruta, que es lo que usa PIDROUTE al cerrar --------
{
  const vieja = ruta("r1", '6"-P-1001-CS150', [
    [2_000, -1_000, 2_500],
    [2_000, 1_000, 2_500],
  ]);
  const nueva = ruta("r2", '4"-P-1002-CS150', [
    [8_000, -1_000, 2_500],
    [8_000, 1_000, 2_500],
  ]);
  const todo = cadPipeClashReport(doc([muro(), puerta(), vieja, nueva]));
  eq(todo.clashes.length, 2, "sin filtro salen las dos");
  const soloNueva = cadPipeClashReport(doc([muro(), puerta(), vieja, nueva]), {
    routeIds: ["r2"],
  });
  eq(soloNueva.clashes.length, 1, "con filtro, sólo la que se acaba de cerrar");
  eq(soloNueva.clashes[0].routeId, "r2", "y es la suya");
  eq(soloNueva.routes, 1, "el denominador del informe también se filtra");
}

// --- 12 · sin estructura, se dice; no se calla ni se inventa --------------
{
  const sola = ruta("r1", '6"-P-1001-CS150', [
    [0, 0, 0],
    [10_000, 0, 3_000],
  ]);
  const informe = cadPipeClashReport(doc([sola]));
  eq(informe.obstacles, 0, "un dibujo sin muros ni sólidos no tiene obstáculos");
  ok(
    /sin estructura contra la que chocar/.test(cadPipeClashSummary(informe)),
    "y el resumen lo dice en vez de fingir un «todo bien»",
  );
}

console.log(
  `Choques de tubería contra lo construido: ${verdes} comprobaciones verdes — atravesar el muro es choque duro con su profundidad, cruzarlo por el vano no lo es y se informa, 5 mm de la cara es holgura insuficiente y 500 no, la arista mide su hipotenusa exacta y dos rutas empalmadas no se acusan`,
);
