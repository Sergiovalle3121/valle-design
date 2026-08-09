/**
 * Adaptadores del esquema 4: POINT, XLINE, RAY, SOLID, WIPEOUT, IMAGE, ATTDEF
 * y TABLE.
 *
 * ## Lo que se comprueba, y por qué así
 *
 * Una propiedad de ida y vuelta —«reflejar dos veces devuelve el original»— SE
 * CUMPLE DE FORMA VACÍA si el adaptador no toca el campo. Por eso cada regla de
 * reflexión se afirma con un ANCLA ABSOLUTA: qué coordenada concreta, qué
 * ángulo concreto sale. La ida y vuelta se comprueba además, como red.
 *
 * Y se comprueba lo que revienta el producto si falta:
 *
 *  · `CadSpatialIndex` no se cuelga con una recta infinita, y la encuentra.
 *  · Una XLINE lejana NO sale seleccionada por una ventana de captura, que es
 *    lo que pasaría si el impacto delegara en sus bounds infinitos.
 *  · Todo tipo nuevo está en el registro y tiene sus siete capacidades.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "./cad-document";
import {
  CAD_ENTITY_REGISTRY,
  CadSpatialIndex,
  type CadEntityTransform,
  type CadNativeEntity,
} from "./entity-runtime";
import { CAD_SCHEMA_4_ENTITY_TYPES } from "./cad-entities-v4";
import { __testables as infinite } from "./point-line-adapters";

const layer = "MUROS";
const near = (actual: number, expected: number, what: string, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${what}: ${actual}, se esperaba ${expected}`);

/** Reflexión respecto del eje Y (la recta x = 0). */
const MIRROR_Y: CadEntityTransform = {
  mirror: { point: { x: 0, y: 0 }, direction: { x: 0, y: 1 } },
};

function apply<E extends CadNativeEntity>(entity: E, transform: CadEntityTransform): E {
  return CAD_ENTITY_REGISTRY.adapter(entity).commands.transform(entity, transform);
}

// --- los ocho tipos existen en el registro, con sus siete capacidades ---------
{
  const samples: Record<(typeof CAD_SCHEMA_4_ENTITY_TYPES)[number], CadEntity> = {
    point: { id: "pt", type: "point", position: { x: 0, y: 0, z: 0 }, layer },
    xline: { id: "xl", type: "xline", basePoint: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, layer },
    ray: { id: "ry", type: "ray", basePoint: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, layer },
    solid: {
      id: "sd", type: "solid",
      points: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 100, z: 0 }],
      layer,
    },
    wipeout: {
      id: "wp", type: "wipeout",
      boundary: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 100, z: 0 }, { x: 0, y: 100, z: 0 }],
      layer,
    },
    image: {
      id: "im", type: "image", definition: "def", insertion: { x: 0, y: 0, z: 0 },
      uVector: { x: 1, y: 0, z: 0 }, vVector: { x: 0, y: 1, z: 0 },
      size: { width: 200, height: 100 }, layer,
    },
    attdef: { id: "at", type: "attdef", tag: "CODIGO", insertion: { x: 0, y: 0, z: 0 }, height: 100, layer },
    table: {
      id: "tb", type: "table", insertion: { x: 0, y: 0, z: 0 }, rows: 2, columns: 2,
      rowHeights: [100, 100], columnWidths: [300, 200], cells: [], layer,
    },
  };

  for (const type of CAD_SCHEMA_4_ENTITY_TYPES) {
    const entity = samples[type];
    assert.ok(CAD_ENTITY_REGISTRY.supports(entity), `${type} debe ser una entidad nativa`);
    if (!CAD_ENTITY_REGISTRY.supports(entity)) throw new Error("registro");
    const adapter = CAD_ENTITY_REGISTRY.adapter(entity);
    for (const capability of ["renderer", "hitTester", "grips", "snaps", "properties", "bounds", "commands"] as const)
      assert.ok(adapter[capability], `${type} necesita su ${capability}`);
    // Un adaptador que no devuelve grips no se puede editar con el ratón, y un
    // `properties.read` vacío deja el panel de propiedades en blanco.
    assert.ok(adapter.grips.grips(entity).length > 0, `${type} debe ofrecer grips`);
    assert.ok(Object.keys(adapter.properties.read(entity)).length > 0, `${type} debe leer propiedades`);
    assert.ok(adapter.snaps.snaps(entity).length > 0, `${type} debe ofrecer snaps`);
  }
}

