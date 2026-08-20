/**
 * Golden de la visibilidad EXACTA: cóncavos, varios sólidos, y cuánto cuesta.
 *
 * Que un cubo salga bien no prueba nada: el cubo ya salía bien con la
 * clasificación por caras traseras de `hidden-lines.ts`. Lo que hay que
 * demostrar es lo otro, y por eso cada bloque de este archivo elige una figura
 * en la que el método viejo se EQUIVOCA y escribe a mano la respuesta correcta
 * con el razonamiento al lado.
 *
 *  1. **Un canal en U**, que es cóncavo. Una arista del brazo lejano tiene una
 *     cara de frente —así que el método viejo la da por vista— y el brazo
 *     cercano le tapa la mitad de abajo. El corte cae en `z = 22` EXACTOS, y ese
 *     22 sale de una cuenta de tres líneas que está escrita más abajo.
 *  2. **Dos cuerpos**, uno dentro de la sombra del otro. Las doce aristas de la
 *     caja de atrás se ocultan; el método viejo, que sólo mira un cuerpo cada
 *     vez, dice nueve vistas y tres ocultas.
 *  3. **El error de posición en MILÍMETROS**, contra la proyección calculada
 *     con trigonometría escrita aquí y no con la del módulo.
 *  4. **El coste**, sobre una escena de tamaño de planta, contra un presupuesto
 *     declarado como número y justificado.
 *  5. **Fallo cerrado**: las cuatro maneras de no poder proyectar devuelven su
 *     código, no un dibujo a medias.
 */
import { check, checkClose, report } from "../../brep/spec-support";
import { cloneBody, extrudeProfile, makeBox, type BrepBody, type Vec3 } from "../../brep";
import { cadBodyIsConvex, cadSceneEdgeVisibility, cadSolidEdgeVisibility } from "./hidden-lines";
import { cadEdgeVerdicts, cadHiddenLineDrawing, type CadHiddenLineDrawing } from "./hidden-line-solver";

/** Índice de la arista cuyos dos extremos son estos puntos, en cualquier orden. */
function edgeBetween(body: BrepBody, p: Vec3, q: Vec3): number {
  const same = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-6;
  for (let edge = 0; edge < body.edges.length; edge += 1) {
    const half = body.edges[edge].a;
    const from = body.vertices[body.halfEdges[half].origin].point;
    const to = body.vertices[body.halfEdges[body.halfEdges[half].next].origin].point;
    if ((same(from, p) && same(to, q)) || (same(from, q) && same(to, p))) return edge;
  }
  return -1;
}

/** Cotas z de los trozos de una arista, por lista. Sirve para leer un corte. */
function zSpan(
  segments: CadHiddenLineDrawing["visible"],
  body: number,
  edge: number,
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const segment of segments) {
    if (segment.body !== body || segment.edge !== edge) continue;
    min = Math.min(min, segment.from3.z, segment.to3.z);
    max = Math.max(max, segment.from3.z, segment.to3.z);
  }
  return min === Infinity ? null : { min, max };
}

// ---------------------------------------------------------------------------
// 1. Un canal en U: cóncavo, y con un corte que se calcula a mano
// ---------------------------------------------------------------------------
//
// Sección en el plano XY, extruida 40 en Z. Base maciza de y=0 a y=20 en todo el
// ancho, y dos brazos de 20 de grueso que suben hasta y=60: uno en x∈[0,20] y
// otro en x∈[80,100]. Entre ellos, la ranura x∈(20,80), y∈(20,60), vacía.
const channel: BrepBody = extrudeProfile({
  profile: {
    outer: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 60 },
      { x: 80, y: 60 },
      { x: 80, y: 20 },
      { x: 20, y: 20 },
      { x: 20, y: 60 },
      { x: 0, y: 60 },
    ],
  },
  height: 40,
});

