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
 *
 * ## Y las dos reglas que no necesitan un dato nuevo (bloques 12 a 14)
 *
 * `Art. 240-6(A)`: la capacidad nominal tiene que ser una de las que se
 * fabrican. Es el único error de esta familia que las reglas anteriores no
 * pueden cazar — un «22 A» tiene ampacidad que lo respalda y caída que sale
 * bien—, y por eso se afirma aparte.
 *
 * `Tabla 250-122`: el calibre de tierra que corresponde a la protección. La
 * trampa de esa tabla, que también se afirma, es que su columna dice «sin
 * exceder de»: una protección de 30 A NO cae en la fila de 20 A sino en la de
 * 60, así que su tierra es 10 AWG y no 12. Devolver el 12 sería devolver un
 * calibre insuficiente, que es peor que no decir nada.
 *
 * El bloque 15 duplica a propósito las tres subcadenas que afirma el golden de
 * navegador `93-cad-circuito-nom.spec.ts`: ese golden tarda minutos y sólo
 * corre en CI, así que aquí cuestan milisegundos y lo cazan primero.
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
  CAD_NOM_EQUIPMENT_GROUND,
  CAD_NOM_STANDARD_BREAKER_AMPS,
  cadNomConductor,
  cadNomEquipmentGround,
  cadNomGroundLabel,
  cadNomIsStandardBreaker,
  cadNomMaxBreaker,
  cadNomNearestStandardBreakers,
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

// --- 11 · el límite se declara siempre, y dice el límite VERDADERO ---------
{
  ok(/No es memorial de cálculo/.test(CAD_NOM_CHECK_LIMITS), "empieza diciendo lo que NO es");
  for (const trozo of ["temperatura", "agrupamiento", "125 %", "llenado de tubo", "reactancia"])
    ok(CAD_NOM_CHECK_LIMITS.includes(trozo), `y nombra «${trozo}» entre lo que no mira`);
  // Decía «sin tierra» y era falso desde que la Tabla 250-122 entró: ahora la
  // tierra SÍ se dice. El límite verdadero es otro y tiene que decirse tal cual
  // —se calcula de la protección, no se coteja contra un conductor dibujado—,
  // porque un límite que se queda corto se lee como un certificado y un límite
  // que sobra hace que nadie lea el renglón.
  ok(
    !/sin tierra/.test(CAD_NOM_CHECK_LIMITS),
    `ya no puede decir «sin tierra»: ${CAD_NOM_CHECK_LIMITS}`,
  );
  ok(
    /tierra física se calcula de la protección/.test(CAD_NOM_CHECK_LIMITS),
    "dice que la tierra se CALCULA de la protección",
  );
  ok(
    /250-122/.test(CAD_NOM_CHECK_LIMITS),
    "citando la tabla con la que se calcula, para poder cotejarla",
  );
  ok(
    /no se coteja contra un conductor de tierra dibujado/.test(CAD_NOM_CHECK_LIMITS),
    "y dice lo que NO hace: cotejar contra un conductor de tierra del dibujo",
  );
}

// --- 12 · Art. 240-6(A): la capacidad que no se fabrica ------------------
{
  // El error que ninguna de las reglas anteriores puede cazar: 22 A tiene
  // ampacidad que lo respalda (el 10 AWG llega a 30) y caída que sale bien.
  ok(cadNomIsStandardBreaker(20), "20 A es estándar");
  ok(cadNomIsStandardBreaker(15), "15 A también");
  ok(cadNomIsStandardBreaker(200), "y 200 A");
  ok(!cadNomIsStandardBreaker(22), "22 A NO es una capacidad estándar");
  ok(!cadNomIsStandardBreaker(55), "ni 55 A");
  ok(cadNomIsStandardBreaker(6), "un fusible de 6 A sí: el artículo los añade aparte");
  ok(
    CAD_NOM_STANDARD_BREAKER_AMPS.every((valor, i, todas) => i === 0 || valor > todas[i - 1]),
    "la lista va de menor a mayor y no repite",
  );
  eq(CAD_NOM_STANDARD_BREAKER_AMPS[0], 15, "empieza en 15 A");
  eq(
    CAD_NOM_STANDARD_BREAKER_AMPS[CAD_NOM_STANDARD_BREAKER_AMPS.length - 1],
    6_000,
    "y termina en 6000 A",
  );

  const vecinas = cadNomNearestStandardBreakers(22);
  eq(vecinas.below, 20, "por debajo del 22 está el 20");
  eq(vecinas.above, 25, "y por encima el 25");
  // Se dan LAS DOS y no «la correcta»: bajar protege el conductor pero puede
  // disparar con la carga real, y subir obliga a revisar otra vez el calibre.
  eq(cadNomNearestStandardBreakers(9_000).above, null, "arriba de la tabla no se inventa una");
}

