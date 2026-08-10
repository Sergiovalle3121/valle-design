import { BadRequestException } from '@nestjs/common';
import { objectValue, stringValue } from './cad-entity-invariants';

/**
 * Invariantes de los dos tipos que estrena el esquema 5: SOLID3D y REGION.
 *
 * Mismo criterio fail-closed que el resto del validador: un documento inválido
 * se RECHAZA, no se «arregla». Aquí eso importa más que en ninguna otra
 * entidad, y conviene entender por qué.
 *
 * Un SOLID3D no guarda su malla: guarda el ÁRBOL que la produce. Eso significa
 * que el documento persistido no contiene el sólido, contiene un PROGRAMA que lo
 * calcula — y un programa mal formado no falla al guardarse, falla al abrirse.
 * Una referencia colgando (`union` que nombra un nodo que ya no existe) o un
 * ciclo (`a` que se resta a sí mismo) cruzan la frontera sin problema y luego
 * cuelgan el hilo del navegador de quien abra el plano, o revientan a mitad del
 * render sin decir de qué entidad venían.
 *
 * Por eso no hay reparación posible ni deseable: no hay nada que adivinar en «el
 * nodo `fantasma` no existe». Se rechaza en la frontera, que es el único sitio
 * donde el error todavía tiene un culpable identificable.
 */

/** Techo de nodos por sólido. Debe coincidir con `CAD_SOLID_MAX_NODES` del web. */
const MAX_SOLID_NODES = 256;
/** Techo de puntos de un nodo `brep` importado: un catálogo, no un almacén. */
const MAX_BREP_POINTS = 200_000;
const MAX_PROFILE_POINTS = 20_000;
const MAX_REGION_POINTS = 20_000;

const LEAF_OPS = new Set([
  'box',
  'extrude',
  'revolve',
  'sweep',
  'loft',
  'brep',
]);
const OPERATION_OPS = new Set([
  'union',
  'subtract',
  'intersect',
  'fillet',
  'chamfer',
  'slice',
]);

