/**
 * EL TUBO FACETADO: que ocupe el volumen que dice ocupar.
 *
 * Lo que se mide aquí no es que el módulo compile: es que el cuerpo que llega
 * al visor 3D tenga el VOLUMEN del tubo nominal —dentro del 1 % de `π r² L`,
 * en un tramo recto y en uno con montante de 90°—, que salga CERRADO, y que el
 * densificado del camino no sea una preferencia estética.
 *
 * Las dos cifras del apartado 3 están clavadas a propósito. `lib/brep/sweep.ts`
 * coloca el perfil en el plano bisector sin estirarlo por `1/cos(θ/2)`; sin
 * puntos intermedios ese estrechamiento se interpola a lo largo de metros de
 * tubo y el codo se come el 12,7 % del volumen. Con el camino densificado a
 * ±100 mm del vértice la pérdida se queda local y baja al 0,33 %. Quien quite
 * el densificado verá romperse este apartado con el número exacto que perdió,
 * en vez de descubrirlo en un metrado.
 *
 * Y se mide la deuda que este módulo contrae por PERSISTIR el sólido en vez de
 * derivarlo: mover un vértice de la ruta deja la huella sin cuadrar, y eso se
 * declara —«quedó viejo»—, nunca se calla.
 */
import { strict as assert } from "node:assert";
import { bodyBounds, validateBody } from "../../brep";
import type { CadDocument } from "../cad-document";
import { cadFlatshotBodies } from "../flatshot-solids";
import { solid3dBody, solid3dMassProperties } from "../solid3d-build";
import { CAD_PL_LINE, CAD_PL_SERVICE, CAD_PL_SPEC } from "./line-numbers";
import {
  CAD_PL_ROUTE,
  CAD_PL_ROUTE_MARK,
  cadPipeRoutesOf,
  type CadPipeRoute,
} from "./pipe-route";
import {
  CAD_PL_SOLID_DENSIFY_MM,
  CAD_PL_SOLID_LAYER,
  CAD_PL_SOLID_LIMITS,
  CAD_PL_SOLID_OF,
  CAD_PL_SOLID_PRINT,
  CAD_PL_SOLID_SIDES,
  cadPipeDensifyPath,
  cadPipeRouteFingerprint,
  cadPipeSolidEntity,
  cadPipeSolidProfile,
  cadPipeSolidRadius,
  cadPipeSolidRingRadius,
  cadPipeSolidsOf,
  cadPipeSolidsStale,
} from "./pipe-solid";

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
type Punto = { x: number; y: number; z: number };

/** El radio nominal de una 6": 152,4 / 2. Es el número contra el que se mide. */
const R = 76.2;

const ruta = (points: Punto[], entityId = "r1", size = '6"'): CadPipeRoute => ({
  entityId,
  line: `${size}-P-1001-CS150`,
  size,
  service: "P",
  number: 1001,
  spec: "CS150",
  points,
});

const largo = (points: readonly Punto[]): number => {
  let total = 0;
  for (let i = 1; i < points.length; i += 1)
    total += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
      points[i].z - points[i - 1].z,
    );
  return total;
};

const RECTO: Punto[] = [
  { x: 0, y: 0, z: 0 },
  { x: 10_000, y: 0, z: 0 },
];

/** 6 m en planta y 3 m de subida: el montante de 90° que paga el densificado. */
const MONTANTE: Punto[] = [
  { x: 0, y: 0, z: 0 },
  { x: 6_000, y: 0, z: 0 },
  { x: 6_000, y: 0, z: 3_000 },
];

const solidoDe = (route: CadPipeRoute, id: string, densifyMm?: number) => {
  const { solid, reason } = cadPipeSolidEntity(route, id, { densifyMm });
  assert.ok(solid, `no se pudo barrer ${route.line}: ${reason ?? "sin motivo"}`);
  return solid;
};

const errorPorciento = (volumen: number, points: readonly Punto[]): number =>
  ((volumen - Math.PI * R * R * largo(points)) / (Math.PI * R * R * largo(points))) * 100;

