/**
 * Exportación a STEP (ISO 10303-21), esquemas AP203 y AP214.
 *
 * STEP es texto estructurado y se escribe sin ninguna dependencia: una cabecera,
 * una lista de instancias `#n = TIPO(argumentos);` y un cierre. Lo que cuesta no
 * es el formato, es saber QUÉ entidades hay que emitir para que el archivo sea
 * un sólido y no un montón de triángulos sueltos.
 *
 * LA CADENA DE ENTIDADES, de dentro a fuera:
 *
 *   CARTESIAN_POINT   un punto
 *   VERTEX_POINT      ese punto, como vértice topológico
 *   LINE + VECTOR + DIRECTION   la geometría de una arista recta
 *   EDGE_CURVE        la arista: dos vértices y su curva
 *   ORIENTED_EDGE     esa arista recorrida en un sentido concreto
 *   EDGE_LOOP         un lazo cerrado de aristas orientadas
 *   FACE_OUTER_BOUND / FACE_BOUND   ese lazo, como contorno o como agujero
 *   PLANE + AXIS2_PLACEMENT_3D      la superficie portadora
 *   ADVANCED_FACE     la cara: sus contornos y su superficie
 *   CLOSED_SHELL      la cáscara
 *   MANIFOLD_SOLID_BREP   el sólido
 *
 * CADA ARISTA SE EMITE UNA SOLA VEZ. Es el punto en el que fallan casi todos los
 * exportadores caseros: emiten la arista dos veces, una por cara, y el archivo
 * resultante se abre pero no es una variedad — el importador de destino lo ve
 * como una lámina con el doble de aristas. Aquí las aristas se emiten por su
 * índice del B-rep, y la segunda cara reutiliza la misma `EDGE_CURVE` con
 * `ORIENTED_EDGE(..., .F.)`. Que la topología de media-arista ya sepa cuál es la
 * gemela es justo lo que hace esto trivial.
 *
 * CONTEXTO Y UNIDADES. Las entidades de producto y contexto (`APPLICATION_CONTEXT`,
 * `PRODUCT`, `SHAPE_DEFINITION_REPRESENTATION`, las unidades) no describen
 * geometría y son tediosas, pero sin ellas un archivo STEP no se abre en ningún
 * sitio. Van completas.
 */
import {
  NO_INDEX,
  faceCentroid,
  faceGeometricNormal,
  halfEdgeDestination,
  loopHalfEdges,
  type BrepBody,
} from "./topology";
import { v3Basis, v3Distance, v3Normalize, v3Sub, type Vec3 } from "./vec3";

export type StepSchema = "AP203" | "AP214";

export interface StepExportOptions {
  schema?: StepSchema;
  /** Nombre del producto dentro del archivo. */
  name?: string;
  /** Marca de tiempo ISO. Se pide en vez de tomarse del reloj: un exportador que
   *  mira la hora produce archivos distintos en cada corrida y arruina cualquier
   *  comparación byte a byte en un test. */
  timestamp?: string;
  author?: string;
  organization?: string;
}

const SCHEMA_NAMES: Record<StepSchema, string> = {
  AP203: "CONFIG_CONTROL_DESIGN",
  AP214: "AUTOMOTIVE_DESIGN { 1 0 10303 214 3 1 1 }",
};

/** Acumulador de instancias `#n = ...;` con numeración correlativa. */
class StepWriter {
  private readonly lines: string[] = [];
  private next = 1;

  add(body: string): number {
    const id = this.next;
    this.next += 1;
    this.lines.push(`#${id} = ${body};`);
    return id;
  }

  get data(): string {
    return this.lines.join("\n");
  }
}

function num(value: number): string {
  // STEP exige punto decimal SIEMPRE: `1` no es un real válido, `1.` sí. Es la
  // causa número uno de que un lector estricto rechace un archivo generado a
  // mano. Y el exponente va con `E` mayúscula: `1.0e-7` tampoco se acepta.
  if (!Number.isFinite(value)) throw new Error(`Coordenada no finita en la exportación STEP: ${value}`);
  if (Number.isInteger(value)) return `${value}.`;
  const text = value.toPrecision(15);
  if (text.includes("e") || text.includes("E")) {
    const [mantissa, exponent] = text.toUpperCase().split("E");
    let cleaned = mantissa.includes(".") ? mantissa.replace(/0+$/, "") : `${mantissa}.`;
    if (cleaned.endsWith(".")) cleaned = `${cleaned}0`;
    return `${cleaned}E${exponent}`;
  }
  const trimmed = text.replace(/0+$/, "");
  return trimmed.endsWith(".") ? `${trimmed}0` : trimmed;
}

