/**
 * UNION, SUBTRACT, INTERSECT, FILLETEDGE, CHAMFEREDGE, SLICE y SECTION.
 *
 * ## Las booleanas NO evalúan nada al ejecutarse: FUNDEN ÁRBOLES
 *
 * Restar dos sólidos podría resolverse evaluando los dos cuerpos, llamando al
 * kernel y guardando el resultado. Sería más corto y destruiría la propiedad que
 * justifica el esquema 5: el sólido dejaría de ser reeditable. Aquí se construye
 * un árbol NUEVO que contiene los dos árboles de entrada más un nodo `subtract`,
 * de modo que después se puede seguir cambiando la altura de la extrusión que
 * hay tres operaciones más abajo y toda la pieza se rehace.
 *
 * El precio son los NOMBRES: dos árboles independientes traen casi siempre un
 * nodo llamado `perfil`, porque es el que escribe EXTRUDE. Fundirlos sin
 * renombrar haría que uno pisara al otro y la resta tomase el operando
 * equivocado —sin ningún error, con una pieza plausible—. De ahí `prefixNodes`.
 *
 * ## FILLETEDGE y CHAMFEREDGE: qué aristas, y por qué no todas
 *
 * Designar una arista concreta exige poder pincharla, y el viewport 2D designa
 * entidades. Mientras tanto la lista vacía significa «el juego compatible», que
 * `preferredFeatureEdges` resuelve dando prioridad a las verticales: en un prisma
 * extruido eso son exactamente las esquinas que se ven en planta, que es lo que
 * un dibujante quiere redondear.
 *
 * No es «todas», y la razón no es pereza: el kernel no sabe fundir dos redondeos
 * que se encuentran en un vértice —haría falta una transición esférica que no
 * implementa— y se niega, correctamente, antes de producir astillas degeneradas.
 * Hay además una fragilidad conocida de las booleanas encadenadas: cada corte
 * fragmenta el cuerpo en caras coplanarias, y el tercero o el cuarto puede
 * fallar sobre ciertas topologías con tamaños de chaflán pequeños. Cuando pasa,
 * la orden termina con el mensaje del kernel y NO escribe — que es la
 * diferencia entre «no se pudo» y «el documento quedó con un sólido roto».
 *
 * Desde el 2026-09-04 el remedio EXISTE y es manual: `SOLIDEDIT Cuerpo Limpiar`
 * funde las coplanarias del sólido designado (`mergeCoplanarFaces` en
 * `lib/brep/coplanar-merge.ts`) y devuelve la caja de 200×100×50 a sus 6 caras.
 * No se aplica sola aquí a propósito: la fusión HORNEA el cuerpo como geometría
 * explícita, y un FILLETEDGE que además borrase el árbol paramétrico del sólido
 * sin que nadie lo pidiera sería una orden que hace dos cosas.
 *
 * Cuando exista la designación de aristas, el nodo ya guarda sus índices: el
 * esquema no cambia.
 *
 * ## SLICE devuelve un sólido REEDITABLE y SECTION una región
 *
 * Son operaciones distintas y se distinguen en el resultado: SLICE deja el sólido
 * cortado (con su nodo `slice` en el árbol, así que se puede mover el plano
 * después) y SECTION deja la REGION de la huella del corte, que es un objeto 2D
 * acotable y sombreable.
 *
 * Lo que las dos comparten desde el 2026-09-17 es la NEGACIÓN: un plano que no
 * atraviesa el sólido no produce sección en SECTION y tampoco produce corte en
 * SLICE, y las dos lo DICEN en vez de escribir algo que no cambia nada. Ver
 * `planoDivide`.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadSolid3dEntity, CadSolidNode, CadSolidPlacement } from "../../cad-entities-v5";
import type { CadEntityCommand } from "../../entity-commands";
import {
  bodyToSolidNode,
  evaluateSolidTree,
  placeBody,
  resolveSolidPlacement,
  solid3dBody,
} from "../../solid3d-build";
import { cadSolidWorldPlaneToLocal } from "../../solid3d-plane";
import { sectionLoopsOfSolid } from "../../solid3d-section";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_EDGE_PICK,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import {
  finishedSolid,
  makeSolidEntity,
  prefixNodes,
  selectedFlattenableBodies,
  selectedSolids,
  solidBatch,
  solidCancelled,
  solidMessage,
} from "./solids-support";

interface SolidSelectionState {
  selection: readonly string[];
}

const NO_SOLIDS = "Esta orden necesita SOLID3D designados. Crea uno con EXTRUDE, REVOLVE, SWEEP o LOFT.";

/** Colocación de `next` expresada en el marco local de `first` (A⁻¹·B). */
function relativePlacement(
  first: Required<CadSolidPlacement>,
  next: Required<CadSolidPlacement>,
): Required<CadSolidPlacement> {
  // La 3×3 es: | a    c   m02 |
  //            | b    d   m12 |
  //            | m20 m21 m22  |
  const det =
    first.a * (first.d * first.m22 - first.m12 * first.m21) -
    first.c * (first.b * first.m22 - first.m12 * first.m20) +
    first.m02 * (first.b * first.m21 - first.d * first.m20);
  if (!(Math.abs(det) > 1e-30)) return { ...resolveSolidPlacement() };
  const invDet = 1 / det;
  // Adjunta (traspuesta de la matriz de cofactores) / det.
  const r0c0 = (first.d * first.m22 - first.m12 * first.m21) * invDet;
  const r1c0 = (first.m12 * first.m20 - first.b * first.m22) * invDet;
  const r2c0 = (first.b * first.m21 - first.d * first.m20) * invDet;
  const r0c1 = (first.m02 * first.m21 - first.c * first.m22) * invDet;
  const r1c1 = (first.a * first.m22 - first.m02 * first.m20) * invDet;
  const r2c1 = (first.c * first.m20 - first.a * first.m21) * invDet;
  const r0c2 = (first.c * first.m12 - first.d * first.m02) * invDet;
  const r1c2 = (first.b * first.m02 - first.a * first.m12) * invDet;
  const r2c2 = (first.a * first.d - first.b * first.c) * invDet;
  // Traslación relativa: A⁻¹·(tB − tA)
  const dtx = next.e + next.tx - (first.e + first.tx);
  const dty = next.f + next.ty - (first.f + first.ty);
  const dtz = next.dz + next.tz - (first.dz + first.tz);
  const etx = r0c0 * dtx + r0c1 * dty + r0c2 * dtz;
  const ety = r1c0 * dtx + r1c1 * dty + r1c2 * dtz;
  const etz = r2c0 * dtx + r2c1 * dty + r2c2 * dtz;
  // A⁻¹ · B (3×3)
  return {
    a: r0c0 * next.a + r0c1 * next.b + r0c2 * next.m20,
    b: r1c0 * next.a + r1c1 * next.b + r1c2 * next.m20,
    c: r0c0 * next.c + r0c1 * next.d + r0c2 * next.m21,
    d: r1c0 * next.c + r1c1 * next.d + r1c2 * next.m21,
    e: etx,
    f: ety,
    dz: etz,
    m02: r0c0 * next.m02 + r0c1 * next.m12 + r0c2 * next.m22,
    m12: r1c0 * next.m02 + r1c1 * next.m12 + r1c2 * next.m22,
    m20: r2c0 * next.a + r2c1 * next.b + r2c2 * next.m20,
    m21: r2c0 * next.c + r2c1 * next.d + r2c2 * next.m21,
    m22: r2c0 * next.m02 + r2c1 * next.m12 + r2c2 * next.m22,
    tx: 0,
    ty: 0,
    tz: 0,
  };
}