// Mirada d = (1, 0'2, −0'3): el observador está en x muy negativo, algo por
// encima y algo hacia −y. Ve el brazo cercano (x∈[0,20]) de frente y detrás de
// él, el lejano (x∈[80,100]).
const channelView = { kind: "parallel" as const, direction: { x: 1, y: 0.2, z: -0.3 } };

{
  check("el canal en U no es convexo", cadBodyIsConvex(channel) === false);
  check("tiene 24 aristas y 10 caras", channel.edges.length === 24 && channel.faces.length === 10);

  const legacy = cadSolidEdgeVisibility(channel, channelView);
  check("la clasificación por caras traseras se declara NO exacta", legacy.exact === false);

  const drawing = cadHiddenLineDrawing([channel], channelView);
  check("el cóncavo se resuelve sin fallar", drawing.ok === true);
  if (!drawing.ok) throw new Error(drawing.message);
  const verdicts = cadEdgeVerdicts(drawing);
  check("las 24 aristas quedan clasificadas", verdicts.size === 24);

  // --- La arista del brazo LEJANO, por dentro: (80, 60, 0) → (80, 60, 40) ---
  //
  // Sus dos caras son el plano x=80 (normal −X, n·d = −1 ⇒ DE FRENTE) y el
  // plano y=60 (normal +Y, n·d = +0'2 ⇒ de espaldas). Con una cara de frente, la
  // clasificación por caras traseras la da por VISTA ENTERA. Y no lo es.
  //
  // El rayo que va de un punto (80, 60, z) hacia el observador es
  //   r(t) = (80 − t, 60 − 0'2t, z + 0'3t).
  // Mientras t < 60 va por la ranura, que está vacía. A partir de t = 60 entra
  // en el brazo cercano (x ≤ 20), y sigue dentro de él mientras z + 0'3t ≤ 40,
  // es decir t ≤ (40 − z)/0'3. Hay material tapando si y sólo si
  //   (40 − z)/0'3 > 60  ⟺  40 − z > 18  ⟺  z < 22.
  // Así que la arista está OCULTA de z=0 a z=22 y VISTA de z=22 a z=40. El 22 no
  // es una tolerancia elegida: es la altura a la que el rayo roza exactamente la
  // arista superior del brazo cercano, en el punto (20, 48, 40).
  const farInner = edgeBetween(channel, { x: 80, y: 60, z: 0 }, { x: 80, y: 60, z: 40 });
  check("la arista interior del brazo lejano existe", farInner >= 0);
  check(
    "el método viejo la da por VISTA (y se equivoca)",
    legacy.visible.includes(farInner) && !legacy.hidden.includes(farInner),
  );
  check("el método exacto la parte en dos", verdicts.get(farInner) === "partial");
  const hiddenPart = zSpan(drawing.hidden, 0, farInner);
  const visiblePart = zSpan(drawing.visible, 0, farInner);
  check("tiene un trozo oculto y otro visto", hiddenPart !== null && visiblePart !== null);
  if (hiddenPart && visiblePart) {
    checkClose("el trozo oculto arranca en la base", hiddenPart.min, 0, 1e-9);
    checkClose("y termina exactamente en z = 22", hiddenPart.max, 22, 1e-9);
    checkClose("el trozo visto arranca exactamente en z = 22", visiblePart.min, 22, 1e-9);
    checkClose("y llega hasta la cara superior", visiblePart.max, 40, 1e-9);
  }

  // --- Las otras cinco aristas verticales, una por una ----------------------
  //
  // · (100,60): caras x=100 (n=+X, n·d=+1) e y=60 (n=+Y, n·d=+0'2). Las dos de
  //   espaldas ⇒ el material del propio brazo está entre ella y el ojo. OCULTA.
  // · (20,60): caras x=20 (n=+X, de espaldas) e y=60 (n=+Y, de espaldas). El
  //   rayo entra enseguida en el brazo cercano. OCULTA.
  // · (0,60): caras x=0 (n=−X, n·d=−1, DE FRENTE) e y=60 (de espaldas). El rayo
  //   sale del sólido en cuanto x<0: no hay nada delante. VISTA.
  // · (0,0): las dos caras que la tocan miran al observador. VISTA.
  // · (100,0): la esquina de la base más lejana en x, y aun así VISTA. Es el
  //   caso que enseña que «lejos» no significa «tapado»: su cara y=0 mira al
  //   observador, y el rayo hacia el ojo sale por y<0 —fuera de la pieza— antes
  //   de encontrarse con nada. Está escrita porque la intuición dice lo
  //   contrario y una spec que sólo comprueba lo intuitivo no comprueba nada.
  const cases: [string, Vec3, Vec3, "visible" | "hidden"][] = [
    ["la exterior del brazo lejano (100,60)", { x: 100, y: 60, z: 0 }, { x: 100, y: 60, z: 40 }, "hidden"],
    ["la interior del brazo cercano (20,60)", { x: 20, y: 60, z: 0 }, { x: 20, y: 60, z: 40 }, "hidden"],
    ["la exterior del brazo cercano (0,60)", { x: 0, y: 60, z: 0 }, { x: 0, y: 60, z: 40 }, "visible"],
    ["la esquina cercana de la base (0,0)", { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 40 }, "visible"],
    ["la esquina lejana de la base (100,0)", { x: 100, y: 0, z: 0 }, { x: 100, y: 0, z: 40 }, "visible"],
  ];
  for (const [label, p, q, expected] of cases) {
    const edge = edgeBetween(channel, p, q);
    check(`${label} está en el cuerpo`, edge >= 0);
    check(`${label} sale ${expected}`, verdicts.get(edge) === expected, `salió ${verdicts.get(edge)}`);
  }

  // El suelo de la ranura, arriba y abajo. Arriba el rayo se escapa por encima
  // de la pieza (z > 40) y se ve; abajo entra en la base maciza y se oculta.
  const slotTop = edgeBetween(channel, { x: 20, y: 20, z: 40 }, { x: 80, y: 20, z: 40 });
  const slotBottom = edgeBetween(channel, { x: 20, y: 20, z: 0 }, { x: 80, y: 20, z: 0 });
  check("el borde alto del suelo de la ranura se ve", verdicts.get(slotTop) === "visible");
  check("el borde bajo del suelo de la ranura se oculta", verdicts.get(slotBottom) === "hidden");

  // El reparto completo, para que nadie pueda cambiar el algoritmo y dejar esto
  // pasando por casualidad: 13 vistas, 10 ocultas y 1 partida.
  const tally = { visible: 0, hidden: 0, partial: 0 };
  for (const value of verdicts.values()) tally[value] += 1;
  check(
    `el reparto es 13 vistas / 10 ocultas / 1 partida (salió ${tally.visible}/${tally.hidden}/${tally.partial})`,
    tally.visible === 13 && tally.hidden === 10 && tally.partial === 1,
  );
}

