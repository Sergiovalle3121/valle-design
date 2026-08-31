/**
 * Empujar una cara: el volumen por dos caminos, y las negativas que importan.
 *
 * La comprobación central es aritmética y no admite discusión: empujar una cara
 * de área A una distancia d tiene que cambiar el volumen en EXACTAMENTE A·d. Se
 * contrasta el volumen integrado sobre las caras del sólido cosido contra ese
 * producto, que no comparte una línea de código con él.
 *
 * Las otras tres son las negativas, y valen tanto como la primera: un empujón de
 * cero no finge que hizo algo, uno que atraviesa el sólido se rechaza con el
 * volumen en el mensaje, y uno que combaría una cara vecina la NOMBRA en vez de
 * dejarla fuera de su plano unos milímetros que nadie ve hasta fabricar.
 */
import { check, checkClose, report } from "../../brep/spec-support";
import {
  buildBody,
  extrudeProfile,
  makeBox,
  makeBoxWithThroughHole,
  planarBodyVolume,
  rectangle,
  regularPolygon,
  validateBody,
  vec3,
} from "../../brep";
import { cadFaceRefFromBody } from "./solid-face-ref";
import { cadPushFace } from "./face-push";

/** El índice de la cara cuya normal apunta a +Z y está a la cota `z`. */
function faceFacingUpAt(body: ReturnType<typeof makeBox>, z: number): number {
  for (let face = 0; face < body.faces.length; face += 1) {
    const ref = cadFaceRefFromBody(body, face);
    if (ref.plane.nz > 0.9 && Math.abs(ref.centroid.z - z) < 1e-6) return face;
  }
  return -1;
}

// --- 1 · EL NÚMERO: empujar la tapa de una caja ---------------------------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const top = faceFacingUpAt(box, 10);
  check("se localiza la tapa", top >= 0);

  const out = cadPushFace(box, top, 5);
  check("el empujón se acepta", out.ok === true, out.ok ? "" : out.reason);
  if (out.ok) {
    checkClose("volumen antes = 10·10·10", out.volumeBefore, 1000, 1e-6);
    checkClose("volumen después = 10·10·15", out.volumeAfter, 1500, 1e-6);
    checkClose(
      "el delta es área × distancia = 100·5",
      out.prismaticDelta,
      500,
      1e-6,
    );
    checkClose(
      "y el delta medido coincide con el declarado",
      out.volumeAfter - out.volumeBefore,
      out.prismaticDelta,
      1e-6,
    );
    const validation = validateBody(out.body, {
      requireClosed: true,
      requirePlanarFaces: true,
      expectedGenus: 0,
    });
    check(
      "el sólido resultante pasa los invariantes",
      validation.ok,
      validation.violations.map((v) => v.message).join(" | "),
    );
    check(
      "y conserva 6 caras",
      out.body.faces.length === 6,
      `${out.body.faces.length}`,
    );
  }
}

// --- 2 · Hundir: la misma aritmética con signo ----------------------------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const top = faceFacingUpAt(box, 10);
  const out = cadPushFace(box, top, -4);
  check("hundir la cara se acepta", out.ok === true, out.ok ? "" : out.reason);
  if (out.ok) {
    checkClose("volumen después = 10·10·6", out.volumeAfter, 600, 1e-6);
    checkClose(
      "el delta es negativo: 100·(−4)",
      out.prismaticDelta,
      -400,
      1e-6,
    );
    checkClose(
      "y coincide con lo medido",
      out.volumeAfter - out.volumeBefore,
      out.prismaticDelta,
      1e-6,
    );
  }
}

// --- 3 · Empujar un LATERAL, no sólo la tapa ------------------------------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  let side = -1;
  for (let face = 0; face < box.faces.length; face += 1) {
    const ref = cadFaceRefFromBody(box, face);
    if (Math.abs(ref.plane.nz) < 1e-9 && Math.abs(ref.centroid.x - 10) < 1e-6)
      side = face;
  }
  check("se localiza la cara +X", side >= 0, `${side}`);
  if (side >= 0) {
    const out = cadPushFace(box, side, 3);
    check(
      "empujar un lateral se acepta",
      out.ok === true,
      out.ok ? "" : out.reason,
    );
    if (out.ok) checkClose("volumen = 13·10·10", out.volumeAfter, 1300, 1e-6);
  }
}

