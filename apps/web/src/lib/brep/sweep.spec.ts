/**
 * Barrido y solevado: contrastados contra operaciones que YA están probadas.
 *
 * La forma más honesta de probar una operación nueva es reducirla a una vieja.
 * Un barrido por un camino recto TIENE que dar exactamente lo mismo que una
 * extrusión; un barrido por un camino circular cerrado, exactamente lo mismo que
 * una revolución completa con el mismo número de facetas. Si no coinciden al
 * bit, una de las dos está mal, y como la extrusión y la revolución ya tienen sus
 * propias anclas absolutas, la sospechosa es la nueva.
 *
 * El solevado se contrasta contra la fórmula del prismatoide, que es exacta para
 * un tronco de pirámide: `h/6·(A₀ + 4A_m + A₁)`.
 */
import { extrudeProfile, revolveVolume } from "./extrude";
import { validateBody } from "./invariants";
import { rectangle, regularPolygon, vec2 } from "./profile";
import { makeFrame } from "./surfaces";
import { loftProfiles, pathFrames, prismatoidVolume, sweepProfile } from "./sweep";
import { check, checkClose, checkThrows, report } from "./spec-support";
import { bodyIsClosed, eulerCounts, planarBodyVolume, type BrepBody } from "./topology";
import { v3Cross, v3Dot, v3Length, v3Sub, vec3, V3_X, V3_Z } from "./vec3";

function audit(label: string, body: BrepBody, expectedGenus: number) {
  const validation = validateBody(body, { requireClosed: true, requirePlanarFaces: true, expectedGenus });
  check(`${label}: invariantes verdes`, validation.ok, validation.violations.map((v) => v.message).join(" | "));
  check(`${label}: cerrado`, bodyIsClosed(body));
  return validation;
}

// --- Marcos de mínima rotación --------------------------------------------
{
  const frames = pathFrames([vec3(0, 0, 0), vec3(0, 0, 5), vec3(0, 0, 10)], false, V3_X);
  check("un camino recto da 3 marcos", frames.length === 3);
  let worst = 0;
  for (const { frame, tangent } of frames) {
    worst = Math.max(worst, v3Length(v3Sub(frame.zAxis, tangent)));
    worst = Math.max(worst, Math.abs(v3Dot(frame.xAxis, frame.yAxis)));
    worst = Math.max(worst, Math.abs(v3Dot(v3Cross(frame.xAxis, frame.yAxis), frame.zAxis) - 1));
  }
  check("los marcos son ortonormales y diestros con z = tangente", worst < 1e-12, `peor ${worst}`);
  // En un camino RECTO el marco no rota: es la propiedad que Frenet no cumple
  // (en una recta la normal de Frenet ni siquiera existe).
  let drift = 0;
  for (const { frame } of frames) drift = Math.max(drift, v3Length(v3Sub(frame.xAxis, frames[0].frame.xAxis)));
  check("y en una recta no giran nada", drift < 1e-12, `deriva ${drift}`);
}
{
  // Camino circular cerrado: tras corregir la torsión residual, el marco que
  // cierra el bucle coincide con el inicial.
  const segments = 24;
  const path = Array.from({ length: segments }, (_, i) =>
    vec3(6 * Math.cos((2 * Math.PI * i) / segments), 6 * Math.sin((2 * Math.PI * i) / segments), 0),
  );
  const frames = pathFrames(path, true, V3_X);
  check("un camino cerrado da un marco por punto", frames.length === segments);
  // En un camino PLANO la corrección debe dejar todos los ejes X en el plano.
  let outOfPlane = 0;
  for (const { frame } of frames) outOfPlane = Math.max(outOfPlane, Math.abs(v3Dot(frame.xAxis, V3_Z)));
  check("los marcos de un camino plano no salen del plano", outOfPlane < 1e-9, `peor ${outOfPlane}`);
  // El primer marco apunta radialmente hacia fuera: es el ancla que fija upHint.
  checkClose("el eje X del primer marco es radial", v3Dot(frames[0].frame.xAxis, V3_X), 1, 1e-12);
}
checkThrows("un camino de un solo punto se rechaza", () => pathFrames([vec3(0, 0, 0)], false));
checkThrows("un camino con todos los puntos iguales se rechaza", () =>
  pathFrames([vec3(1, 1, 1), vec3(1, 1, 1)], false),
);

