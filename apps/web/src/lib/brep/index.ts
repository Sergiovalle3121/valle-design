/**
 * Kernel B-rep de Valle Design: la puerta de entrada del subsistema.
 *
 * QUÉ ES ESTO. Un modelador de sólidos por representación de fronteras, escrito
 * desde cero y sin dependencias. El CAD 2D ya tenía un modelo canónico y un
 * visor 3D; lo que no tenía era GEOMETRÍA SÓLIDA — el 3D era extrusión visual de
 * dibujo 2D. Esto es lo otro: vértices, aristas, caras, lazos, cáscaras y
 * sólidos con adyacencias en tiempo constante, operaciones de modelado, y un
 * validador que comprueba que lo que sale sigue siendo un sólido.
 *
 * QUÉ NO ESTÁ CONECTADO. Nada de esto toca el visor todavía, y es deliberado:
 * un kernel a medias enchufado al render es imposible de depurar porque no se
 * sabe si falla la geometría o la proyección. `tessellateBody` devuelve
 * posiciones, normales e índices — el formato que espera `entity-three.ts`— y
 * conectarlo es un cambio de una función, el día que se decida.
 *
 * DECISIÓN DE FONDO, Y SUS CONSECUENCIAS. El kernel es FACETADO: la revolución,
 * el barrido y el solevado aproximan la curvatura al construir, y a partir de
 * ahí todas las caras son planas. A cambio:
 *
 *   + las booleanas funcionan sobre TODO el catálogo, no sobre un subconjunto;
 *   + el volumen por integración sobre caras es exacto y coincide con el de la
 *     malla hasta el ruido de coma flotante, lo que convierte la comparación de
 *     los dos caminos en una prueba de verdad;
 *   − un cilindro no es un cilindro exacto, sino un prisma de N lados. Cuánto se
 *     pierde está CALCULADO, no estimado: el factor `sinΔ/Δ`, y
 *     `segmentsForChordTolerance` dice cuántas facetas hacen falta para una
 *     flecha dada.
 *
 * Las superficies analíticas (plano, cilindro, cono, esfera, toro, NURBS) están
 * completas y probadas —evaluación, normal, derivadas primera y segunda,
 * proyección de punto e intersección con recta— y viajan como PORTADORAS de las
 * caras. Hoy sirven para normales exactas y para la exportación; el día que la
 * topología deje de facetar, ya están.
 *
 * LO QUE NO HAY, en un solo sitio para no tener que buscarlo:
 *   · Intersección exacta superficie-superficie (SSI). Las booleanas trabajan
 *     sobre caras planas y rechazan las curvas con un mensaje explícito.
 *   · Transición esférica donde se encuentran dos redondeos en un vértice.
 *   · Redondeo de radio variable, y redondeo de aristas cóncavas.
 *   · Fusión de caras coplanarias tras una booleana: el resultado es correcto
 *     pero queda fragmentado en triángulos.
 *   · Transformadas generales de cuerpos: sólo hay traslación.
 */

export {
  vec3,
  V3_ZERO,
  V3_X,
  V3_Y,
  V3_Z,
  v3Add,
  v3Sub,
  v3Scale,
  v3Dot,
  v3Cross,
  v3Length,
  v3Distance,
  v3Normalize,
  v3Basis,
  v3Angle,
  v3SignedAngle,
  v3RotateAroundAxis,
  aabbFromPoints,
  aabbDiagonal,
  aabbCenter,
  type Vec3,
  type Aabb3,
} from "./vec3";

export { BREP_TOLERANCE, resolveTolerance, type BrepTolerance } from "./tolerance";

export { polyRealRoots, quadraticRoots, cubicRoots, quarticRoots } from "./poly";

export {
  makeFrame,
  frameToWorld,
  worldToFrame,
  planeFromPointNormal,
  planeSignedDistance,
  surfacePoint,
  surfaceNormal,
  surfaceDerivatives,
  surfaceProject,
  surfaceLineIntersect,
  surfaceIsPeriodicU,
  surfaceIsPeriodicV,
  coneApex,
  coneRadiusAt,
  type BrepSurface,
  type SurfaceFrame,
  type SurfaceDerivatives,
  type SurfaceProjection,
  type SurfaceLineHit,
  type PlaneSurface,
  type CylinderSurface,
  type ConeSurface,
  type SphereSurface,
  type TorusSurface,
} from "./surfaces";