function point3(writer: StepWriter, point: Vec3, label = ""): number {
  return writer.add(`CARTESIAN_POINT('${label}',(${num(point.x)},${num(point.y)},${num(point.z)}))`);
}

function direction(writer: StepWriter, vector: Vec3, label = ""): number {
  const unit = v3Normalize(vector);
  return writer.add(`DIRECTION('${label}',(${num(unit.x)},${num(unit.y)},${num(unit.z)}))`);
}

/** Escribe el cuerpo como archivo STEP completo. */
export function exportStep(body: BrepBody, options: StepExportOptions = {}): string {
  const schema = options.schema ?? "AP214";
  const name = options.name ?? "VALLE_DESIGN_SOLID";
  const timestamp = options.timestamp ?? "1970-01-01T00:00:00";
  const writer = new StepWriter();

  // --- Contexto de aplicación y producto ---------------------------------
  const applicationContext = writer.add(
    `APPLICATION_CONTEXT('core data for automotive mechanical design processes')`,
  );
  writer.add(
    `APPLICATION_PROTOCOL_DEFINITION('international standard','${schema === "AP203" ? "config_control_design" : "automotive_design"}',2010,#${applicationContext})`,
  );
  const productContext = writer.add(`PRODUCT_CONTEXT('',#${applicationContext},'mechanical')`);
  const product = writer.add(`PRODUCT('${name}','${name}','',(#${productContext}))`);
  const productDefinitionFormation = writer.add(`PRODUCT_DEFINITION_FORMATION('','',#${product})`);
  const productDefinitionContext = writer.add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${applicationContext},'design')`);
  const productDefinition = writer.add(
    `PRODUCT_DEFINITION('design','',#${productDefinitionFormation},#${productDefinitionContext})`,
  );
  const productDefinitionShape = writer.add(`PRODUCT_DEFINITION_SHAPE('','',#${productDefinition})`);

  // --- Unidades y contexto geométrico ------------------------------------
  const lengthUnit = writer.add(`( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )`);
  const angleUnit = writer.add(`( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )`);
  const solidAngleUnit = writer.add(`( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )`);
  const uncertainty = writer.add(
    `UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#${lengthUnit},'distance_accuracy_value','confusion accuracy')`,
  );
  const context = writer.add(
    `( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${uncertainty})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lengthUnit},#${angleUnit},#${solidAngleUnit})) REPRESENTATION_CONTEXT('Context','3D') )`,
  );

  // --- Geometría ----------------------------------------------------------
  const vertexIds = body.vertices.map((vertex, index) => {
    const cartesian = point3(writer, vertex.point, `V${index}`);
    return writer.add(`VERTEX_POINT('',#${cartesian})`);
  });

  // Una EDGE_CURVE por arista del B-rep, nunca dos. La media-arista `a` fija el
  // sentido canónico; la cara vecina la reutiliza invertida.
  const edgeIds = body.edges.map((edge, index) => {
    const from = body.halfEdges[edge.a].origin;
    const to = halfEdgeDestination(body, edge.a);
    const start = body.vertices[from].point;
    const end = body.vertices[to].point;
    const length = v3Distance(start, end);
    if (length === 0) throw new Error(`La arista ${index} tiene longitud cero: no se puede escribir su LINE.`);
    const linePoint = point3(writer, start, `E${index}`);
    const lineDirection = direction(writer, v3Sub(end, start), `E${index}`);
    const vector = writer.add(`VECTOR('',#${lineDirection},${num(length)})`);
    const line = writer.add(`LINE('',#${linePoint},#${vector})`);
    return writer.add(`EDGE_CURVE('',#${vertexIds[from]},#${vertexIds[to]},#${line},.T.)`);
  });

  const faceIds: number[] = [];
  for (let face = 0; face < body.faces.length; face += 1) {
    const boundIds: number[] = [];
    const loops = body.faces[face].loops;
    for (let slot = 0; slot < loops.length; slot += 1) {
      const orientedIds = loopHalfEdges(body, loops[slot]).map((halfEdge) => {
        const edge = body.halfEdges[halfEdge].edge;
        // `.T.` si esta media-arista es la canónica de su arista; `.F.` si es la
        // gemela, que la recorre al revés.
        const sameSense = body.edges[edge].a === halfEdge;
        return writer.add(`ORIENTED_EDGE('',*,*,#${edgeIds[edge]},${sameSense ? ".T." : ".F."})`);
      });
      const edgeLoop = writer.add(`EDGE_LOOP('',(${orientedIds.map((id) => `#${id}`).join(",")}))`);
      const kind = slot === 0 ? "FACE_OUTER_BOUND" : "FACE_BOUND";
      boundIds.push(writer.add(`${kind}('',#${edgeLoop},.T.)`));
    }
    const normal = faceGeometricNormal(body, face);
    const origin = faceCentroid(body, face);
    const basis = v3Basis(normal);
    const placementOrigin = point3(writer, origin, `F${face}`);
    const axis = direction(writer, basis.w, `F${face}N`);
    const reference = direction(writer, basis.u, `F${face}X`);
    const placement = writer.add(`AXIS2_PLACEMENT_3D('',#${placementOrigin},#${axis},#${reference})`);
    const plane = writer.add(`PLANE('',#${placement})`);
    faceIds.push(writer.add(`ADVANCED_FACE('',(${boundIds.map((id) => `#${id}`).join(",")}),#${plane},.T.)`));
  }

  // --- Cáscaras y sólido --------------------------------------------------
  const shellIds = body.shells.map((shell, index) => {
    if (!shell.closed) {
      throw new Error(
        `La cáscara ${index} está abierta. MANIFOLD_SOLID_BREP exige CLOSED_SHELL: un cuerpo con aristas de borde no es un sólido y escribirlo como tal produce un archivo que miente.`,
      );
    }
    return writer.add(`CLOSED_SHELL('',(${shell.faces.map((face) => `#${faceIds[face]}`).join(",")}))`);
  });
  if (shellIds.length === 0) throw new Error("El cuerpo no tiene ninguna cáscara que exportar.");

  const solidIds = shellIds.map((shell, index) => writer.add(`MANIFOLD_SOLID_BREP('${name}_${index}',#${shell})`));
  const representation = writer.add(
    `ADVANCED_BREP_SHAPE_REPRESENTATION('${name}',(${solidIds.map((id) => `#${id}`).join(",")}),#${context})`,
  );
  writer.add(`SHAPE_DEFINITION_REPRESENTATION(#${productDefinitionShape},#${representation})`);

  return [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION(('Valle Design B-rep'),'2;1');`,
    `FILE_NAME('${name}','${timestamp}',('${options.author ?? "Valle Design"}'),('${options.organization ?? "Valle Design"}'),'valle-design-brep','valle-design','');`,
    `FILE_SCHEMA(('${SCHEMA_NAMES[schema]}'));`,
    "ENDSEC;",
    "DATA;",
    writer.data,
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join("\n");
}

/**
 * Comprueba que el cuerpo se puede escribir como STEP ANTES de escribirlo.
 *
 * Devuelve la lista de motivos por los que no. Es preferible a lanzar a mitad
 * del archivo: quien exporta un lote de sólidos quiere saber cuáles fallan, no
 * quedarse con medio archivo del primero que reventó.
 */
export function stepExportBlockers(body: BrepBody): string[] {
  const blockers: string[] = [];
  if (body.shells.length === 0) blockers.push("El cuerpo no tiene cáscaras.");
  for (let i = 0; i < body.shells.length; i += 1) {
    if (!body.shells[i].closed) blockers.push(`La cáscara ${i} está abierta.`);
  }
  for (let i = 0; i < body.edges.length; i += 1) {
    if (body.edges[i].a === NO_INDEX) blockers.push(`La arista ${i} no tiene media-arista.`);
  }
  for (let i = 0; i < body.vertices.length; i += 1) {
    const { x, y, z } = body.vertices[i].point;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      blockers.push(`El vértice ${i} tiene coordenadas no finitas.`);
    }
  }
  return blockers;
}