// --- 13 · Tabla 250-122: la tierra que hasta hoy no se decía --------------
{
  const tierra = (amps: number) => {
    const fila = cadNomEquipmentGround(amps);
    return fila ? cadNomGroundLabel(fila) : null;
  };
  eq(tierra(20), "12 AWG", "20 A pide 12 AWG de tierra");
  eq(tierra(60), "10 AWG", "60 A pide 10 AWG");
  eq(tierra(100), "8 AWG", "100 A pide 8 AWG");
  eq(tierra(200), "6 AWG", "200 A pide 6 AWG");
  eq(tierra(15), "14 AWG", "y el más pequeño de la tabla, 15 A, pide 14 AWG");
  // La trampa de la tabla: la columna dice «sin exceder de», así que 30 A NO
  // cae en la fila de 20 — cae en la de 60, y su tierra es 10 y no 12.
  eq(tierra(30), "10 AWG", "30 A cae en la fila de 60 A: la columna dice «sin exceder de»");
  eq(tierra(21), "10 AWG", "y 21 A también, aunque esté pegado al 20");
  eq(tierra(1_600), "4/0 AWG", "1600 A pide 4/0");
  // Arriba de 4/0 la norma cambia de unidad; el renglón no puede decir «250 AWG».
  eq(tierra(2_000), "250 kcmil", "y de ahí para arriba la norma habla en kcmil");
  eq(cadNomEquipmentGround(9_000), null, "arriba de 6000 A la tabla se acaba y se dice");
  ok(
    CAD_NOM_EQUIPMENT_GROUND.every(
      (fila, i, todas) => i === 0 || fila.maxDeviceAmps > todas[i - 1].maxDeviceAmps,
    ),
    "la tabla va de menor a mayor: si no, la búsqueda devolvería un calibre insuficiente",
  );
}

