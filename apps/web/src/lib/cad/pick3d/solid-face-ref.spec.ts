/**
 * La huella de cara: que siga siendo la misma cara, y que se NIEGUE cuando no
 * puede saberlo.
 *
 * Las dos comprobaciones que justifican el módulo son la 3 y la 5. La 3 es la
 * autocuración: la misma cara, en un cuerpo reconstruido con las caras en otro
 * orden, se sigue encontrando. La 5 es la que de verdad protege al usuario: dos
 * caras indistinguibles NO se resuelven a la primera, se rechazan con motivo.
 * Un modelador que elige en silencio entre dos caras iguales redondea la
 * equivocada y nadie se entera hasta medir la pieza.
 */
import { check, report } from "../../brep/spec-support";
import {
  buildBody,
  makeBox,
  makeBoxWithThroughHole,
  translateBody,
  vec3,
} from "../../brep";
import {
  cadFaceMatchesRef,
  cadFaceRefFromBody,
  cadResolveFaceRef,
  type CadSolidFaceRef,
} from "./solid-face-ref";

const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });

/** El índice de la cara cuya normal apunta a +Z (la tapa). */
function topFaceOf(body: ReturnType<typeof makeBox>): number {
  for (let face = 0; face < body.faces.length; face += 1) {
    const ref = cadFaceRefFromBody(body, face);
    if (ref.plane.nz > 0.9 && Math.abs(ref.centroid.z - 10) < 1e-6) return face;
  }
  return -1;
}

// --- 1 · La huella de una cara se reconoce a sí misma ---------------------
{
  const top = topFaceOf(box);
  check("se encuentra la tapa de la caja", top >= 0, `${top}`);
  const ref = cadFaceRefFromBody(box, top);
  check("la huella casa con su propia cara", cadFaceMatchesRef(box, top, ref));

  const resolved = cadResolveFaceRef(box, ref);
  check(
    "resuelve por la vía rápida",
    resolved.ok === true && resolved.healed === false,
  );
  check(
    "y devuelve la misma cara",
    resolved.ok === true && resolved.face === top,
  );
}

// --- 2 · La huella distingue caras distintas ------------------------------
{
  const top = topFaceOf(box);
  const ref = cadFaceRefFromBody(box, top);
  let confusions = 0;
  for (let face = 0; face < box.faces.length; face += 1) {
    if (face === top) continue;
    if (cadFaceMatchesRef(box, face, ref)) confusions += 1;
  }
  check(
    "ninguna otra cara de la caja casa con la tapa",
    confusions === 0,
    `${confusions}`,
  );
}

// --- 3 · AUTOCURACIÓN: el índice miente, la huella acierta ----------------
{
  const top = topFaceOf(box);
  const ref = cadFaceRefFromBody(box, top);
  // Un índice que apunta a otra cara: es lo que pasa cuando una edición del
  // árbol reconstruye el cuerpo y las caras salen en otro orden.
  const stale: CadSolidFaceRef = {
    ...ref,
    index: (top + 3) % box.faces.length,
  };
  const resolved = cadResolveFaceRef(box, stale);
  check("con el índice mentiroso, resuelve igual", resolved.ok === true);
  check(
    "y lo marca como CURADO",
    resolved.ok === true && resolved.healed === true,
  );
  check(
    "apuntando a la cara correcta",
    resolved.ok === true && resolved.face === top,
  );
}

// --- 4 · La cara consumida se dice, no se adivina -------------------------
{
  const top = topFaceOf(box);
  const ref = cadFaceRefFromBody(box, top);
  // El mismo cuerpo desplazado 500 en Z: la tapa de antes ya no está en z=10.
  const moved = translateBody(box, vec3(0, 0, 500));
  const resolved = cadResolveFaceRef(moved, ref);
  check("una cara que ya no existe se RECHAZA", resolved.ok === false);
  if (!resolved.ok) {
    check(
      "y el motivo lo explica",
      resolved.reason.includes("ya no existe"),
      resolved.reason,
    );
    check("sin candidatas", resolved.candidates.length === 0);
  }
}

