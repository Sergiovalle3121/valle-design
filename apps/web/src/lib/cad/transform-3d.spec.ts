/**
 * Transformaciones 3D sobre sólidos: ampliación de `CadSolidPlacement` a una
 * afín 3×4 que permite girar, reflejar y trasladar un cuerpo en las tres
 * dimensiones.
 *
 * Lo que se comprueba aquí:
 *
 * 1. Una traslación en Z mueve el centroide y conserva el volumen.
 * 2. Un giro de 90° alrededor de X conserva el volumen y coloca el centroide
 *    donde toca.
 * 3. Un espejo3D (determinante negativo) invierte las caras y conserva el
 *    volumen.
 * 4. La colocación vieja (2×3 + dz) sigue funcionando sin cambios.
 * 5. La colocación va y vuelve del documento serializado.
 *
 * La colocación se pasa como `placement` del `solid3d`. `placeBody` la aplica
 * al evaluar el árbol. `resolveSolidPlacement` la completa con valores por
 * defecto.
 */
import { check, report } from "../brep/spec-support";
import type { CadSolid3dEntity } from "./cad-entities-v5";
import {
  clearSolidCache,
  solid3dBody,
  solid3dMassProperties,
} from "./solid3d-build";
import { parseCadDocument, serializeCadDocument } from "./cad-document";

const layer = "0";

function box(
  id: string,
  w: number,
  d: number,
  h: number,
  placement?: CadSolid3dEntity["placement"],
): CadSolid3dEntity {
  return {
    id,
    type: "solid3d",
    nodes: [
      {
        id: "perfil",
        op: "extrude",
        profile: {
          outer: [
            { x: 0, y: 0 },
            { x: w, y: 0 },
            { x: w, y: d },
            { x: 0, y: d },
          ],
        },
        height: h,
      },
    ],
    root: "perfil",
    layer,
    ...(placement ? { placement } : {}),
  };
}

// ---------------------------------------------------------------------------
// 1. Traslación en Z: el centroide sube y el volumen no cambia
// ---------------------------------------------------------------------------
{
  clearSolidCache();
  const w = 1000;
  const d = 600;
  const h = 500;
  const expectedVolume = w * d * h;

  const placed = box("z", w, d, h, {
    a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
    dz: 500,
  });
  solid3dBody(placed);
  const mass = solid3dMassProperties(placed);

  check("traslación Z: volumen conservado", Math.abs(mass.volume - expectedVolume) < 1, `volumen=${mass.volume}, esperado=${expectedVolume}`);
  check("traslación Z: centroide Z ≈ 750", Math.abs(mass.centroid.z - 750) < 1, `z=${mass.centroid.z}`);
}

// ---------------------------------------------------------------------------
// 2. Giro 90° alrededor de X: la caja se tumba
//    Matriz 3×4: fila X sin cambio, fila Y→Z, fila Z→-Y
//    a=1 b=0 c=0 | e=0
//    d=0 e'=0 f'=1| f=0  (notación del esquema actual: a,b,c,d = 2D; dz = Z)
//    Necesitamos campos nuevos: m02, m10, m11, m12, m20, m21, m22, tx, ty, tz
// ---------------------------------------------------------------------------
{
  clearSolidCache();
  const w = 100;
  const d = 100;
  const h = 100;
  const expectedVolume = w * d * h;

  // Giro 90° alrededor de X: (x,y,z) → (x, -z, y)
  const placed = box("rotX", w, d, h, {
    a: 1, b: 0, c: 0, d: 0, e: 0, f: 0,
    // Nuevos campos 3D: b=0 (row1,col0 from rotation), d=0 (row1,col1)
    // m02=0, m12=-1 (row1,col2), m20=0, m21=1 (row2,col1), m22=0
    m02: 0, m12: -1,
    m20: 0, m21: 1, m22: 0,
    tx: 0, ty: 0, tz: 0,
  });
  solid3dBody(placed);
  const mass = solid3dMassProperties(placed);

  check("giro X 90°: volumen conservado", Math.abs(mass.volume - expectedVolume) < 1, `volumen=${mass.volume}`);
  // Centroide original: (50, 50, 50). Después de (x,-z,y): (50, -50, 50)
  check("giro X 90°: centroide Y ≈ -50", Math.abs(mass.centroid.y - (-50)) < 1, `y=${mass.centroid.y}`);
  check("giro X 90°: centroide Z ≈ 50", Math.abs(mass.centroid.z - 50) < 1, `z=${mass.centroid.z}`);
}

// ---------------------------------------------------------------------------
// 3. Espejo 3D: MIRROR3D por plano XY a z=0 → (x,y,z) → (x,y,-z)
//    Determinante negativo: las caras se invierten y el volumen sigue positivo
// ---------------------------------------------------------------------------
{
  clearSolidCache();
  const w = 200;
  const d = 300;
  const h = 400;
  const expectedVolume = w * d * h;

  const placed = box("mirror", w, d, h, {
    a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
    m02: 0, m12: 0,
    m20: 0, m21: 0, m22: -1,
    tx: 0, ty: 0, tz: 0,
  });
  const mass = solid3dMassProperties(placed);

  check("espejo3D: volumen positivo", mass.volume > 0, `volumen=${mass.volume}`);
  check("espejo3D: volumen conservado", Math.abs(mass.volume - expectedVolume) < 1, `volumen=${mass.volume}`);
  // Centroide original: (100,150,200). Después de (x,y,-z): (100,150,-200)
  check("espejo3D: centroide Z ≈ -200", Math.abs(mass.centroid.z - (-200)) < 1, `z=${mass.centroid.z}`);
}

