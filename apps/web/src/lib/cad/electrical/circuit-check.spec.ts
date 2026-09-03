/**
 * LO QUE AUTOCAD ELECTRICAL NO PUEDE HACER: revisar el circuito CON EL PLANO.
 *
 * ## Por qué esta spec existe y qué prueba de verdad
 *
 * AutoCAD Electrical numera conductores y saca listas; no comprueba si el
 * calibre aguanta la protección ni cuánta tensión se cae, y no puede, porque
 * sus conductores son esquemáticos y el dibujo no sabe cuánto miden. Aquí el
 * conductor es una polilínea a escala, así que la longitud sale del plano.
 *
 * Lo que se afirma abajo NO es «el módulo existe». Se afirma la aritmética,
 * contra casos hechos a mano que cualquiera puede rehacer con una calculadora,
 * y se afirma el FALLO CERRADO: que un circuito al que le falta un dato no
 * pasa en silencio.
 *
 * ## Los números a mano, para que se puedan cotejar
 *
 * Caída monofásica: `ΔV = 2 · L · I · R / 1000`, con R en ohm/km.
 * Un 12 AWG (6,5 Ω/km) con 16 A a 30 m: 2 × 30 × 16 × 6,5 / 1000 = **6,24 V**,
 * que sobre 127 V es **4,91 %** — por encima del 3 % que recomienda la NOM.
 * El mismo circuito con 10 AWG (4,07 Ω/km): 2 × 30 × 16 × 4,07 / 1000 = 3,907 V
 * = 3,08 %, que TAMBIÉN se pasa; con 8 AWG (2,55 Ω/km) da 2,448 V = 1,93 %.
 * Por eso el sugerido de ese caso es el 8, y no el 10.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad-document";
import {
  CAD_NOM_CHECK_LIMITS,
  cadCheckCircuits,
  cadCircuitMetadata,
  cadEntityRunLength,
} from "./circuit-check";
import {
  CAD_NOM_CONDUCTORS,
  cadNomConductor,
  cadNomMaxBreaker,
  cadNomSuggestGauge,
  cadNomVoltageDrop,
} from "./nom-conductors";
import { cadWireMetadata } from "./wire-numbering";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};
const cerca = (actual: number, esperado: number, mensaje: string, tol = 1e-3) => {
  assert.ok(Math.abs(actual - esperado) <= tol, `${mensaje} (${actual} vs ${esperado})`);
  verdes += 1;
};

/** Un conductor recto de `metros` metros, en un dibujo en milímetros. */
const tramo = (
  id: string,
  metros: number,
  metadata: Record<string, string>,
): CadEntity =>
  ({
    id,
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: metros * 1_000, y: 0, z: 0 },
    ],
    closed: false,
    layer: "IE-CIR",
    context: { metadata },
  }) as unknown as CadEntity;

const doc = (entities: CadEntity[]): Pick<CadDocument, "entities" | "meta"> => ({
  entities,
  meta: { version: 1, schema: 8, unit: "mm" } as never,
});

// --- 1 · la tabla es la de la norma, y la regla del conductor pequeño manda -
{
  eq(cadNomConductor("12")!.ampacity, 25, "el 12 AWG tiene 25 A de ampacidad de tabla");
  eq(
    cadNomMaxBreaker(cadNomConductor("12")!),
    20,
    "pero su protección no pasa de 20 A: Art. 240-4(D), el conductor pequeño",
  );
  eq(cadNomMaxBreaker(cadNomConductor("10")!), 30, "el 10 AWG, hasta 30 A");
  eq(
    cadNomMaxBreaker(cadNomConductor("8")!),
    50,
    "y del 8 en adelante manda la ampacidad, sin tope especial",
  );
  eq(cadNomConductor("  12 awg ")!.gauge, "12", "el calibre lo teclea una persona");
  eq(cadNomConductor("13"), null, "un calibre que no existe no se aproxima al de al lado");
  ok(
    CAD_NOM_CONDUCTORS.every(
      (fila, i, todas) => i === 0 || fila.ohmPerKm < todas[i - 1].ohmPerKm,
    ),
    "la tabla va de más delgado a más grueso: la resistencia sólo baja",
  );
}

// --- 2 · la caída de tensión, contra la cuenta hecha a mano -----------------
{
  const doce = cadNomConductor("12")!;
  cerca(
    cadNomVoltageDrop({ conductor: doce, lengthM: 30, amps: 16, phases: 1 }),
    6.24,
    "2 × 30 × 16 × 6,5 / 1000 = 6,24 V",
  );
  const dos = cadNomConductor("2")!;
  cerca(
    cadNomVoltageDrop({ conductor: dos, lengthM: 50, amps: 100, phases: 3 }),
    Math.sqrt(3) * 50 * 100 * 0.634 / 1_000,
    "trifásico usa √3 y no 2: la caída es entre fases",
  );
  ok(
    cadNomVoltageDrop({ conductor: doce, lengthM: 30, amps: 16, phases: 3 }) <
      cadNomVoltageDrop({ conductor: doce, lengthM: 30, amps: 16, phases: 1 }),
    "y por eso el mismo recorrido cae menos en trifásico",
  );
}