// --- 1 · el polígono es de ÁREA EQUIVALENTE, no inscrito ------------------
{
  const perfil = cadPipeSolidProfile(R);
  eq(perfil.outer.length, CAD_PL_SOLID_SIDES, "el prisma es de dieciséis lados");
  eq(perfil.inners, undefined, "el tubo es macizo: la pared no se modela y se dice");

  let area = 0;
  for (let i = 0; i < perfil.outer.length; i += 1) {
    const a = perfil.outer[i];
    const b = perfil.outer[(i + 1) % perfil.outer.length];
    area += a.x * b.y - b.x * a.y;
  }
  area = Math.abs(area) / 2;
  casi(area, Math.PI * R * R, "la sección del polígono es exactamente la del círculo nominal", 1e-6);

  const inscrito = (CAD_PL_SOLID_SIDES / 2) * R * R * Math.sin((2 * Math.PI) / CAD_PL_SOLID_SIDES);
  const perdida = ((Math.PI * R * R - inscrito) / (Math.PI * R * R)) * 100;
  casi(perdida, 2.55, "un 16-gono INSCRITO perdería 2,55 % de sección: por eso no se inscribe", 0.01);

  // La faceta, dicha con sus dos números: más estrecho entre caras, más ancho
  // entre aristas. No es un cilindro y no se insinúa que lo sea.
  const circunradio = cadPipeSolidRingRadius(R);
  casi((circunradio / R - 1) * 100, 1.2997, "entre aristas mide 1,3 % más que el nominal", 0.001);
  const apotema = circunradio * Math.cos(Math.PI / CAD_PL_SOLID_SIDES);
  casi((1 - apotema / R) * 100, 0.6459, "y entre caras 0,65 % menos", 0.001);
  ok(/FACETADO/.test(CAD_PL_SOLID_LIMITS), "y el límite escrito lo dice con esa palabra");
  ok(/NOMINAL/.test(CAD_PL_SOLID_LIMITS), "y dice que el diámetro es el nominal");
}

// --- 2 · el radio sale del tamaño rotulado, y de la unidad del documento --
{
  casi(cadPipeSolidRadius('6"') ?? 0, 76.2, '6" en milímetros es radio 76,2');
  casi(cadPipeSolidRadius('1-1/2"') ?? 0, 19.05, '1-1/2" es radio 19,05');
  casi(cadPipeSolidRadius('6"', "m") ?? 0, 0.0762, "en metros el mismo tubo mide 0,0762 de radio");
  eq(cadPipeSolidRadius("seis pulgadas"), null, "lo que no es una medida en pulgadas no da radio");
}

// --- 3 · el volumen, y lo que cuesta quitar el densificado ----------------
{
  const recto = solidoDe(ruta(RECTO), "s-recto");
  const masaRecta = solid3dMassProperties(recto);
  const errRecto = errorPorciento(masaRecta.volume, RECTO);
  ok(
    Math.abs(errRecto) <= 1,
    `un tramo recto queda dentro del 1 % de π r² L — salió ${errRecto.toFixed(4)} %`,
  );
  casi(errRecto, 0, "y de hecho es exacto: el área equivalente no deja error en la recta", 1e-9);
  ok(validateBody(solid3dBody(recto)).closed, "el cuerpo del tramo recto sale CERRADO");
  ok(validateBody(solid3dBody(recto)).ok, "y pasa los invariantes del kernel");

  const montante = solidoDe(ruta(MONTANTE), "s-montante");
  const errMontante = errorPorciento(solid3dMassProperties(montante).volume, MONTANTE);
  ok(
    Math.abs(errMontante) <= 1,
    `el montante de 90° también queda dentro del 1 % — salió ${errMontante.toFixed(4)} %`,
  );
  casi(errMontante, -0.3254, "medido: −0,3254 % con el camino densificado a ±100 mm", 0.002);
  const validacion = validateBody(solid3dBody(montante));
  ok(validacion.closed, "el cuerpo con codo también sale cerrado");
  ok(validacion.ok, "y también pasa los invariantes");

  // La cifra que existe para que nadie quite el densificado sin verla.
  const crudo = solidoDe(ruta(MONTANTE), "s-crudo", 0);
  const errCrudo = errorPorciento(solid3dMassProperties(crudo).volume, MONTANTE);
  casi(errCrudo, -12.7322, "sin densificar, el MISMO codo pierde 12,73 % del volumen", 0.002);
  ok(
    Math.abs(errCrudo) > 10 * Math.abs(errMontante),
    `densificar no es cosmético: ${errCrudo.toFixed(2)} % frente a ${errMontante.toFixed(2)} %`,
  );

  eq(CAD_PL_SOLID_DENSIFY_MM, 100, "y la ventana del densificado son ±100 mm, no un número suelto");
}