export {
  makeNurbsSurface,
  nurbsSurfacePoint,
  nurbsSurfaceNormal,
  nurbsSurfaceDerivatives,
  nurbsCurvePoint,
  nurbsCurveDerivatives,
  nurbsPlanePatch,
  uniformClampedKnots,
  type NurbsCurve,
  type NurbsSurface,
} from "./nurbs";

export {
  NO_INDEX,
  emptyBody,
  cloneBody,
  translateBody,
  bodyIsClosed,
  bodyBounds,
  eulerCounts,
  connectedComponentCount,
  faceComponents,
  faceGeometricNormal,
  faceCentroid,
  facePlanarity,
  planarFaceArea,
  planarBodyArea,
  planarBodyVolume,
  loopHalfEdges,
  loopVertices,
  loopPoints,
  faceHalfEdges,
  faceOuterLoop,
  faceInnerLoops,
  edgeFaces,
  edgeIsBoundary,
  edgeDihedralAngle,
  halfEdgeDestination,
  halfEdgeSegment,
  vertexEdges,
  vertexOutgoingHalfEdges,
  newellNormal,
  type BrepBody,
  type BrepSolid,
  type BrepVertex,
  type BrepHalfEdge,
  type BrepEdge,
  type BrepLoop,
  type BrepFace,
  type BrepShell,
  type EulerCounts,
} from "./topology";

export { BodyBuilder, buildBody, reverseBody, bodyToFaceSpecs, assignShells, type FaceSpec } from "./body-builder";

export {
  validateBody,
  assertValidBody,
  describeValidation,
  type BrepValidation,
  type BrepValidationOptions,
  type BrepViolation,
  type BrepViolationKind,
} from "./invariants";

export {
  makeBox,
  makeBoxWithThroughHole,
  makeTetrahedron,
  makePrism,
  boxVolume,
  boxArea,
  attachPlanarSurfaces,
  prismSideFaces,
  type BoxOptions,
  type BoxWithHoleOptions,
} from "./primitives";

export {
  vec2,
  normalizeProfile,
  profileArea,
  profileToWorld,
  polygonSignedArea,
  polygonIsCounterClockwise,
  polygonPerimeter,
  pointInPolygon,
  pointInProfile,
  offsetPolygon,
  offsetProfile,
  regularPolygon,
  rectangle,
  circleProfile,
  type Profile,
  type Vec2,
} from "./profile";

export { triangulateWithHoles, type Triangulation } from "./triangulate2d";

export {
  extrudeProfile,
  extrudeVolume,
  revolveProfile,
  revolveVolume,
  type ExtrudeOptions,
  type RevolveOptions,
} from "./extrude";

export {
  sweepProfile,
  loftProfiles,
  pathFrames,
  prismatoidVolume,
  type SweepOptions,
  type LoftOptions,
  type LoftSection,
  type PathFrame,
} from "./sweep";

export { stitchSections, resampleRing, alignRingStart, type SweepSection, type StitchOptions } from "./sweep-core";

export {
  booleanUnion,
  booleanDifference,
  booleanIntersection,
  booleanWithReport,
  tryBoolean,
  booleanEpsilon,
  bodyToPolygons,
  polygonsToBody,
  type BooleanOptions,
  type BooleanResult,
} from "./boolean";

export type { CsgOperation, CsgPolygon, CsgPlane } from "./csg-bsp";

export {
  stitchMeshToBody,
  type MeshStitchInput,
  type MeshStitchLossEntry,
  type MeshStitchOptions,
  type MeshStitchResult,
  type MeshStitchStats,
} from "./mesh-stitch";

export {
  chamferEdges,
  filletEdges,
  chamferCutter,
  chamferCrossSection,
  chamferRemovedVolume,
  edgeGeometry,
  filletAxisPoint,
  type ChamferOptions,
  type EdgeGeometry,
} from "./fillet";

export {
  tessellateBody,
  tessellateSurface,
  segmentsForChordTolerance,
  chordErrorOf,
  meshTriangleCount,
  meshVertexCount,
  meshTriangle,
  type BrepMesh,
  type TessellateOptions,
  type SurfaceTessellateOptions,
} from "./tessellate";

export {
  meshVolume,
  meshArea,
  meshCentroid,
  bodyMassProperties,
  compareMassProperties,
  type MassProperties,
  type MassPropertyComparison,
} from "./mass-properties";

export { exportStep, stepExportBlockers, type StepExportOptions, type StepSchema } from "./step-export";
export { importStep, parseStepFile, type StepFile, type StepInstance, type StepImportResult } from "./step-import";
export { exportIges, importIges, parseIges, type IgesExportOptions, type IgesFile, type IgesImportResult } from "./iges";