// --- 3 · el calibre sugerido cumple LAS DOS cosas ---------------------------
{
  // El caso de la cabecera: 16 A a 30 m en 127 V. El 12 aguanta la protección
  // pero se pasa de caída; el 10 también se pasa (3,08 %); el 8 no.
  const sugerido = cadNomSuggestGauge({ breakerAmps: 16, lengthM: 30, volts: 127, phases: 1 });
  eq(sugerido!.gauge, "8", "sugiere el 8: el 10 todavía se pasa de caída");

  // Sin recorrido largo, manda la protección y sale el más delgado que aguanta.
  eq(
    cadNomSuggestGauge({ breakerAmps: 16, lengthM: 3, volts: 127, phases: 1 })!.gauge,
    "12",
    "en 3 m basta el 12",
  );
  // Y con 20 A el 12 sigue valiendo; con 25 A ya no, por el tope de 20 A.
  eq(
    cadNomSuggestGauge({ breakerAmps: 25, lengthM: 3, volts: 127, phases: 1 })!.gauge,
    "10",
    "con 25 A el 12 queda fuera por el tope del conductor pequeño",
  );
  eq(
    cadNomSuggestGauge({ breakerAmps: 400, lengthM: 3, volts: 220, phases: 3 }),
    null,
    "y si ni el más grueso de la tabla cumple, se dice: no se inventa un calibre",
  );
}

// --- 4 · la LONGITUD sale del plano, y es la recorrida ---------------------
{
  // Una polilínea en L: 3.000 + 4.000 unidades. La distancia entre extremos es
  // 5.000 —el cateto— pero el conductor recorre 7.000. Ésa es la diferencia
  // que hace que una caída de tensión se salga.
  const ele = {
    id: "L",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 3_000, y: 0, z: 0 },
      { x: 3_000, y: 4_000, z: 0 },
    ],
    closed: false,
    layer: "IE-CIR",
  } as unknown as CadEntity;
  cerca(cadEntityRunLength(ele), 7_000, "se suma tramo a tramo, no la recta");

  // Y la cota cuenta: un conductor que sube por el muro recorre más.
  const sube = {
    ...(ele as unknown as { vertices: { x: number; y: number; z: number }[] }),
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 2_500 },
    ],
  } as unknown as CadEntity;
  cerca(cadEntityRunLength(sube), 2_500, "el tramo vertical también se mide");
}

// --- 5 · un circuito que NO cumple se dice, con su número ------------------
{
  const documento = doc([
    tramo("c1", 30, {
      ...cadWireMetadata({ circuit: "C-1", number: 1, gauge: "12" }),
      ...cadCircuitMetadata({ breakerAmps: 30, volts: 127, phases: 1 }),
    }),
  ]);
  const [fila] = cadCheckCircuits(documento);
  eq(fila.circuit, "C-1", "la fila es del circuito");
  eq(fila.verdict, "no-cumple", "un 12 AWG con protección de 30 A NO cumple");
  ok(
    fila.findings.some((f) => /admite hasta 20 A y la protección es de 30 A/.test(f)),
    `y se dice con los dos números: ${fila.findings.join(" | ")}`,
  );
  ok(
    fila.findings.some((f) => /240-4\(D\)/.test(f)),
    "citando el artículo que lo prohíbe, para poder cotejarlo",
  );
  cerca(fila.lengthM, 30, "la longitud sale del dibujo, en metros");
}

// --- 6 · un circuito que cumple la protección pero se pasa de caída --------
{
  const documento = doc([
    tramo("c1", 30, {
      ...cadWireMetadata({ circuit: "C-2", number: 1, gauge: "12" }),
      ...cadCircuitMetadata({ breakerAmps: 16, volts: 127, phases: 1 }),
    }),
  ]);
  const [fila] = cadCheckCircuits(documento);
  eq(fila.verdict, "aviso", "la caída es una RECOMENDACIÓN: aviso, no negativa");
  cerca(fila.dropVolts!, 6.24, "6,24 V, la cuenta de la cabecera");
  cerca(fila.dropPercent!, 4.913, "4,91 % sobre 127 V", 0.01);
  ok(
    fila.findings.some((f) => /con 8 AWG bajaría del tope/.test(f)),
    `y propone el calibre que lo resuelve: ${fila.findings.join(" | ")}`,
  );
}