// --- Barrido recto = extrusión --------------------------------------------
{
  const profile = { outer: rectangle(3, 5) };
  const swept = sweepProfile({ profile, path: [vec3(0, 0, 0), vec3(0, 0, 8)], upHint: V3_X });
  audit("barrido recto", swept, 0);
  const extruded = extrudeProfile({ profile, height: 8 });
  checkClose("barrer en recto da el MISMO volumen que extruir", planarBodyVolume(swept), planarBodyVolume(extruded), 1e-12);
  checkClose("y ese volumen es 3·5·8", planarBodyVolume(swept), 120, 1e-12);
  check("con la misma cuenta de caras", eulerCounts(swept).faces === eulerCounts(extruded).faces);
}
{
  // Camino con un codo de 90°: sigue siendo un sólido válido.
  const body = sweepProfile({
    profile: { outer: rectangle(1, 1) },
    path: [vec3(0, 0, 0), vec3(0, 0, 5), vec3(4, 0, 5)],
    upHint: V3_X,
  });
  audit("barrido con codo", body, 0);
  check("el volumen es positivo y del orden esperado", planarBodyVolume(body) > 5 && planarBodyVolume(body) < 12, `${planarBodyVolume(body)}`);
}

// --- Barrido circular cerrado = revolución completa ------------------------
{
  const segments = 32;
  const radius = 6;
  const side = 1.5;
  const path = Array.from({ length: segments }, (_, i) =>
    vec3(radius * Math.cos((2 * Math.PI * i) / segments), radius * Math.sin((2 * Math.PI * i) / segments), 0),
  );
  const body = sweepProfile({ profile: { outer: rectangle(side, side) }, path, closed: true, upHint: V3_X });
  const validation = audit("barrido circular cerrado", body, 1);
  check("un barrido cerrado sobre un anillo tiene género 1", validation.counts.genus === 1, `${validation.counts.genus}`);
  // Coincide con la revolución del mismo perfil cuadrado centrado en el radio.
  const expected = revolveVolume({
    profile: { outer: rectangle(side, side).map((point) => vec2(point.x + radius, point.y)) },
    segments,
  });
  checkClose("y el volumen coincide con la revolución facetada equivalente", planarBodyVolume(body), expected, 1e-9);
  // El valor cerrado de Pappus, como segunda referencia independiente.
  const pappus = 2 * Math.PI * radius * side * side;
  // El facetado pierde exactamente el factor sinΔ/Δ: con 32 caras eso es un
  // 0,64 %, así que exigir 0,5 % sería exigir que el facetado no facetase.
  const step = (2 * Math.PI) / segments;
  checkClose(
    "y su diferencia con Pappus es EXACTAMENTE el factor sinΔ/Δ del facetado",
    planarBodyVolume(body) / pappus,
    Math.sin(step) / step,
    1e-9,
  );
}