// --- XLINE y RAY: bounds infinitos, y el índice espacial NO se cuelga --------
{
  const horizontal = infinite.infiniteBounds({
    id: "xl", type: "xline", basePoint: { x: 500, y: 300, z: 0 }, direction: { x: 1, y: 0, z: 0 }, layer,
  });
  // Ancla absoluta: infinito SÓLO donde de verdad lo hay. Una recta horizontal
  // no tiene extensión vertical, y decirlo mantiene útil el encuadre.
  assert.equal(horizontal.minX, -Infinity);
  assert.equal(horizontal.maxX, Infinity);
  assert.equal(horizontal.minY, 300, "una XLINE horizontal no es infinita en Y");
  assert.equal(horizontal.maxY, 300);

  const ray = infinite.infiniteBounds({
    id: "ry", type: "ray", basePoint: { x: 10, y: 20, z: 0 }, direction: { x: 1, y: 0, z: 0 }, layer,
  });
  assert.equal(ray.minX, 10, "una semirrecta hacia +X NO es infinita hacia −X");
  assert.equal(ray.maxX, Infinity);
  assert.equal(ray.minY, 20);
  assert.equal(ray.maxY, 20);

  // Dirección degenerada: se comporta como un punto en vez de propagar NaN.
  const degenerate = infinite.infiniteBounds({
    id: "xl0", type: "xline", basePoint: { x: 7, y: 9, z: 0 }, direction: { x: 0, y: 0, z: 0 }, layer,
  });
  assert.deepEqual(degenerate, { minX: 7, minY: 9, maxX: 7, maxY: 9 });

  // El guardia del índice: sin él, `cellKeys` iteraría de −∞ a +∞ y colgaría el
  // hilo. Con él, la recta va al conjunto de desbordamiento y SIGUE saliendo en
  // las búsquedas — el desbordamiento no es un cajón donde se pierden cosas.
  const index = new CadSpatialIndex(2_000, 4_096);
  index.upsert("xl", horizontal);
  index.upsert("finite", { minX: 0, minY: 0, maxX: 100, maxY: 100 });
  assert.equal(index.size, 2);
  const found = index.search({ minX: 400, minY: 250, maxX: 600, maxY: 350 });
  assert.ok(found.includes("xl"), "la recta infinita se encuentra por desbordamiento");
  assert.ok(!found.includes("finite"), "y el filtro por caja sigue descartando lo que no toca");
  // Y una ventana que no la toca tampoco la devuelve: el desbordamiento se
  // filtra por bounds igual que todo lo demás.
  assert.ok(!index.search({ minX: 0, minY: 1_000, maxX: 100, maxY: 1_100 }).includes("xl"));
}

