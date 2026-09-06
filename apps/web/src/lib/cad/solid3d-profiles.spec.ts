/**
 * Planaridad del perfil que come EXTRUDE (T-10 b, 2026-09-06).
 *
 * La auditoría del 2026-09-05 midió que `profileFromEntity` toma la cota de UN
 * vértice y devuelve los puntos 2D del renderizador: un perfil dibujado a 30°
 * salía aplanado, más pequeño por el coseno y a la cota de una esquina, y
 * EXTRUDE lo consumía sin decir nada. Este spec deja escrito el defecto
 * —sigue ahí, a propósito, porque REVOLVE y LOFT lo consumen— y comprueba la
 * puerta nueva, `horizontalProfileFromEntity`, que MIDE la separación en cota
 * y devuelve un motivo en vez del perfil aplanado. Un perfil horizontal a
 * cualquier cota pasa por ella byte a byte igual que antes.
 */
import { strict as assert } from "node:assert";
import type { CadEntity, CadPoint2 } from "./cad-document";
import {
  CAD_PROFILE_HORIZONTAL_TOLERANCE,
  horizontalProfileFromEntity,
  planeFrameAt,
  profileElevationDeviation,
  profileFromEntity,
} from "./solid3d-profiles";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (actual: number, expected: number, what: string, epsilon = 1e-6) =>
  ok(Math.abs(actual - expected) <= epsilon, `${what}: ${actual}, se esperaba ${expected}`);

const layer = "PERFILES";

/** Área con signo de un anillo: positiva si es antihorario. */
function ringArea(points: readonly CadPoint2[]): number {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    total += a.x * b.y - b.x * a.y;
  }
  return total / 2;
}

function polyline(id: string, vertices: { x: number; y: number; z: number }[], closed = true): CadEntity {
  return { id, type: "polyline", vertices, closed, layer };
}

const SIN30 = 0.5;
const COS30 = Math.sqrt(3) / 2;

/**
 * Rectángulo de 1000 × 1000 dibujado INCLINADO 30° sobre el eje X: la arista
 * de 1000 que sube recorre 866 en Y y 500 en Z. Aplanado sobre el plano XY mide
 * 1000 × 866, que es lo que el extrusor entregaba en silencio.
 */
const inclined = polyline("inclinado", [
  { x: 0, y: 0, z: 0 },
  { x: 1000, y: 0, z: 0 },
  { x: 1000, y: 1000 * COS30, z: 1000 * SIN30 },
  { x: 0, y: 1000 * COS30, z: 1000 * SIN30 },
]);

/** Rectángulo horizontal de 400 × 300 a la cota 1200: el caso que ya funcionaba. */
const horizontal = polyline("horizontal", [
  { x: 0, y: 0, z: 1200 },
  { x: 400, y: 0, z: 1200 },
  { x: 400, y: 300, z: 1200 },
  { x: 0, y: 300, z: 1200 },
]);

/* ── El defecto medido: lo que profileFromEntity sigue devolviendo ─────────── */
{
  const flattened = profileFromEntity(inclined);
  ok(flattened !== null, "profileFromEntity sigue aceptando el contorno inclinado (lo consumen REVOLVE y LOFT)");
  near(flattened!.elevation, 0, "toma la cota de UNA esquina: la primera");
  near(
    Math.abs(ringArea(flattened!.profile.outer)),
    1000 * 1000 * COS30,
    "y el área que devuelve es la real multiplicada por el coseno: 866 025 en vez de 1 000 000",
    1e-6,
  );
}

/* ── La medida: cuánto se separa el perfil de la horizontal ─────────────────── */
{
  near(profileElevationDeviation(inclined), 500, "un rectángulo de 1000 a 30° se separa 500 en cota");
  near(profileElevationDeviation(horizontal), 0, "uno horizontal a la cota 1200 se separa 0");
  ok(CAD_PROFILE_HORIZONTAL_TOLERANCE > 0 && CAD_PROFILE_HORIZONTAL_TOLERANCE < 1e-3, "la tolerancia es la lineal del kernel, no una cifra propia");

  const warped = polyline("alabeado", [
    { x: 0, y: 0, z: 0 },
    { x: 1000, y: 0, z: 0 },
    { x: 1000, y: 1000, z: 0 },
    { x: 0, y: 1000, z: 500 },
  ]);
  near(profileElevationDeviation(warped), 500, "un contorno ALABEADO (una esquina fuera del plano) también se mide: no es horizontal");

  const region: CadEntity = {
    id: "region",
    type: "region",
    layer,
    outer: [
      { x: 0, y: 0, z: 100 },
      { x: 500, y: 0, z: 100 },
      { x: 500, y: 500, z: 100 },
      { x: 0, y: 500, z: 100 },
    ],
    inners: [
      [
        { x: 100, y: 100, z: 100 },
        { x: 100, y: 200, z: 160 },
        { x: 200, y: 200, z: 160 },
        { x: 200, y: 100, z: 100 },
      ],
    ],
  };
  near(profileElevationDeviation(region), 60, "en una REGION cuentan también los anillos interiores");

  const spline: CadEntity = {
    id: "spline",
    type: "spline",
    layer,
    degree: 3,
    closed: true,
    knots: [0, 0, 0, 0, 1, 1, 1, 1],
    controlPoints: [
      { x: 0, y: 0, z: 10 },
      { x: 100, y: 0, z: 10 },
      { x: 100, y: 100, z: 35 },
      { x: 0, y: 100, z: 35 },
    ],
  };
  near(profileElevationDeviation(spline), 25, "en una spline miden los puntos de control, que son los que llevan cota");

  const tilted: CadEntity = {
    id: "elipse",
    type: "ellipse",
    layer,
    center: { x: 0, y: 0, z: 0 },
    majorAxis: { x: 500, y: 0, z: 100 },
    ratio: 0.5,
    startParameter: 0,
    endParameter: 360,
  };
  near(profileElevationDeviation(tilted), 200, "en una elipse miden los dos extremos del eje mayor: centro ± eje");

  const circle: CadEntity = { id: "circulo", type: "circle", layer, center: { x: 0, y: 0, z: 50 }, radius: 10 };
  near(profileElevationDeviation(circle), 0, "un círculo sólo lleva la cota de su centro");

  const line: CadEntity = { id: "linea", type: "line", layer, start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 900 } };
  near(profileElevationDeviation(line), 0, "una entidad sin perfil no tiene desviación que declarar");
}