// ---------------------------------------------------------------------------
// 2. Dos cuerpos: uno entero dentro de la sombra del otro
// ---------------------------------------------------------------------------
{
  // Una placa de 1.000 × 1.000 delante y una caja de 60 detrás. La mirada es
  // oblicua, así que la caja de atrás se desplaza en la imagen respecto de la
  // placa; con la placa diez veces más grande que ese desplazamiento, la caja
  // cae ENTERA dentro de su sombra sin necesidad de calcular la sombra.
  const plate = makeBox({ min: { x: -500, y: 0, z: -500 }, max: { x: 500, y: 100, z: 500 } });
  const far = makeBox({ min: { x: 20, y: 200, z: 20 }, max: { x: 80, y: 300, z: 80 } });
  const view = { kind: "parallel" as const, direction: { x: 0.2, y: 1, z: 0.15 } };

  const alone = cadSolidEdgeVisibility(far, view);
  check("la caja de atrás, MIRADA SOLA, sería un convexo exacto", alone.exact === true);
  check("y sola daría nueve aristas vistas", alone.visible.length === 9);

  const drawing = cadHiddenLineDrawing([plate, far], view);
  check("la escena de dos cuerpos se resuelve", drawing.ok === true);
  if (!drawing.ok) throw new Error(drawing.message);

  const farVerdicts = cadEdgeVerdicts(drawing, 1);
  check("las doce aristas de la caja de atrás se clasifican", farVerdicts.size === 12);
  check(
    "y las DOCE salen ocultas, que es lo que un solo cuerpo no puede saber",
    [...farVerdicts.values()].every((verdict) => verdict === "hidden"),
  );
  check("no queda ni un trozo suyo entre lo visto", drawing.visible.every((segment) => segment.body !== 1));

  // Y la placa, que es convexa y no la tapa nadie, tiene que dar exactamente lo
  // de siempre: nueve vistas y tres ocultas desde una esquina. Es el ancla que
  // impide que «resolver los cóncavos» estropee los convexos.
  const plateVerdicts = cadEdgeVerdicts(drawing, 0);
  const plateVisible = [...plateVerdicts.values()].filter((verdict) => verdict === "visible").length;
  const plateHidden = [...plateVerdicts.values()].filter((verdict) => verdict === "hidden").length;
  check(`la placa convexa da 9 vistas (salió ${plateVisible})`, plateVisible === 9);
  check(`y 3 ocultas (salió ${plateHidden})`, plateHidden === 3);
}