function reject(message: string): never {
  throw new BadRequestException(`CadDocument: ${message}`);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function positive(value: unknown): value is number {
  return finite(value) && value > 0;
}

/** Punto 3D con sus tres coordenadas finitas. */
function assertPoint3(
  value: unknown,
  where: string,
): { x: number; y: number; z: number } {
  const point = objectValue(value);
  if (!point || !finite(point.x) || !finite(point.y) || !finite(point.z)) {
    reject(`${where} necesita un punto con x, y, z finitos.`);
  }
  return { x: point.x, y: point.y, z: point.z };
}

/** Punto 2D de un perfil. La `z` no participa: el perfil vive en su plano. */
function assertPoint2(value: unknown, where: string): void {
  const point = objectValue(value);
  if (!point || !finite(point.x) || !finite(point.y)) {
    reject(`${where} necesita un punto con x e y finitos.`);
  }
}

/** Vector no nulo: una dirección de longitud cero no orienta nada. */
function assertDirection(value: unknown, where: string): void {
  const vector = assertPoint3(value, where);
  if (!(Math.hypot(vector.x, vector.y, vector.z) > 0)) {
    reject(`${where} no puede ser un vector nulo.`);
  }
}

function assertProfile(value: unknown, where: string): void {
  const profile = objectValue(value);
  if (!profile) reject(`${where} necesita un perfil.`);
  const outer = profile.outer;
  if (!Array.isArray(outer) || outer.length < 3) {
    reject(`${where} necesita un contorno exterior de al menos 3 puntos.`);
  }
  if (outer.length > MAX_PROFILE_POINTS) {
    reject(
      `${where} tiene ${outer.length} puntos y el máximo es ${MAX_PROFILE_POINTS}.`,
    );
  }
  for (const [index, point] of outer.entries())
    assertPoint2(point, `${where}, punto ${index}`);
  const inners = profile.inners;
  if (inners === undefined) return;
  if (!Array.isArray(inners))
    reject(`${where} tiene un \`inners\` que no es un arreglo.`);
  for (const [ring, hole] of inners.entries()) {
    if (!Array.isArray(hole) || hole.length < 3) {
      reject(`${where}, agujero ${ring}: necesita al menos 3 puntos.`);
    }
    if (hole.length > MAX_PROFILE_POINTS) {
      reject(
        `${where}, agujero ${ring}: tiene ${hole.length} puntos y el máximo es ${MAX_PROFILE_POINTS}.`,
      );
    }
    for (const [index, point] of hole.entries())
      assertPoint2(point, `${where}, agujero ${ring} punto ${index}`);
  }
}

function assertFrame(value: unknown, where: string): void {
  if (value === undefined) return;
  const frame = objectValue(value);
  if (!frame) reject(`${where} tiene un marco que no es un objeto.`);
  assertPoint3(frame.origin, `${where}: el origen del marco`);
  assertDirection(frame.zAxis, `${where}: el eje Z del marco`);
  if (frame.xAxis !== undefined)
    assertDirection(frame.xAxis, `${where}: el eje X del marco`);
}

/** Operandos declarados por un nodo, sea `operand` u `operands`. */
function nodeReferences(node: Record<string, unknown>, id: string): string[] {
  const op = stringValue(node.op);
  if (op === 'union' || op === 'subtract' || op === 'intersect') {
    const operands = node.operands;
    if (!Array.isArray(operands) || operands.length < 2) {
      reject(`el nodo ${id} (${op}) necesita al menos dos operandos.`);
    }
    return operands.map((operand, index) => {
      const reference = stringValue(operand);
      if (!reference)
        reject(`el nodo ${id} (${op}) tiene un operando ${index} vacío.`);
      return reference;
    });
  }
  if (op === 'fillet' || op === 'chamfer' || op === 'slice') {
    const reference = stringValue(node.operand);
    if (!reference) reject(`el nodo ${id} (${op}) necesita un operando.`);
    return [reference];
  }
  return [];
}

/** Invariantes propias de cada `op`. */
function assertNodeGeometry(node: Record<string, unknown>, id: string): void {
  const op = stringValue(node.op);
  if (op === 'box') {
    const min = assertPoint3(node.min, `el nodo ${id}: la esquina mínima`);
    const max = assertPoint3(node.max, `el nodo ${id}: la esquina máxima`);
    // Una caja aplastada en un eje no es un sólido: es un rectángulo con
    // pretensiones, y todas las booleanas que la tomen darán volumen cero.
    if (!(max.x > min.x) || !(max.y > min.y) || !(max.z > min.z)) {
      reject(
        `el nodo ${id} (box) tiene una caja degenerada: la esquina máxima debe superar a la mínima en los tres ejes.`,
      );
    }
    return;
  }
  if (op === 'extrude') {
    assertProfile(node.profile, `el nodo ${id} (extrude)`);
    assertFrame(node.frame, `el nodo ${id} (extrude)`);
    if (!finite(node.height) || node.height === 0) {
      reject(
        `el nodo ${id} (extrude) necesita una altura finita distinta de cero.`,
      );
    }
    const draft = node.draftAngleRad;
    if (
      draft !== undefined &&
      (!finite(draft) || Math.abs(draft) >= Math.PI / 2)
    ) {
      reject(
        `el nodo ${id} (extrude) tiene un ángulo de desmoldeo fuera de (−90°, 90°).`,
      );
    }
    return;
  }
  if (op === 'revolve') {
    assertProfile(node.profile, `el nodo ${id} (revolve)`);
    assertFrame(node.frame, `el nodo ${id} (revolve)`);
    const angle = node.angleRad;
    if (angle !== undefined) {
      if (
        !finite(angle) ||
        angle === 0 ||
        Math.abs(angle) > 2 * Math.PI + 1e-9
      ) {
        reject(`el nodo ${id} (revolve) tiene un ángulo fuera de (0, 2π].`);
      }
    }
    const segments = node.segments;
    if (
      segments !== undefined &&
      (!Number.isInteger(segments) || (segments as number) < 3)
    ) {
      reject(`el nodo ${id} (revolve) necesita al menos 3 segmentos.`);
    }
    return;
  }
  if (op === 'sweep') {
    assertProfile(node.profile, `el nodo ${id} (sweep)`);
    const path = node.path;
    if (!Array.isArray(path) || path.length < 2) {
      reject(
        `el nodo ${id} (sweep) necesita un recorrido de al menos 2 puntos.`,
      );
    }
    for (const [index, point] of path.entries())
      assertPoint3(
        point,
        `el nodo ${id} (sweep): el punto ${index} del recorrido`,
      );
    if (node.upHint !== undefined)
      assertDirection(
        node.upHint,
        `el nodo ${id} (sweep): la referencia de giro`,
      );
    return;
  }
  if (op === 'loft') {
    const sections = node.sections;
    if (!Array.isArray(sections) || sections.length < 2) {
      reject(`el nodo ${id} (loft) necesita al menos 2 secciones.`);
    }
    for (const [index, raw] of sections.entries()) {
      const section = objectValue(raw);
      if (!section)
        reject(`el nodo ${id} (loft): la sección ${index} no es un objeto.`);
      assertProfile(section.profile, `el nodo ${id} (loft), sección ${index}`);
      const frame = objectValue(section.frame);
      if (!frame)
        reject(`el nodo ${id} (loft): la sección ${index} necesita un marco.`);
      assertFrame(section.frame, `el nodo ${id} (loft), sección ${index}`);
    }
    return;
  }
  if (op === 'brep') {
    const points = node.points;
    const faces = node.faces;
    // Cuatro puntos y cuatro caras es el tetraedro: el sólido más pequeño que
    // existe. Menos que eso no encierra volumen por mucho que se declare.
    if (!Array.isArray(points) || points.length < 4) {
      reject(`el nodo ${id} (brep) necesita al menos 4 vértices.`);
    }
    if (points.length > MAX_BREP_POINTS) {
      reject(
        `el nodo ${id} (brep) tiene ${points.length} vértices y el máximo es ${MAX_BREP_POINTS}.`,
      );
    }
    for (const [index, point] of points.entries())
      assertPoint3(point, `el nodo ${id} (brep): el vértice ${index}`);
    if (!Array.isArray(faces) || faces.length < 4) {
      reject(`el nodo ${id} (brep) necesita al menos 4 caras.`);
    }
    for (const [index, raw] of faces.entries()) {
      const face = objectValue(raw);
      if (!face)
        reject(`el nodo ${id} (brep): la cara ${index} no es un objeto.`);
      assertIndexLoop(
        face.outer,
        points.length,
        `el nodo ${id} (brep), cara ${index}`,
      );
      const inners = face.inners;
      if (inners === undefined) continue;
      if (!Array.isArray(inners))
        reject(
          `el nodo ${id} (brep), cara ${index}: \`inners\` no es un arreglo.`,
        );
      for (const [ring, hole] of inners.entries())
        assertIndexLoop(
          hole,
          points.length,
          `el nodo ${id} (brep), cara ${index} agujero ${ring}`,
        );
    }
    return;
  }
  if (op === 'fillet') {
    if (!positive(node.radius))
      reject(`el nodo ${id} (fillet) necesita un radio positivo.`);
    assertEdgeList(node.edges, `el nodo ${id} (fillet)`);
    const segments = node.segments;
    if (
      segments !== undefined &&
      (!Number.isInteger(segments) || (segments as number) < 1)
    ) {
      reject(`el nodo ${id} (fillet) necesita al menos 1 faceta.`);
    }
    return;
  }
  if (op === 'chamfer') {
    if (!positive(node.distance))
      reject(`el nodo ${id} (chamfer) necesita una distancia positiva.`);
    assertEdgeList(node.edges, `el nodo ${id} (chamfer)`);
    return;
  }
  if (op === 'slice') {
    const plane = objectValue(node.plane);
    if (!plane) reject(`el nodo ${id} (slice) necesita un plano de corte.`);
    assertPoint3(plane.origin, `el nodo ${id} (slice): el origen del plano`);
    assertDirection(plane.normal, `el nodo ${id} (slice): la normal del plano`);
    const keep = stringValue(node.keep);
    if (keep !== 'positive' && keep !== 'negative') {
      reject(
        `el nodo ${id} (slice) necesita \`keep\` igual a "positive" o "negative".`,
      );
    }
  }
}

/** Lazo de índices de vértice, todos dentro del rango del nodo. */
function assertIndexLoop(
  value: unknown,
  vertexCount: number,
  where: string,
): void {
  if (!Array.isArray(value) || value.length < 3) {
    reject(`${where}: un lazo necesita al menos 3 índices de vértice.`);
  }
  for (const index of value) {
    if (
      !Number.isInteger(index) ||
      (index as number) < 0 ||
      (index as number) >= vertexCount
    ) {
      // Un índice fuera de rango no da una cara rara: da `undefined` al recorrer
      // el lazo, y de ahí salen `NaN` que envenenan bounds, índice espacial y
      // exportación mucho después de haberse guardado.
      reject(
        `${where}: el índice ${String(index)} está fuera del rango de vértices [0, ${vertexCount}).`,
      );
    }
  }
}

function assertEdgeList(value: unknown, where: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value))
    reject(`${where}: \`edges\` debe ser un arreglo de índices.`);
  for (const index of value) {
    if (!Number.isInteger(index) || (index as number) < 0) {
      reject(`${where}: los índices de arista deben ser enteros no negativos.`);
    }
  }
}

