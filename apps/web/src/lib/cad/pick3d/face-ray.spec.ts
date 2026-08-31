/**
 * Designación de cara por rayo: la regresión que justifica el módulo entero.
 *
 * La comprobación que importa es la tercera. `ucs-solid.ts` designaba mirando por
 * la Z del mundo y quedándose con la cara más ALTA; con esa regla, pinchar la
 * cara frontal de una caja desde una vista isométrica designaba la TAPA. Aquí se
 * fija con números que eso ya no pasa: el mismo rayo, el mismo cuerpo, y la cara
 * que sale es la que el ojo ve.
 *
 * Lo demás son las propiedades sin las cuales el picking miente: no se designa
 * lo que está detrás del ojo, no se designa por un agujero pasante, y una cara
 * vista de canto no se designa por casualidad.
 */
import {
  check,
  checkClose,
  checkPointClose,
  report,
} from "../../brep/spec-support";
import { makeBox, makeBoxWithThroughHole, vec3 } from "../../brep";
import {
  cadFaceContainsPoint,
  cadFaceRayHit,
  cadFaceRayHits,
} from "./face-ray";

const box = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });

// --- 1 · Vertical hacia abajo: la tapa ------------------------------------
{
  const hit = cadFaceRayHit(box, {
    origin: vec3(5, 5, 50),
    direction: vec3(0, 0, -1),
  });
  check("rayo vertical impacta una cara", hit !== null);
  if (hit) {
    checkPointClose("impacta la TAPA en z=10", hit.point, vec3(5, 5, 10));
    checkPointClose("la normal de la tapa es +Z", hit.normal, vec3(0, 0, 1));
    checkClose("t = 40 desde z=50", hit.t, 40);
    check("la tapa no es cara trasera", hit.backFace === false);
    checkClose("una caja tiene caras planas", hit.planarityDeviation, 0);
  }
}

// --- 2 · Vertical hacia arriba desde debajo: la base ----------------------
{
  const hit = cadFaceRayHit(box, {
    origin: vec3(5, 5, -50),
    direction: vec3(0, 0, 1),
  });
  check("desde abajo impacta", hit !== null);
  if (hit) {
    checkPointClose("impacta la BASE en z=0", hit.point, vec3(5, 5, 0));
    checkPointClose("la normal de la base es −Z", hit.normal, vec3(0, 0, -1));
  }
}

// --- 3 · LA REGRESIÓN: en isométrica se designa lo que se ve --------------
{
  // Ojo en isométrica, mirando al centro de la caja. El rayo entra por la
  // esquina y la PRIMERA cara que atraviesa es una lateral, no la tapa.
  const eye = vec3(60, -40, 5);
  const target = vec3(5, 5, 5);
  const hit = cadFaceRayHit(box, {
    origin: eye,
    direction: vec3(target.x - eye.x, target.y - eye.y, target.z - eye.z),
  });
  check("la vista isométrica designa algo", hit !== null);
  if (hit) {
    check(
      "designa una cara LATERAL, no la tapa (la regla vieja fallaba aquí)",
      Math.abs(hit.normal.z) < 1e-9,
      `normal (${hit.normal.x}, ${hit.normal.y}, ${hit.normal.z})`,
    );
    check(
      "el impacto está sobre la superficie de la caja",
      hit.point.x <= 10 + 1e-9 &&
        hit.point.y >= -1e-9 &&
        hit.point.z >= -1e-9 &&
        hit.point.z <= 10 + 1e-9,
      `punto (${hit.point.x}, ${hit.point.y}, ${hit.point.z})`,
    );
  }

  // Y la prueba directa de que la regla vieja habría dicho otra cosa: por la
  // vertical de ese mismo punto de impacto, la cara más alta ES la tapa.
  if (hit) {
    const vertical = cadFaceRayHit(box, {
      origin: vec3(hit.point.x, hit.point.y, 100),
      direction: vec3(0, 0, -1),
    });
    check(
      "por la vertical de ese punto, la cara más alta es OTRA (la tapa)",
      vertical !== null && vertical.face !== hit.face,
      vertical
        ? `vertical=${vertical.face} isométrica=${hit.face}`
        : "sin impacto vertical",
    );
  }
}

// --- 4 · No se designa lo que está detrás del ojo -------------------------
{
  const hits = cadFaceRayHits(box, {
    origin: vec3(5, 5, 50),
    direction: vec3(0, 0, 1),
  });
  check(
    "mirando al revés no se designa nada",
    hits.length === 0,
    `${hits.length} impactos`,
  );
}

