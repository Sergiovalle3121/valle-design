/**
 * Presentaciones y ventanas gráficas: las operaciones puras.
 *
 * Las anclas absolutas de este archivo son milímetros de papel y escalas
 * concretas. Una prueba que sólo comprobase «la ventana existe» pasaría con una
 * ventana de tamaño cero colocada fuera de la hoja.
 */
import { strict as assert } from "node:assert";
import type { CadPaperSpace } from "../cad-document";
import { cadPrintableBounds } from "../cad-layout-manager";
import {
  CAD_LAYOUT_TEMPLATES,
  cadLayoutId,
  canDeleteCadLayout,
  copyCadLayout,
  createCadLayout,
  findCadLayout,
  renameCadLayout,
  uniqueCadLayoutName,
} from "./layout-operations";
import {
  CAD_VIEWPORT_CLIP_METADATA,
  CAD_VIEWPORT_ON_KEY,
  activeCadViewports,
  cadBoundaryFromEntity,
  cadLayerVisibleInViewport,
  cadViewportId,
  cadViewportIsOn,
  createCadPolygonalViewport,
  createCadRectangularViewport,
  freezeCadLayerInViewport,
  nearestCadViewportScale,
  setCadViewportLocked,
  setCadViewportOn,
  setCadViewportScale,
  tileCadViewportBounds,
} from "./viewport-operations";

const MODEL = { x: 0, y: 0, width: 20_000, height: 12_000 };
const METADATA = {
  project: "Nave",
  drawingNumber: "A-0001",
  title: "Planta",
  sheetNumber: "S-001",
  revision: "P01",
  discipline: "Arquitectura",
};

// --- crear con plantilla -----------------------------------------------------
{
  const a1 = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    templateId: "a1-landscape",
    modelBounds: MODEL,
    unit: "mm",
    metadata: METADATA,
  });
  // A1 apaisado son 841 × 594 mm exactos.
  assert.equal(a1.page.width, 841);
  assert.equal(a1.page.height, 594);
  assert.equal(a1.page.orientation, "landscape");
  assert.equal(a1.pageSetup?.paper, "A1");
  // Margen ISO 5457: 20 mm de archivado a la izquierda.
  assert.deepEqual(a1.pageSetup?.margins, { top: 10, right: 10, bottom: 10, left: 20 });
  assert.equal(a1.viewports?.length, 1, "una hoja nace con su ventana");
  // Y la ventana nace DONDE esos márgenes la ponen: la plantilla entra por la
  // misma puerta que PAGESETUP y la ventana queda recolocada. Nacer en x=10
  // —dentro del margen de archivado, por donde se perfora el plano— era el
  // defecto: la hoja declaraba 20 mm y la ventana usaba 10.
  assert.deepEqual(a1.viewports![0].paperBounds, { x: 20, y: 10, width: 811, height: 544 });
  assert.deepEqual(
    a1.viewports![0].paperBounds,
    cadPrintableBounds(a1),
    "la ventana llena exactamente el área imprimible de la hoja definitiva",
  );

  // La escala automática se ajusta contra la ventana RECOLOCADA. En A3 apaisado
  // la ventana definitiva mide 390 mm y el modelo a 1:50 mediría 400: encajaba
  // sólo porque la ventana vieja invadía el margen. La escala honesta es 1:75.
  const a3 = createCadLayout([], {
    id: "layout:corte",
    name: "Corte",
    templateId: "a3-landscape",
    modelBounds: MODEL,
    unit: "mm",
    metadata: METADATA,
  });
  assert.deepEqual(a3.viewports![0].paperBounds, { x: 20, y: 10, width: 390, height: 247 });
  assert.equal(a3.viewports![0].scale, 75, "la escala se ajusta a la ventana definitiva");
  // Una escala pedida explícitamente es contrato y NO se reajusta.
  const fija = createCadLayout([], {
    id: "layout:corte-50",
    name: "Corte 1:50",
    templateId: "a3-landscape",
    modelBounds: MODEL,
    unit: "mm",
    scale: 50,
    metadata: METADATA,
  });
  assert.equal(fija.viewports![0].scale, 50);

  const a4 = createCadLayout([a1], {
    id: "layout:detalle",
    name: "Detalle",
    templateId: "a4-portrait",
    modelBounds: MODEL,
    metadata: METADATA,
  });
  assert.equal(a4.page.width, 210);
  assert.equal(a4.page.height, 297);
  assert.equal(a4.order, 1);

  assert.equal(CAD_LAYOUT_TEMPLATES.length, 6);
}

