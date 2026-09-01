/**
 * `UCS > Cara` designa la cara QUE SE VE, no su sombra en planta.
 *
 * ## Qué cambia y por qué importa
 *
 * Hasta esta ola el paso resolvía la cara con `cadSolidFaceUnderPoint`
 * (`ucs-solid.ts:205`), que lanza el rayo **a lo largo de la Z del mundo** y se
 * declara a sí mismo, con todas sus letras, «una regla de designación, no de
 * geometría exacta». Esa regla tiene dos consecuencias caras:
 *
 *  1. **Una cara VERTICAL es indesignable.** Su proyección en planta es un
 *     segmento, de área nula: por mucho que el usuario la esté mirando de
 *     frente, un rayo vertical no la toca nunca. Y apoyar el SCU en un muro, en
 *     el costado de una pieza o en el canto de una losa es justo lo que se pide
 *     al abrir la opción.
 *  2. **La cara de arriba y la de abajo comparten proyección.** El criterio
 *     desempata por altura, no por lo que el usuario ve, así que mirar un
 *     sólido desde abajo y designar su base daba la tapa. Sin avisar.
 *
 * Ahora el lienzo 3D manda la cara que el rayo de su cámara viva encuentra, con
 * su huella geométrica, y este archivo prueba la diferencia con un caso que la
 * regla vieja NO puede resolver.
 *
 * El camino aproximado no se borra: sigue siendo lo único disponible en el
 * visor 2D, que no tiene cámara con la que lanzar un rayo. Se conserva como
 * respaldo declarado, y aquí se comprueba que sigue funcionando.
 */
import { strict as assert } from "node:assert";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import type { CadEntity } from "../../cad-document";
import type { CadSolid3dEntity } from "../../cad-entities-v5";
import { CAD_UCS_COMMANDS } from "./ucs-commands";
import { solid3dBody } from "../../solid3d-build";
import { cadFaceRefFromBody } from "../../pick3d/solid-face-ref";

const commands = new Map(CAD_UCS_COMMANDS.map((c) => [c.name, c]));

/** Una caja de 10×10×10 apoyada en el origen: seis caras, dos horizontales. */
const CAJA: CadSolid3dEntity = {
  id: "caja",
  type: "solid3d",
  layer: "0",
  nodes: [
    {
      id: "b1",
      op: "box",
      min: { x: 0, y: 0, z: 0 },
      max: { x: 10, y: 10, z: 10 },
    },
  ],
  root: "b1",
};

const ESCENA: CadEntity[] = [
  CAJA as unknown as CadEntity,
  { id: "raya", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer: "0" },
];

function makeContext(): CadCommandContext {
  const entities = new Map(ESCENA.map((entity) => [entity.id, entity]));
  let ids = 0;
  return {
    entityIds: [...entities.keys()],
    entity: (id) => entities.get(id),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `n${++ids}`,
  };
}

/** Corre UCS con una lista de entradas y devuelve el ÚLTIMO paso, no el result:
 *  designar una cara no cierra el comando, abre el paso de aceptación. */
function pasos(inputs: readonly CadCommandInput[]) {
  const descriptor = commands.get("UCS");
  assert.ok(descriptor, "UCS debe existir");
  const context = makeContext();
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step;
}

const keyword = (word: string): CadCommandInput => ({ kind: "keyword", keyword: word });

/**
 * El texto que el usuario ve. Un paso que CONTINÚA lo pone en `prompt.message`;
 * uno que se NIEGA cierra con `result: { kind: "message", text }`. Leer sólo el
 * primero haría que este archivo diera por buenas todas las negativas —pasaría
 * en verde tanto si el comando explica el motivo como si se queda mudo—, que es
 * justo lo contrario de lo que viene a comprobar.
 */
function loQueSeVe(paso: ReturnType<typeof pasos>): string {
  if (paso.result && paso.result.kind === "message") return paso.result.text;
  return paso.prompt.message;
}

const cuerpo = solid3dBody(CAJA);

/** El índice de la cara cuya normal apunta a donde se pida. */
function caraConNormal(nx: number, ny: number, nz: number): number {
  for (let face = 0; face < cuerpo.faces.length; face += 1) {
    const { plane } = cadFaceRefFromBody(cuerpo, face);
    if (
      Math.abs(plane.nx - nx) < 1e-6 &&
      Math.abs(plane.ny - ny) < 1e-6 &&
      Math.abs(plane.nz - nz) < 1e-6
    )
      return face;
  }
  return -1;
}

