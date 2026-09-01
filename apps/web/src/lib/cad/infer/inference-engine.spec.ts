/**
 * El punto cae SOBRE el plano de trabajo, y no en el suelo.
 *
 * La comprobación central es geométrica y no admite discusión: un punto que
 * dice estar sobre un plano tiene que satisfacer su ecuación —(p − origen) · n
 * = 0— con la tolerancia de la máquina. Se comprueba así, contra la normal,
 * en vez de comparar contra un valor esperado calculado a mano: un valor a mano
 * puede estar mal de la misma forma que el código.
 *
 * Y la que enseña el defecto que se arregla: sobre un plano INCLINADO el punto
 * resultante tiene una z distinta de cero. Ése es exactamente el número que la
 * regla vieja no podía producir, porque lanzaba el rayo contra el suelo y todo
 * aterrizaba en z = 0.
 */
import type { CadNamedUcs } from "../ucs";
import {
  cadInferPoint,
  cadPointFromPlane,
  cadPointToPlane,
  cadRayPlanePoint,
} from "./inference-engine";

let ok = 0;
const fallos: string[] = [];
function comprueba(que: string, condicion: boolean) {
  if (condicion) ok += 1;
  else fallos.push(que);
}
function cerca(que: string, a: number, b: number, tol = 1e-9) {
  comprueba(`${que} (${a} ≈ ${b})`, Math.abs(a - b) <= tol);
}

/** El plano del suelo: el SCU universal. */
const SUELO: CadNamedUcs = {
  name: "",
  origin: { x: 0, y: 0, z: 0 },
  xAxis: { x: 1, y: 0, z: 0 },
  yAxis: { x: 0, y: 1, z: 0 },
  zAxis: { x: 0, y: 0, z: 1 },
};

/**
 * Un faldón a 45°, que es el caso que motiva toda la ola: su normal se inclina
 * en el plano XZ, así que un rayo vertical lo toca en un punto con z ≠ 0.
 */
const R2 = Math.SQRT1_2;
const FALDON: CadNamedUcs = {
  name: "",
  origin: { x: 0, y: 0, z: 0 },
  xAxis: { x: R2, y: 0, z: R2 },
  yAxis: { x: 0, y: 1, z: 0 },
  zAxis: { x: -R2, y: 0, z: R2 },
};

/** ¿Satisface el punto la ecuación del plano? La prueba que no se puede fingir. */
function sobreElPlano(p: { x: number; y: number; z: number }, ucs: CadNamedUcs): number {
  const d = { x: p.x - ucs.origin.x, y: p.y - ucs.origin.y, z: p.z - ucs.origin.z };
  return d.x * ucs.zAxis.x + d.y * ucs.zAxis.y + d.z * ucs.zAxis.z;
}

// --- 1 · EL SUELO SIGUE FUNCIONANDO ----------------------------------------
// Si el caso de siempre se rompiera, lo nuevo no valdría de nada.
{
  const hit = cadRayPlanePoint(
    { origin: { x: 3, y: 4, z: 10 }, direction: { x: 0, y: 0, z: -1 } },
    SUELO,
  );
  comprueba("un rayo vertical toca el suelo", hit !== null);
  if (hit) {
    cerca("y cae en x = 3", hit.x, 3);
    cerca("y cae en y = 4", hit.y, 4);
    cerca("y cae en z = 0", hit.z, 0);
  }
}

// --- 2 · LA PROMESA: sobre el faldón, y con cota -----------------------------
{
  const hit = cadRayPlanePoint(
    { origin: { x: 5, y: 2, z: 10 }, direction: { x: 0, y: 0, z: -1 } },
    FALDON,
  );
  comprueba("un rayo vertical toca el faldón inclinado", hit !== null);
  if (hit) {
    cerca("el punto SATISFACE la ecuación del plano", sobreElPlano(hit, FALDON), 0);
    comprueba(
      "y NO está en el suelo — que es el defecto que esto arregla",
      Math.abs(hit.z) > 1e-6,
    );
    // El faldón sube a 45°: en x = 5 la cota vale 5.
    cerca("sobre un faldón a 45°, z = x", hit.z, hit.x, 1e-9);
  }
}