// --- 4 · el densificado mete DOS puntos por tramo, y no se pisa nunca -----
{
  const denso = cadPipeDensifyPath(MONTANTE, 100);
  eq(denso.length, 7, "tres vértices con dos puntos por tramo son siete");
  casi(denso[1].x, 100, "el primero, a 100 del arranque");
  casi(denso[2].x, 5_900, "el segundo, a 100 del codo");
  casi(denso[3].x, 6_000, "y el codo sigue estando donde estaba");
  casi(denso[4].z, 100, "arriba del codo, otros 100");

  // Un tramo más corto que 3·spacing mete los puntos a un tercio: siguen en
  // orden, siguen siendo dos, y el codo conserva su ventana local.
  const corto = cadPipeDensifyPath(
    [
      { x: 0, y: 0, z: 0 },
      { x: 120, y: 0, z: 0 },
      { x: 120, y: 0, z: 120 },
    ],
    100,
  );
  eq(corto.length, 7, "en tramos cortos siguen siendo dos puntos por tramo");
  casi(corto[1].x, 40, "metidos a un tercio del tramo, no a los 100 que no caben");
  casi(corto[2].x, 80, "y el segundo al otro tercio");
  for (let i = 1; i < corto.length; i += 1)
    ok(
      Math.hypot(
        corto[i].x - corto[i - 1].x,
        corto[i].y - corto[i - 1].y,
        corto[i].z - corto[i - 1].z,
      ) > 1e-9,
      `ningún punto densificado se pisa con el anterior (${i})`,
    );

  const nulo = cadPipeDensifyPath(
    [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 1_000, y: 0, z: 0 },
    ],
    100,
  );
  eq(nulo.length, 4, "un tramo de longitud cero se salta entero, no fabrica secciones dobles");
}

// --- 5 · la unidad del documento manda también en el densificado ----------
{
  const enMetros = cadPipeSolidEntity(
    ruta([
      { x: 0, y: 0, z: 0 },
      { x: 6, y: 0, z: 0 },
      { x: 6, y: 0, z: 3 },
    ]),
    "s-m",
    { unit: "m" },
  ).solid;
  ok(enMetros, "en un dibujo en metros también se barre");
  const camino = (enMetros!.nodes[0] as { path: Punto[] }).path;
  eq(camino.length, 7, "con los mismos dos puntos por tramo");
  casi(camino[1].x, 0.1, "y los 100 mm son 0,1 en un dibujo en metros");
}

// --- 6 · la entidad: capa, marca de ruta, huella y nombre -----------------
{
  const route = ruta(MONTANTE);
  const solido = solidoDe(route, "s1");
  eq(solido.type, "solid3d", "es un SOLID3D del esquema, no una entidad nueva");
  eq(solido.layer, CAD_PL_SOLID_LAYER, "vive en TU-SOLIDO, aparte del eje");
  eq(solido.nodes.length, 1, "un solo nodo: el barrido");
  eq(solido.nodes[0].op, "sweep", "y es un sweep del esquema, sin tocar el formato");
  eq(solido.root, solido.nodes[0].id, "que además es la raíz");
  eq(solido.name, route.line, "se llama como su línea");
  eq(solido.context?.metadata?.[CAD_PL_LINE], route.line, "lleva pl:linea");
  eq(solido.context?.metadata?.[CAD_PL_SERVICE], "P", "y el servicio");
  eq(solido.context?.metadata?.[CAD_PL_SPEC], "CS150", "y la especificación");
  eq(solido.context?.metadata?.[CAD_PL_SOLID_OF], "r1", "y de qué ruta salió");
  eq(
    solido.context?.metadata?.[CAD_PL_SOLID_PRINT],
    cadPipeRouteFingerprint(route),
    "y la huella de la geometría con que se barrió",
  );
}

// --- 7 · lo que no se puede barrer se DICE, no se calla -------------------
{
  const sinMedida = cadPipeSolidEntity(ruta(MONTANTE, "r1", "DN150"), "s1");
  eq(sinMedida.solid, null, "un tamaño que no es en pulgadas no produce sólido");
  ok(/no es una medida en pulgadas/.test(sinMedida.reason ?? ""), `y lo dice: ${sinMedida.reason}`);

  const unPunto = cadPipeSolidEntity(ruta([{ x: 0, y: 0, z: 0 }]), "s1");
  eq(unPunto.solid, null, "un punto no es una ruta");
  ok(/dos puntos distintos/.test(unPunto.reason ?? ""), `y también lo dice: ${unPunto.reason}`);
}

// --- 8 · la huella cambia con la geometría, y con el diámetro -------------
{
  const base = cadPipeRouteFingerprint(ruta(MONTANTE));
  eq(base, cadPipeRouteFingerprint(ruta(MONTANTE)), "la misma ruta da la misma huella");
  eq(
    base,
    cadPipeRouteFingerprint(ruta(MONTANTE.map((p) => ({ ...p, x: p.x + 1e-9 })))),
    "un temblor por debajo de la milésima no la cambia: los flotantes no se repiten bit a bit",
  );
  ok(
    base !== cadPipeRouteFingerprint(ruta(MONTANTE.map((p) => ({ ...p, z: p.z + 1 })))),
    "subir la ruta un milímetro sí la cambia",
  );
  ok(
    base !== cadPipeRouteFingerprint(ruta(MONTANTE, "r1", '4"')),
    "y cambiar de 6\" a 4\" también: el sólido quedaría del diámetro que no es",
  );
}

