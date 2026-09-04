/**
 * PRESSPULL sobre cara: que el empujón LLEGUE al documento y sea reeditable.
 *
 * Lo que este spec vigila no es que la aritmética del kernel funcione —eso ya
 * lo prueban `pick3d/face-push.spec.ts` y sus 46 aserciones—, sino lo que sólo
 * se puede romper aquí: que la orden acepte la cara, que el nodo entre al árbol
 * con su huella, que el sólido viejo se borre y el nuevo se inserte en un solo
 * lote, y que un empujón imposible se NIEGUE diciendo por qué en vez de escribir
 * un cuerpo inválido.
 */
import { strict as assert } from "node:assert";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { planarBodyVolume } from "../../../brep";
import { cadFaceRefFromBody } from "../../pick3d/solid-face-ref";
import { solid3dBody, clearSolidCache } from "../../solid3d-build";
import { makeSolidEntity } from "./solids-support";
import { withPushedFace } from "./solids-push-face";
import type { CadSolid3dEntity, CadSolidNode } from "../../cad-entities-v5";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

/**
 * El índice de la cara que mira hacia arriba.
 *
 * Se pregunta por la HUELLA y no por una lista de normales del cuerpo: la
 * huella ya trae el plano canónico de la cara, y es además lo mismo que el
 * comando usará para reencontrarla después de reconstruir.
 */
function caraDeArriba(cuerpo: { faces: readonly unknown[] }): number {
  for (let cara = 0; cara < cuerpo.faces.length; cara += 1) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ref = cadFaceRefFromBody(cuerpo as any, cara);
    if (ref.plane.nz > 0.9) return cara;
  }
  return -1;
}

const LAYER = "MUROS";
let contador = 0;

/** Una caja de 100×100×50 como sólido del documento. */
function caja(id: string): CadSolid3dEntity {
  const node: CadSolidNode = {
    id: "base",
    op: "box",
    min: { x: 0, y: 0, z: 0 },
    max: { x: 100, y: 100, z: 50 },
  };
  return makeSolidEntity(id, [node], "base", LAYER);
}

function contexto(entidades: CadSolid3dEntity[]): CadCommandContext {
  return {
    entityIds: entidades.map((e) => e.id),
    entity: (id: string) => entidades.find((e) => e.id === id),
    selection: [],
    activeLayer: LAYER,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `nueva-${++contador}`,
  } as unknown as CadCommandContext;
}

function correr(
  entradas: CadCommandInput[],
  contexto_: CadCommandContext,
): CadCommandResult | undefined {
  const orden = CAD_COMMAND_REGISTRY_V2.all().find((c) => c.name === "PRESSPULL");
  assert.ok(orden, "PRESSPULL sigue registrado en el motor");
  let paso = orden.begin(contexto_);
  for (const entrada of entradas) {
    paso = orden.step(paso.state, entrada, contexto_);
    if (paso.result) return paso.result;
  }
  return paso.result;
}

clearSolidCache();

// --- 1. la cara de arriba, empujada, sube el volumen -------------------------
{
  const solido = caja("s1");
  const cuerpo = solid3dBody(solido);
  const arriba = caraDeArriba(cuerpo);
  assert.ok(arriba >= 0, "la caja tiene una cara mirando hacia arriba");
  const huella = cadFaceRefFromBody(cuerpo, arriba);

  const resultado = correr(
    [
      { kind: "facePick", entityId: "s1", face: huella, point: { x: 50, y: 50, z: 50 }, normal: { x: 0, y: 0, z: 1 } },
      { kind: "distance", value: 25 },
    ],
    contexto([solido]),
  );

  assert.ok(resultado, "PRESSPULL terminó");
  assert.equal(resultado.kind, "document", "y escribió en el documento");
  if (resultado.kind !== "document") throw new Error("tipo");

  // Un solo lote: se borra el sólido viejo y se inserta el nuevo. Si fueran dos
  // lotes, un Ctrl+Z dejaría el documento sin sólido ninguno.
  const borrados = resultado.commands.filter((c) => c.type === "delete");
  const insertados = resultado.commands.filter((c) => c.type === "insert");
  assert.equal(borrados.length, 1, "se borra exactamente el sólido de origen");
  assert.equal(insertados.length, 1, "y se inserta exactamente uno nuevo");

  const nuevo = (insertados[0] as { entity: CadSolid3dEntity }).entity;
  const empuje = nuevo.nodes.find((n) => n.op === "push");
  assert.ok(empuje, "el árbol gana un nodo `push`, no una malla horneada");
  assert.equal(nuevo.root, empuje.id, "y ese nodo es la nueva raíz");

  const volumenAntes = 100 * 100 * 50;
  const despues = planarBodyVolume(solid3dBody(nuevo));
  assert.ok(
    Math.abs(despues - (volumenAntes + 100 * 100 * 25)) < 1,
    `empujar 25 sobre 100×100 añade 250 000; dio ${despues - volumenAntes}`,
  );
}