/* ── La puerta: motivo en vez de perfil aplanado ───────────────────────────── */
{
  const refused = horizontalProfileFromEntity(inclined);
  ok(refused.kind === "inclined", `el contorno a 30° no da perfil: da «inclined», dio «${refused.kind}»`);
  if (refused.kind !== "inclined") throw new Error("tipo");
  near(refused.deviation, 500, "y trae la desviación medida, que es el número que el comando declara");
  ok(!("extracted" in refused), "sin ningún perfil adjunto: el aplanado no se ofrece ni como cortesía");

  const accepted = horizontalProfileFromEntity(horizontal);
  ok(accepted.kind === "profile", "el rectángulo horizontal a la cota 1200 sigue dando perfil");
  if (accepted.kind !== "profile") throw new Error("tipo");
  near(accepted.extracted.elevation, 1200, "con su cota, la 1200");
  assert.equal(accepted.extracted.sourceId, "horizontal");
  assert.deepEqual(accepted.extracted, profileFromEntity(horizontal), "y es EXACTAMENTE lo que profileFromEntity daba: ni un byte distinto");
  ok(accepted.extracted.profile.outer.length === 4, "cuatro vértices");
  near(ringArea(accepted.extracted.profile.outer), 400 * 300, "antihorario y con su área entera");
  const frame = planeFrameAt(accepted.extracted.elevation);
  near(frame.origin.z, 1200, "el marco nace a la cota del perfil");
  assert.deepEqual(frame.zAxis, { x: 0, y: 0, z: 1 }, "y es horizontal");

  const noisy = polyline("ruido", [
    { x: 0, y: 0, z: 1200 },
    { x: 400, y: 0, z: 1200 + 1e-9 },
    { x: 400, y: 300, z: 1200 },
    { x: 0, y: 300, z: 1200 - 1e-9 },
  ]);
  ok(horizontalProfileFromEntity(noisy).kind === "profile", "un nanómetro de ruido en cota está por debajo de la tolerancia del kernel: sigue siendo horizontal");

  const openInclined = polyline("abierto", inclined.type === "polyline" ? inclined.vertices : [], false);
  ok(horizontalProfileFromEntity(openInclined).kind === "none", "una polilínea abierta no es un contorno, inclinada o no: «none», y el mensaje es el de siempre");

  const legacy = {
    id: "sin-z",
    type: "polyline",
    layer,
    closed: true,
    vertices: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
  } as unknown as CadEntity;
  const flat = horizontalProfileFromEntity(legacy);
  ok(flat.kind === "profile", "un dibujo anterior al 3D, con vértices sin `z`, sigue extruyéndose");
  if (flat.kind !== "profile") throw new Error("tipo");
  near(flat.extracted.elevation, 0, "a la cota cero, como siempre");

  const horizontalRegion: CadEntity = {
    id: "region-h",
    type: "region",
    layer,
    outer: [
      { x: 0, y: 0, z: 300 },
      { x: 500, y: 0, z: 300 },
      { x: 500, y: 500, z: 300 },
      { x: 0, y: 500, z: 300 },
    ],
    inners: [
      [
        { x: 100, y: 100, z: 300 },
        { x: 100, y: 200, z: 300 },
        { x: 200, y: 200, z: 300 },
        { x: 200, y: 100, z: 300 },
      ],
    ],
  };
  const withHole = horizontalProfileFromEntity(horizontalRegion);
  ok(withHole.kind === "profile", "una REGION horizontal con agujero pasa");
  if (withHole.kind !== "profile") throw new Error("tipo");
  ok(withHole.extracted.profile.inners?.length === 1, "con su agujero");
  near(withHole.extracted.elevation, 300, "a su cota");

  const circle: CadEntity = { id: "circulo", type: "circle", layer, center: { x: 0, y: 0, z: 50 }, radius: 10 };
  const disc = horizontalProfileFromEntity(circle);
  ok(disc.kind === "profile" && disc.extracted.elevation === 50, "un círculo a la cota 50 da su disco a la cota 50");

  const line: CadEntity = { id: "linea", type: "line", layer, start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 900 } };
  ok(horizontalProfileFromEntity(line).kind === "none", "una línea no es contorno, aunque suba 900");
}

console.log(`solid3d-profiles: ${checks} comprobaciones — el perfil a 30° devuelve motivo (500 en cota) y el horizontal a 1200 pasa intacto`);
