/**
 * Qué aristas de un sólido SE VEN, y cuáles las tapa el propio sólido.
 *
 * ## Por qué esto no lo resuelve la tarjeta gráfica
 *
 * En el visor, el estilo Oculto se apoya en el búfer de profundidad: pinta las
 * caras del color del fondo y deja que la GPU esconda lo que hay detrás. Es
 * exacto y es gratis, y no sirve para nada de lo que NO pasa por una GPU: un
 * trazado a PDF, una exportación 2D, una proyección alámbrica de un sólido
 * sobre un plano, o una spec en Node. Ahí hay que SABER qué aristas se ven, no
 * dejar que se vea lo que toque.
 *
 * ## La regla, y hasta dónde es exacta
 *
 * Una cara mira a la cámara si su normal saliente apunta hacia ella. Una arista
 * queda tapada por el propio cuerpo cuando SUS DOS caras miran para el otro
 * lado. Es la clasificación clásica por caras traseras, y sobre un cuerpo
 * CONVEXO es exacta: no hay nada entre la arista y el ojo salvo caras que ya se
 * han descartado.
 *
 * Sobre un cuerpo cóncavo NO lo es, y decirlo importa más que la propia regla.
 * En un canal en U, una arista con una cara de frente puede quedar tapada por el
 * otro brazo de la misma pieza — y este módulo la dará por vista. Tampoco sabe
 * nada de un SEGUNDO cuerpo: una caja que está entera detrás de otra sigue
 * dando aquí nueve aristas vistas. Por eso el resultado declara `exact`: se
 * calcula midiendo los ángulos diedros, y sólo vale `true` cuando el cuerpo es
 * realmente convexo.
 *
 * ## Dónde ir cuando `exact` es `false`
 *
 * Hay dos salidas, y la que toque depende de para qué sea el resultado:
 *
 *  · **Para la pantalla**, el búfer de profundidad. Es lo que hace el visor:
 *    pinta las caras del color del fondo y deja que la GPU esconda lo de detrás.
 *  · **Para un PLANO**, `hidden-line-solver.ts`. Resuelve cóncavos y escenas de
 *    varios sólidos de forma analítica y exacta, y devuelve los segmentos ya
 *    partidos en la parte que se ve y la que no. Cuesta más —no es un gesto por
 *    cuadro— y es lo único que sirve para emitir geometría acotable.
 *
 * Lo que NO vale es consumir esto ignorando la bandera: es la diferencia entre
 * una optimización y un dibujo mal hecho.
 *
 * ## Aristas de borde
 *
 * Una lámina no tiene «dentro»: sus aristas de borde se ven desde los dos
 * lados. Se declaran siempre visibles, que es lo conservador y lo correcto.
 */
import {
  NO_INDEX,
  edgeDihedralAngle,
  faceCentroid,
  faceGeometricNormal,
  halfEdgeSegment,
  type BrepBody,
  type Vec3,
} from "../../brep";
import {
  cadEdgeVerdicts,
  cadHiddenLineDrawing,
  type CadHiddenLineDrawing,
  type CadHiddenLineFailure,
  type CadHiddenLineOptions,
} from "./hidden-line-solver";

/**
 * Desde dónde se mira.
 *
 * Paralela y perspectiva son dos preguntas distintas y no se pueden mezclar:
 * bajo perspectiva la dirección de mirada cambia de una cara a otra, y usar una
 * sola dirección para todo el cuerpo clasifica mal justo las caras del borde
 * del encuadre, que son las que más se notan.
 */
export type CadHiddenLineView =
  /** Proyección paralela: una sola dirección de mirada para todo el cuerpo. */
  | { kind: "parallel"; direction: Vec3 }
  /** Perspectiva: la dirección se recalcula cara a cara desde el ojo. */
  | { kind: "perspective"; eye: Vec3 };