// --- nombres únicos e ids deterministas --------------------------------------
{
  const spaces = [
    { id: "a", name: "Planta" } as CadPaperSpace,
    { id: "b", name: "Planta (2)" } as CadPaperSpace,
  ];
  assert.equal(uniqueCadLayoutName(spaces, "Planta"), "Planta (3)");
  // La colisión se detecta sin distinguir mayúsculas, pero el nombre conserva
  // la caja que tecleó el usuario: renombrar no debe corregirle la ortografía.
  assert.equal(uniqueCadLayoutName(spaces, "planta"), "planta (3)");
  assert.equal(uniqueCadLayoutName(spaces, "Alzado"), "Alzado");
  // Renombrar a lo que ya tiene no debe sufijarse a sí mismo.
  assert.equal(uniqueCadLayoutName(spaces, "Planta", "a"), "Planta");

  assert.equal(cadLayoutId([], "Planta baja"), "layout:planta-baja");
  assert.equal(cadLayoutId([], "Sección A-A'"), "layout:seccion-a-a");
  assert.equal(
    cadLayoutId([{ id: "layout:planta-baja" } as CadPaperSpace], "Planta baja"),
    "layout:planta-baja-2",
  );
}

// --- copiar renueva los ids de las ventanas ----------------------------------
{
  const source = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    templateId: "a1-landscape",
    modelBounds: MODEL,
    metadata: METADATA,
  });
  const withFreeze = freezeCadLayerInViewport(source, source.viewports![0].id, ["MEP"], true);
  const copy = copyCadLayout([withFreeze], withFreeze.id, "layout:planta-2");
  assert.ok(copy);
  assert.equal(copy.name, "Planta (copia)");
  assert.notEqual(copy.viewports![0].id, withFreeze.viewports![0].id);
  assert.equal(copy.viewports![0].id, "layout:planta-2:viewport:1");
  assert.equal(
    copy.viewports![0].layerVisibility?.MEP,
    false,
    "la copia hereda el congelado por ventana",
  );
  assert.deepEqual(copy.entityIds, [], "la copia no duplica entidades del documento");

  assert.equal(copyCadLayout([], "nope", "x"), null);
}

// --- renombrar, borrar, buscar -----------------------------------------------
{
  const one = { id: "a", name: "Planta", order: 0 } as CadPaperSpace;
  const two = { id: "b", name: "Alzado", order: 1 } as CadPaperSpace;
  assert.equal(renameCadLayout([one, two], "a", " Sección ")?.name, "Sección");
  assert.equal(renameCadLayout([one, two], "a", "Alzado")?.name, "Alzado (2)");
  assert.equal(renameCadLayout([one, two], "a", "   "), null);

  assert.equal(canDeleteCadLayout([one, two], "a"), null);
  assert.equal(canDeleteCadLayout([one], "a")?.code, "last_layout");
  assert.equal(canDeleteCadLayout([one, two], "zzz")?.code, "layout_not_found");

  assert.equal(findCadLayout([one, two], "alzado")?.id, "b");
  assert.equal(findCadLayout([one, two], "b")?.id, "b");
  assert.equal(findCadLayout([one, two], "  "), undefined);
}