// --- 4 · Un prisma de perfil cualquiera, no sólo cajas --------------------
{
  const prism = extrudeProfile({
    profile: { outer: regularPolygon(6, 4) },
    height: 7,
  });
  const top = faceFacingUpAt(prism, 7);
  check("se localiza la tapa del prisma hexagonal", top >= 0, `${top}`);
  if (top >= 0) {
    const before = planarBodyVolume(prism);
    const out = cadPushFace(prism, top, 2);
    check(
      "el prisma hexagonal se empuja",
      out.ok === true,
      out.ok ? "" : out.reason,
    );
    if (out.ok) {
      checkClose(
        "el volumen crece en área×distancia",
        out.volumeAfter - before,
        out.prismaticDelta,
        1e-6,
      );
      // 9/7 de la altura ⇒ 9/7 del volumen. Camino totalmente independiente.
      checkClose(
        "y equivale a escalar la altura de 7 a 9",
        out.volumeAfter,
        (before * 9) / 7,
        1e-6,
      );
    }
  }
}

// --- 5 · Cara con agujero: el hueco viaja con ella ------------------------
{
  const holed = makeBoxWithThroughHole({
    min: vec3(0, 0, 0),
    max: vec3(10, 10, 4),
    holeMin: { x: 4, y: 4 },
    holeMax: { x: 6, y: 6 },
  });
  let top = -1;
  for (let face = 0; face < holed.faces.length; face += 1) {
    const ref = cadFaceRefFromBody(holed, face);
    if (ref.plane.nz > 0.9 && ref.innerLoops === 1) top = face;
  }
  check("se localiza la tapa agujereada", top >= 0, `${top}`);
  if (top >= 0) {
    const out = cadPushFace(holed, top, 3);
    check(
      "empujar una cara con agujero se acepta",
      out.ok === true,
      out.ok ? "" : out.reason,
    );
    if (out.ok) {
      // Área = 100 − 4 = 96. Empujar 3 ⇒ +288.
      checkClose(
        "el área descuenta el agujero: (100−4)·3",
        out.prismaticDelta,
        288,
        1e-6,
      );
      checkClose(
        "y el volumen lo confirma",
        out.volumeAfter - out.volumeBefore,
        288,
        1e-6,
      );
      const validation = validateBody(out.body, {
        requireClosed: true,
        requirePlanarFaces: true,
        expectedGenus: 1,
      });
      check(
        "el agujero pasante sigue siendo pasante (género 1)",
        validation.ok,
        validation.violations.map((v) => v.message).join(" | "),
      );
    }
  }
}

// --- 6 · NEGATIVA: distancia cero no finge -------------------------------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const top = faceFacingUpAt(box, 10);
  const out = cadPushFace(box, top, 0);
  check("un empujón de cero se rechaza", out.ok === false);
  if (!out.ok)
    check("y dice que no cambia nada", out.reason.includes("cero"), out.reason);

  const nan = cadPushFace(box, top, Number.NaN);
  check("una distancia no finita se rechaza", nan.ok === false);
}

// --- 7 · NEGATIVA: atravesar el sólido se rechaza CON el volumen ----------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const top = faceFacingUpAt(box, 10);
  const out = cadPushFace(box, top, -15);
  check("hundir más allá del sólido se rechaza", out.ok === false);
  if (!out.ok)
    check(
      "y el motivo nombra el atravesar",
      out.reason.includes("atraviesa"),
      out.reason,
    );
}