export interface CadEdgeVisibility {
  /** Índices de arista que se ven. */
  visible: readonly number[];
  /** Índices de arista que el propio cuerpo tapa. */
  hidden: readonly number[];
  /** De las visibles, las de SILUETA: una cara de frente y otra de espaldas. */
  silhouette: readonly number[];
  /** Caras que miran a la cámara. */
  frontFaces: number;
  /**
   * `true` sólo si el cuerpo es convexo, es decir: si esta clasificación es
   * demostrablemente la verdad y no una aproximación. Ver la cabecera.
   */
  exact: boolean;
}

/**
 * Holgura del test de convexidad, en radianes.
 *
 * Un cuerpo salido de una booleana tiene aristas cuyo diedro vale π con error
 * de coma flotante —caras coplanares que la operación no fundió—, y tratarlas
 * como cóncavas declararía no convexo a un cubo perfectamente convexo. 1e-6 rad
 * son 0,00006°: por debajo del ruido y muy por encima del error de la cuenta.
 */
const CONVEXITY_TOLERANCE = 1e-6;

/** Umbral por debajo del cual una cara se considera «de canto», ni de frente ni de espaldas. */
const GRAZING_TOLERANCE = 1e-9;

function faceFacesViewer(body: BrepBody, face: number, view: CadHiddenLineView): boolean {
  const normal = faceGeometricNormal(body, face);
  if (view.kind === "parallel") {
    // La normal apunta hacia FUERA; la dirección de mirada va del ojo a la
    // escena. La cara mira al observador cuando las dos se oponen.
    return normal.x * view.direction.x + normal.y * view.direction.y + normal.z * view.direction.z <
      -GRAZING_TOLERANCE;
  }
  const centroid = faceCentroid(body, face);
  const toEye = {
    x: view.eye.x - centroid.x,
    y: view.eye.y - centroid.y,
    z: view.eye.z - centroid.z,
  };
  return normal.x * toEye.x + normal.y * toEye.y + normal.z * toEye.z > GRAZING_TOLERANCE;
}

/**
 * ¿Es convexo el cuerpo? Todas sus aristas interiores tienen diedro ≤ π.
 *
 * Se mide sobre el ángulo diedro que ya calcula el kernel en vez de inventar
 * otra prueba: un cuerpo con una sola arista reflexiva deja de ser convexo, y
 * ésa es exactamente la condición que rompe la clasificación por caras
 * traseras.
 */
export function cadBodyIsConvex(body: BrepBody): boolean {
  for (let edge = 0; edge < body.edges.length; edge += 1) {
    const angle = edgeDihedralAngle(body, edge);
    if (angle === null) return false;
    if (angle > Math.PI + CONVEXITY_TOLERANCE) return false;
  }
  return body.edges.length > 0;
}

/**
 * Clasifica las aristas de un cuerpo según se vean o no desde `view`.
 *
 * Coste: una normal y un centroide por cara, más una consulta por arista. Es
 * O(V+E+F) sin estructuras auxiliares, que es lo que permite llamarlo al girar
 * la vista sin que el giro se salga del cuadro.
 */
export function cadSolidEdgeVisibility(
  body: BrepBody,
  view: CadHiddenLineView,
): CadEdgeVisibility {
  const front = new Array<boolean>(body.faces.length);
  let frontFaces = 0;
  for (let face = 0; face < body.faces.length; face += 1) {
    front[face] = faceFacesViewer(body, face, view);
    if (front[face]) frontFaces += 1;
  }

  const visible: number[] = [];
  const hidden: number[] = [];
  const silhouette: number[] = [];
  for (let edge = 0; edge < body.edges.length; edge += 1) {
    const { a, b } = body.edges[edge];
    if (a === NO_INDEX) continue;
    const faceA = body.loops[body.halfEdges[a].loop].face;
    // Arista de borde: una lámina se ve por los dos lados y no tapa nada.
    if (b === NO_INDEX) {
      visible.push(edge);
      continue;
    }
    const faceB = body.loops[body.halfEdges[b].loop].face;
    const frontA = front[faceA];
    const frontB = front[faceB];
    if (!frontA && !frontB) {
      hidden.push(edge);
      continue;
    }
    visible.push(edge);
    if (frontA !== frontB) silhouette.push(edge);
  }

  return {
    visible,
    hidden,
    silhouette,
    frontFaces,
    exact: cadBodyIsConvex(body),
  };
}