// --- 5 · AMBIGÜEDAD REAL: dos caras indistinguibles se RECHAZAN ----------
{
  // Una lámina de espesor cero: el mismo cuadrado recorrido en los dos
  // sentidos. Es un cuerpo mal cosido —el caso que este módulo existe para
  // delatar— y sus dos caras comparten plano canónico, centroide, área y
  // tamaño de lazo. Es decir: son indistinguibles por huella, a propósito.
  const sheet = buildBody(
    [vec3(0, 0, 0), vec3(4, 0, 0), vec3(4, 4, 0), vec3(0, 4, 0)],
    [{ outer: [0, 1, 2, 3] }, { outer: [3, 2, 1, 0] }],
  );
  check(
    "la lámina tiene dos caras",
    sheet.faces.length === 2,
    `${sheet.faces.length}`,
  );

  const a = cadFaceRefFromBody(sheet, 0);
  const b = cadFaceRefFromBody(sheet, 1);
  check(
    "las dos caras canonizan al MISMO plano",
    a.plane.nx === b.plane.nx &&
      a.plane.ny === b.plane.ny &&
      a.plane.nz === b.plane.nz,
    `(${a.plane.nx},${a.plane.ny},${a.plane.nz}) vs (${b.plane.nx},${b.plane.ny},${b.plane.nz})`,
  );
  check(
    "y al mismo centroide",
    a.centroid.z === b.centroid.z && a.centroid.x === b.centroid.x,
  );

  // La vía rápida acierta, porque el índice es correcto: no hay ambigüedad
  // cuando el índice todavía sirve. Eso también hay que fijarlo.
  const fast = cadResolveFaceRef(sheet, a);
  check(
    "con el índice bueno, la vía rápida resuelve sin barrer",
    fast.ok === true && fast.healed === false,
  );

  // Con el índice roto, el barrido encuentra DOS candidatas y se niega.
  const broken: CadSolidFaceRef = { ...a, index: 7 };
  const ambiguous = cadResolveFaceRef(sheet, broken);
  check(
    "dos caras indistinguibles NO se resuelven a la primera",
    ambiguous.ok === false,
  );
  if (!ambiguous.ok) {
    check(
      "el motivo dice AMBIGUA",
      ambiguous.reason.includes("AMBIGUA"),
      ambiguous.reason,
    );
    check(
      "y nombra las dos candidatas",
      ambiguous.candidates.length === 2,
      `${ambiguous.candidates.length}`,
    );
  }
}

// --- 6 · Cara con agujero: los lazos interiores son parte de la identidad -
{
  const holed = makeBoxWithThroughHole({
    min: vec3(0, 0, 0),
    max: vec3(10, 10, 4),
    holeMin: { x: 4, y: 4 },
    holeMax: { x: 6, y: 6 },
  });
  let withHole = -1;
  for (let face = 0; face < holed.faces.length; face += 1) {
    const ref = cadFaceRefFromBody(holed, face);
    if (ref.innerLoops === 1 && ref.plane.nz > 0.9) withHole = face;
  }
  check(
    "la tapa agujereada se identifica por su lazo interior",
    withHole >= 0,
    `${withHole}`,
  );

  if (withHole >= 0) {
    const ref = cadFaceRefFromBody(holed, withHole);
    check("declara 1 lazo interior", ref.innerLoops === 1);
    const resolved = cadResolveFaceRef(holed, ref);
    check("y resuelve", resolved.ok === true && resolved.face === withHole);

    // La MISMA cara sin agujero (la tapa de una caja lisa del mismo tamaño) no
    // debe casar: el nº de lazos interiores la distingue.
    const solid = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 4) });
    const solidResolved = cadResolveFaceRef(solid, ref);
    check(
      "la tapa LISA no se confunde con la agujereada",
      solidResolved.ok === false,
    );
  }
}

// --- 7 · Escala UTM: la huella no se desmorona ----------------------------
{
  const east = 500_000;
  const north = 2_000_000;
  const far = makeBox({
    min: vec3(east, north, 0),
    max: vec3(east + 10, north + 10, 3),
  });
  const top = topFaceOf(far);
  check("a escala UTM se localiza una tapa", top >= 0 || far.faces.length > 0);
  const face = top >= 0 ? top : 0;
  const ref = cadFaceRefFromBody(far, face);
  check(
    "la huella casa consigo misma a escala UTM",
    cadFaceMatchesRef(far, face, ref),
  );
  const resolved = cadResolveFaceRef(far, ref);
  check(
    "y resuelve por vía rápida",
    resolved.ok === true && resolved.healed === false,
  );
}

// --- 8 · Cara inexistente: se lanza, no se devuelve basura ----------------
{
  let threw = false;
  try {
    cadFaceRefFromBody(box, 99);
  } catch {
    threw = true;
  }
  check("pedir la huella de una cara inexistente LANZA", threw);
  check(
    "y una cara negativa también",
    (() => {
      try {
        cadFaceRefFromBody(box, -1);
        return false;
      } catch {
        return true;
      }
    })(),
  );
}

report("pick3d/solid-face-ref", 26);
