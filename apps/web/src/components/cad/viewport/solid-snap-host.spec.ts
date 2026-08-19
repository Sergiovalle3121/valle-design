/**
 * El enganche 3D, ENCHUFADO: del documento a la cámara y de vuelta.
 *
 * `view/solid-snap.spec.ts` prueba el motor puro con un proyector cualquiera.
 * Esto prueba el tramo que convierte ese motor en una funcionalidad: que el
 * anfitrión que el visor ya usa para dibujar sólidos indexa los MISMOS sólidos,
 * que reproyecta cuando la cámara se mueve y no cuando no, y que un montaje sin
 * cámara lo dice en vez de responder cualquier cosa.
 *
 * Es la regla de la casa: un módulo que nadie importa no cuenta como
 * implementado. Aquí se comprueba el importador.
 */
import assert from "node:assert/strict";
import type { CadDocument, CadEntity } from "@/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "@/lib/cad/cad-document";
import type { CadSolid3dEntity } from "@/lib/cad/cad-entities-v5";
import { CadViewController } from "@/lib/cad/view/view-controller";
import { CadSolidShadeHost } from "./solid-shade-host";

const layer = { id: "0", name: "0", color: "#94a3b8", visible: true, locked: false };
const viewport = { scale: 0.01, width: 1_000, height: 800, elevation: 0.11 };
const none: ReadonlySet<string> = new Set();
const APERTURE_PX = 12;

/** Prisma 400..600 × 350..450, de 0 a 50 de alto. */
function block(id: string, top: number): CadSolid3dEntity {
  return {
    id,
    type: "solid3d",
    root: `${id}-caja`,
    nodes: [
      {
        id: `${id}-caja`,
        op: "box",
        min: { x: 400, y: 350, z: 0 },
        max: { x: 600, y: 450, z: top },
      },
    ],
    layer: "0",
  };
}

function documentWith(entities: readonly CadEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [layer],
    entities: [...entities],
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as CadDocument;
}

function controllerLookingAtSolid(): CadViewController {
  const controller = new CadViewController({ scale: 0.01, width: 1_000, height: 800 }, 1_200, 900);
  controller.setMode("3d");
  controller.perspective.position.set(0, 0, 12);
  controller.applyStandardView("se-iso");
  return controller;
}

// ---------------------------------------------------------------------------
// 1. El anfitrión del visor engancha a los sólidos que dibuja
// ---------------------------------------------------------------------------
{
  const controller = controllerLookingAtSolid();
  const host = new CadSolidShadeHost(
    () => viewport,
    () => controller,
  );
  host.sync(documentWith([block("caja", 50)]), none);
  assert.equal(host.count, 1, "el visor dibuja el sólido");
  assert.equal(host.snapDisabledReason, null, "y el enganche 3D está disponible");
  assert.equal(host.snapIndexedEdges, 12, "las doce aristas del prisma están indexadas");

  // El vértice superior: el que hoy es inalcanzable desde el plano del suelo.
  const vertex = { x: 600, y: 350, z: 50 };
  const project = controller.createDrawingProjector();
  const screen = project(vertex);
  assert.ok(screen, "el vértice se proyecta");

  const hit = host.snap3d(screen.x + 3, screen.y - 2, { aperturePx: APERTURE_PX });
  assert.ok(hit, "hay enganche bajo el píxel del vértice");
  assert.equal(hit.type, "endpoint");
  assert.equal(hit.entityId, "caja");
  const errorMm = Math.hypot(
    hit.point.x - vertex.x,
    hit.point.y - vertex.y,
    hit.point.z - vertex.z,
  );
  assert.equal(errorMm, 0, "el enganche devuelve el vértice EXACTO, error 0 mm");
  assert.equal(hit.point.z, 50, "con su cota, que es lo que el motor plano pierde");

  // Lejos del sólido no engancha, en vez de devolver lo más cercano.
  assert.equal(host.snap3d(4, 4, { aperturePx: APERTURE_PX }), null);
  host.dispose();
}

// ---------------------------------------------------------------------------
// 2. Reproyecta cuando la cámara se mueve, y sólo entonces
// ---------------------------------------------------------------------------
{
  const controller = controllerLookingAtSolid();
  const host = new CadSolidShadeHost(
    () => viewport,
    () => controller,
  );
  host.sync(documentWith([block("caja", 50)]), none);

  const vertex = { x: 600, y: 350, z: 50 };
  const before = controller.createDrawingProjector()(vertex);
  assert.ok(before);
  assert.ok(host.snap3d(before.x, before.y, { aperturePx: APERTURE_PX }), "engancha antes de orbitar");

  // Se orbita 40°: el mismo píxel ya NO tiene el vértice debajo, y el píxel
  // nuevo sí. Si el índice no reproyectara, pasaría exactamente lo contrario, y
  // ése es el fallo que este par de aserciones caza.
  const revisionBefore = controller.revision;
  controller.orbitPerspective(40, 10);
  assert.ok(controller.revision > revisionBefore, "orbitar cuenta como cambio de vista");

  const after = controller.createDrawingProjector()(vertex);
  assert.ok(after);
  assert.ok(
    Math.hypot(after.x - before.x, after.y - before.y) > APERTURE_PX * 2,
    "el vértice se ha movido bastante más que la apertura",
  );
  const moved = host.snap3d(after.x, after.y, { aperturePx: APERTURE_PX });
  assert.ok(moved, "engancha en el píxel NUEVO");
  assert.equal(
    Math.hypot(moved.point.x - vertex.x, moved.point.y - vertex.y, moved.point.z - vertex.z),
    0,
    "y sigue devolviendo el vértice exacto",
  );
  host.dispose();
}