/**
 * Aristas que un estilo visual con caras opacas debería DIBUJAR, ya en forma de
 * segmentos.
 *
 * Se filtran además las aristas casi planas: dos caras coplanares comparten una
 * arista que topológicamente existe y que nadie quiere ver dibujada — es la
 * misma regla del umbral de `EdgesGeometry`, aplicada sobre el diedro real en
 * vez de sobre el de una malla ya triangulada, que es donde ese umbral se
 * equivoca.
 */
export function cadVisibleEdgeSegments(
  body: BrepBody,
  view: CadHiddenLineView,
  featureAngleDeg = 20,
): { from: Vec3; to: Vec3 }[] {
  const visibility = cadSolidEdgeVisibility(body, view);
  const threshold = (featureAngleDeg * Math.PI) / 180;
  const segments: { from: Vec3; to: Vec3 }[] = [];
  for (const edge of visibility.visible) {
    const angle = edgeDihedralAngle(body, edge);
    if (angle !== null && Math.abs(angle - Math.PI) < threshold) continue;
    segments.push(halfEdgeSegment(body, body.edges[edge].a));
  }
  return segments;
}

/**
 * Dirección de mirada en coordenadas de DIBUJO a partir de una de ESCENA.
 *
 * El editor pone el dibujo sobre XZ y la altura en Y; un sólido tiene z real.
 * La permutación es la misma que aplica `solid3d-three.ts` a las posiciones, y
 * está aquí para que quien tiene la cámara (que habla en escena) pueda
 * preguntarle a este módulo (que habla en dibujo) sin reinventarla.
 */
export function cadDrawingDirectionFromScene(scene: Vec3): Vec3 {
  return { x: scene.x, y: scene.z, z: scene.y };
}

// ---------------------------------------------------------------------------
// La puerta multicuerpo
// ---------------------------------------------------------------------------

/**
 * Visibilidad de las aristas de UN cuerpo frente a TODA la escena.
 *
 * Es `CadEdgeVisibility` con dos listas más, y las dos existen porque la verdad
 * no cabe en «vista u oculta»:
 *
 *  · `partial` son las aristas que se ven a trozos —un muro tapa la mitad de
 *    baja de la esquina del de detrás—. Aparecen a la vez en `visible` y en
 *    `hidden`, para que quien sólo mire aquellas dos listas siga funcionando y
 *    dibuje esa arista de las dos formas encima de sí misma, que es feo pero no
 *    es mentira. Quien quiera partirla de verdad tiene los segmentos.
 *  · `dropped` son las que NO se dibujan: costuras suaves entre dos facetas del
 *    mismo cilindro, o aristas que apuntan al observador y se proyectan a un
 *    punto. Están declaradas en vez de desaparecer, porque «faltan tres
 *    aristas» y «tres aristas no se dibujan a propósito» son informes distintos.
 */
export interface CadSceneEdgeVisibility extends CadEdgeVisibility {
  partial: readonly number[];
  dropped: readonly number[];
}

export interface CadSceneVisibility {
  ok: true;
  /** Una entrada por cuerpo, en el MISMO orden en que entraron. */
  bodies: readonly CadSceneEdgeVisibility[];
  /** El dibujo completo, por si hace falta la geometría y no sólo el veredicto. */
  drawing: CadHiddenLineDrawing;
}

export type CadSceneVisibilityOutcome = CadSceneVisibility | CadHiddenLineFailure;