// --- XLINE: la selección por ventana usa la RECTA, no la caja infinita -------
{
  const xline: CadNativeEntity = {
    id: "xl", type: "xline", basePoint: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, layer,
  };
  const adapter = CAD_ENTITY_REGISTRY.adapter(xline);
  // Ventana LEJOS de la recta. Con bounds infinitos, `boundsIntersect` diría
  // que sí y toda ventana del dibujo seleccionaría todas las rectas.
  assert.equal(
    adapter.hitTester.intersectsWindow(xline, { minX: 0, minY: 500, maxX: 100, maxY: 600 }, true),
    false,
    "una captura que no cruza la recta no la selecciona",
  );
  assert.equal(
    adapter.hitTester.intersectsWindow(xline, { minX: -50, minY: -10, maxX: 50, maxY: 10 }, true),
    true,
    "y una que sí la cruza, sí",
  );
  // Ventana de INCLUSIÓN: nada infinito cabe dentro de un rectángulo finito.
  assert.equal(
    adapter.hitTester.intersectsWindow(xline, { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 }, false),
    false,
    "una entidad sin cota nunca está CONTENIDA",
  );
  near(adapter.hitTester.hitTest(xline, { x: 9_999, y: 0.5 }, 1) ? 1 : 0, 1, "impacto sobre la recta a lo lejos");
  assert.equal(adapter.hitTester.hitTest(xline, { x: 0, y: 40 }, 1), false, "y no a 40 unidades de ella");
}

// --- RAY: por detrás de su origen no hay nada --------------------------------
{
  const ray: CadNativeEntity = {
    id: "ry", type: "ray", basePoint: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, layer,
  };
  near(infinite.distanceToInfinite(ray, { x: 1_000, y: 0 }), 0, "sobre la semirrecta");
  // Ancla absoluta: un punto 30 unidades DETRÁS del origen está a 30, no a 0.
  // Si se midiera contra la recta completa daría 0 y la semirrecta se
  // comportaría como una XLINE.
  near(infinite.distanceToInfinite(ray, { x: -30, y: 0 }), 30, "detrás del origen");
  assert.equal(
    infinite.crossesWindow(ray, { minX: -200, minY: -10, maxX: -100, maxY: 10 }),
    false,
    "una ventana detrás del origen no corta la semirrecta",
  );
}

// --- XLINE bajo reflexión: la dirección va por la parte LINEAL ---------------
{
  const xline: CadNativeEntity = {
    id: "xl", type: "xline", basePoint: { x: 100, y: 50, z: 0 }, direction: { x: 1, y: 1, z: 0 }, layer,
  };
  const mirrored = apply(xline, MIRROR_Y);
  if (mirrored.type !== "xline") throw new Error("tipo");
  // Anclas absolutas: el punto base se refleja (x cambia de signo) y la
  // dirección TAMBIÉN, pero sin sumarle la traslación. Si `direction` hubiera
  // pasado por la transformada de PUNTO valdría (−1, 1) desplazado, es decir
  // otra recta completamente distinta.
  near(mirrored.basePoint.x, -100, "punto base reflejado");
  near(mirrored.basePoint.y, 50, "y su Y intacta");
  near(mirrored.direction.x, -1, "dirección reflejada");
  near(mirrored.direction.y, 1, "y su componente Y intacta");

  const back = apply(mirrored, MIRROR_Y);
  if (back.type !== "xline") throw new Error("tipo");
  near(back.basePoint.x, 100, "ida y vuelta");
  near(back.direction.x, 1, "ida y vuelta de la dirección");
}

// --- IMAGE: U y V van por la parte LINEAL, y el espejo se nota --------------
{
  const image: CadNativeEntity = {
    id: "im", type: "image", definition: "def",
    insertion: { x: 1_000, y: 0, z: 0 },
    uVector: { x: 2, y: 0, z: 0 },
    vVector: { x: 0, y: 2, z: 0 },
    size: { width: 100, height: 50 },
    layer,
  };
  const mirrored = apply(image, MIRROR_Y);
  if (mirrored.type !== "image") throw new Error("tipo");
  near(mirrored.insertion.x, -1_000, "la inserción se refleja");
  // Ancla absoluta: U pasa de +2 a −2. Ése es el espejo. Si U hubiera ido por
  // la transformada de PUNTO valdría 0 (reflejo del punto (2,0) sobre x=0 es
  // (−2,0), pero relativo al origen del MUNDO, no al de la imagen) y la
  // imagen habría cambiado de tamaño además de sitio.
  near(mirrored.uVector.x, -2, "el vector U se refleja");
  near(mirrored.vVector.y, 2, "y V no cambia bajo un espejo vertical");
  assert.equal(mirrored.size.width, 100, "el tamaño en PÍXELES no lo toca ninguna transformada");

  // Escalar ×3 y girar 90°: U pasa de (2,0) a (0,6).
  const scaled = apply(image, { scale: 3, rotationDeg: 90 });
  if (scaled.type !== "image") throw new Error("tipo");
  near(scaled.uVector.x, 0, "U girado 90°");
  near(scaled.uVector.y, 6, "y escalado ×3");
}