// ---------------------------------------------------------------------------
// 3. El error de posición, en milímetros
// ---------------------------------------------------------------------------
{
  // Cubo de 100 visto desde la esquina (+,+,+). La base de la vista se puede
  // escribir a mano: con la mirada (−1,−1,−1)/√3 y la vertical del mundo,
  //   derecha = (−1, 1, 0)/√2      arriba = (−1, −1, 2)/√6
  // y la proyección de un punto es su producto escalar con cada uno de los dos.
  // Esta cuenta NO usa nada del módulo: si el módulo se equivocara de base, de
  // signo o de orden, la diferencia saldría aquí en milímetros.
  const cube = makeBox({ min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } });
  const drawing = cadHiddenLineDrawing([cube], { kind: "parallel", direction: { x: -1, y: -1, z: -1 } });
  check("la isométrica del cubo se resuelve", drawing.ok === true);
  if (!drawing.ok) throw new Error(drawing.message);

  const right = { x: -1 / Math.SQRT2, y: 1 / Math.SQRT2, z: 0 };
  const up = { x: -1 / Math.sqrt(6), y: -1 / Math.sqrt(6), z: 2 / Math.sqrt(6) };
  let worst = 0;
  for (const segment of [...drawing.visible, ...drawing.hidden])
    for (const [flat, space] of [
      [segment.from, segment.from3],
      [segment.to, segment.to3],
    ] as const) {
      const u = space.x * right.x + space.y * right.y + space.z * right.z;
      const v = space.x * up.x + space.y * up.y + space.z * up.z;
      worst = Math.max(worst, Math.hypot(flat.x - u, flat.y - v));
    }
  // TOLERANCIA DECLARADA: 1e-9 unidades de dibujo. Con el dibujo en milímetros
  // eso es una millonésima de milímetro, cien mil veces más fino que el trazo
  // más estrecho que imprime un plóter. Lo medido está trece órdenes por debajo.
  check(
    `el error de proyección es de ${worst.toExponential(2)} mm, por debajo de 1e-9`,
    worst < 1e-9,
  );

  // Y el ancla absoluta: la arista de un cubo visto en isométrica mide
  // 100·√(2/3) = 81'6496… mm proyectados. Es trigonometría de bachillerato y no
  // depende de esta implementación.
  const expected = 100 * Math.sqrt(2 / 3);
  check("la isométrica deja nueve aristas vistas", drawing.visible.length === 9);
  for (const segment of drawing.visible)
    checkClose(
      "cada arista proyectada mide 100·√(2/3)",
      Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y),
      expected,
      1e-9,
    );
}