// --- ventana rectangular: la escala sube, nunca baja -------------------------
{
  const space = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    templateId: "a1-landscape",
    modelBounds: MODEL,
    metadata: METADATA,
  });
  // Un modelo de 20.000 × 12.000 en una ventana de 400 × 200 mm necesita al
  // menos 20.000/400 = 50 y 12.000/200 = 60. Manda 60, y la normalizada
  // siguiente es 75.
  assert.equal(nearestCadViewportScale(60), 75);
  const viewport = createCadRectangularViewport({
    space,
    id: cadViewportId(space),
    paperBounds: { x: 30, y: 30, width: 400, height: 200 },
    modelBounds: MODEL,
  });
  assert.equal(viewport.scale, 75);
  assert.equal(viewport.annotationScale, 75, "la escala de anotación acompaña por defecto");
  assert.equal(viewport.locked, false);
  assert.equal(viewport.id, "layout:planta:viewport:2");
  assert.deepEqual(viewport.paperBounds, { x: 30, y: 30, width: 400, height: 200 });

  // Fuera de la zona imprimible, la ventana se mete dentro en vez de salirse.
  const printable = cadPrintableBounds(space);
  const clamped = createCadRectangularViewport({
    space,
    id: "vp:clamped",
    paperBounds: { x: -500, y: -500, width: 9_999, height: 9_999 },
    modelBounds: MODEL,
  });
  assert.equal(clamped.paperBounds.x, printable.x);
  assert.equal(clamped.paperBounds.width, printable.width);
  assert.ok(
    clamped.paperBounds.x + clamped.paperBounds.width <= printable.x + printable.width + 1e-9,
  );
}

// --- escala bloqueable -------------------------------------------------------
{
  let space = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    templateId: "a1-landscape",
    modelBounds: MODEL,
    metadata: METADATA,
  });
  const viewportId = space.viewports![0].id;

  space = setCadViewportScale(space, viewportId, { denominator: 50, lock: true });
  assert.equal(space.viewports![0].scale, 50);
  assert.equal(space.viewports![0].annotationScale, 50);
  assert.equal(space.viewports![0].locked, true, "fijar la escala bloquea la ventana");

  space = setCadViewportScale(space, viewportId, {
    denominator: 100,
    matchAnnotationScale: false,
  });
  assert.equal(space.viewports![0].scale, 100);
  assert.equal(space.viewports![0].annotationScale, 50, "se puede desacoplar a propósito");
  assert.equal(space.viewports![0].locked, true, "y sigue bloqueada");

  space = setCadViewportLocked(space, viewportId, false);
  assert.equal(space.viewports![0].locked, false);

  const untouched = setCadViewportScale(space, viewportId, { denominator: 0 });
  assert.equal(untouched.viewports![0].scale, 100, "una escala no positiva no se aplica");
}

// --- ANCLA: capa congelada en una ventana, visible en la otra ----------------
{
  let space = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    templateId: "a1-landscape",
    modelBounds: MODEL,
    metadata: METADATA,
  });
  const general = space.viewports![0].id;
  const detail = createCadRectangularViewport({
    space,
    id: cadViewportId(space),
    paperBounds: { x: 500, y: 40, width: 250, height: 200 },
    modelBounds: { x: 0, y: 0, width: 5_000, height: 4_000 },
  });
  space = { ...space, viewports: [...space.viewports!, detail] };

  space = setCadViewportScale(space, general, { denominator: 50, lock: true });
  space = freezeCadLayerInViewport(space, general, ["MEP"], true);

  const document = {
    layers: [
      { id: "MEP", name: "MEP", color: "#f00", visible: true, locked: false },
      { id: "0", name: "0", color: "#fff", visible: true, locked: false },
    ],
  } as never as Parameters<typeof cadLayerVisibleInViewport>[0];

  const [generalVp, detailVp] = space.viewports!;
  assert.equal(generalVp.scale, 50, "la ventana a 1:50");
  assert.equal(
    cadLayerVisibleInViewport(document, generalVp, "MEP"),
    false,
    "MEP está congelada en la ventana a 1:50",
  );
  assert.equal(
    cadLayerVisibleInViewport(document, detailVp, "MEP"),
    true,
    "y se ve en la otra ventana de la MISMA hoja",
  );
  assert.equal(cadLayerVisibleInViewport(document, generalVp, "0"), true);

  // Descongelar BORRA la anulación en vez de forzar visible.
  space = freezeCadLayerInViewport(space, general, ["MEP"], false);
  assert.equal(space.viewports![0].layerVisibility, undefined);

  // `"*"` está reservado: no se puede congelar como si fuera una capa.
  const guarded = freezeCadLayerInViewport(space, general, [CAD_VIEWPORT_ON_KEY], true);
  assert.equal(guarded.viewports![0].layerVisibility, undefined);
}