/** Colocación: seis números finitos y determinante no nulo. */
function assertPlacement(value: unknown, id: string): void {
  if (value === undefined) return;
  const placement = objectValue(value);
  if (!placement)
    reject(`el sólido ${id} tiene una colocación que no es un objeto.`);
  for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) {
    if (!finite(placement[key])) {
      reject(`el sólido ${id} tiene una colocación con \`${key}\` no finito.`);
    }
  }
  if (placement.dz !== undefined && !finite(placement.dz)) {
    reject(`el sólido ${id} tiene una colocación con \`dz\` no finito.`);
  }
  const determinant =
    (placement.a as number) * (placement.d as number) -
    (placement.b as number) * (placement.c as number);
  // Determinante cero aplasta el sólido contra un plano. No es un sólido
  // pequeño: es un cuerpo sin volumen que rompe toda booleana posterior.
  if (!(Math.abs(determinant) > 0)) {
    reject(
      `el sólido ${id} tiene una colocación singular: aplastaría el sólido a un plano.`,
    );
  }
}

/**
 * Invariantes de un SOLID3D: el árbol de construcción tiene que ser un
 * PROGRAMA bien formado, no sólo una lista de objetos con la forma correcta.
 */
export function assertSolid3dInvariants(
  entity: Record<string, unknown>,
  id: string,
): void {
  const nodes = entity.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    reject(`el sólido ${id} necesita al menos un nodo de construcción.`);
  }
  if (nodes.length > MAX_SOLID_NODES) {
    reject(
      `el sólido ${id} tiene ${nodes.length} nodos y el máximo es ${MAX_SOLID_NODES}.`,
    );
  }

  const byId = new Map<string, Record<string, unknown>>();
  const references = new Map<string, string[]>();
  for (const raw of nodes) {
    const node = objectValue(raw);
    if (!node) reject(`el sólido ${id} tiene un nodo que no es un objeto.`);
    const nodeId = stringValue(node.id).trim();
    if (!nodeId || nodeId.length > 128) {
      reject(`el sólido ${id} tiene un nodo con id vacío o demasiado largo.`);
    }
    if (byId.has(nodeId)) {
      reject(`el sólido ${id} tiene el nodo ${nodeId} duplicado.`);
    }
    const op = stringValue(node.op);
    if (!LEAF_OPS.has(op) && !OPERATION_OPS.has(op)) {
      reject(
        `el sólido ${id}: el nodo ${nodeId} declara la operación desconocida "${op}".`,
      );
    }
    byId.set(nodeId, node);
    references.set(nodeId, nodeReferences(node, nodeId));
    assertNodeGeometry(node, nodeId);
  }

  const root = stringValue(entity.root).trim();
  if (!root || !byId.has(root)) {
    reject(
      `el sólido ${id} declara la raíz "${root || '(vacía)'}", que no existe entre sus nodos.`,
    );
  }

  for (const [nodeId, targets] of references) {
    for (const target of targets) {
      if (!byId.has(target)) {
        reject(
          `el sólido ${id}: el nodo ${nodeId} referencia ${target}, que no existe.`,
        );
      }
    }
  }

  // Ciclos. Un `union` que se alcanza a sí mismo no es geometría rara: es un
  // bucle infinito con paso por el kernel. Persistirlo cuelga el hilo de quien
  // abra el plano, sin ningún mensaje y sin forma de saber qué entidad fue.
  const state = new Map<string, 'visiting' | 'done'>();
  const walk = (nodeId: string): void => {
    const status = state.get(nodeId);
    if (status === 'done') return;
    if (status === 'visiting') {
      reject(
        `el sólido ${id}: el nodo ${nodeId} forma un ciclo en su árbol de construcción.`,
      );
    }
    state.set(nodeId, 'visiting');
    for (const target of references.get(nodeId) ?? []) walk(target);
    state.set(nodeId, 'done');
  };
  for (const nodeId of byId.keys()) walk(nodeId);

  assertPlacement(entity.placement, id);

  const name = entity.name;
  if (name !== undefined && (typeof name !== 'string' || name.length > 128)) {
    reject(
      `el sólido ${id} tiene un nombre que no es una cadena de 128 caracteres o menos.`,
    );
  }
}