// --- 3 · IDA Y VUELTA AL MARCO DEL PLANO ------------------------------------
{
  const mundo = { x: 7, y: -3, z: 7 };
  const uv = cadPointToPlane(FALDON, mundo);
  const vuelta = cadPointFromPlane(FALDON, uv);
  cerca("la vuelta recupera x", vuelta.x, mundo.x, 1e-9);
  cerca("la vuelta recupera y", vuelta.y, mundo.y, 1e-9);
  cerca("la vuelta recupera z", vuelta.z, mundo.z, 1e-9);
}

// --- 4 · LAS NEGATIVAS, que valen tanto como los aciertos --------------------
{
  const paralelo = cadRayPlanePoint(
    { origin: { x: 0, y: 0, z: 5 }, direction: { x: 1, y: 0, z: 0 } },
    SUELO,
  );
  comprueba("un rayo PARALELO al plano no inventa un punto", paralelo === null);

  const detras = cadRayPlanePoint(
    { origin: { x: 0, y: 0, z: 5 }, direction: { x: 0, y: 0, z: 1 } },
    SUELO,
  );
  comprueba("un plano A LA ESPALDA del rayo no devuelve punto", detras === null);

  const roto = cadRayPlanePoint(
    { origin: { x: NaN, y: 0, z: 5 }, direction: { x: 0, y: 0, z: -1 } },
    SUELO,
  );
  comprueba("un rayo con NaN se rechaza en vez de propagarlo", roto === null);
}

// --- 5 · ORTO SIGUE LOS EJES DEL PLANO, no los del mundo ---------------------
//
// Ésta es la comprobación que separa «tener un SCU» de «poder dibujar con él».
// Con el bloqueo ortogonal activo sobre un faldón, el punto tiene que quedarse
// EN EL FALDÓN. Si el bloqueo se aplicara en coordenadas del mundo, el trazo se
// saldría del plano y el usuario vería su línea despegarse de la cara.
{
  const base = { x: 0, y: 0, z: 0 };
  const inferido = cadInferPoint(
    { origin: { x: 4, y: 3, z: 10 }, direction: { x: 0, y: 0, z: -1 } },
    FALDON,
    { base, ortho: true },
  );
  comprueba("con Orto hay punto", inferido !== null);
  if (inferido) {
    cerca(
      "el punto con Orto SIGUE sobre el faldón",
      sobreElPlano(inferido.point, FALDON),
      0,
      1e-9,
    );
    comprueba(
      "y la razón se anuncia con insignia en vez de moverse en silencio",
      inferido.reason.startsWith("eje-") && inferido.label.length > 0,
    );
  }
}

// --- 6 · SIN PUNTO BASE NO HAY CANDADO, y se dice ---------------------------
{
  const inferido = cadInferPoint(
    { origin: { x: 4, y: 3, z: 10 }, direction: { x: 0, y: 0, z: -1 } },
    FALDON,
    { ortho: true },
  );
  comprueba("sin base, Orto no puede bloquear nada", inferido?.reason === "plano");
  comprueba(
    "y no pinta una insignia que mentiría",
    inferido?.label === "",
  );
}

// --- 7 · POLAR: engancha cuando toca, y no cuando no ------------------------
{
  const base = { x: 0, y: 0, z: 0 };
  // Un cursor casi a 45° en el marco del plano: el rastreo de 45° lo engancha.
  const cerca45 = cadInferPoint(
    { origin: { x: 3.1, y: 3, z: 10 }, direction: { x: 0, y: 0, z: -1 } },
    SUELO,
    { base, polarStepDegrees: 45 },
  );
  comprueba("el rastreo polar engancha cerca de un múltiplo", cerca45?.reason === "polar");
  comprueba(
    "y la insignia dice el ángulo, no sólo «polar»",
    (cerca45?.label ?? "").includes("°"),
  );

  const apagado = cadInferPoint(
    { origin: { x: 3.1, y: 3, z: 10 }, direction: { x: 0, y: 0, z: -1 } },
    SUELO,
    { base, polarStepDegrees: 0 },
  );
  comprueba("con paso 0 el rastreo polar está apagado", apagado?.reason === "plano");
}

if (fallos.length > 0) {
  console.error(`inference-engine: ${fallos.length} fallo(s)`);
  for (const f of fallos) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`inference-engine OK — ${ok} aserciones`);