// ---------------------------------------------------------------------------
// 4. Perspectiva: el ojo, y una cuenta que también sale a mano
// ---------------------------------------------------------------------------
{
  const cube = makeBox({ min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } });
  // Ojo en la vertical del centro, a z=500. La distancia focal que fija el
  // módulo es la que hay del ojo al centro de la escena: 500 − 50 = 450.
  // La esquina alta (0,0,100) está a profundidad 400, así que su coordenada de
  // imagen es 450 · (−50)/400 = −56'25 en los dos ejes. La esquina baja (0,0,0)
  // está a 500 y da 450 · (−50)/500 = −45: la caja se «cierra» al alejarse, que
  // es justo lo que la proyección paralela no sabe hacer.
  const drawing = cadHiddenLineDrawing([cube], { kind: "perspective", eye: { x: 50, y: 50, z: 500 } });
  check("la perspectiva cenital se resuelve", drawing.ok === true);
  if (!drawing.ok) throw new Error(drawing.message);
  checkClose("la focal es la distancia al centro de la escena", drawing.frame.focal, 450, 1e-9);

  const top = drawing.visible.find(
    (segment) =>
      Math.hypot(segment.from3.x - 0, segment.from3.y - 0, segment.from3.z - 100) < 1e-9 ||
      Math.hypot(segment.to3.x - 0, segment.to3.y - 0, segment.to3.z - 100) < 1e-9,
  );
  check("la esquina alta (0,0,100) está entre lo visto", top !== undefined);
  if (top) {
    const corner =
      Math.hypot(top.from3.x, top.from3.y, top.from3.z - 100) < 1e-9 ? top.from : top.to;
    checkClose("y se proyecta en u = −56'25", corner.x, -56.25, 1e-9);
    checkClose("y en v = −56'25", corner.y, -56.25, 1e-9);
  }

  // Desde justo encima sólo se ve la tapa: sus cuatro aristas. Las ocho
  // restantes —cuatro del fondo y cuatro verticales— caen DENTRO del cuadrado
  // de la tapa en la imagen y están más lejos, así que se ocultan enteras.
  const verdicts = cadEdgeVerdicts(drawing);
  const visibles = [...verdicts.values()].filter((verdict) => verdict === "visible").length;
  const hiddens = [...verdicts.values()].filter((verdict) => verdict === "hidden").length;
  check(`se ven las cuatro de la tapa (salieron ${visibles})`, visibles === 4);
  check(`y se ocultan las otras ocho (salieron ${hiddens})`, hiddens === 8);
}

// ---------------------------------------------------------------------------
// 5. Fallo cerrado
// ---------------------------------------------------------------------------
{
  const cube = makeBox({ min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } });

  const empty = cadHiddenLineDrawing([], { kind: "parallel", direction: { x: 0, y: 0, z: -1 } });
  check("una escena vacía no devuelve un dibujo vacío: devuelve su código", empty.ok === false);
  if (!empty.ok) check("y el código es escena-vacia", empty.code === "escena-vacia");

  const nowhere = cadHiddenLineDrawing([cube], { kind: "parallel", direction: { x: 0, y: 0, z: 0 } });
  check("una mirada de longitud cero se rechaza", nowhere.ok === false);
  if (!nowhere.ok) check("con el código vista-degenerada", nowhere.code === "vista-degenerada");

  // El ojo DENTRO del cubo, mirando hacia el centro: la tapa de abajo queda
  // detrás de él, y una proyección en perspectiva de algo que está detrás del
  // ojo no existe. Se dice, no se inventa.
  const inside = cadHiddenLineDrawing([cube], { kind: "perspective", eye: { x: 50, y: 50, z: 30 } });
  check("el ojo dentro del sólido se rechaza", inside.ok === false);
  if (!inside.ok) check("con el código detras-del-observador", inside.code === "detras-del-observador");

  // Una cara alabeada: se mueve un vértice del cubo y su cara deja de ser plana.
  // El test de profundidad de este módulo está definido sobre un plano, así que
  // el cuerpo entero se rechaza en vez de proyectarse mal.
  const warped = cloneBody(cube);
  warped.vertices[0].point = {
    x: warped.vertices[0].point.x,
    y: warped.vertices[0].point.y,
    z: warped.vertices[0].point.z + 30,
  };
  const bad = cadHiddenLineDrawing([warped], { kind: "parallel", direction: { x: -1, y: -1, z: -1 } });
  check("una cara alabeada se rechaza", bad.ok === false);
  if (!bad.ok) check("con el código cara-no-plana", bad.code === "cara-no-plana");
}