// --- 7 · un circuito correcto pasa, y dice con qué números -----------------
{
  const documento = doc([
    tramo("c1", 8, {
      ...cadWireMetadata({ circuit: "C-3", number: 1, gauge: "12" }),
      ...cadCircuitMetadata({ breakerAmps: 20, volts: 127, phases: 1 }),
    }),
  ]);
  const [fila] = cadCheckCircuits(documento);
  eq(fila.verdict, "ok", "20 A en 12 AWG y 8 m: cumple");
  ok(
    fila.findings.some((f) => /12 AWG con 20 A y 8\.0 m/.test(f)),
    `y lo aprobado se dice con sus números: ${fila.findings.join(" | ")}`,
  );
}

// --- 8 · FALLO CERRADO: lo que falta no pasa en silencio -------------------
{
  const sinProteccion = doc([
    tramo("c1", 10, cadWireMetadata({ circuit: "C-4", number: 1, gauge: "12" })),
  ]);
  const [fila] = cadCheckCircuits(sinProteccion);
  eq(fila.verdict, "sin-datos", "sin protección declarada NO se aprueba");
  ok(
    fila.findings.some((f) => /no se declaró la protección/.test(f)),
    "y se dice qué falta y con qué orden se pone",
  );

  const sinCalibre = doc([
    tramo("c1", 10, {
      ...cadWireMetadata({ circuit: "C-5", number: 1 }),
      ...cadCircuitMetadata({ breakerAmps: 20, volts: 127, phases: 1 }),
    }),
  ]);
  eq(cadCheckCircuits(sinCalibre)[0].verdict, "sin-datos", "sin calibre tampoco");

  // Dos calibres en el mismo circuito: no se elige uno en silencio.
  const mezclado = doc([
    tramo("a", 10, {
      ...cadWireMetadata({ circuit: "C-6", number: 1, gauge: "12" }),
      ...cadCircuitMetadata({ breakerAmps: 20, volts: 127, phases: 1 }),
    }),
    tramo("b", 10, cadWireMetadata({ circuit: "C-6", number: 2, gauge: "10" })),
  ]);
  const [mezcla] = cadCheckCircuits(mezclado);
  eq(mezcla.verdict, "sin-datos", "un circuito con dos calibres no se revisa a medias");
  ok(
    mezcla.findings.some((f) => /mezcla calibres \(10, 12\)/.test(f)),
    `se dice cuáles: ${mezcla.findings.join(" | ")}`,
  );
}

// --- 9 · dos protecciones distintas en el mismo circuito es un error ------
{
  const contradictorio = doc([
    tramo("a", 5, {
      ...cadWireMetadata({ circuit: "C-7", number: 1, gauge: "12" }),
      ...cadCircuitMetadata({ breakerAmps: 20, volts: 127, phases: 1 }),
    }),
    tramo("b", 5, {
      ...cadWireMetadata({ circuit: "C-7", number: 2, gauge: "12" }),
      ...cadCircuitMetadata({ breakerAmps: 30, volts: 127, phases: 1 }),
    }),
  ]);
  const [fila] = cadCheckCircuits(contradictorio);
  eq(fila.verdict, "no-cumple", "un dato contradictorio no se resuelve eligiendo uno");
  ok(
    fila.findings.some((f) => /dos protecciones distintas/.test(f)),
    `y se nombra: ${fila.findings.join(" | ")}`,
  );
}

// --- 10 · la longitud del circuito SUMA sus tramos -------------------------
{
  const documento = doc([
    tramo("a", 12, {
      ...cadWireMetadata({ circuit: "C-8", number: 1, gauge: "10" }),
      ...cadCircuitMetadata({ breakerAmps: 30, volts: 127, phases: 1 }),
    }),
    tramo("b", 18, cadWireMetadata({ circuit: "C-8", number: 2, gauge: "10" })),
  ]);
  const [fila] = cadCheckCircuits(documento);
  eq(fila.wires, 2, "los dos conductores son del circuito");
  cerca(fila.lengthM, 30, "y el recorrido del circuito es la suma: 12 + 18");
}

// --- 11 · el límite se declara siempre -------------------------------------
{
  ok(/No es memorial de cálculo/.test(CAD_NOM_CHECK_LIMITS), "empieza diciendo lo que NO es");
  for (const trozo of ["temperatura", "agrupamiento", "125 %", "tierra", "reactancia"])
    ok(CAD_NOM_CHECK_LIMITS.includes(trozo), `y nombra «${trozo}» entre lo que no mira`);
}

console.log(
  `circuit-check: ${verdes} comprobaciones verdes — la caída sale del PLANO, el conductor pequeño manda, y lo que falta no pasa en silencio`,
);
