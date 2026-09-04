/**
 * QUÉ ENTRADA ACEPTA cada clase de entidad antes de escribirla — la otra
 * mitad de `ac1015-entity-emitters.ts`.
 *
 * Vive aparte de `ac1015-entity-writer.ts` desde el 2026-09-04, cuando el
 * intake del ATTRIB empujó aquel archivo por encima del presupuesto de
 * monolito. La costura es la misma que ya separó los emisores y tiene sentido
 * propio: allá queda decidir QUÉ entidad se escribe —código de tipo, prólogo
 * común, handles y envoltura—, que es igual para todas; aquí queda el
 * criterio concreto de cada clase sobre lo que puede emitirse tal cual, que
 * es lo que crece cuando el laboratorio aprende una clase más.
 *
 * El contrato es el mismo en todas: reciben la entidad y el `invalid()` que
 * el llamador construyó, y o vuelven sin decir nada o fallan CERRADO. Nada
 * aquí corrige, redondea ni completa un campo ausente: media entidad
 * desplazaría todos los bits siguientes y el lector ajeno leería otro dibujo,
 * no un dibujo incompleto.
 */
import {
  isFiniteDwgPoint2,
  isFiniteDwgPoint3,
  type DwgAttribEntity,
  type DwgHatchEntity,
  type DwgLwPolylineEntity,
  type DwgMTextEntity,
  type DwgTextFields,
} from "../model/entity-geometry.js";
import { HATCH_PATH_DERIVED_BIT } from "../objects/entities-complex.js";

/**
 * El sombreado del modelo debe ser emitible tal cual. Hasta el 2026-09-04
 * esta validación NO existía —el HATCH salía del primer `switch` sin pasar
 * por el segundo— y con relleno sólido casi no dolía: los contornos son RD y
 * un valor no finito lo cazaba el emisor. Con patrón sí duele, porque el
 * bloque de definición es la parte del cuerpo cuyo recuento decide cuántos
 * bits vienen detrás.
 *
 * Se valida lo que el emisor va a escribir: cota y extrusión finitas, al
 * menos un camino, vértices y bulges finitos y alineados, los códigos BS en
 * rango, y —si no es sólido— los CUATRO campos del patrón presentes y
 * finitos, con cada línea de definición completa. `pixelSize` es obligatorio
 * exactamente cuando algún camino trae el bit DERIVADO, que es la misma
 * condición con la que el decodificador decide leerlo.
 */
export function validateHatch(entity: DwgHatchEntity, invalid: () => never): void {
  // `Array.isArray` sobre un `readonly T[]` lo ESTRECHA a `any[]`, y desde
  // ahí todo lo que se lea del arreglo llega como `any` —el compilador deja
  // de vigilar justo dentro del validador—. Este envoltorio comprueba lo
  // mismo en tiempo de ejecución sin tocar el tipo.
  const esArreglo = (value: unknown): boolean => Array.isArray(value);
  if (
    !Number.isFinite(entity.elevation) ||
    !isFiniteDwgPoint3(entity.extrusion) ||
    !esArreglo(entity.nameBytes) ||
    typeof entity.solidFill !== "boolean" ||
    typeof entity.associative !== "boolean" ||
    !esArreglo(entity.paths) ||
    entity.paths.length < 1 ||
    !esArreglo(entity.seedPoints)
  ) {
    invalid();
  }
  for (const code of [entity.style, entity.patternType]) {
    if (!Number.isInteger(code) || code < 0 || code > 0xffff) invalid();
  }
  for (const path of entity.paths) {
    if (!Number.isInteger(path.flags) || path.boundaryObjectCount < 0) invalid();
    if (path.kind !== "polyline") continue;
    if (path.vertices.length < 1) invalid();
    for (const vertex of path.vertices) {
      if (!isFiniteDwgPoint2(vertex)) invalid();
    }
    // Un arreglo de bulges VACÍO no es un arreglo mal alineado: el emisor
    // decide con `bulges.length > 0` si enciende el bit, así que vacío y
    // ausente significan lo mismo —y el camino público arma justamente el
    // vacío—. Alineado se exige sólo cuando hay bulges que emitir.
    if (
      path.bulges !== undefined &&
      path.bulges.length > 0 &&
      (path.bulges.length !== path.vertices.length ||
        path.bulges.some((bulge) => !Number.isFinite(bulge)))
    ) {
      invalid();
    }
  }
  for (const seed of entity.seedPoints) {
    if (!isFiniteDwgPoint2(seed)) invalid();
  }
  if (
    entity.paths.some((path) => (path.flags & HATCH_PATH_DERIVED_BIT) !== 0) &&
    !Number.isFinite(entity.pixelSize)
  ) {
    invalid();
  }
  if (entity.solidFill) return;
  const { angle, scaleOrSpacing, doubleHatch, definitionLines } = entity;
  if (
    !Number.isFinite(angle) ||
    !Number.isFinite(scaleOrSpacing) ||
    typeof doubleHatch !== "boolean" ||
    !esArreglo(definitionLines)
  ) {
    invalid();
  }
  for (const line of definitionLines ?? []) {
    if (
      !Number.isFinite(line.angle) ||
      !isFiniteDwgPoint2(line.basePoint) ||
      !isFiniteDwgPoint2(line.offset) ||
      !esArreglo(line.dashes) ||
      line.dashes.some((dash) => !Number.isFinite(dash))
    ) {
      invalid();
    }
  }
}

