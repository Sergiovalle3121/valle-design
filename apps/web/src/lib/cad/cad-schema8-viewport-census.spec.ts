/**
 * CENSO de la subida al esquema 8: la ventana gráfica aprende a mirar.
 *
 * ## Por qué este spec, y por qué se parece al del esquema 7
 *
 * El censo del 7 nació de un hallazgo medido: cinco tipos de entidad se
 * perdían en silencio al pasar por el disco, y no se descubrió leyendo código
 * sino CONTANDO. La subida al 8 corre el mismo riesgo por otro sitio: no toca
 * la lista de entidades, toca `paperSpaces`, y una vista perdida es igual de
 * silenciosa que una entidad perdida — la lámina sigue abriendo, sigue
 * trazándose, y lo único que pasa es que el alzado sur ya no está.
 *
 * Así que se cuenta POR CLASE DE VISTA, no por total, por la misma razón que
 * allí se cuenta por tipo: un total que cuadra puede esconder un alzado
 * perdido y una planta duplicada. Y se cuentan además las entidades por tipo,
 * porque el 8 no puede llevarse por delante lo que el 7 conservaba.
 *
 * ## Qué se afirma, exactamente
 *
 *  1. El censo cubre las cuatro clases de vista y ninguna muestra miente.
 *  2. Guardar y volver a abrir devuelve el MISMO recuento por clase, y las
 *     cámaras vuelven con sus mismos números.
 *  3. Un documento del esquema 7 —ventanas SIN vista— abre declarándose 8, con
 *     una vista de planta EXPLÍCITA en cada ventana y sin perder una entidad.
 *  4. Esa planta explícita no cambia lo que la lámina enseña: proyectar con
 *     ella es la identidad sobre el plano de dibujo, medido punto a punto.
 *  5. Abrir NO pisa una vista que ya existía. Es lo que separa «poner por
 *     escrito el default» de «perder todos los alzados al abrir».
 *  6. CONTROL NEGATIVO: un censo que no puede fallar no defiende nada. Se
 *     suprime una vista a propósito y se comprueba que el censo la echa en
 *     falta y la NOMBRA.
 */
import { strict as assert } from "node:assert";
import {
  CAD_DOCUMENT_SCHEMA,
  cadDocumentStats,
  migrateCadDocument,
  parseCadDocument,
  serializeCadDocument,
  type CadDocument,
  type CadEntity,
  type CadPaperSpace,
  type CadPaperViewport,
  type CadViewportView,
  type CadViewportViewKind,
} from "./cad-document";
import {
  cadViewportOrthoView,
  cadViewportProjectPoint,
  cadViewportSectionView,
  cadViewportViewCensus,
  cadViewportViewFrame,
} from "./layout/viewport-view";

const P = (x: number, y: number, z = 0) => ({ x, y, z });

const corte = cadViewportSectionView({ from: { x: 0, y: 0 }, to: { x: 1_000, y: 0 } });
assert.ok(!("ok" in corte), "la vista de corte de la muestra no se pudo construir");

/**
 * Una muestra por CLASE de vista, declarada `satisfies Record<...>` para que
 * sea el COMPILADOR quien exija la muestra nueva el día que se añada una clase
 * quinta. Un censo mantenido a mano se queda corto justo en lo que se acaba de
 * añadir, que es lo que más falta hacía contar.
 */
const VISTAS = {
  plan: cadViewportOrthoView("planta", P(0, 0, 0)),
  elevation: cadViewportOrthoView("frontal", P(2_000, 0, 1_300)),
  section: corte,
  detail: {
    ...cadViewportOrthoView("planta", P(500, 500, 0)),
    kind: "detail",
  } as CadViewportView,
} satisfies Record<CadViewportViewKind, CadViewportView>;

const CLASES = Object.keys(VISTAS) as CadViewportViewKind[];

function ventana(kind: CadViewportViewKind, index: number): CadPaperViewport {
  return {
    id: `vp-${kind}`,
    name: kind,
    paperBounds: { x: 10, y: 10 + index * 60, width: 180, height: 50 },
    modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
    scale: 50,
    locked: false,
    view: VISTAS[kind],
  };
}

function lamina(viewports: CadPaperViewport[]): CadPaperSpace {
  return {
    id: "layout:planta",
    name: "Planta",
    entityIds: [],
    order: 0,
    page: { width: 420, height: 297, unit: "mm", orientation: "landscape" },
    viewports,
  };
}

/** Lo que habría EN EL DISCO: un objeto pelado, como lo abre un usuario. */
function crudo(
  entities: CadEntity[],
  schema: number,
  spaces: CadPaperSpace[],
): Record<string, unknown> {
  return {
    meta: { version: 1, schema, unit: "mm" },
    layers: [{ id: "0", name: "0", visible: true, locked: false, color: "#fff" }],
    entities,
    modelSpace: { entityIds: entities.map((e) => e.id) },
    paperSpaces: spaces,
  };
}