/**
 * Qué se ve, cuando hay MÁS DE UN CUERPO y pueden taparse entre ellos.
 *
 * Ésta es la función que hay que llamar para dibujar un alzado. La de arriba
 * —`cadSolidEdgeVisibility`— mira un cuerpo contra la cámara y no sabe que
 * existe un segundo: con cuatro prismas en fila, el muro de atrás sale entero
 * como visto aunque el de delante lo tape en el mismo punto del papel. Aquí no:
 * cada arista se clasifica contra el conjunto, con el solucionador analítico de
 * `hidden-line-solver.ts`.
 *
 * ## Qué promete `exact`, y qué no
 *
 * Sale `true` siempre que la función devuelve un resultado, y no es un `true`
 * de cortesía: sobre las caras PLANAS que se le dan, la clasificación es la
 * verdad geométrica y no una heurística. Lo que ese `true` no promete está en
 * la cabecera de `hidden-line-solver.ts` y son propiedades del MODELO, no del
 * algoritmo: la silueta de un cilindro es la de su prisma facetado, dos sólidos
 * que se interpenetran sin haber pasado por una booleana no dibujan la curva
 * donde se cruzan, y dos caras coplanarias que empatan en profundidad se
 * resuelven a favor de dibujar. Cuando no puede responder, no devuelve un
 * `exact: false`: devuelve un fallo con su código.
 *
 * `frontFaces` se conserva por compatibilidad y se calcula como antes, contando
 * caras que miran al observador; con varios cuerpos es un dato por cuerpo y no
 * de la escena.
 */
/** Cuántas caras del cuerpo miran al observador. */
function frontFacingCount(body: BrepBody, view: CadHiddenLineView): number {
  let count = 0;
  for (let face = 0; face < body.faces.length; face += 1)
    if (faceFacesViewer(body, face, view)) count += 1;
  return count;
}

export function cadSceneEdgeVisibility(
  bodies: readonly BrepBody[],
  view: CadHiddenLineView,
  options: CadHiddenLineOptions = {},
): CadSceneVisibilityOutcome {
  const drawing = cadHiddenLineDrawing(bodies, view, options);
  if (!drawing.ok) return drawing;

  // Las siluetas se agrupan por cuerpo en UNA pasada. Recorrer los segmentos
  // dentro del bucle de cuerpos costaría cuerpos × segmentos, y con una planta
  // de cuatrocientos sólidos eso son millones de comparaciones para rellenar una
  // lista que ya está delante.
  const silhouettes = new Map<number, Set<number>>();
  for (const segment of drawing.visible) {
    if (!segment.silhouette) continue;
    let set = silhouettes.get(segment.body);
    if (!set) {
      set = new Set<number>();
      silhouettes.set(segment.body, set);
    }
    set.add(segment.edge);
  }

  const perBody = bodies.map((body, index) => {
    const verdicts = cadEdgeVerdicts(drawing, index);
    const visible: number[] = [];
    const hidden: number[] = [];
    const partial: number[] = [];
    const dropped: number[] = [];
    for (let edge = 0; edge < body.edges.length; edge += 1) {
      const verdict = verdicts.get(edge);
      if (verdict === undefined) {
        dropped.push(edge);
        continue;
      }
      // Una arista partida entra en las DOS listas a propósito: ver arriba.
      if (verdict !== "hidden") visible.push(edge);
      if (verdict !== "visible") hidden.push(edge);
      if (verdict === "partial") partial.push(edge);
    }
    return {
      visible,
      hidden,
      partial,
      dropped,
      silhouette: [...(silhouettes.get(index) ?? [])].sort((a, b) => a - b),
      // Se cuenta a mano en vez de reutilizar `cadSolidEdgeVisibility`: aquélla
      // arrastra el test de convexidad, que mide un diedro por arista, y aquí la
      // convexidad ya no decide nada. Pagar un ángulo por arista para rellenar
      // un contador sería el clásico coste que nadie mira.
      frontFaces: frontFacingCount(body, view),
      exact: true,
    } satisfies CadSceneEdgeVisibility;
  });

  return { ok: true, bodies: perBody, drawing };
}