// --- ventana apagada ---------------------------------------------------------
{
  let space = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    templateId: "a3-landscape",
    modelBounds: MODEL,
    metadata: METADATA,
  });
  const viewportId = space.viewports![0].id;
  assert.equal(cadViewportIsOn(space.viewports![0]), true);
  assert.equal(activeCadViewports(space).length, 1);

  space = setCadViewportOn(space, viewportId, false);
  assert.equal(cadViewportIsOn(space.viewports![0]), false);
  assert.equal(activeCadViewports(space).length, 0, "una ventana apagada no se dibuja");
  // Y conserva su encuadre: apagar no es borrar.
  assert.ok(space.viewports![0].scale > 0);

  space = setCadViewportOn(space, viewportId, true);
  assert.equal(cadViewportIsOn(space.viewports![0]), true);
  assert.equal(
    space.viewports![0].layerVisibility,
    undefined,
    "encender borra la clave en vez de escribir true",
  );
}

// --- ventana poligonal y desde objeto ----------------------------------------
{
  const space = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    templateId: "a3-landscape",
    modelBounds: MODEL,
    metadata: METADATA,
  });
  const boundary = [
    { x: 20, y: 20 },
    { x: 160, y: 20 },
    { x: 160, y: 90 },
    { x: 90, y: 130 },
    { x: 20, y: 90 },
  ];
  const polygonal = createCadPolygonalViewport({
    space,
    id: "vp:poly",
    clipEntityId: "clip-1",
    boundary,
    modelBounds: MODEL,
    layer: "0",
  });
  assert.ok(polygonal);
  // El rectángulo envolvente del contorno: 20..160 × 20..130.
  assert.deepEqual(polygonal.viewport.paperBounds, { x: 20, y: 20, width: 140, height: 110 });
  assert.equal(polygonal.clip.type, "polyline");
  assert.equal(
    polygonal.clip.context?.metadata?.[CAD_VIEWPORT_CLIP_METADATA],
    "vp:poly",
    "el contorno queda atado a su ventana",
  );
  // Las dos escrituras van en el MISMO lote: contorno y hoja, un paso de deshacer.
  assert.equal(polygonal.commands.length, 2);
  assert.equal(polygonal.commands[0].type, "insert");
  assert.equal(polygonal.commands[1].type, "paper-space");

  assert.equal(
    createCadPolygonalViewport({
      space,
      id: "vp:bad",
      clipEntityId: "clip-2",
      boundary: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      modelBounds: MODEL,
      layer: "0",
    }),
    null,
  );

  const circle = {
    id: "c1",
    type: "circle" as const,
    center: { x: 100, y: 100, z: 0 },
    radius: 40,
    layer: "0",
  };
  const tessellated = cadBoundaryFromEntity(circle);
  assert.equal(tessellated?.length, 64);
  assert.ok(Math.abs(tessellated![0].x - 140) < 1e-9);
  assert.equal(cadBoundaryFromEntity({ ...circle, type: "point" } as never), null);
}

// --- reparto en rejilla ------------------------------------------------------
{
  const space = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    templateId: "a3-landscape",
    modelBounds: MODEL,
    metadata: METADATA,
  });
  const printable = cadPrintableBounds(space);
  const tiles = tileCadViewportBounds(space, 4, 4);
  assert.equal(tiles.length, 4);
  // 2 × 2 con 4 mm de separación: cada celda es (ancho − 4)/2.
  assert.ok(Math.abs(tiles[0].width - (printable.width - 4) / 2) < 1e-9);
  assert.ok(Math.abs(tiles[3].x - (printable.x + tiles[0].width + 4)) < 1e-9);
  assert.ok(Math.abs(tiles[3].y - (printable.y + tiles[0].height + 4)) < 1e-9);
  assert.equal(tileCadViewportBounds(space, 1).length, 1);
}

console.log("cad layout operations specs passed");