/** `true` cuando la colocación es la identidad (no requiere hornear). */
function isIdentityPlacement(p: Required<CadSolidPlacement>): boolean {
  return (
    p.a === 1 && p.b === 0 && p.c === 0 && p.d === 1 &&
    p.e === 0 && p.f === 0 && p.dz === 0 &&
    p.m02 === 0 && p.m12 === 0 &&
    p.m20 === 0 && p.m21 === 0 && p.m22 === 1 &&
    p.tx === 0 && p.ty === 0 && p.tz === 0
  );
}

function designate<S extends SolidSelectionState>(state: S, message: string): CadCommandStep<S> {
  return { state, prompt: { message, options: [] }, accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK };
}

// ---------------------------------------------------------------------------
// Booleanas
// ---------------------------------------------------------------------------

type BooleanOp = "union" | "subtract" | "intersect";

function booleanDescriptor(
  name: string,
  aliases: readonly string[],
  op: BooleanOp,
  prompt: string,
): CadCommandDescriptor<SolidSelectionState> {
  return {
    name,
    aliases,
    kind: "modify",
    transparent: false,
    selection: "optional",
    repeatable: true,
    mutates: true,
    cursor: "pick",
    // Con una designación PREVIA suficiente, la orden se ejecuta al teclearla.
    // Es la semántica PICKFIRST de AutoCAD y la que ya tienen ERASE y
    // AUTOCONSTRAIN: pedir un Intro de confirmación sobre objetos que el usuario
    // acaba de designar es un paso que no decide nada.
    begin: (context) =>
      selectedSolids(context, context.selection).length >= 2
        ? execute({ selection: context.selection }, context)
        : designate({ selection: context.selection }, prompt),
    step: (state, input, context) => {
      if (input.kind === "cancel") return solidCancelled(state);
      if (input.kind === "selection") return designate({ selection: input.entityIds }, prompt);
      if (input.kind === "entityPick")
        return designate({ selection: [...new Set([...state.selection, input.entityId])] }, prompt);
      if (input.kind !== "enter") return designate(state, prompt);
      return execute(state, context);
    },
  };

  function execute(
    state: SolidSelectionState,
    context: CadCommandContext,
  ): CadCommandStep<SolidSelectionState> {
    const solids = selectedSolids(context, state.selection);
    if (solids.length < 2)
      return solidMessage(state, `${name} necesita al menos DOS sólidos designados; hay ${solids.length}.`);

    const firstPlacement = resolveSolidPlacement(solids[0].placement);

    const nodes: CadSolidNode[] = [];
    const roots: string[] = [];
    const removals: CadEntityCommand[] = [];
    for (const [index, solid] of solids.entries()) {
      const prefix = `op${index}:`;
      if (index === 0) {
        nodes.push(...prefixNodes(solid.nodes, prefix));
        roots.push(`${prefix}${solid.root}`);
      } else {
        // El operando no-primero necesita su colocación RELATIVA horneada
        // en los nodos, porque el evaluador sólo aplica la colocación del
        // resultado (la del primer operando) al final. Si la colocación
        // relativa es la identidad, conserva su subárbol paramétrico.
        const ownPlacement = resolveSolidPlacement(solid.placement);
        const rel = relativePlacement(firstPlacement, ownPlacement);
        if (isIdentityPlacement(rel)) {
          nodes.push(...prefixNodes(solid.nodes, prefix));
          roots.push(`${prefix}${solid.root}`);
        } else {
          const rawBody = evaluateSolidTree(solid, { skipPlacement: true });
          const positioned = placeBody(rawBody, rel);
          nodes.push(bodyToSolidNode(positioned, `${prefix}baked`));
          roots.push(`${prefix}baked`);
        }
      }
      removals.push({ type: "delete", entityId: solid.id });
    }
    const rootId = "resultado";
    nodes.push({ id: rootId, op, operands: roots } as CadSolidNode);

    // La colocación del PRIMER operando manda: el resultado «es» la primera
    // pieza con la operación aplicada, y conservar su punto base hace que los
    // grips y las cotas que la apuntaban sigan significando lo mismo.
    const solid = makeSolidEntity(
      context.newEntityId(),
      nodes,
      rootId,
      solids[0].layer,
      solids[0].name,
    );
    const placed = solids[0].placement ? { ...solid, placement: solids[0].placement } : solid;
    return finishedSolid(placed, { state, label: name, before: removals });
  }
}