let ok = 0;
const fallos: string[] = [];
function comprueba(que: string, condicion: boolean) {
  if (condicion) ok += 1;
  else fallos.push(que);
}

// --- 1 · LA CARA VERTICAL, que es la que la regla vieja no alcanza ---------
{
  const lateral = caraConNormal(1, 0, 0);
  comprueba("la caja tiene una cara con normal +X", lateral >= 0);

  const ref = cadFaceRefFromBody(cuerpo, lateral);
  comprueba("esa cara es vertical (nz = 0)", Math.abs(ref.plane.nz) < 1e-6);

  const paso = pasos([
    keyword("Cara"),
    {
      kind: "facePick",
      entityId: "caja",
      face: ref,
      point: { x: 10, y: 5, z: 5 },
      normal: { x: 1, y: 0, z: 0 },
    },
  ]);

  comprueba(
    "designar una cara VERTICAL con el rayo abre el paso de aceptación",
    /cara \d+ de 6/.test(paso.prompt.message),
  );
  comprueba(
    "y el mensaje nombra la cara designada, no otra",
    paso.prompt.message.includes(`cara ${lateral + 1} de 6`),
  );
}

// --- 2 · LA REGLA VIEJA NO PUEDE, y ésa es toda la diferencia ---------------
//
// No se afirma «el rayo es mejor» de palabra: se comprueba que el camino de
// respaldo, con el MISMO punto sobre la cara vertical, resuelve OTRA cara —la
// horizontal que hay encima—, porque proyecta. Si algún día la regla vieja
// aprendiera a designar verticales, esta comprobación fallaría y habría que
// releer el archivo entero, que es exactamente lo que debe pasar.
{
  const lateral = caraConNormal(1, 0, 0);
  const paso = pasos([
    keyword("Cara"),
    { kind: "entityPick", entityId: "caja", point: { x: 10, y: 5 } },
  ]);
  const esperada = `cara ${lateral + 1} de 6`;
  const visto = loQueSeVe(paso);
  comprueba(
    "el respaldo por proyección NO designa la cara vertical",
    !visto.includes(esperada),
  );
  comprueba(
    "y lo DICE en vez de callarse o elegir una cualquiera",
    visto.includes("no hay ninguna cara visible"),
  );
}

// --- 3 · UNA HUELLA QUE NO RESUELVE SE DICE, no se cae a la cara 0 ---------
{
  const ref = cadFaceRefFromBody(cuerpo, caraConNormal(1, 0, 0));
  // Se estropea el plano: ninguna cara del cuerpo casa con esta huella.
  const imposible = { ...ref, index: 99, plane: { ...ref.plane, d: ref.plane.d + 1234 } };
  const paso = pasos([
    keyword("Cara"),
    {
      kind: "facePick",
      entityId: "caja",
      face: imposible,
      point: { x: 10, y: 5, z: 5 },
      normal: { x: 1, y: 0, z: 0 },
    },
  ]);
  const visto = loQueSeVe(paso);
  comprueba(
    "una huella que no casa con ninguna cara se NIEGA nombrando el motivo",
    visto.includes("No pude fijar esa cara"),
  );
  comprueba(
    "y el motivo dice CUÁNTAS caras miró, no un «error» genérico",
    visto.includes("ninguna de las 6 caras"),
  );
  comprueba(
    "y no finge haber designado la cara 0",
    !visto.includes("cara 1 de 6"),
  );
}

// --- 4 · DESIGNAR ALGO QUE NO ES UN SÓLIDO se explica -----------------------
{
  const ref = cadFaceRefFromBody(cuerpo, 0);
  const paso = pasos([
    keyword("Cara"),
    {
      kind: "facePick",
      entityId: "raya",
      face: ref,
      point: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
    },
  ]);
  const visto = loQueSeVe(paso);
  comprueba(
    "designar una línea en vez de un sólido NOMBRA el tipo designado",
    visto.includes('"line"') && visto.includes("no un sólido"),
  );
  comprueba(
    "y ofrece la salida: la opción Objeto",
    visto.includes("Objeto"),
  );
}

if (fallos.length > 0) {
  console.error(`ucs-face-pick: ${fallos.length} fallo(s)`);
  for (const f of fallos) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`ucs-face-pick OK — ${ok} aserciones`);