// --- 9 · mover un vértice deja el sólido VIEJO, y se declara --------------
{
  const puntos = MONTANTE;
  const polilinea = (vertices: Punto[]): Entidad =>
    ({
      id: "r1",
      type: "polyline",
      vertices,
      closed: false,
      layer: "TU-RUTA",
      context: {
        metadata: {
          [CAD_PL_LINE]: '6"-P-1001-CS150',
          [CAD_PL_SERVICE]: "P",
          [CAD_PL_SPEC]: "CS150",
          [CAD_PL_ROUTE]: CAD_PL_ROUTE_MARK,
        },
      },
    }) as unknown as Entidad;

  const route = cadPipeRoutesOf({ entities: [polilinea(puntos)] })[0];
  ok(route, "la ruta se lee del documento como siempre");
  const solido = solidoDe(route, "s1") as unknown as Entidad;

  const alDia = { entities: [polilinea(puntos), solido] };
  eq(cadPipeSolidsOf(alDia).length, 1, "el sólido de tubería se reconoce en el dibujo");
  eq(cadPipeSolidsStale(alDia).length, 0, "recién barrido, nada que declarar");

  const movido = {
    entities: [
      polilinea([puntos[0], puntos[1], { x: 6_000, y: 0, z: 4_500 }]),
      solido,
    ],
  };
  const viejos = cadPipeSolidsStale(movido);
  eq(viejos.length, 1, "mover un vértice de la ruta deja el sólido descuadrado");
  eq(viejos[0].kind, "viejo", "y se llama viejo, que es lo que es");
  eq(viejos[0].solidId, "s1", "con el sólido señalado por su id");
  ok(
    /el sólido de 6"-P-1001-CS150 quedó viejo/.test(viejos[0].detail),
    `y el renglón se lee: ${viejos[0].detail}`,
  );

  const huerfano = cadPipeSolidsStale({ entities: [solido] });
  eq(huerfano.length, 1, "borrar la ruta también deja el sólido colgado");
  eq(huerfano[0].kind, "huerfano", "y ése es huérfano, no viejo");
  ok(/ya no tiene ruta/.test(huerfano[0].detail), `con su motivo: ${huerfano[0].detail}`);

  // Un `solid3d` que no salió de una ruta no es asunto de este módulo.
  const ajeno = { ...(solido as unknown as { context?: unknown }), id: "x1", context: undefined };
  eq(
    cadPipeSolidsOf({ entities: [ajeno as unknown as Entidad] }).length,
    0,
    "un sólido cualquiera del dibujo no se cuenta como tubo",
  );
}

// --- 10 · la propina: FLATSHOT lo recoge sin que nadie toque ese módulo ---
{
  // `flatshot-solids.ts` ya acepta cualquier `solid3d`, así que emitir el tubo
  // como sólido lo pone en los ortográficos desde el modelo de balde. Se
  // comprueba en vez de afirmarse: una propina sin evidencia es un claim.
  const solido = solidoDe(ruta(MONTANTE), "s1") as unknown as Entidad;
  const cuerpos = cadFlatshotBodies([solido], () => null);
  eq(cuerpos.bodies.length, 1, "FLATSHOT recoge el tubo sin tocar flatshot-solids.ts");
  eq(cuerpos.skipped.length, 0, "y no lo salta por no saber qué es");
  const caja = bodyBounds(cuerpos.bodies[0]);
  const anillo = cadPipeSolidRingRadius(R);
  // Las tapas del barrido son PERPENDICULARES al camino en sus puntas: el tubo
  // termina a ras de su último punto, no medio diámetro más allá. Por eso la
  // envolvente sube justo a 3 000 y arranca justo en 0.
  casi(caja.max.z, 3_000, "el tubo sube hasta la cota del montante y ahí se corta a ras", 1e-6);
  casi(caja.min.x, 0, "y arranca a ras de su primer punto", 1e-6);
  casi(caja.max.x, 6_000 + anillo, "a lo ancho llega media caña más allá del eje del montante", 1e-6);
  casi(caja.min.z, -anillo, "y por debajo, media caña bajo el eje del tramo horizontal", 1e-6);
}

console.log(
  `Tubo facetado desde la ruta: ${verdes} comprobaciones verdes — prisma de ${CAD_PL_SOLID_SIDES} lados de área equivalente al diámetro NOMINAL, volumen dentro del 1 % de π r² L en recto (0,0000 %) y en montante de 90° (−0,3254 %) frente al −12,73 % que costaría quitar el densificado a ±100 mm, cuerpo cerrado, mover un vértice deja el sólido declarado viejo, y FLATSHOT lo recoge sin tocar su módulo`,
);