// ---------------------------------------------------------------------------
// FILLETEDGE / CHAMFEREDGE
// ---------------------------------------------------------------------------

type EdgeFeatureState = SolidSelectionState & {
  /** Aristas designadas por el usuario. Vacío = usar preferredFeatureEdges. */
  pickedEdges: { entityId: string; edge: number }[];
};

function edgeFeatureDescriptor(
  name: string,
  op: "fillet" | "chamfer",
  magnitude: string,
): CadCommandDescriptor<EdgeFeatureState> {
  const prompt = `Designe los sólidos cuyas aristas ${op === "fillet" ? "redondear" : "achaflanar"}`;
  const step = (state: EdgeFeatureState): CadCommandStep<EdgeFeatureState> => {
    if (state.selection.length === 0) return designate(state, prompt);
    const edgeInfo = state.pickedEdges.length > 0
      ? ` (${state.pickedEdges.length} arista(s) designada(s))`
      : " (se aplica al juego de aristas compatibles)";
    return {
      state,
      prompt: { message: `Precise ${magnitude}${edgeInfo}`, options: [] },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT | CAD_ACCEPT_EDGE_PICK,
    };
  };
  return {
    name,
    aliases: [],
    kind: "modify",
    transparent: false,
    selection: "optional",
    repeatable: true,
    mutates: true,
    cursor: "pick",
    begin: (context) => step({ selection: context.selection, pickedEdges: [] }),
    step: (state, input, context) => {
      if (input.kind === "cancel") return solidCancelled(state);
      if (input.kind === "selection") return step({ ...state, selection: input.entityIds });
      if (input.kind === "entityPick")
        return step({ ...state, selection: [...new Set([...state.selection, input.entityId])] });
      if (input.kind === "edgePick") {
        // Acumular la arista designada. El índice se mapea al cuerpo evaluado.
        return step({ ...state, pickedEdges: [...state.pickedEdges, { entityId: input.entityId, edge: input.edge }] });
      }
      if (input.kind !== "distance") {
        if (input.kind === "enter" && state.selection.length === 0) return solidMessage(state, NO_SOLIDS);
        return step(state);
      }
      const size = Math.abs(input.value);
      if (!(size > 1e-9)) return solidMessage(state, `${name} necesita ${magnitude} mayor que cero.`);

      const solids = selectedSolids(context, state.selection);
      if (solids.length === 0) return solidMessage(state, NO_SOLIDS);
      const commands: CadEntityCommand[] = [];
      for (const source of solids) {
        const nodes: CadSolidNode[] = [...source.nodes];
        const rootId = `${op}:${nodes.length}`;
        // Si el usuario designó aristas, usarlas; si no, dejar que
        // preferredFeatureEdges elija (edges: [] = auto-selección).
        const pickedForSource = state.pickedEdges
          .filter((e) => e.entityId === source.id)
          .map((e) => e.edge);
        nodes.push(
          op === "fillet"
            ? { id: rootId, op: "fillet", operand: source.root, edges: pickedForSource, radius: size, segments: 8 }
            : { id: rootId, op: "chamfer", operand: source.root, edges: pickedForSource, distance: size },
        );
        const next = {
          ...makeSolidEntity(source.id, nodes, rootId, source.layer, source.name),
          ...(source.placement ? { placement: source.placement } : {}),
        };
        const structural = finishedSolid(next, { state, label: name });
        if (structural.result?.kind !== "document") return structural;
        // `replace` y no borrar+crear: conserva el id, su sitio en el orden de
        // dibujo y las referencias que apunten al sólido.
        commands.push({ type: "replace", entityId: source.id, entity: next });
      }
      return solidBatch(state, commands, name);
    },
  };
}

