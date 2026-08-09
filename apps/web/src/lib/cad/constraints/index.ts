/**
 * Superficie pública del dibujo paramétrico.
 *
 * Un solo sitio del que importar: el solucionador, el esquema persistido y la
 * tabla de parámetros. Quien monte la ventana de gestión de parámetros —o
 * cualquier otra interfaz— trabaja contra esto y no contra los módulos
 * internos, que pueden reorganizarse sin romper a nadie.
 */
export type {
  CadConstraint,
  CadConstraintAnchor,
  CadConstraintKind,
  CadParameter,
} from "./constraint-schema";
export {
  solveConstraintSystem,
  type CadConstraintIssue,
  type CadConstraintSolution,
  type CadConstraintSolverOptions,
  type CadConstraintStatus,
} from "./solver";
export {
  CAD_PARAMETER_NAME_PATTERN,
  deleteCadParameter,
  evaluateCadParameters,
  setCadParameter,
  type CadParameterEvaluation,
  type CadParameterIssue,
  type CadParameterOptions,
  type CadParameterWriteResult,
} from "./parameters";
export { autoConstrainCadEntities, type CadAutoConstrainOptions } from "./auto-constrain";
export { parametrizeCadEntity, type CadEntityParametrization } from "./variables";