// ---------------------------------------------------------------------------
// 4. Compatibilidad hacia atrás: la colocación vieja (2×3 + dz) funciona
// ---------------------------------------------------------------------------
{
  clearSolidCache();
  const placed = box("legacy", 500, 400, 300, {
    a: 1, b: 0, c: 0, d: 1, e: 100, f: 200,
    dz: 50,
  });
  const mass = solid3dMassProperties(placed);
  const expectedVolume = 500 * 400 * 300;

  check("legacy: volumen conservado", Math.abs(mass.volume - expectedVolume) < 1, `volumen=${mass.volume}`);
  check("legacy: centroide X desplazado", Math.abs(mass.centroid.x - 350) < 1, `x=${mass.centroid.x}`);
  check("legacy: centroide Y desplazado", Math.abs(mass.centroid.y - 400) < 1, `y=${mass.centroid.y}`);
  check("legacy: centroide Z desplazado", Math.abs(mass.centroid.z - 200) < 1, `z=${mass.centroid.z}`);
}

// ---------------------------------------------------------------------------
// 5. Round-trip: la colocación3D sobrevive a la serialización
//    (Sólo si los campos nuevos están en el esquema de serialización)
// ---------------------------------------------------------------------------
{
  clearSolidCache();
  const original = box("rt", 100, 100, 100, {
    a: 1, b: 0, c: 0, d: 0, e: 0, f: 0,
    m02: 0, m12: -1,
    m20: 0, m21: 1, m22: 0,
    tx: 0, ty: 0, tz: 0,
  });

  const doc = {
    meta: {
      version: 1,
      schema: 9 as const,
      unit: "mm" as const,
    },
    entities: [original],
    layers: [{ id: "0", name: "0", color: 7, visible: true, locked: false }],
    modelSpace: { entityIds: [original.id] },
    paperSpaces: [],
    styles: {},
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
    history: [],
  } as unknown as Parameters<typeof serializeCadDocument>[0];

  const json = serializeCadDocument(doc);
  const parsed = parseCadDocument(json);
  const reloaded = parsed.entities[0] as CadSolid3dEntity;
  const p = reloaded.placement;
  check("round-trip3D: placement existe", !!p, "sin placement");
  if (p) {
    const pp = p as unknown as Record<string, unknown>;
    check("round-trip3D: m12 conservado", pp.m12 === -1, `m12=${pp.m12}`);
    check("round-trip3D: m21 conservado", pp.m21 === 1, `m21=${pp.m21}`);

    clearSolidCache();
    const mass = solid3dMassProperties(reloaded);
    check("round-trip3D: volumen conservado tras reload", Math.abs(mass.volume - 100 * 100 * 100) < 1, `volumen=${mass.volume}`);
  }
}

// ---------------------------------------------------------------------------
// 6. 3DROTATE: giro de 90° alrededor de Z por el centro de la caja
//    Sólo campos3D: la afín2D queda en identidad.
// ---------------------------------------------------------------------------
{
  clearSolidCache();
  const s = 200;
  // Caja sin colocación2D: perfil de 0..200 × 0..200, altura200
  const placed = box("rotZ", s, s, s);
  solid3dMassProperties(placed);
  const expectedVolume = s * s * s;

  // Giro90° alrededor de Z por el centro de la caja (100,100,100):
  // Rodrigues u=(0,0,1), angle=π/2:   r00=0, r01=-1, r10=1, r11=0
  // Centro (100,100,100): tx = 100-(0*100+(-1)*100+0*100) = 200
  //                       ty = 100-(1*100+0*100+0*100) = 0
  //                       tz = 100-(0+0+1*100) = 0
  const cx = 100, cy = 100, cz = 100;
  const placedRotated = box("rotZr", s, s, s, {
    a: 0, b: 1, c: -1, d: 0, e: 0, f: 0, dz: 0,
    m02: 0, m12: 0,
    m20: 0, m21: 0, m22: 1,
    tx: cx - (0 * cx + (-1) * cy + 0 * cz),
    ty: cy - (1 * cx + 0 * cy + 0 * cz),
    tz: cz - (0 * cx + 0 * cy + 1 * cz),
  });
  const massAfter = solid3dMassProperties(placedRotated);

  check("3DROTATE Z 90°: volumen conservado", Math.abs(massAfter.volume - expectedVolume) < 1, `volumen=${massAfter.volume}`);
  // Centroide original: (100,100,100). Después de giro90° Z alrededor de (100,100,100):
  // el centro está en el eje de giro → no se mueve.
  check("3DROTATE Z 90°: centroide X ≈ 100", Math.abs(massAfter.centroid.x - 100) < 1, `x=${massAfter.centroid.x}`);
  check("3DROTATE Z 90°: centroide Y ≈ 100", Math.abs(massAfter.centroid.y - 100) < 1, `y=${massAfter.centroid.y}`);
  check("3DROTATE Z 90°: centroide Z ≈ 100", Math.abs(massAfter.centroid.z - 100) < 1, `z=${massAfter.centroid.z}`);
}

report("transform-3d");