// ---------------------------------------------------------------------------
// SLICE / SECTION
// ---------------------------------------------------------------------------

interface PlaneState extends SolidSelectionState {
  first: CadPoint2 | null;
  second: CadPoint2 | null;
  /** Modo de plano elegido: por dos puntos (null) o por plano coordenado. */
  planeMode: "XY" | "YZ" | "ZX" | null;
  /** Cota del plano coordenado, cuando planeMode no es null. */
  planeElevation: number | null;
}

const KEEP_LEFT = { keyword: "Izquierda", shortcut: "I" } as const;
const KEEP_RIGHT = { keyword: "Derecha", shortcut: "D" } as const;
const KEEP_BOTH = { keyword: "Ambos", shortcut: "A" } as const;
// Keywords para planos coordenados: "Izquierda"/"Derecha" no significan nada
// en XY (arriba/abajo) ni en YZ/ZX (positivo/negativo del eje perpendicular).
const KEEP_UP = { keyword: "Arriba", shortcut: "AR" } as const;
const KEEP_DOWN = { keyword: "Abajo", shortcut: "AB" } as const;
const KEEP_POS_X = { keyword: "Positivo X", shortcut: "PX" } as const;
const KEEP_NEG_X = { keyword: "Negativo X", shortcut: "NX" } as const;
const KEEP_POS_Y = { keyword: "Positivo Y", shortcut: "PY" } as const;
const KEEP_NEG_Y = { keyword: "Negativo Y", shortcut: "NY" } as const;
const PLANE_XY = { keyword: "XY", shortcut: "XY" } as const;
const PLANE_YZ = { keyword: "YZ", shortcut: "YZ" } as const;
const PLANE_ZX = { keyword: "ZX", shortcut: "ZX" } as const;
const PLANE_OPTIONS = [PLANE_XY, PLANE_YZ, PLANE_ZX] as const;