// --- Solevado -------------------------------------------------------------
{
  const height = 6;
  const bottom = makeFrame(vec3(0, 0, 0), V3_Z, V3_X);
  const top = makeFrame(vec3(0, 0, height), V3_Z, V3_X);
  const body = loftProfiles({
    sections: [
      { profile: { outer: rectangle(4, 4) }, frame: bottom },
      { profile: { outer: rectangle(2, 2) }, frame: top },
    ],
  });
  audit("tronco de pirámide", body, 0);
  // Prismatoide: h/6·(16 + 4·9 + 4). La sección media de un tronco entre lados
  // 4 y 2 es un cuadrado de lado 3, área 9.
  checkClose("volumen del tronco = h/6·(A₀ + 4A_m + A₁)", planarBodyVolume(body), (height / 6) * (16 + 36 + 4), 1e-12);
  check("y menos que el prisma recto de base mayor", planarBodyVolume(body) < 16 * height);
}
{
  // Cuadrados girados 45°: sin alinear el arranque, el sólido saldría retorcido
  // media vuelta. La alineación lo evita, y el volumen del prismatoide lo prueba.
  const bottom = makeFrame(vec3(0, 0, 0), V3_Z, V3_X);
  const top = makeFrame(vec3(0, 0, 4), V3_Z, V3_X);
  const rotated = regularPolygon(4, Math.SQRT2 * 2, Math.PI / 4 + Math.PI / 4);
  const body = loftProfiles({
    sections: [
      { profile: { outer: rectangle(4, 4) }, frame: bottom },
      { profile: { outer: rotated }, frame: top },
    ],
  });
  audit("solevado entre cuadrados girados", body, 0);
  // Aquí está el hecho incómodo que merece la pena tener escrito: entre un
  // cuadrado y su giro de 45°, las cuatro caras laterales son cuadriláteros
  // ALABEADOS. Un cuadrilátero alabeado no encierra un volumen definido —las dos
  // triangulaciones posibles difieren en ⅙ del determinante de sus esquinas—, así
  // que el sólido de un solo paso vale lo que valga su diagonal. Subdividir
  // reduce el alabeo y ambas triangulaciones convergen al sólido reglado.
  //
  // Valor del sólido reglado, calculado a mano. Los vértices emparejados dan una
  // sección media cuadrada de lado² = (2+√2)² + 2 = 8 + 4√2, de modo que el
  // prismatoide vale (4/6)·(16 + 4(8+4√2) + 16) = (2/3)·(64 + 16√2) ≈ 57,75.
  const ruled = (2 / 3) * (64 + 16 * Math.SQRT2);
  const singleStep = planarBodyVolume(body);
  check("el sólido de un solo paso se aparta más de un 20 % del reglado", Math.abs(singleStep - ruled) / ruled > 0.2, `${singleStep} vs ${ruled}`);
  let previous = singleStep;
  let previousDelta = Infinity;
  for (const steps of [4, 16, 64]) {
    const refined = loftProfiles({
      sections: [
        { profile: { outer: rectangle(4, 4) }, frame: bottom },
        { profile: { outer: rotated }, frame: top },
      ],
      steps,
    });
    audit(`solevado retorcido con ${steps} pasos`, refined, 0);
    const volume = planarBodyVolume(refined);
    const delta = Math.abs(volume - previous);
    check(`con ${steps} pasos el volumen se estabiliza`, delta < previousDelta, `${delta} >= ${previousDelta}`);
    previousDelta = delta;
    previous = volume;
  }
  check("y converge al sólido reglado con menos de un 1,5 % de error", Math.abs(previous - ruled) / ruled < 0.015, `${previous} vs ${ruled}`);
}
{
  // Distinto número de puntos: cuadrado → octógono. Se remuestrea por longitud
  // de arco, y el resultado sigue siendo un sólido válido.
  const bottom = makeFrame(vec3(0, 0, 0), V3_Z, V3_X);
  const top = makeFrame(vec3(0, 0, 5), V3_Z, V3_X);
  const body = loftProfiles({
    sections: [
      { profile: { outer: rectangle(6, 6) }, frame: bottom },
      { profile: { outer: regularPolygon(8, 2) }, frame: top },
    ],
  });
  audit("solevado cuadrado → octógono", body, 0);
  const volume = planarBodyVolume(body);
  // Área del octógono regular de circunradio 2: ½·8·2²·sin(45°) = 11,3137.
  const octagonArea = 0.5 * 8 * 4 * Math.sin(Math.PI / 4);
  check(
    "el volumen queda entre los dos prismas rectos",
    volume > octagonArea * 5 && volume < 36 * 5,
    `${volume} fuera de (${octagonArea * 5}, 180)`,
  );
}
{
  // Con agujero en las dos secciones: el solevado conserva el género 1.
  const bottom = makeFrame(vec3(0, 0, 0), V3_Z, V3_X);
  const top = makeFrame(vec3(0, 0, 4), V3_Z, V3_X);
  const body = loftProfiles({
    sections: [
      { profile: { outer: rectangle(10, 10), inners: [rectangle(4, 4)] }, frame: bottom },
      { profile: { outer: rectangle(6, 6), inners: [rectangle(3, 3)] }, frame: top },
    ],
  });
  const validation = audit("solevado con agujero", body, 1);
  check("género 1", validation.counts.genus === 1, `${validation.counts.genus}`);
  check("volumen positivo", planarBodyVolume(body) > 0);
}
checkThrows("solevar entre perfiles con distinto número de agujeros se rechaza", () =>
  loftProfiles({
    sections: [
      { profile: { outer: rectangle(4, 4), inners: [rectangle(1, 1)] }, frame: makeFrame(vec3(0, 0, 0), V3_Z, V3_X) },
      { profile: { outer: rectangle(4, 4) }, frame: makeFrame(vec3(0, 0, 2), V3_Z, V3_X) },
    ],
  }),
);
checkThrows("un solevado de una sola sección se rechaza", () =>
  loftProfiles({ sections: [{ profile: { outer: rectangle(1, 1) }, frame: makeFrame(vec3(0, 0, 0), V3_Z, V3_X) }] }),
);

// --- La fórmula del prismatoide, con su propia ancla ----------------------
{
  const bottom = [vec3(-2, -2, 0), vec3(2, -2, 0), vec3(2, 2, 0), vec3(-2, 2, 0)];
  const top = [vec3(-1, -1, 6), vec3(1, -1, 6), vec3(1, 1, 6), vec3(-1, 1, 6)];
  checkClose("prismatoide de un tronco 4→2 de altura 6", prismatoidVolume(bottom, top, V3_Z), (6 / 6) * (16 + 36 + 4), 1e-12);
  checkClose("y de un prisma recto es base × altura", prismatoidVolume(bottom, bottom.map((p) => vec3(p.x, p.y, 3)), V3_Z), 48, 1e-12);
}
checkThrows("el prismatoide rechaza anillos de distinto tamaño", () =>
  prismatoidVolume([vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0)], [vec3(0, 0, 1), vec3(1, 0, 1)], V3_Z),
);

report("brep/sweep", 35);