/** Invariantes de una REGION: contorno exterior cerrado y agujeros válidos. */
export function assertRegionInvariants(
  entity: Record<string, unknown>,
  id: string,
): void {
  const outer = entity.outer;
  if (!Array.isArray(outer) || outer.length < 3) {
    reject(
      `la región ${id} necesita un contorno exterior de al menos 3 puntos.`,
    );
  }
  if (outer.length > MAX_REGION_POINTS) {
    reject(
      `la región ${id} tiene ${outer.length} puntos y el máximo es ${MAX_REGION_POINTS}.`,
    );
  }
  for (const [index, point] of outer.entries())
    assertPoint3(point, `la región ${id}: el punto ${index}`);

  const inners = entity.inners;
  if (inners === undefined) return;
  if (!Array.isArray(inners))
    reject(`la región ${id} tiene un \`inners\` que no es un arreglo.`);
  for (const [ring, hole] of inners.entries()) {
    if (!Array.isArray(hole) || hole.length < 3) {
      reject(`la región ${id}, agujero ${ring}: necesita al menos 3 puntos.`);
    }
    if (hole.length > MAX_REGION_POINTS) {
      reject(
        `la región ${id}, agujero ${ring}: tiene ${hole.length} puntos y el máximo es ${MAX_REGION_POINTS}.`,
      );
    }
    for (const [index, point] of hole.entries())
      assertPoint3(
        point,
        `la región ${id}, agujero ${ring}: el punto ${index}`,
      );
  }
}