// --- 5 · Cara trasera: culling por defecto, y el reverso bajo petición ----
{
  const ray = { origin: vec3(5, 5, 50), direction: vec3(0, 0, -1) };
  const culled = cadFaceRayHits(box, ray);
  check(
    "con culling sólo se ve la cara de delante",
    culled.length === 1,
    `${culled.length}`,
  );

  const both = cadFaceRayHits(box, ray, { cullBackFaces: false });
  check(
    "sin culling se ven las dos caras",
    both.length === 2,
    `${both.length}`,
  );
  if (both.length === 2) {
    check(
      "vienen ordenadas de cerca a lejos",
      both[0].t < both[1].t,
      `${both[0].t} vs ${both[1].t}`,
    );
    check("la primera es cara vista", both[0].backFace === false);
    check("la segunda es cara trasera", both[1].backFace === true);
    checkPointClose("la trasera está en z=0", both[1].point, vec3(5, 5, 0));
  }
}

// --- 6 · Una cara vista de canto no se designa ----------------------------
{
  // Rayo contenido en el plano z=10 (el de la tapa): paralelo, nunca la impacta.
  const hits = cadFaceRayHits(
    box,
    { origin: vec3(-50, 5, 10), direction: vec3(1, 0, 0) },
    { cullBackFaces: false },
  );
  const topHits = hits.filter((h) => Math.abs(h.normal.z) > 0.5);
  check(
    "un rayo en el plano de la tapa no designa la tapa",
    topHits.length === 0,
    `${topHits.length}`,
  );
}

// --- 7 · Un agujero pasante se atraviesa, no se designa -------------------
{
  const holed = makeBoxWithThroughHole({
    min: vec3(0, 0, 0),
    max: vec3(10, 10, 4),
    holeMin: { x: 4, y: 4 },
    holeMax: { x: 6, y: 6 },
  });

  const throughHole = cadFaceRayHits(
    holed,
    { origin: vec3(5, 5, 50), direction: vec3(0, 0, -1) },
    { cullBackFaces: false },
  );
  check(
    "por el centro del agujero no se designa nada",
    throughHole.length === 0,
    `${throughHole.length}`,
  );

  const onMaterial = cadFaceRayHit(holed, {
    origin: vec3(1, 1, 50),
    direction: vec3(0, 0, -1),
  });
  check("fuera del agujero sí se designa la tapa", onMaterial !== null);
  if (onMaterial) checkPointClose("y en z=4", onMaterial.point, vec3(1, 1, 4));

  check(
    "el centro del agujero NO pertenece a la tapa",
    !cadFaceContainsPoint(
      holed,
      onMaterial ? onMaterial.face : 0,
      vec3(5, 5, 4),
    ),
  );
}

// --- 8 · El borde de una cara pertenece a la cara -------------------------
{
  const corner = cadFaceRayHit(box, {
    origin: vec3(0, 0, 50),
    direction: vec3(0, 0, -1),
  });
  check("pinchar justo en la esquina designa la tapa", corner !== null);
  const edge = cadFaceRayHit(box, {
    origin: vec3(0, 5, 50),
    direction: vec3(0, 0, -1),
  });
  check("pinchar justo sobre una arista designa la tapa", edge !== null);
}

// --- 9 · Entradas imposibles: se dice que no, no se inventa ---------------
{
  check(
    "dirección nula no designa",
    cadFaceRayHits(box, { origin: vec3(5, 5, 50), direction: vec3(0, 0, 0) })
      .length === 0,
  );
  check(
    "origen no finito no designa",
    cadFaceRayHits(box, { origin: vec3(NaN, 5, 50), direction: vec3(0, 0, -1) })
      .length === 0,
  );
  check(
    "dirección no finita no designa",
    cadFaceRayHits(box, {
      origin: vec3(5, 5, 50),
      direction: vec3(0, Infinity, -1),
    }).length === 0,
  );
  check(
    "fuera de la planta de la caja no designa",
    cadFaceRayHits(box, { origin: vec3(99, 99, 50), direction: vec3(0, 0, -1) })
      .length === 0,
  );
}

// --- 10 · Coordenadas grandes: la tolerancia es RELATIVA ------------------
{
  // Un predio en UTM: 500 km al este, 2 000 km al norte. Con epsilon absolutos
  // el punto-en-polígono se desmorona; con tolerancia relativa, no.
  const east = 500_000;
  const north = 2_000_000;
  const far = makeBox({
    min: vec3(east, north, 0),
    max: vec3(east + 10, north + 10, 3),
  });
  const hit = cadFaceRayHit(far, {
    origin: vec3(east + 5, north + 5, 100),
    direction: vec3(0, 0, -1),
  });
  check("a escala UTM se sigue designando", hit !== null);
  if (hit)
    checkPointClose(
      "y en la cota correcta",
      hit.point,
      vec3(east + 5, north + 5, 3),
      1e-6,
    );
}

report("pick3d/face-ray", 28);