// ---------------------------------------------------------------------------
// 3. Sin cámara no hay enganche 3D, y se sabe
// ---------------------------------------------------------------------------
{
  const host = new CadSolidShadeHost(() => viewport);
  host.sync(documentWith([block("caja", 50)]), none);
  assert.equal(host.count, 1, "el visor sigue dibujando");
  assert.equal(
    host.snap3d(600, 450, { aperturePx: APERTURE_PX }),
    null,
    "pero sin puente de vista no engancha, en vez de responder cualquier cosa",
  );
  assert.equal(host.snapIndexedEdges, 0, "y no gasta memoria indexando");
  host.dispose();
}

// ---------------------------------------------------------------------------
// 4. El índice sigue al documento
// ---------------------------------------------------------------------------
{
  const controller = controllerLookingAtSolid();
  const host = new CadSolidShadeHost(
    () => viewport,
    () => controller,
  );
  host.sync(documentWith([block("caja", 50)]), none);
  assert.equal(host.snapIndexedEdges, 12);

  host.sync(documentWith([block("caja", 50), block("otra", 90)]), none);
  assert.equal(host.snapIndexedEdges, 24, "dos prismas son veinticuatro aristas");

  // Y un documento sin sólidos deja de costar nada: un dibujo 2D no paga esta
  // capa. Es la condición de que sea «apagable» de verdad.
  host.sync(documentWith([]), none);
  assert.equal(host.snapIndexedEdges, 0);
  assert.equal(host.snap3d(600, 450, { aperturePx: APERTURE_PX }), null);
  host.dispose();
}

// ---------------------------------------------------------------------------
// 5. Líneas ocultas: sólo en estilo Oculto, y sólo si la vista giró
// ---------------------------------------------------------------------------
{
  const controller = controllerLookingAtSolid();
  const host = new CadSolidShadeHost(
    () => viewport,
    () => controller,
  );
  host.sync(documentWith([block("caja", 50)]), none);

  // En el estilo por defecto (sombreado con aristas) manda el búfer de
  // profundidad: la CPU no toca las aristas por muy fuerte que se orbite.
  assert.equal(host.visualStyle, "shaded-edges");
  controller.orbitPerspective(90, 0);
  assert.equal(
    host.refreshHiddenLines(),
    false,
    "en un estilo sombreado, la eliminación por CPU no se aplica: la GPU lo hace exacto",
  );
  assert.equal(
    host.group.children[0]?.userData.hiddenLineRemoval,
    false,
    "y la malla lo declara",
  );

  // Al pasar a Oculto se recalcula ya, sin esperar a la siguiente órbita.
  host.setStyle("hidden");
  assert.equal(
    host.group.children[0]?.userData.hiddenLineRemoval,
    true,
    "VSCURRENT Oculto quita las aristas que el cuerpo tapa en el acto",
  );

  // El CABLE, que es lo que de verdad importa: nadie llama a
  // `refreshHiddenLines` desde fuera. El anfitrión se suscribió al controlador
  // en su primer `sync`, así que orbitar reconstruye SOLO. Sin esta aserción,
  // la funcionalidad podría existir entera y no dispararse nunca — que es como
  // se rompen las cosas que «están implementadas».
  const beforeSmall = host.group.children[0];
  controller.orbitPerspective(1, 0);
  assert.equal(
    host.group.children[0],
    beforeSmall,
    "un grado no llega al umbral: no se reconstruye nada",
  );
  controller.orbitPerspective(30, 0);
  assert.notEqual(
    host.group.children[0],
    beforeSmall,
    "treinta grados sí, y sin que nadie lo pida a mano",
  );
  assert.equal(host.group.children[0]?.userData.hiddenLineRemoval, true);
  // Y ya reconstruido, pedirlo otra vez no vuelve a costar.
  assert.equal(host.refreshHiddenLines(), false, "la vista no ha vuelto a girar");

  // Volver a un estilo sombreado devuelve el mando a la GPU.
  host.setStyle("shaded-edges");
  assert.equal(host.group.children[0]?.userData.hiddenLineRemoval, false);
  host.dispose();
}

console.log(
  "solid-snap-host.spec: el visor indexa los sólidos que dibuja, reproyecta al orbitar y engancha con error 0 mm",
);