const MURO: CadEntity = {
  id: "e-wall",
  type: "wall",
  start: P(0, 0),
  end: P(4_000, 0),
  thickness: 150,
  height: 2_600,
  layer: "0",
};
const SOLIDO: CadEntity = {
  id: "e-solid3d",
  type: "solid3d",
  nodes: [{ id: "n", op: "box", min: P(0, 0, 0), max: P(10, 10, 10) }],
  root: "n",
  layer: "0",
};

// --- 1. el censo cubre lo que dice cubrir ------------------------------------
{
  assert.equal(CAD_DOCUMENT_SCHEMA, 9, "el esquema canónico vigente es el 9 (frozen + layerStates)");
  assert.equal(CLASES.length, 4, "el censo debe cubrir las cuatro clases de vista");
  for (const clase of CLASES) {
    assert.equal(VISTAS[clase].kind, clase, `la muestra de ${clase} declara otra clase`);
    assert.equal(
      VISTAS[clase].projection,
      "parallel",
      `la muestra de ${clase} no declara proyección paralela`,
    );
  }
}

// --- 2. guardar → abrir no pierde NI UNA CLASE DE VISTA ----------------------
{
  const original: CadDocument = migrateCadDocument(
    crudo([MURO, SOLIDO], CAD_DOCUMENT_SCHEMA, [
      lamina(CLASES.map((clase, index) => ventana(clase, index))),
    ]),
  );
  const abierto = parseCadDocument(serializeCadDocument(original));

  const antes = cadViewportViewCensus(original);
  const despues = cadViewportViewCensus(abierto);

  // Recuento POR CLASE, no total: un total que cuadra puede esconder un alzado
  // perdido y una planta duplicada, que es como pasan desapercibidos.
  const perdidas = CLASES.filter((clase) => despues[clase] !== antes[clase]);
  assert.deepEqual(
    perdidas,
    [],
    `clases de vista que NO sobreviven al viaje guardar→abrir: ${perdidas.join(", ")}`,
  );
  for (const clase of CLASES) {
    assert.equal(antes[clase], 1, `el documento de partida debía tener 1 vista ${clase}`);
    assert.equal(despues[clase], 1, `se perdió la vista ${clase} al abrir`);
  }
  assert.equal(despues.sinVista, 0, "ninguna ventana puede quedar sin declarar su cámara");

  // La cámara vuelve con sus MISMOS números: sobrevivir no es «hay una vista
  // de esa clase», es «mira exactamente hacia donde miraba».
  const reabiertas = new Map(
    (abierto.paperSpaces[0].viewports ?? []).map((v) => [v.id, v.view]),
  );
  for (const clase of CLASES) {
    assert.deepEqual(
      reabiertas.get(`vp-${clase}`),
      VISTAS[clase],
      `la cámara de la vista ${clase} cambió al abrir`,
    );
  }

  // Y las entidades siguen ahí: una subida de esquema que salva las láminas y
  // se come el modelo no ha salvado nada.
  const stats = cadDocumentStats(abierto);
  assert.equal(stats.wall, 1, "la subida al 8 perdió el muro");
  assert.equal(stats.solid3d, 1, "la subida al 8 perdió el sólido");
  assert.equal(abierto.entities.length, 2, "el total de entidades también debe cuadrar");
}

// --- 3. un documento del esquema 7 abre, y sus ventanas declaran su cámara ---
{
  // Un v7 real NO puede traer `view`: en el 7 el campo no existía. Se guarda
  // exactamente lo que un usuario tendría en disco antes de esta ola.
  const ventanaV7 = {
    id: "vp-vieja",
    name: "Ventana 1",
    paperBounds: { x: 10, y: 10, width: 180, height: 120 },
    modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
    scale: 50,
    locked: false,
  } as CadPaperViewport;
  const v7EnDisco = crudo([MURO, SOLIDO], 7, [lamina([ventanaV7])]);
  const migrado = migrateCadDocument(v7EnDisco);

  assert.equal(migrado.meta.schema, 9, "el v7 debe pasar a declararse el esquema vigente al abrirse");
  const censo = cadViewportViewCensus(migrado);
  assert.equal(censo.sinVista, 0, "la migración 7→8 dejó una ventana sin cámara");
  assert.equal(censo.plan, 1, "la ventana del v7 debe abrirse como PLANTA");
  assert.equal(censo.elevation + censo.section + censo.detail, 0, "la migración inventó vistas");

  const stats = cadDocumentStats(migrado);
  assert.equal(stats.wall, 1, "la migración 7→8 perdió el muro");
  assert.equal(stats.solid3d, 1, "la migración 7→8 perdió el sólido");
  assert.equal(migrado.entities.length, 2, "el v7 tenía 2 entidades y debe seguir teniéndolas");

  // El resto de la ventana no se toca: escribir la cámara no puede mover el
  // encuadre ni la escala, que es lo que decide qué se ve y a qué tamaño.
  const abierta = migrado.paperSpaces[0].viewports![0];
  assert.deepEqual(abierta.modelBounds, ventanaV7.modelBounds, "el encuadre cambió al migrar");
  assert.deepEqual(abierta.paperBounds, ventanaV7.paperBounds, "el sitio en el papel cambió");
  assert.equal(abierta.scale, 50, "la escala cambió al migrar");

  // Idempotencia: abrir lo ya abierto no vuelve a mover nada.
  const otraVez = migrateCadDocument(JSON.parse(serializeCadDocument(migrado)));
  assert.deepEqual(cadViewportViewCensus(otraVez), censo, "abrir dos veces cambia el censo");
  assert.deepEqual(
    otraVez.paperSpaces[0].viewports![0].view,
    abierta.view,
    "abrir dos veces cambia la cámara",
  );
}

