/**
 * El volumen 3D de piso, cielorraso y cubierta: la misma primitiva de
 * extrusión, contrastada con números exactos, no con una captura.
 *
 * Lo que se fija:
 *
 *  1. Un anillo rectangular simple extruye al volumen EXACTO de una caja —
 *     y con signo POSITIVO, que es la comprobación real de que el anillo
 *     entra en `makePrism` en el sentido que espera (antihorario visto desde
 *     +Z): un anillo invertido no lanzaría, construiría un cuerpo con las
 *     caras al revés, y `meshVolume` (integral con signo) lo delataría dando
 *     volumen NEGATIVO.
 *  2. El anillo EXTERIOR real que produce `detectCadRooms` sobre una planta
 *     con un tabique en T —el mismo módulo, no una copia— extruye al volumen
 *     de la huella ENTERA del edificio, no al de un solo local: es la prueba
 *     de que piso y cubierta cubren todo el edificio y no dejan un local a
 *     la intemperie.
 *  3. Entradas degeneradas (anillo corto, rango de Z no positivo) dan `null`.
 *  4. `conservativeWallTop`: sin muros da `null`; con todos iguales da esa
 *     altura; con uno más bajo que los demás da la MENOR, nunca la mayor.
 */
import { check, checkClose, report } from "../brep/spec-support";
import { bodyBounds, bodyMassProperties } from "../brep";
import { architecturalSlabBodyLocal, conservativeWallTop } from "./room-solid";
import { detectCadRooms } from "./bim-schedule";
import type { CadWallEntity } from "./cad-entities-v6";

const wall = (
  id: string,
  start: [number, number],
  end: [number, number],
  thickness = 250,
): CadWallEntity => ({
  id,
  type: "wall",
  start: { x: start[0], y: start[1], z: 0 },
  end: { x: end[0], y: end[1], z: 0 },
  thickness,
  height: 2_400,
  layer: "MUROS",
});

// --- 1. anillo rectangular simple: volumen exacto, y con signo positivo ----
{
  const ring = [
    { x: 0, y: 0 },
    { x: 5_000, y: 0 },
    { x: 5_000, y: 4_000 },
    { x: 0, y: 4_000 },
  ];
  const body = architecturalSlabBodyLocal(ring, -150, 0);
  check("un anillo válido produce cuerpo", body !== null);
  if (body) {
    const mass = bodyMassProperties(body);
    const analytic = 5_000 * 4_000 * 150;
    check(
      "el volumen sale POSITIVO: el anillo entra a makePrism en el sentido que espera",
      mass.volume > 0,
      `volumen: ${mass.volume}`,
    );
    checkClose(
      "volumen exacto: huella × grosor",
      mass.volume,
      analytic,
      analytic * 1e-6,
    );
    const bounds = bodyBounds(body);
    checkClose("X: la huella completa", bounds.max.x - bounds.min.x, 5_000);
    checkClose("Y: la huella completa", bounds.max.y - bounds.min.y, 4_000);
    checkClose("Z: -150 a 0", bounds.max.z - bounds.min.z, 150);
    checkClose("Z: el techo de la losa queda en 0", bounds.max.z, 0);
  }
}

// --- 2. el anillo EXTERIOR real de un tabique en T cubre TODO el edificio --
{
  const walls: CadWallEntity[] = [
    wall("sur", [0, 0], [5_000, 0]),
    wall("este", [5_000, 0], [5_000, 4_000]),
    wall("norte", [5_000, 4_000], [0, 4_000]),
    wall("oeste", [0, 4_000], [0, 0]),
    wall("tabique", [2_000, 0], [2_000, 4_000], 150),
  ];
  const { rooms, exteriorRing } = detectCadRooms(walls);
  check(
    "el tabique sigue partiendo la planta en dos locales",
    rooms.length === 2,
  );
  check(
    "y el recorrido sigue exponiendo un contorno exterior",
    exteriorRing !== null,
  );
  if (exteriorRing) {
    const wallHeight = conservativeWallTop(walls)!;
    const body = architecturalSlabBodyLocal(
      exteriorRing,
      wallHeight,
      wallHeight + 300,
    );
    check("la cubierta sobre el anillo exterior produce cuerpo", body !== null);
    if (body) {
      const mass = bodyMassProperties(body);
      const wholeFootprint = 5_000 * 4_000 * 300;
      const oneRoomOnly = rooms[0].axisArea * 300; // el local mayor, si el anillo se hubiera limitado a él
      checkClose(
        "la cubierta cubre la huella ENTERA (5.000×4.000), no un solo local",
        mass.volume,
        wholeFootprint,
        wholeFootprint * 1e-6,
      );
      check(
        "en particular, es más que el volumen de un solo local",
        mass.volume > oneRoomOnly * 1.1,
        `cubierta: ${mass.volume}, un local: ${oneRoomOnly}`,
      );
      const bounds = bodyBounds(body);
      checkClose(
        "la cubierta se apoya en la altura de muro",
        bounds.min.z,
        2_400,
      );
      checkClose("y sube el grosor dado", bounds.max.z - bounds.min.z, 300);
    }
  }
}

// --- 3. entradas degeneradas -------------------------------------------------
{
  check(
    "anillo de menos de 3 vértices → null",
    architecturalSlabBodyLocal(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      0,
      100,
    ) === null,
  );
  const triangle = [
    { x: 0, y: 0 },
    { x: 1_000, y: 0 },
    { x: 0, y: 1_000 },
  ];
  check(
    "z1 igual a z0 → null",
    architecturalSlabBodyLocal(triangle, 0, 0) === null,
  );
  check(
    "z1 menor que z0 → null",
    architecturalSlabBodyLocal(triangle, 100, 0) === null,
  );
}

// --- 4. conservativeWallTop: la MENOR altura, nunca la mayor ----------------
{
  check("sin muros → null", conservativeWallTop([]) === null);
  check(
    "todos los muros a la misma altura → esa altura",
    conservativeWallTop([
      { height: 2_400 },
      { height: 2_400 },
      { height: 2_400 },
    ]) === 2_400,
  );
  check(
    "un muro más bajo que los demás → la MENOR, no la mayor ni el promedio",
    conservativeWallTop([
      { height: 2_400 },
      { height: 2_100 },
      { height: 3_000 },
    ]) === 2_100,
  );
}

report("room-solid", 20);