// --- 8 · Una pirámide TAMBIÉN se empuja, y por qué eso es lo correcto ------
{
  // Escribí este caso esperando un rechazo: creía que las caras laterales
  // triangulares se combarían. Es falso, y el spec es el que lo dijo. Tres
  // puntos definen un plano SIEMPRE, así que un triángulo no se puede combar.
  // La operación es válida y el número lo confirma: mover la base de una
  // pirámide de altura h a altura h+d multiplica su volumen por (h+d)/h.
  const pyramid = buildBody(
    [vec3(0, 0, 0), vec3(4, 0, 0), vec3(4, 4, 0), vec3(0, 4, 0), vec3(2, 2, 5)],
    [
      { outer: [3, 2, 1, 0] },
      { outer: [0, 1, 4] },
      { outer: [1, 2, 4] },
      { outer: [2, 3, 4] },
      { outer: [3, 0, 4] },
    ],
  );
  const base = validateBody(pyramid, {
    requireClosed: true,
    requirePlanarFaces: true,
  });
  check(
    "la pirámide de referencia es válida",
    base.ok,
    base.violations.map((v) => v.message).join(" | "),
  );
  checkClose(
    "su volumen es 4·4·5/3",
    planarBodyVolume(pyramid),
    (16 * 5) / 3,
    1e-9,
  );

  // La cara 0 es la base; su normal apunta a −Z, así que empujarla hacia fuera
  // (positivo) la baja y hace la pirámide más alta.
  const out = cadPushFace(pyramid, 0, 2);
  check(
    "empujar la base de una pirámide se ACEPTA",
    out.ok === true,
    out.ok ? "" : out.reason,
  );
  if (out.ok) {
    checkClose(
      "altura 5 → 7 multiplica el volumen por 7/5",
      out.volumeAfter,
      (16 * 7) / 3,
      1e-9,
    );
    checkClose(
      "el delta PRISMÁTICO es área×distancia = 16·2",
      out.prismaticDelta,
      32,
      1e-9,
    );
    checkClose(
      "pero el REAL es un tercio de eso, porque la pirámide se estrecha",
      out.volumeAfter - out.volumeBefore,
      32 / 3,
      1e-9,
    );
    check(
      "y por eso el campo no se llama «esperado»",
      Math.abs(out.volumeAfter - out.volumeBefore - out.prismaticDelta) > 1,
    );
    const after = validateBody(out.body, {
      requireClosed: true,
      requirePlanarFaces: true,
      expectedGenus: 0,
    });
    check(
      "y el resultado sigue siendo un sólido válido",
      after.ok,
      after.violations.map((v) => v.message).join(" | "),
    );
  }
}

// --- 9 · NEGATIVA: cara inexistente --------------------------------------
{
  const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const out = cadPushFace(box, 42, 1);
  check("una cara que no existe se rechaza", out.ok === false);
  if (!out.ok)
    check("diciendo cuántas hay", out.reason.includes("6 cara"), out.reason);
}

// --- 10 · Empujar dos veces la misma cara, encontrándola por su huella ----
{
  let body = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const first = faceFacingUpAt(body, 10);
  const out1 = cadPushFace(body, first, 5);
  check("primer empujón", out1.ok === true, out1.ok ? "" : out1.reason);
  if (out1.ok) {
    body = out1.body;
    const second = faceFacingUpAt(body, 15);
    check(
      "la tapa se vuelve a encontrar en su cota nueva",
      second >= 0,
      `${second}`,
    );
    if (second >= 0) {
      const out2 = cadPushFace(body, second, 5);
      check(
        "segundo empujón sobre la misma cara",
        out2.ok === true,
        out2.ok ? "" : out2.reason,
      );
      if (out2.ok)
        checkClose("volumen = 10·10·20", out2.volumeAfter, 2000, 1e-6);
    }
  }
}

// --- 11 · Escala UTM: el empujón no se desmorona lejos del origen ---------
{
  const east = 500_000;
  const north = 2_000_000;
  const far = makeBox({
    min: vec3(east, north, 0),
    max: vec3(east + 10, north + 10, 3),
  });
  const top = faceFacingUpAt(far, 3);
  check("se localiza la tapa a escala UTM", top >= 0, `${top}`);
  if (top >= 0) {
    const out = cadPushFace(far, top, 2);
    check("y se empuja", out.ok === true, out.ok ? "" : out.reason);
    if (out.ok) checkClose("volumen = 10·10·5", out.volumeAfter, 500, 1e-3);
  }
}

report("pick3d/face-push", 36);