// --- 4. la planta explícita NO cambia lo que la lámina enseña ----------------
{
  // Ésta es la afirmación que hace segura la migración, y por eso se MIDE:
  // proyectar con la planta explícita devuelve (x, y) tal cual, que es lo que
  // significaba `modelBounds` cuando no había cámara ninguna.
  const outcome = cadViewportViewFrame(VISTAS.plan);
  assert.ok(outcome.ok, "la vista de planta no produjo marco");
  const frame = outcome.frame;

  const muestras = [
    P(0, 0, 0),
    P(1_234.5, -987.25, 0),
    P(-4_000, 6_000, 2_600),
    P(1e-7, 1e7, -3_000),
  ];
  let desviacionMaxima = 0;
  for (const punto of muestras) {
    const proyectado = cadViewportProjectPoint(punto, frame);
    desviacionMaxima = Math.max(
      desviacionMaxima,
      Math.abs(proyectado.x - punto.x),
      Math.abs(proyectado.y - punto.y),
    );
  }
  assert.equal(
    desviacionMaxima,
    0,
    `proyectar en planta debe ser la identidad; se desvió ${desviacionMaxima}`,
  );

  // Y un alzado frontal NO es la identidad: si lo fuera, la cámara no estaría
  // haciendo nada y el spec de arriba pasaría por accidente.
  const alzado = cadViewportViewFrame(VISTAS.elevation);
  assert.ok(alzado.ok, "la vista de alzado no produjo marco");
  const enAlzado = cadViewportProjectPoint(P(2_000, 500, 2_600), alzado.frame);
  assert.equal(enAlzado.x, 0, "el alzado frontal mide la X del mundo desde su objetivo");
  assert.equal(enAlzado.y, 1_300, "el alzado frontal debe llevar la Z del mundo al eje vertical");
}

// --- 5. abrir NO pisa una cámara que ya existía ------------------------------
{
  const alzado = ventana("elevation", 0);
  const doc = migrateCadDocument(crudo([MURO], 7, [lamina([alzado])]));
  assert.deepEqual(
    doc.paperSpaces[0].viewports![0].view,
    VISTAS.elevation,
    "abrir un documento del 7 con una vista ya escrita la sustituyó por la planta",
  );
}

// --- 6. CONTROL NEGATIVO: el censo tiene que saber fallar --------------------
{
  // Un documento al que se le suprime a propósito el alzado. Si el censo
  // siguiera diciendo que están las cuatro clases, no estaría defendiendo
  // nada: pasaría igual el día que la pérdida fuese de verdad.
  const completo = migrateCadDocument(
    crudo([MURO], CAD_DOCUMENT_SCHEMA, [
      lamina(CLASES.map((clase, index) => ventana(clase, index))),
    ]),
  );
  const mutilado: CadDocument = {
    ...completo,
    paperSpaces: completo.paperSpaces.map((space) => ({
      ...space,
      viewports: (space.viewports ?? []).filter((v) => v.id !== "vp-elevation"),
    })),
  };

  const antes = cadViewportViewCensus(completo);
  const despues = cadViewportViewCensus(mutilado);
  const perdidas = CLASES.filter((clase) => despues[clase] !== antes[clase]);
  assert.deepEqual(
    perdidas,
    ["elevation"],
    "el censo no detecta —o no nombra— la vista suprimida a propósito",
  );
  // El total NO basta, y aquí se ve: si además duplicásemos una planta, el
  // recuento total volvería a cuadrar y sólo el conteo por clase lo vería.
  const duplicado: CadDocument = {
    ...mutilado,
    paperSpaces: mutilado.paperSpaces.map((space) => ({
      ...space,
      viewports: [...(space.viewports ?? []), { ...ventana("plan", 9), id: "vp-plan-2" }],
    })),
  };
  const censoDuplicado = cadViewportViewCensus(duplicado);
  const totalAntes = CLASES.reduce((sum, clase) => sum + antes[clase], 0);
  const totalDespues = CLASES.reduce((sum, clase) => sum + censoDuplicado[clase], 0);
  assert.equal(totalDespues, totalAntes, "el escenario de control debía cuadrar en TOTAL");
  assert.notEqual(
    censoDuplicado.elevation,
    antes.elevation,
    "el conteo por clase debía ver el alzado perdido que el total esconde",
  );
}

console.log(
  `OK censo del esquema 8: ${CLASES.length}/4 clases de vista sobreviven a guardar→abrir; ` +
    `la migración 7→8 declara la planta sin mover el encuadre y sin pisar cámaras existentes`,
);