/**
 * La polilínea del modelo debe ser emitible tal cual: al menos un vértice
 * finito, arrays de bulges/anchos alineados vértice a vértice cuando existen,
 * anchos y ancho constante no negativos, y opcionales o bien ausentes
 * (`undefined`) o bien finitos — exactamente lo que el lector aceptará.
 */
export function validateLwPolyline(
  entity: DwgLwPolylineEntity,
  invalid: () => never,
): void {
  if (
    typeof entity.closed !== "boolean" ||
    !Array.isArray(entity.vertices) ||
    entity.vertices.length < 1
  ) {
    invalid();
  }
  for (const vertex of entity.vertices) {
    if (!isFiniteDwgPoint2(vertex)) invalid();
  }
  if (entity.bulges !== undefined) {
    if (
      !Array.isArray(entity.bulges) ||
      entity.bulges.length !== entity.vertices.length ||
      entity.bulges.some((bulge) => !Number.isFinite(bulge))
    ) {
      invalid();
    }
  }
  if (entity.widths !== undefined) {
    if (
      !Array.isArray(entity.widths) ||
      entity.widths.length !== entity.vertices.length ||
      entity.widths.some(
        (width) =>
          !Number.isFinite(width.start) ||
          width.start < 0 ||
          !Number.isFinite(width.end) ||
          width.end < 0,
      )
    ) {
      invalid();
    }
  }
  if (
    entity.constantWidth !== undefined &&
    (!Number.isFinite(entity.constantWidth) || entity.constantWidth < 0)
  ) {
    invalid();
  }
  if (entity.elevation !== undefined && !Number.isFinite(entity.elevation)) {
    invalid();
  }
  if (entity.thickness !== undefined && !Number.isFinite(entity.thickness)) {
    invalid();
  }
  if (entity.extrusion !== undefined && !isFiniteDwgPoint3(entity.extrusion)) {
    invalid();
  }
}

/**
 * El texto del modelo debe ser emitible tal cual: inserción finita, altura
 * finita no negativa, opcionales ausentes o finitos, códigos BS en rango y
 * bytes de cadena 0–255 (el emisor TV los revalida bit a bit).
 *
 * Toma `DwgTextFields` y no `DwgTextEntity` desde el 2026-09-04: un ATTRIB
 * ES un TEXT más tres campos, así que valida los mismos trece por la MISMA
 * función. Una copia para el atributo habría podido separarse del original
 * sin que ninguna prueba lo notara.
 */
export function validateTextFields(
  entity: DwgTextFields,
  invalid: () => never,
): void {
  if (
    !isFiniteDwgPoint2(entity.insertion) ||
    !Number.isFinite(entity.height) ||
    entity.height < 0 ||
    !Array.isArray(entity.valueBytes)
  ) {
    invalid();
  }
  if (entity.alignment !== undefined && !isFiniteDwgPoint2(entity.alignment)) {
    invalid();
  }
  for (const optional of [
    entity.elevation,
    entity.obliqueAngle,
    entity.rotation,
    entity.widthFactor,
  ]) {
    if (optional !== undefined && !Number.isFinite(optional)) invalid();
  }
  for (const code of [
    entity.generation,
    entity.horizontalAlignment,
    entity.verticalAlignment,
  ]) {
    if (
      code !== undefined &&
      (!Number.isInteger(code) || code < 0 || code > 0xffff)
    ) {
      invalid();
    }
  }
}

/**
 * El MTEXT del modelo debe ser emitible tal cual: los tres puntos y los
 * cinco campos BD/DD sueltos finitos, los códigos BS en rango, la cadena
 * como array de bytes y el bit final estrictamente 0 o 1 — el decodificador
 * no le da otro significado, así que el writer tampoco inventa uno.
 */
export function validateMText(entity: DwgMTextEntity, invalid: () => never): void {
  if (
    !isFiniteDwgPoint3(entity.insertion) ||
    !isFiniteDwgPoint3(entity.extrusion) ||
    !isFiniteDwgPoint3(entity.xAxisDirection) ||
    !Array.isArray(entity.valueBytes)
  ) {
    invalid();
  }
  for (const value of [
    entity.rectWidth,
    entity.height,
    entity.extentsHeight,
    entity.extentsWidth,
    entity.lineSpacingFactor,
  ]) {
    if (!Number.isFinite(value)) invalid();
  }
  for (const code of [
    entity.attachment,
    entity.drawingDirection,
    entity.lineSpacingStyle,
  ]) {
    if (!Number.isInteger(code) || code < 0 || code > 0xffff) invalid();
  }
  if (entity.trailingBit !== 0 && entity.trailingBit !== 1) invalid();
}

/**
 * El atributo del modelo debe ser emitible tal cual: los trece campos del
 * texto por el mismo camino que un TEXT, más el tag como bytes, la longitud
 * de campo BS y las banderas RC en rango.
 *
 * El tag se exige NO VACÍO. No es una regla de estilo: un ATTRIB es la
 * pareja etiqueta→valor de un cuadro de rótulo, y uno sin etiqueta no dice
 * qué campo es — el archivo lo llevaría, pero nadie podría volver a leerlo
 * como el dato que era.
 */
export function validateAttrib(
  entity: DwgAttribEntity,
  invalid: () => never,
): void {
  validateTextFields(entity, invalid);
  if (!Array.isArray(entity.tagBytes) || entity.tagBytes.length < 1) invalid();
  if (
    !Number.isInteger(entity.fieldLength) ||
    entity.fieldLength < 0 ||
    entity.fieldLength > 0xffff ||
    !Number.isInteger(entity.attributeFlags) ||
    entity.attributeFlags < 0 ||
    entity.attributeFlags > 0xff
  ) {
    invalid();
  }
}