// --- ATTDEF: la rotación se RESTA bajo reflexión, como MTEXT ----------------
{
  const attdef: CadNativeEntity = {
    id: "at", type: "attdef", tag: "CODIGO", defaultValue: "P-01",
    insertion: { x: 100, y: 0, z: 0 }, height: 120, rotation: 30, layer,
  };
  const mirrored = apply(attdef, MIRROR_Y);
  if (mirrored.type !== "attdef") throw new Error("tipo");
  // Ancla absoluta. La base angular de una reflexión sobre el eje x = 0 es
  // 180°, así que 30° pasa a 180 − 30 = 150. SUMARLA daría 210°, que es un
  // rótulo inclinado hacia el lado contrario al de la geometría — invisible en
  // todo texto a 0°, que son casi todos.
  near(mirrored.rotation!, 150, "rotación reflejada");
  near(mirrored.insertion.x, -100, "inserción reflejada");
  assert.equal(mirrored.height, 120, "un espejo no cambia el tamaño del texto");

  // Escalar ×2 escala la altura; la ausencia de altura se conserva ausente.
  const scaled = apply(attdef, { scale: 2 });
  if (scaled.type !== "attdef") throw new Error("tipo");
  near(scaled.height!, 240, "altura escalada");
  const noHeight = apply({ ...attdef, height: undefined } as CadNativeEntity, { translation: { x: 5, y: 0 } });
  if (noHeight.type !== "attdef") throw new Error("tipo");
  assert.equal(noHeight.height, undefined, "mover un ATTDEF no le fija una altura que no tenía");
}

// --- TABLE: se refleja como el texto, y NO se le da la vuelta a las columnas -
{
  const table: CadNativeEntity = {
    id: "tb", type: "table", insertion: { x: 200, y: 400, z: 0 }, rows: 2, columns: 3,
    rowHeights: [100, 80], columnWidths: [300, 200, 100],
    cells: [{ row: 0, column: 0, text: "A" }], rotation: 0, layer,
  };
  const mirrored = apply(table, MIRROR_Y);
  if (mirrored.type !== "table") throw new Error("tipo");
  near(mirrored.insertion.x, -200, "inserción reflejada");
  near(mirrored.rotation!, 180, "180 − 0 = 180: la tabla queda re-orientada");
  assert.deepEqual(
    mirrored.columnWidths,
    [300, 200, 100],
    "el orden de columnas NO se invierte: una tabla espejada con la primera columna a la derecha son otros datos",
  );

  const scaled = apply(table, { scale: 2 });
  if (scaled.type !== "table") throw new Error("tipo");
  assert.deepEqual(scaled.columnWidths, [600, 400, 200], "los anchos son longitudes y escalan");
  assert.deepEqual(scaled.rowHeights, [200, 160]);

  // La tabla crece hacia ABAJO: alto total 180 desde y = 400 hasta y = 220.
  const bounds = CAD_ENTITY_REGISTRY.adapter(table).bounds.bounds(table);
  near(bounds.maxY, 400, "el borde superior es la inserción");
  near(bounds.minY, 220, "y las filas avanzan en −Y");
  near(bounds.minX, 200, "el borde izquierdo es la inserción");
  near(bounds.maxX, 800, "600 de ancho total");
}