// --- 2. el empujón es REEDITABLE, que es la ventaja sobre SketchUp -----------
{
  const solido = caja("s2");
  const cuerpo = solid3dBody(solido);
  const arriba = caraDeArriba(cuerpo);
  const huella = cadFaceRefFromBody(cuerpo, arriba);

  const empujado = withPushedFace(solido, huella, 25);
  assert.ok(Math.abs(planarBodyVolume(solid3dBody(empujado)) - 750_000) < 1, "empujar 25 da 750 000");

  // Cambiar la distancia del nodo —lo que el panel de propiedades hará— y
  // reconstruir. En SketchUp esto exige deshacer y volver a empujar.
  const reeditado: CadSolid3dEntity = {
    ...empujado,
    nodes: empujado.nodes.map((n) => (n.op === "push" ? { ...n, distance: 100 } : n)),
  };
  clearSolidCache();
  assert.ok(
    Math.abs(planarBodyVolume(solid3dBody(reeditado)) - 100 * 100 * 150) < 1,
    "cambiar el 25 por 100 reconstruye a 1 500 000 sin deshacer nada",
  );
}

// --- 3. los empujones se ENCADENAN y se numeran de forma estable -------------
{
  clearSolidCache();
  const solido = caja("s3");
  const cuerpo = solid3dBody(solido);
  const arriba = caraDeArriba(cuerpo);
  const uno = withPushedFace(solido, cadFaceRefFromBody(cuerpo, arriba), 10);

  const cuerpo2 = solid3dBody(uno);
  const arriba2 = caraDeArriba(cuerpo2);
  const dos = withPushedFace(uno, cadFaceRefFromBody(cuerpo2, arriba2), 10);

  const nombres = dos.nodes.filter((n) => n.op === "push").map((n) => n.id);
  assert.deepEqual(nombres, ["empuje1", "empuje2"], "los empujones se numeran por orden, no con un contador global");
  assert.ok(Math.abs(planarBodyVolume(solid3dBody(dos)) - 100 * 100 * 70) < 1, "dos empujones de 10 suben 20");
}

// --- 4. un empujón de cero LO DICE, no escribe nada -------------------------
{
  clearSolidCache();
  const solido = caja("s4");
  const cuerpo = solid3dBody(solido);
  const arriba = caraDeArriba(cuerpo);
  const huella = cadFaceRefFromBody(cuerpo, arriba);

  const resultado = correr(
    [
      { kind: "facePick", entityId: "s4", face: huella, point: { x: 50, y: 50, z: 50 }, normal: { x: 0, y: 0, z: 1 } },
      { kind: "distance", value: 0 },
    ],
    contexto([solido]),
  );
  assert.equal(resultado?.kind, "message", "un empujón de cero no toca el documento");
  if (resultado?.kind === "message")
    assert.match(resultado.text, /cero/, "y dice por qué, en vez de fingir que hizo algo");
}

// --- 5. si la cara ya no pertenece a un sólido, se niega nombrándolo --------
{
  clearSolidCache();
  const solido = caja("s5");
  const cuerpo = solid3dBody(solido);
  const huella = cadFaceRefFromBody(cuerpo, 0);
  const resultado = correr(
    [
      { kind: "facePick", entityId: "fantasma", face: huella, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } },
      { kind: "distance", value: 10 },
    ],
    contexto([solido]),
  );
  assert.equal(resultado?.kind, "message", "no se escribe nada");
  if (resultado?.kind === "message")
    assert.match(resultado.text, /sólido/, "y el mensaje nombra el problema");
}

console.log("✔ PRESSPULL sobre cara: 20 aserciones verdes");
