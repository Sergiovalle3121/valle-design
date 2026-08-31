/**
 * El nodo `push` dentro del árbol: que se evalúe, que sobreviva a una edición
 * del operando, y que sea REEDITABLE — que es la razón de que sea un nodo y no
 * un horneado.
 *
 * La comprobación que justifica la decisión de diseño es la tercera: cambiar el
 * número de un empujón que ya se hizo reconstruye la pieza. Un modelador
 * directo puro no puede hacer eso: allí, si empujaste 30 cm y te equivocaste,
 * deshaces. Aquí se corrige el 30.
 *
 * Y la cuarta es la que protege al usuario: cuando el operando cambia tanto que
 * la cara empujada ya no existe, el árbol **falla con motivo** en vez de
 * empujar otra cara parecida.
 */
import { check, checkClose, report } from "../brep/spec-support";
import { solid3dBody, validateSolidTree } from "./solid3d-build";
import { cadFaceRefFromBody } from "./pick3d/solid-face-ref";
import { makeBox, planarBodyVolume, vec3 } from "../brep";
import type { CadSolid3dEntity, CadSolidNode } from "./cad-entities-v5";

/** Una caja de a×b×c como nodo hoja. */
const boxNode = (
  id: string,
  a: number,
  b: number,
  c: number,
): CadSolidNode => ({
  id,
  op: "box",
  min: { x: 0, y: 0, z: 0 },
  max: { x: a, y: b, z: c },
});

const entity = (nodes: CadSolidNode[], root: string): CadSolid3dEntity => ({
  id: "s1",
  type: "solid3d",
  nodes,
  root,
  layer: "0",
});

/** La cara que mira a +Z a la cota `z`, con su huella lista para persistir. */
function topFaceRef(body: ReturnType<typeof makeBox>, z: number) {
  for (let face = 0; face < body.faces.length; face += 1) {
    const ref = cadFaceRefFromBody(body, face);
    if (ref.plane.nz > 0.9 && Math.abs(ref.centroid.z - z) < 1e-6) return ref;
  }
  throw new Error(`no se encontró la cara superior a z=${z}`);
}

// --- 1 · Un empujón evalúa, y el volumen lo confirma ----------------------
{
  const base = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const face = topFaceRef(base, 10);
  const e = entity(
    [
      boxNode("caja", 10, 10, 10),
      { id: "emp", op: "push", operand: "caja", face, distance: 5 },
    ],
    "emp",
  );
  check(
    "el árbol es válido",
    validateSolidTree(e).length === 0,
    JSON.stringify(validateSolidTree(e)),
  );
  const body = solid3dBody(e);
  checkClose("volumen = 10·10·15", planarBodyVolume(body), 1500, 1e-6);
  check(
    "sigue siendo una caja de 6 caras",
    body.faces.length === 6,
    `${body.faces.length}`,
  );
}

// --- 2 · Dos empujones encadenados ----------------------------------------
{
  const base = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const face1 = topFaceRef(base, 10);
  const once = solid3dBody(
    entity(
      [
        boxNode("caja", 10, 10, 10),
        { id: "e1", op: "push", operand: "caja", face: face1, distance: 5 },
      ],
      "e1",
    ),
  );
  const face2 = topFaceRef(once, 15);
  const e = entity(
    [
      boxNode("caja", 10, 10, 10),
      { id: "e1", op: "push", operand: "caja", face: face1, distance: 5 },
      { id: "e2", op: "push", operand: "e1", face: face2, distance: 5 },
    ],
    "e2",
  );
  checkClose(
    "dos empujones: 10·10·20",
    planarBodyVolume(solid3dBody(e)),
    2000,
    1e-6,
  );
}

// --- 3 · LA PRUEBA QUE JUSTIFICA EL DISEÑO: es reeditable ----------------
{
  const base = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const face = topFaceRef(base, 10);
  const build = (distance: number) =>
    planarBodyVolume(
      solid3dBody(
        entity(
          [
            boxNode("caja", 10, 10, 10),
            { id: "emp", op: "push", operand: "caja", face, distance },
          ],
          "emp",
        ),
      ),
    );
  checkClose("empujar 5 da 1500", build(5), 1500, 1e-6);
  checkClose(
    "cambiar el 5 por un 9 da 1900, sin rehacer nada",
    build(9),
    1900,
    1e-6,
  );
  checkClose("y un valor negativo hunde: 10·10·7", build(-3), 700, 1e-6);
}

// --- 4 · Si el operando cambia y la cara desaparece, FALLA con motivo -----
{
  const base = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const face = topFaceRef(base, 10);
  // La caja pasa a medir 40 de alto: la huella apunta a una cara que ya no
  // está en z=10 y ninguna otra casa con ella.
  const e = entity(
    [
      boxNode("caja", 10, 10, 40),
      { id: "emp", op: "push", operand: "caja", face, distance: 5 },
    ],
    "emp",
  );
  let message = "";
  try {
    solid3dBody(e);
  } catch (error) {
    message = String(error);
  }
  check("el árbol falla en vez de empujar otra cara", message.length > 0);
  check(
    "y el motivo nombra el nodo",
    message.includes("emp"),
    message.slice(0, 160),
  );
  check(
    "y explica que la cara ya no existe",
    /ya no existe/.test(message),
    message.slice(0, 200),
  );
}

// --- 5 · La cara se sigue encontrando aunque el ÍNDICE envejezca ----------
{
  const base = makeBox({ min: vec3(0, 0, 0), max: vec3(10, 10, 10) });
  const face = topFaceRef(base, 10);
  // Índice mentiroso, huella intacta: la autocuración lo resuelve.
  const stale = { ...face, index: (face.index + 3) % 6 };
  const e = entity(
    [
      boxNode("caja", 10, 10, 10),
      { id: "emp", op: "push", operand: "caja", face: stale, distance: 5 },
    ],
    "emp",
  );
  checkClose(
    "con el índice envejecido sigue empujando la cara buena",
    planarBodyVolume(solid3dBody(e)),
    1500,
    1e-6,
  );
}

report("solid3d-push-node", 11);