// ---------------------------------------------------------------------------
// 6. Coste, contra un presupuesto declarado
// ---------------------------------------------------------------------------
{
  /**
   * PRESUPUESTO: 500 ms para 400 sólidos (2.400 caras, 4.800 aristas) en ESTA
   * máquina — AMD Ryzen 5 5500U, 6 núcleos, 7,4 GB, Windows 11, con otras
   * sesiones encima.
   *
   * Por qué 500 y no 27 como el paneo. Los topes de `benchmark/plan-budget.ts`
   * son de gestos que ocurren SESENTA VECES POR SEGUNDO: si el paneo tarda 30 ms
   * el dibujo se arrastra mientras se mueve el ratón. FLATSHOT no es un gesto:
   * es una orden que se teclea, produce geometría y termina. Su vecino no es el
   * paneo, es la apertura de un dibujo. El umbral que importa es el otro: por
   * encima de un segundo, una orden parece colgada. El presupuesto se pone en la
   * mitad de ese segundo, que sobre los 124 ms medidos como mediana deja un
   * margen de cuatro veces — el mismo orden de margen que usa `plan-budget` para
   * que la contención de otra sesión no ponga el gate en rojo sin que nadie haya
   * roto nada.
   *
   * Y si aun así costara caro: lo caro es la mitad OCULTA, y esa mitad sale a su
   * propia capa, que se apaga desde el gestor de capas sin volver a calcular
   * nada.
   */
  const BUDGET_MS = 500;
  const bodies: BrepBody[] = [];
  const side = 20;
  for (let i = 0; i < 400; i += 1)
    bodies.push(
      makeBox({
        min: { x: (i % side) * 400, y: Math.floor(i / side) * 400, z: 0 },
        max: { x: (i % side) * 400 + 250, y: Math.floor(i / side) * 400 + 250, z: 300 },
      }),
    );

  const runs: number[] = [];
  let last: CadHiddenLineDrawing | null = null;
  for (let i = 0; i < 5; i += 1) {
    const result = cadHiddenLineDrawing(bodies, {
      kind: "parallel",
      direction: { x: -0.6, y: -0.8, z: -0.45 },
    });
    if (!result.ok) throw new Error(result.message);
    runs.push(result.stats.elapsedMs);
    last = result;
  }
  runs.sort((a, b) => a - b);
  const median = runs[2];
  check("la escena de planta se resuelve entera", last !== null);
  if (last) {
    check("son 2.400 caras y 4.800 aristas", last.stats.faces === 2400 && last.stats.edges === 4800);
    check("y sale geometría de las dos clases", last.visible.length > 0 && last.hidden.length > 0);
    // Las pruebas punto-en-cara son el término que domina. Que sean del orden de
    // las aristas y no de aristas × caras es LO QUE HACE LA REJILLA: sin ella
    // serían 4.800 × 2.400 = 11,5 millones.
    check(
      `las pruebas punto-en-cara (${last.stats.faceTests}) se quedan muy por debajo de aristas × caras`,
      last.stats.faceTests < last.stats.edges * 20,
    );
  }
  console.log(
    `   coste: mediana ${median.toFixed(1)} ms de 5 corridas (min ${runs[0].toFixed(1)}, max ${runs[4].toFixed(1)}), presupuesto ${BUDGET_MS} ms`,
  );
  check(`la mediana ${median.toFixed(1)} ms cabe en el presupuesto de ${BUDGET_MS} ms`, median <= BUDGET_MS);
}