/**
 * Plano VERTICAL que pasa por dos puntos del dibujo.
 *
 * Es el único plano de corte que un viewport 2D puede precisar sin inventar una
 * tercera coordenada: la recta que se traza en planta, extruida en Z. La normal
 * apunta a la IZQUIERDA del recorrido, de modo que «Izquierda» y «Derecha» en el
 * prompt significan lo que se ve.
 */
function verticalPlane(first: CadPoint2, second: CadPoint2) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const length = Math.hypot(dx, dy);
  return {
    origin: { x: first.x, y: first.y, z: 0 },
    normal: { x: -dy / length, y: dx / length, z: 0 },
  };
}

/**
 * Plano coordenado: XY (horizontal), YZ (vertical lateral) o ZX (vertical frontal).
 *
 * En AutoCAD, `SLICE XY 3000` corta por el plano horizontal a cota 3000.
 * La normal apunta en la dirección positiva del eje perpendicular al plano.
 */
function coordinatePlane(mode: "XY" | "YZ" | "ZX", elevation: number) {
  if (mode === "XY")
    return { origin: { x: 0, y: 0, z: elevation }, normal: { x: 0, y: 0, z: 1 } };
  if (mode === "YZ")
    return { origin: { x: elevation, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } };
  // ZX
  return { origin: { x: 0, y: elevation, z: 0 }, normal: { x: 0, y: 1, z: 0 } };
}