// --- 14 · las dos reglas SOBRE UN CIRCUITO, detrás del resumen ------------
{
  // 10 AWG aguanta 30 A, así que 22 A no falla por ampacidad ni por caída en
  // 5 m: lo único que tiene de malo es que ese interruptor no se fabrica.
  const documento = doc([
    tramo("c1", 5, {
      ...cadWireMetadata({ circuit: "C-9", number: 1, gauge: "10" }),
      ...cadCircuitMetadata({ breakerAmps: 22, volts: 127, phases: 1 }),
    }),
  ]);
  const [fila] = cadCheckCircuits(documento);
  eq(fila.breakerStandard, false, "22 A no es capacidad estándar");
  eq(fila.verdict, "aviso", "y es AVISO: el 240-6 admite otras en disparo ajustable (incisos B y C)");
  ok(
    fila.findings.some((f) => /no es una de las estándar del Art\. 240-6\(A\)/.test(f)),
    `citando el artículo, para poder cotejarlo: ${fila.findings.join(" | ")}`,
  );
  ok(
    fila.findings.some((f) => /las inmediatas son 20 A y 25 A/.test(f)),
    `y poniendo las dos opciones delante sin elegir: ${fila.findings.join(" | ")}`,
  );
  eq(fila.groundGauge, "10 AWG", "y su tierra, calculada de los 22 A, es 10 AWG");
  ok(
    fila.findings.some((f) => /Tabla 250-122/.test(f)),
    `la tierra se dice citando su tabla: ${fila.findings.join(" | ")}`,
  );
  ok(
    fila.findings.some((f) => /no se coteja contra un conductor del dibujo/.test(f)),
    "y diciendo en el mismo renglón que se calcula, no que se comprobó",
  );

  // El circuito que CUMPLE sigue diciendo sus números en el PRIMER renglón: la
  // tierra va detrás. Si fuera delante, `findings` nunca estaría vacío y el
  // resumen del circuito aprobado desaparecería.
  const bueno = doc([
    tramo("c1", 8, {
      ...cadWireMetadata({ circuit: "C-10", number: 1, gauge: "12" }),
      ...cadCircuitMetadata({ breakerAmps: 20, volts: 127, phases: 1 }),
    }),
  ]);
  const [limpio] = cadCheckCircuits(bueno);
  eq(limpio.verdict, "ok", "20 A en 12 AWG y 8 m sigue cumpliendo");
  eq(limpio.breakerStandard, true, "20 A sí es estándar");
  eq(limpio.groundGauge, "12 AWG", "y su tierra es 12 AWG");
  ok(
    /^12 AWG con 20 A y 8\.0 m/.test(limpio.findings[0]),
    `el resumen del circuito sigue siendo el PRIMER renglón: ${limpio.findings.join(" | ")}`,
  );
  ok(
    /Tabla 250-122/.test(limpio.findings[limpio.findings.length - 1]),
    "y la tierra va detrás, informando sin desplazar",
  );

  // Sin protección declarada no se afirma nada de ninguna de las dos: un dato
  // que no existe no tiene ni capacidad estándar ni tierra que le corresponda.
  const [sinDatos] = cadCheckCircuits(
    doc([tramo("c1", 5, cadWireMetadata({ circuit: "C-11", number: 1, gauge: "12" }))]),
  );
  eq(sinDatos.breakerStandard, null, "sin protección no se dice si es estándar");
  eq(sinDatos.groundGauge, null, "ni se inventa un calibre de tierra");

  // Y por arriba de la tabla, fallo cerrado: 9000 A se sale de la 250-122, así
  // que no hay calibre de tierra que decir y se dice que no lo hay.
  const [fuera] = cadCheckCircuits(
    doc([
      tramo("c1", 5, {
        ...cadWireMetadata({ circuit: "C-12", number: 1, gauge: "4/0" }),
        ...cadCircuitMetadata({ breakerAmps: 9_000, volts: 220, phases: 3 }),
      }),
    ]),
  );
  eq(fuera.groundGauge, null, "arriba de 6000 A no se inventa un calibre de tierra");
  ok(
    fuera.findings.some((f) => /el calibre de tierra queda fuera de tabla/.test(f)),
    `y se dice en vez de callarlo: ${fuera.findings.join(" | ")}`,
  );
}

// --- 15 · las tres subcadenas que el golden 93 afirma ---------------------
{
  // `apps/web/e2e/golden/93-cad-circuito-nom.spec.ts` afirma POR SUBCADENA
  // sobre el renglón de AECHECK. Un golden de navegador tarda minutos y sólo
  // corre en CI; estas tres líneas cuestan milisegundos y corren en cada
  // cambio, así que el golden no puede romperse sin que esto lo cace primero.
  // El caso es el mismo que teclea el golden: 30 m de 12 AWG con 20 A a 127 V.
  const documento = doc([
    tramo("a", 15, {
      ...cadWireMetadata({ circuit: "C-1", number: 1, gauge: "12" }),
      ...cadCircuitMetadata({ breakerAmps: 20, volts: 127, phases: 1 }),
    }),
    tramo("b", 15, cadWireMetadata({ circuit: "C-1", number: 2, gauge: "12" })),
  ]);
  const [fila] = cadCheckCircuits(documento);
  const renglon = `${fila.circuit}: ${fila.findings.join("; ")}. ${CAD_NOM_CHECK_LIMITS}`;
  // 2 × 30 m × 20 A × 6,5 Ω/km / 1000 = 7,8 V, que sobre 127 V es 6,14 %.
  ok(/caída es del 6\.1 % en 30\.0 m/.test(renglon), `golden 93 · la caída y los metros: ${renglon}`);
  ok(/con 8 AWG bajaría del tope/.test(renglon), `golden 93 · el calibre propuesto: ${renglon}`);
  ok(/No es memorial de cálculo/.test(renglon), `golden 93 · el límite en el renglón: ${renglon}`);
}

console.log(
  `circuit-check: ${verdes} comprobaciones verdes — la caída sale del PLANO, el conductor pequeño manda, la capacidad de 22 A no se fabrica, la tierra sale de la Tabla 250-122 y lo que falta no pasa en silencio`,
);