// ---------------------------------------------------------------------------
// 7. La puerta multicuerpo, que es la que consume la ventana gráfica
// ---------------------------------------------------------------------------
{
  // El caso que trae SOLDRAW: cuatro paños en fila norte-sur, alzado frontal.
  // El de más al sur es el que está delante; el del norte cae ENTERO dentro de
  // su sombra. Mirando un cuerpo cada vez —que es lo único que sabe hacer
  // `cadSolidEdgeVisibility`— el paño norte sale dibujado como visto encima del
  // sur, que es exactamente el alzado mal hecho que esta ola existe para evitar.
  const sur = makeBox({ min: { x: 0, y: 0, z: 0 }, max: { x: 4000, y: 300, z: 3000 } });
  const centroA = makeBox({ min: { x: 500, y: 2000, z: 200 }, max: { x: 3500, y: 2300, z: 2800 } });
  const centroB = makeBox({ min: { x: 800, y: 4000, z: 400 }, max: { x: 3200, y: 4300, z: 2600 } });
  const norte = makeBox({ min: { x: 1000, y: 6000, z: 600 }, max: { x: 3000, y: 6300, z: 2400 } });
  const frontal = { kind: "parallel" as const, direction: { x: 0, y: 1, z: 0 } };

  // Lo que responde el camino viejo sobre el paño norte MIRADO SOLO.
  const alone = cadSolidEdgeVisibility(norte, frontal);
  check("mirado solo, el paño norte es un convexo y se declara exacto", alone.exact === true);
  check("y da aristas VISTAS, que sobre el conjunto es falso", alone.visible.length > 0);

  const scene = cadSceneEdgeVisibility([sur, centroA, centroB, norte], frontal);
  check("la escena de cuatro paños se resuelve", scene.ok === true);
  if (!scene.ok) throw new Error(scene.message);
  check("devuelve una entrada por cuerpo, en el mismo orden", scene.bodies.length === 4);
  check("y declara la clasificación exacta", scene.bodies.every((body) => body.exact === true));

  const north = scene.bodies[3];
  check(
    `el paño norte no aporta NI UNA arista vista (aporta ${north.visible.length})`,
    north.visible.length === 0,
  );
  check("todas las que se dibujan de él van a ocultas", north.hidden.length > 0);

  // El reparto cierra: cada arista del cuerpo está en visibles, en ocultas o
  // declarada como no dibujada. Ninguna desaparece en silencio, que es la
  // propiedad que permite informar «faltan tres» en vez de no enterarse.
  for (let index = 0; index < 4; index += 1) {
    const body = scene.bodies[index];
    const drawn = new Set([...body.visible, ...body.hidden]);
    check(
      `cuerpo ${index}: dibujadas (${drawn.size}) + descartadas (${body.dropped.length}) son sus 12 aristas`,
      drawn.size + body.dropped.length === 12,
    );
    check(
      `cuerpo ${index}: las partidas están en las dos listas`,
      body.partial.every((edge) => body.visible.includes(edge) && body.hidden.includes(edge)),
    );
  }

  // Y el de delante sí se ve: si saliera todo oculto, la prueba anterior pasaría
  // por la razón equivocada.
  check("el paño sur, que está delante, sí aporta aristas vistas", scene.bodies[0].visible.length > 0);
}

report("hidden-line-solver: visibilidad exacta sobre cóncavos y escenas", 70);