function planeStep<S extends PlaneState>(state: S, prompt: string, final: string): CadCommandStep<S> {
  if (state.selection.length === 0) return designate(state, prompt);
  if (state.planeMode && state.planeElevation === null)
    return {
      state,
      prompt: { message: `Precise la cota del plano ${state.planeMode}`, options: [] },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT,
    };
  if (!state.first && !state.planeMode)
    return {
      state,
      prompt: { message: "Precise el primer punto del plano de corte", options: [...PLANE_OPTIONS] },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  if (!state.planeMode && !state.second)
    return {
      state,
      prompt: { message: "Precise el segundo punto del plano de corte", options: [] },
      accepts: CAD_ACCEPT_POINT,
      preview: state.first ? [{ points: [state.first, state.first] }] : undefined,
    };
  // Keywords dependen del tipo de plano: Izquierda/Derecha sólo tiene sentido
  // en planos verticales (verticalPlane). Para coordenados se usan Arriba/Abajo
  // o Positivo/Negativo del eje perpendicular.
  const sideOptions = state.planeMode === "XY"
    ? [KEEP_UP, KEEP_DOWN, KEEP_BOTH] as const
    : state.planeMode === "YZ"
      ? [KEEP_POS_X, KEEP_NEG_X, KEEP_BOTH] as const
      : state.planeMode === "ZX"
        ? [KEEP_POS_Y, KEEP_NEG_Y, KEEP_BOTH] as const
        : [KEEP_LEFT, KEEP_RIGHT, KEEP_BOTH] as const;
  const defaultSide = sideOptions[0].keyword;
  return {
    state,
    prompt: { message: final, options: [...sideOptions], defaultOption: defaultSide },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

/**
 * ¿El plano DIVIDE el sólido, o pasa de largo?
 *
 * El agujero que cierra: SLICE no comprobaba en ningún sitio que el plano
 * atravesara el sólido. Con un plano que pasa de largo —el que le da la sonda
 * de integridad de comandos: (10,10)→(80,40) contra dos cajas que viven en
 * y∈[200,290]— todos los vértices caen del lado positivo, así que «conservar
 * el positivo» conserva el cuerpo ENTERO: mismo volumen (240000), misma área
 * (24800) y los mismos 12 triángulos, medido con los evaluadores del producto.
 * La orden apilaba igual su nodo `slice`, repuntaba la raíz y escribía el lote
 * sin decir una palabra. El documento cambiaba —el árbol lleva un nodo más— y
 * `finishedSolid` no tenía por qué rechazarlo: sólo sabe rechazar un cuerpo
 * ROTO, y una caja sin cortar es perfectamente válida.
 *
 * Se decide con los VÉRTICES y el signo de su distancia al plano, y la
 * respuesta es exacta en las dos direcciones porque un vértice es material:
 *
 * - si ninguno queda estrictamente a un lado y otro estrictamente al otro, todo
 *   el cuerpo está en un semiespacio y el corte no quita nada (conservando ese
 *   lado queda el sólido entero; conservando el otro, el sólido VACÍO, que el
 *   kernel se niega a montar);
 * - si hay vértices de los dos lados, hay material de los dos lados, y
 *   entonces cualquiera de los dos lados que se conserve quita algo de verdad.
 *
 * Por eso no se compara el cuerpo resultante con el de origen: eso obligaría a
 * evaluar las dos mitades para distinguir «no cortó» de «el kernel no pudo», y
 * los dos casos tienen mensajes distintos.
 *
 * El cuerpo se evalúa SIN la colocación de la entidad a propósito: el nodo
 * `slice` corta el árbol ANTES de que `evaluateSolidTree` le aplique el
 * `placement`, así que el cuerpo que el kernel corta es el de coordenadas
 * locales. Clasificar contra el cuerpo colocado mediría otro sólido. (Que SLICE
 * construya el plano con picados de MUNDO y se lo dé a un nodo que trabaja en
 * local es un defecto aparte, anterior a esto y de otro alcance.)
 */
function planoDivide(
  source: CadSolid3dEntity,
  plane: { origin: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } },
): boolean {
  const { placement: _colocacion, ...sinColocar } = source;
  const body = solid3dBody(sinColocar);
  const largo = Math.hypot(plane.normal.x, plane.normal.y, plane.normal.z);
  if (!(largo > 0)) return false;
  // La tolerancia es ABSOLUTA y se escala con el tamaño del cuerpo, igual que en
  // `sectionLoopsOfSolid`: una fija clasificaría mal los vértices de una nave de
  // cien metros.
  let escala = 1;
  for (const vertex of body.vertices)
    escala = Math.max(escala, Math.abs(vertex.point.x), Math.abs(vertex.point.y), Math.abs(vertex.point.z));
  const tolerancia = 1e-9 * escala;
  let positivo = false;
  let negativo = false;
  for (const vertex of body.vertices) {
    const distancia =
      ((vertex.point.x - plane.origin.x) * plane.normal.x +
        (vertex.point.y - plane.origin.y) * plane.normal.y +
        (vertex.point.z - plane.origin.z) * plane.normal.z) /
      largo;
    if (distancia > tolerancia) positivo = true;
    else if (distancia < -tolerancia) negativo = true;
    if (positivo && negativo) return true;
  }
  return false;
}

const slicePrompt = "Designe los sólidos que cortar";

const sliceCommand: CadCommandDescriptor<PlaneState> = {
  name: "SLICE",
  aliases: ["SL"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => planeStep({ selection: context.selection, first: null, second: null, planeMode: null, planeElevation: null }, slicePrompt, "¿Qué lado se conserva?"),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);
    if (input.kind === "selection")
      return planeStep({ ...state, selection: input.entityIds }, slicePrompt, "¿Qué lado se conserva?");
    if (input.kind === "entityPick")
      return planeStep({ ...state, selection: [...new Set([...state.selection, input.entityId])] }, slicePrompt, "¿Qué lado se conserva?");

    // Palabras clave XY/YZ/ZX: elegir plano coordenado.
    if (input.kind === "keyword" && !state.first && !state.planeMode) {
      const mode = input.keyword === PLANE_XY.keyword ? "XY"
        : input.keyword === PLANE_YZ.keyword ? "YZ"
          : input.keyword === PLANE_ZX.keyword ? "ZX" : null;
      if (mode)
        return planeStep({ ...state, planeMode: mode }, slicePrompt, "¿Qué lado se conserva?");
    }

    // Cota del plano coordenado.
    if (state.planeMode && state.planeElevation === null) {
      if (input.kind === "distance") {
        return planeStep({ ...state, planeElevation: input.value }, slicePrompt, "¿Qué lado se conserva?");
      }
      if (input.kind === "point") {
        const elevation = state.planeMode === "YZ" ? input.point.x
          : state.planeMode === "ZX" ? input.point.y
            : (input.point as { z?: number }).z ?? 0;
        return planeStep({ ...state, planeElevation: elevation }, slicePrompt, "¿Qué lado se conserva?");
      }
      // Enter, text u otra entrada: no avanzar.
      return planeStep(state, slicePrompt, "¿Qué lado se conserva?");
    }

    if (input.kind === "point") {
      if (!state.first) return planeStep({ ...state, first: input.point }, slicePrompt, "¿Qué lado se conserva?");
      if (!state.second) {
        if (Math.hypot(input.point.x - state.first.x, input.point.y - state.first.y) < 1e-9)
          return solidMessage(state, "Los dos puntos del corte son el mismo: no definen ningún plano.");
        return planeStep({ ...state, second: input.point }, slicePrompt, "¿Qué lado se conserva?");
      }
      return planeStep(state, slicePrompt, "¿Qué lado se conserva?");
    }
    if (!state.planeMode && (!state.first || !state.second)) {
      if (input.kind === "enter" && state.selection.length === 0) return solidMessage(state, NO_SOLIDS);
      return planeStep(state, slicePrompt, "¿Qué lado se conserva?");
    }
    if (input.kind !== "keyword" && input.kind !== "enter") return planeStep(state, slicePrompt, "¿Qué lado se conserva?");

    // Default keyword depende del plano coordenado.
    const defaultKeyword = state.planeMode === "XY" ? KEEP_UP.keyword
      : state.planeMode === "YZ" ? KEEP_POS_X.keyword
        : state.planeMode === "ZX" ? KEEP_POS_Y.keyword
          : KEEP_LEFT.keyword;
    const keyword = input.kind === "keyword" ? input.keyword : defaultKeyword;
    const solids = selectedSolids(context, state.selection);
    if (solids.length === 0) return solidMessage(state, NO_SOLIDS);
    const plane = state.planeMode
      ? coordinatePlane(state.planeMode, state.planeElevation ?? 0)
      : verticalPlane(state.first!, state.second!);
    // Traducir keyword a lado positivo/negativo.
    const isNegativeSide = keyword === KEEP_RIGHT.keyword || keyword === KEEP_DOWN.keyword
      || keyword === KEEP_NEG_X.keyword || keyword === KEEP_NEG_Y.keyword;
    const sides: ("positive" | "negative")[] =
      keyword === KEEP_BOTH.keyword
        ? ["positive", "negative"]
        : [isNegativeSide ? "negative" : "positive"];

    const commands: CadEntityCommand[] = [];
    const intactos: string[] = [];
    for (const source of solids) {
      // Transformar el plano a coordenadas locales del sólido para que el
      // corte ocurra a la cota correcta cuando hay colocación (tz, dz, etc.).
      const localPlane = cadSolidWorldPlaneToLocal(plane, source.placement);
      // Al sólido que el plano no atraviesa no se le apila NADA: apilarle el
      // nodo dejaría el árbol un nodo más largo, el cuerpo idéntico y la orden
      // muda. Va antes de montar las mitades para no gastar tampoco un id.
      //
      // Y se le pasa el plano LOCAL, no el de mundo: `planoDivide` descarta la
      // colocación a propósito (`sinColocar`) y mide sobre el cuerpo en
      // coordenadas locales, así que con el plano de mundo clasificaría mal los
      // vértices de un sólido colocado. Las dos mitades de este merge se
      // necesitan: la guarda sin la transformación mentía con `placement`, y la
      // transformación sin la guarda dejaba a SLICE cobrando «muta» sin cortar.
      if (!planoDivide(source, localPlane)) {
        intactos.push(source.id);
        continue;
      }
      const halves = sides.map((keep, index) => {
        const nodes: CadSolidNode[] = [...source.nodes];
        const rootId = `slice:${index}`;
        nodes.push({ id: rootId, op: "slice", operand: source.root, plane: localPlane, keep });
        return {
          ...makeSolidEntity(index === 0 ? source.id : context.newEntityId(), nodes, rootId, source.layer, source.name),
          ...(source.placement ? { placement: source.placement } : {}),
        };
      });
      for (const [index, half] of halves.entries()) {
        const checked = finishedSolid(half, { state, label: "SLICE" });
        if (checked.result?.kind !== "document") return checked;
        commands.push(
          index === 0
            ? { type: "replace", entityId: source.id, entity: half }
            : { type: "insert", entity: half },
        );
      }
    }
    if (commands.length === 0)
      return solidMessage(
        state,
        "SLICE no cortó nada: el plano de corte no atraviesa ninguno de los sólidos designados.",
      );
    return solidBatch(
      state,
      commands,
      "SLICE",
      intactos.length > 0
        ? `SLICE no cortó ${intactos.length} de los ${solids.length} sólidos designados: el plano de corte no atraviesa ${intactos.join(", ")}.`
        : undefined,
    );
  },
};

const sectionPrompt = "Designe los sólidos de los que extraer la sección";

const sectionCommand: CadCommandDescriptor<PlaneState> = {
  name: "SECTION",
  aliases: ["SEC"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => planeStep({ selection: context.selection, first: null, second: null, planeMode: null, planeElevation: null }, sectionPrompt, "Pulse Intro para crear la región de sección"),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);
    if (input.kind === "selection")
      return planeStep({ ...state, selection: input.entityIds }, sectionPrompt, "Pulse Intro para crear la región de sección");
    if (input.kind === "entityPick")
      return planeStep({ ...state, selection: [...new Set([...state.selection, input.entityId])] }, sectionPrompt, "Pulse Intro para crear la región de sección");

    // Palabras clave XY/YZ/ZX: elegir plano coordenado.
    if (input.kind === "keyword" && !state.first && !state.planeMode) {
      const mode = input.keyword === PLANE_XY.keyword ? "XY"
        : input.keyword === PLANE_YZ.keyword ? "YZ"
          : input.keyword === PLANE_ZX.keyword ? "ZX" : null;
      if (mode)
        return planeStep({ ...state, planeMode: mode }, sectionPrompt, "Pulse Intro para crear la región de sección");
    }

    // Cota del plano coordenado.
    if (state.planeMode && state.planeElevation === null) {
      if (input.kind === "distance") {
        return planeStep({ ...state, planeElevation: input.value }, sectionPrompt, "Pulse Intro para crear la región de sección");
      }
      if (input.kind === "point") {
        const elevation = state.planeMode === "YZ" ? input.point.x
          : state.planeMode === "ZX" ? input.point.y
            : (input.point as { z?: number }).z ?? 0;
        return planeStep({ ...state, planeElevation: elevation }, sectionPrompt, "Pulse Intro para crear la región de sección");
      }
      return planeStep(state, sectionPrompt, "Pulse Intro para crear la región de sección");
    }

    if (input.kind === "point") {
      if (!state.first) return planeStep({ ...state, first: input.point }, sectionPrompt, "Pulse Intro para crear la región de sección");
      if (!state.second) {
        if (Math.hypot(input.point.x - state.first.x, input.point.y - state.first.y) < 1e-9)
          return solidMessage(state, "Los dos puntos de la sección son el mismo: no definen ningún plano.");
        return planeStep({ ...state, second: input.point }, sectionPrompt, "Pulse Intro para crear la región de sección");
      }
      return planeStep(state, sectionPrompt, "Pulse Intro para crear la región de sección");
    }
    if (!state.planeMode && (!state.first || !state.second)) {
      if (input.kind === "enter" && state.selection.length === 0) return solidMessage(state, NO_SOLIDS);
      return planeStep(state, sectionPrompt, "Pulse Intro para crear la región de sección");
    }
    if (input.kind !== "enter" && input.kind !== "keyword")
      return planeStep(state, sectionPrompt, "Pulse Intro para crear la región de sección");

    // No sólo SOLID3D (T-33): un muro del arquitecto también tiene cuerpo, y
    // SECTION únicamente lo LEE para dibujar la `region` del corte — nunca lo
    // reemplaza, así que extenderlo aquí no toca su naturaleza paramétrica.
    const solids = selectedFlattenableBodies(context, state.selection);
    if (solids.length === 0) return solidMessage(state, NO_SOLIDS);
    const plane = state.planeMode
      ? coordinatePlane(state.planeMode, state.planeElevation ?? 0)
      : verticalPlane(state.first!, state.second!);
    const commands: CadEntityCommand[] = [];
    for (const source of solids) {
      let loops;
      try {
        loops = sectionLoopsOfSolid(source.body, plane);
      } catch (error) {
        return solidMessage(state, `SECTION no pudo cortar ${source.entityId}: ${error instanceof Error ? error.message : String(error)}`);
      }
      for (const loop of loops) {
        commands.push({
          type: "insert",
          entity: { id: context.newEntityId(), type: "region", outer: loop, layer: source.layer },
        });
      }
    }
    if (commands.length === 0)
      return solidMessage(state, "El plano de corte no atraviesa ninguno de los sólidos designados.");
    return solidBatch(state, commands, "SECTION");
  },
};

export const CAD_SOLID_MODIFY_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  booleanDescriptor("UNION", ["UNI"], "union", "Designe los sólidos que unir"),
  booleanDescriptor("SUBTRACT", ["SU"], "subtract", "Designe los sólidos: el PRIMERO es el que conserva, los demás se restan"),
  booleanDescriptor("INTERSECT", ["IN"], "intersect", "Designe los sólidos que intersecar"),
  edgeFeatureDescriptor("FILLETEDGE", "fillet", "el radio del redondeo"),
  edgeFeatureDescriptor("CHAMFEREDGE", "chamfer", "la distancia del chaflán"),
  sliceCommand,
  sectionCommand,
].map(asCadCommand);