// --- SOLID y WIPEOUT: polígonos, e impacto por INTERIOR ---------------------
{
  const solid: CadNativeEntity = {
    id: "sd", type: "solid",
    points: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 100, z: 0 }, { x: 0, y: 100, z: 0 }],
    layer,
  };
  const adapter = CAD_ENTITY_REGISTRY.adapter(solid);
  assert.equal(
    adapter.hitTester.hitTest(solid, { x: 50, y: 50 }, 1),
    true,
    "pinchar EN MEDIO de un relleno lo selecciona; no hay que acertarle al borde",
  );
  assert.equal(adapter.hitTester.hitTest(solid, { x: 150, y: 50 }, 1), false);
  near(adapter.properties.read(solid).area as number, 10_000, "área del cuadrado de lado 100");

  const mirrored = apply(solid, MIRROR_Y);
  if (mirrored.type !== "solid") throw new Error("tipo");
  // Ancla absoluta: se reflejan los vértices en su sitio de la lista. El
  // recorrido pasa a ser horario y da igual —un relleno no tiene orientación—,
  // pero el ÍNDICE tiene que seguir apuntando al mismo vértice, o los grips
  // dejarían de corresponder.
  near(mirrored.points[1].x, -100, "el segundo vértice sigue siendo el segundo");
  near(mirrored.points[1].y, 0, "y su Y no cambia bajo un espejo vertical");

  const wipeout: CadNativeEntity = {
    id: "wp", type: "wipeout",
    boundary: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }, { x: 0, y: 10, z: 0 }],
    frame: false, layer,
  };
  assert.equal(CAD_ENTITY_REGISTRY.adapter(wipeout).properties.read(wipeout).frame, false);
  assert.equal(CAD_ENTITY_REGISTRY.adapter(wipeout).hitTester.hitTest(wipeout, { x: 5, y: 5 }, 0.1), true);
}

// --- POINT: la cota es el punto, no su marca --------------------------------
{
  const point: CadNativeEntity = {
    id: "pt", type: "point", position: { x: 40, y: 60, z: 0 }, style: 34, size: 25, layer,
  };
  const adapter = CAD_ENTITY_REGISTRY.adapter(point);
  assert.deepEqual(
    adapter.bounds.bounds(point),
    { minX: 40, minY: 60, maxX: 40, maxY: 60 },
    "la marca es decoración de viewport: no puede ensanchar el encuadre del dibujo",
  );
  // `PDMODE 34` = 2 (cruz) + 32 (círculo): dos trazos de cruz y un círculo.
  assert.equal(adapter.renderer.paths(point).length, 3, "estilo 34 = cruz + círculo");
  // Con `PDMODE 1` no se dibuja NADA, y aun así el punto tiene que poder
  // seleccionarse: por eso el impacto va contra la posición, no contra trazos.
  const invisible: CadNativeEntity = { ...point, style: 1 };
  assert.equal(adapter.renderer.paths(invisible).length, 0);
  assert.equal(adapter.hitTester.hitTest(invisible, { x: 40.5, y: 60 }, 1), true);

  const scaled = apply(point, { scale: 4 });
  if (scaled.type !== "point") throw new Error("tipo");
  near(scaled.position.x, 160, "posición escalada");
  near(scaled.size!, 100, "el tamaño ABSOLUTO de la marca escala");
  // Un tamaño NEGATIVO es un porcentaje del viewport en la convención PDSIZE:
  // escalarlo no significaría nada, así que se deja intacto.
  const relative = apply({ ...point, size: -5 } as CadNativeEntity, { scale: 4 });
  if (relative.type !== "point") throw new Error("tipo");
  assert.equal(relative.size, -5, "un PDSIZE relativo no escala");
}

console.log(
  `adaptadores v4: ${CAD_SCHEMA_4_ENTITY_TYPES.length} tipos registrados con sus 7 capacidades; ` +
    "bounds infinitos con signo, desbordamiento del índice espacial, captura por recta real y " +
    "reflexión con anclas absolutas en XLINE, IMAGE, ATTDEF, TABLE, SOLID y POINT",
);
