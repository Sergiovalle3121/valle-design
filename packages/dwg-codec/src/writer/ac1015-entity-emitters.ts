/**
 * CÓMO SE DISPONE CADA CLASE de entidad AC1015 en bits — la mitad "qué campos
 * y en qué orden" del writer.
 *
 * Vive aparte de `ac1015-entity-writer.ts` desde el 2026-09-01, cuando el
 * intake del HATCH sólido empujó aquel archivo por encima del presupuesto de
 * monolito. La costura tiene sentido propio y no es un corte por tamaño: allá
 * queda decidir QUÉ entidad se escribe —validación, código de tipo, prólogo
 * común, handles y envoltura—, que es igual para todas; aquí queda el saber
 * concreto de cada clase, que es lo que cambia cuando el laboratorio aprende
 * a escribir una más.
 *
 * Cada emisor es el espejo campo a campo de su decodificador en `objects/`, y
 * el round-trip contra el lector propio es lo que los mantiene honestos.
 */
import type { DwgBitEmitter } from "./dwg-bit-emitter.js";
import { throwDwgError } from "../security/parse-error.js";
import {
  HATCH_PATH_DERIVED_BIT,
  HATCH_PATH_POLYLINE_BIT,
} from "../objects/entities-complex.js";
import type {
  DwgAttribEntity,
  DwgEllipseEntity,
  DwgHatchEntity,
  DwgInsertEntity,
  DwgLwPolylineEntity,
  DwgMTextEntity,
  DwgTextEntity,
  DwgTextFields,
  DwgViewportEntity,
} from "../model/entity-geometry.js";

/**
 * ELLIPSE: espejo campo a campo de `decodeEllipse` — centro, eje mayor y
 * extrusión viajan como 3BD (tres BD, NO la forma comprimida BE de LINE/ARC:
 * el propio decodificador usa `read3BD` sin atajo), seguidos de razón de
 * ejes, ángulo de arranque y ángulo final, los cuatro BD sueltos.
 */
export function emitEllipse(emitter: DwgBitEmitter, entity: DwgEllipseEntity): void {
  emitter.emit3BD(entity.center);
  emitter.emit3BD(entity.majorAxisEndpoint);
  emitter.emit3BD(entity.extrusion);
  emitter.emitBD(entity.axisRatio);
  emitter.emitBD(entity.startAngle);
  emitter.emitBD(entity.endAngle);
}

/**
 * MTEXT: espejo campo a campo de `decodeMText` — inserción, extrusión y
 * dirección del eje X como 3BD, ancho/altura/extents como BD sueltos,
 * attachment/dirección de dibujo como BS, la cadena como TV, interlineado
 * BS+BD y el bit final sin semántica registrada, emitido tal cual viaja en
 * el modelo (el decodificador lo expone crudo, así que el writer lo espeja
 * en vez de inventarle un significado).
 */
export function emitMText(emitter: DwgBitEmitter, entity: DwgMTextEntity): void {
  emitter.emit3BD(entity.insertion);
  emitter.emit3BD(entity.extrusion);
  emitter.emit3BD(entity.xAxisDirection);
  emitter.emitBD(entity.rectWidth);
  emitter.emitBD(entity.height);
  emitter.emitBS(entity.attachment);
  emitter.emitBS(entity.drawingDirection);
  emitter.emitBD(entity.extentsHeight);
  emitter.emitBD(entity.extentsWidth);
  emitter.emitTV(entity.valueBytes);
  emitter.emitBS(entity.lineSpacingStyle);
  emitter.emitBD(entity.lineSpacingFactor);
  emitter.pushBit(entity.trailingBit as 0 | 1);
}

/**
 * HATCH — espejo campo a campo de `decodeHatch`, relleno sólido y patrón.
 *
 * EL BLOQUE DE PATRÓN, QUE HASTA EL 2026-09-04 NO SE ESCRIBÍA. El
 * decodificador lee, cuando `solidFill` es falso y JUSTO detrás del estilo y
 * el tipo de patrón, el ángulo BD del patrón, su escala BD, el bit de doble
 * trama y un recuento BS de líneas de definición, cada una con su ángulo BD,
 * su punto base 2BD, su desfase 2BD y un recuento BS de trazos con sus
 * longitudes BD (hecho REGISTRADO de HATCH R2000 en SOURCE_REGISTER). El
 * writer lo emitía a ciegas como sólido —bit fijo a 1— porque el documento
 * canónico no traía esa definición; ahora la trae, así que el bit sale del
 * modelo y el bloque se escribe.
 *
 * NO SE DEDUCE NADA AQUÍ. Si el modelo dice «patrón» y no trae los cuatro
 * campos, este emisor falla cerrado: media definición desplazaría todos los
 * bits siguientes y el lector ajeno leería otro dibujo, no un dibujo
 * incompleto.
 *
 * `pixelSize` sólo existe cuando algún camino trae el bit DERIVADO —el mismo
 * `anyDerived` que calcula el decodificador—, y por eso se decide contando
 * los caminos ya emitidos en vez de omitirse siempre: emitirlo o saltárselo
 * a destiempo desplaza todos los bits que siguen.
 */
export function emitHatch(emitter: DwgBitEmitter, entity: DwgHatchEntity): void {
  emitter.emitBD(entity.elevation);
  emitter.emit3BD(entity.extrusion);
  emitter.emitTV(entity.nameBytes);
  emitter.pushBit(entity.solidFill ? 1 : 0);
  emitter.pushBit(entity.associative ? 1 : 0);
  emitter.emitBL(entity.paths.length);
  for (const path of entity.paths) {
    if (path.kind !== "polyline") {
      // Inalcanzable por construcción —`canonicalDocumentToDwgEntities` sólo
      // arma caminos polilínea— y aun así se falla cerrado en vez de emitir
      // una forma que el lector interpretaría como otra cosa. El `continue`
      // tras el throw no se ejecuta nunca: está para que el estrechamiento de
      // tipo sea EXPLÍCITO y no dependa de que el compilador deduzca que
      // `throwDwgError` no vuelve.
      throwDwgError(
        "DWG_VERSION_DECODER_UNSUPPORTED",
        "unsupported",
        0,
        "Writing a HATCH boundary made of line/arc/spline segments is not implemented.",
      );
      continue;
    }
    // `hasBulges` es UNA bandera para todo el camino, y el lector, si está
    // encendida, espera un BD DETRÁS DE CADA vértice. Se decide una sola vez
    // aquí y se respeta en todo el bucle: encenderla y luego saltarse un
    // bulge desplazaría todos los bits siguientes.
    const bulges = path.bulges ?? [];
    const hasBulges = bulges.length > 0;
    emitter.emitBL(path.flags | HATCH_PATH_POLYLINE_BIT);
    emitter.pushBit(hasBulges ? 1 : 0);
    emitter.pushBit(path.closed ? 1 : 0);
    emitter.emitBL(path.vertices.length);
    for (const [index, vertex] of path.vertices.entries()) {
      emitter.emitRD(vertex.x);
      emitter.emitRD(vertex.y);
      if (hasBulges) emitter.emitBD(bulges[index] ?? 0);
    }
    emitter.emitBL(path.boundaryObjectCount);
  }
  emitter.emitBS(entity.style);
  emitter.emitBS(entity.patternType);
  if (!entity.solidFill) emitHatchPattern(emitter, entity);
  if (entity.paths.some((path) => (path.flags & HATCH_PATH_DERIVED_BIT) !== 0)) {
    if (entity.pixelSize === undefined) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A hatch with a derived boundary path must carry its pixel size.",
      );
    }
    emitter.emitBD(entity.pixelSize);
  }
  emitter.emitBL(entity.seedPoints.length);
  for (const seed of entity.seedPoints) {
    emitter.emitRD(seed.x);
    emitter.emitRD(seed.y);
  }
}

/**
 * El bloque de patrón de un HATCH no sólido, en el orden EXACTO en que
 * `decodeHatch` lo lee. Vive aparte porque es la parte del cuerpo que sólo
 * existe a veces: mezclarla en el cuerpo principal escondería que el resto se
 * emite siempre.
 *
 * Los cuatro campos van juntos o no va ninguno. `validateEntity` ya lo
 * garantiza; este guardia existe igual porque el precio de equivocarse aquí
 * no es un campo malo sino un archivo desincronizado desde este bit hasta el
 * final.
 */
function emitHatchPattern(emitter: DwgBitEmitter, entity: DwgHatchEntity): void {
  const { angle, scaleOrSpacing, doubleHatch, definitionLines } = entity;
  if (
    angle === undefined ||
    scaleOrSpacing === undefined ||
    doubleHatch === undefined ||
    definitionLines === undefined
  ) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      0,
      "Writing a patterned HATCH requires its pattern definition: angle, scale, double flag and definition lines.",
    );
  }
  emitter.emitBD(angle);
  emitter.emitBD(scaleOrSpacing);
  emitter.pushBit(doubleHatch ? 1 : 0);
  emitter.emitBS(definitionLines.length);
  for (const line of definitionLines) {
    emitter.emitBD(line.angle);
    emitter.emit2BD(line.basePoint);
    emitter.emit2BD(line.offset);
    emitter.emitBS(line.dashes.length);
    for (const dash of line.dashes) emitter.emitBD(dash);
  }
}

/**
 * VIEWPORT — la VENTANA de una hoja, espejo campo a campo de `decodeViewport`.
 *
 * Es la primera clase que este writer emite y que NO vive en model space: su
 * sitio es el espacio papel, y por eso llega con la ola que parte la cadena de
 * entidades en dos. El cuerpo va entero —el formato no tiene aquí campos
 * opcionales que se puedan omitir— en el orden que el hecho registrado de
 * VIEWPORT R2000 fija: centro 3BD, ancho y alto BD, objetivo y dirección de
 * vista 3BD, giro/altura de vista/lente/recortes/ángulo de snap BD, los cuatro
 * pares 2RD de centro de vista, base y espaciado de snap y espaciado de grid,
 * el zoom de círculo BS y la cola de R2000+: recuento BL de capas congeladas,
 * banderas de estado BL, hoja de estilos TV, modo de render RC, los dos bits
 * de UCS, origen y ejes del UCS 3BD, elevación BD y tipo de vista ortográfica
 * BS.
 *
 * EL RECUENTO DE CAPAS CONGELADAS SE EMITE, PERO SUS HANDLES NO EXISTEN AQUÍ:
 * viven en el flujo final, que compone `ac1015-entity-writer.ts`. Escribir un
 * recuento distinto de cero sin esos handles desincronizaría el flujo entero,
 * así que `validateViewport` lo rechaza cerrado antes de llegar a este emisor
 * — la congelación por ventana es «todavía no», no un campo que se redondee.
 */
export function emitViewport(
  emitter: DwgBitEmitter,
  entity: DwgViewportEntity,
): void {
  emitter.emit3BD(entity.center);
  emitter.emitBD(entity.width);
  emitter.emitBD(entity.height);
  emitter.emit3BD(entity.viewTarget);
  emitter.emit3BD(entity.viewDirection);
  emitter.emitBD(entity.twistAngle);
  emitter.emitBD(entity.viewHeight);
  emitter.emitBD(entity.lensLength);
  emitter.emitBD(entity.frontClip);
  emitter.emitBD(entity.backClip);
  emitter.emitBD(entity.snapAngle);
  for (const point of [
    entity.viewCenter,
    entity.snapBase,
    entity.snapSpacing,
    entity.gridSpacing,
  ]) {
    emitter.emitRD(point.x);
    emitter.emitRD(point.y);
  }
  emitter.emitBS(entity.circleZoom);
  emitter.emitBL(entity.frozenLayerCount);
  emitter.emitBL(entity.statusFlags);
  emitter.emitTV([...entity.styleSheetBytes]);
  emitter.emitRC(entity.renderMode);
  emitter.pushBit(entity.ucsAtOrigin as 0 | 1);
  emitter.pushBit(entity.ucsPerViewport as 0 | 1);
  emitter.emit3BD(entity.ucsOrigin);
  emitter.emit3BD(entity.ucsXAxis);
  emitter.emit3BD(entity.ucsYAxis);
  emitter.emitBD(entity.ucsElevation);
  emitter.emitBS(entity.ucsOrthoViewType);
}

/**
 * INSERT: inserción 3BD y la doble bandada de escalas — este writer emite
 * SOLO sus formas totales, 0b11 (las tres escalas exactamente 1.0, bit a
 * bit) o 0b00 (X como RD y las Y/Z como DD contra la X); las formas 0b01 y
 * 0b10 son compresión que el lector ya acepta, como con DD. Después la
 * rotación BD, la extrusión 3BD — hecho 3 del intake 2026-08-20: los 6
 * INSERT reales desmintieron la BE que declaraba la ODS, y writer y lector
 * se corrigieron JUNTOS — y el bit de ATTRIBs.
 *
 * EL BIT DE ATTRIBs SALE DEL MODELO DESDE EL 2026-09-04. Estuvo clavado a 0
 * mientras el laboratorio no sabía emitir ATTRIB: un cuadro de rótulo se
 * exportaba MUDO. Ahora lo emite `emitAttrib` y el bit dice la verdad — pero
 * encenderlo es una promesa, así que `validateEntity` exige que quien llama
 * traiga los handles del primer y último ATTRIB y del SEQEND antes de que
 * este bit llegue a valer 1.
 */
export function emitInsert(emitter: DwgBitEmitter, entity: DwgInsertEntity): void {
  emitter.emitBD(entity.position.x);
  emitter.emitBD(entity.position.y);
  emitter.emitBD(entity.position.z);
  const { x, y, z } = entity.scale;
  if (Object.is(x, 1) && Object.is(y, 1) && Object.is(z, 1)) {
    emitter.pushBits(0b11, 2);
  } else {
    emitter.pushBits(0b00, 2);
    emitter.emitRD(x);
    emitter.emitDD(y, x);
    emitter.emitDD(z, x);
  }
  emitter.emitBD(entity.rotation);
  emitter.emitBD(entity.extrusion.x);
  emitter.emitBD(entity.extrusion.y);
  emitter.emitBD(entity.extrusion.z);
  emitter.pushBit(entity.attributesFollow ? 1 : 0);
}

/**
 * LWPOLYLINE: la bandera BS se DERIVA de la presencia de cada campo del
 * modelo (`undefined` = el archivo no lo lleva), los opcionales presentes se
 * emiten en el orden del formato y los vértices tras el primero viajan como
 * 2DD contra el anterior — el atajo DD sólo con igualdad exacta de bits, como
 * en el resto del writer.
 */
export function emitLwPolyline(
  emitter: DwgBitEmitter,
  entity: DwgLwPolylineEntity,
): void {
  let flags = 0;
  if (entity.extrusion !== undefined) flags |= 0x1;
  if (entity.thickness !== undefined) flags |= 0x2;
  if (entity.constantWidth !== undefined) flags |= 0x4;
  if (entity.elevation !== undefined) flags |= 0x8;
  if (entity.bulges !== undefined) flags |= 0x10;
  if (entity.widths !== undefined) flags |= 0x20;
  if (entity.closed) flags |= 0x200;
  emitter.emitBS(flags);

  if (entity.constantWidth !== undefined) emitter.emitBD(entity.constantWidth);
  if (entity.elevation !== undefined) emitter.emitBD(entity.elevation);
  if (entity.thickness !== undefined) emitter.emitBD(entity.thickness);
  if (entity.extrusion !== undefined) emitter.emitBE(entity.extrusion);

  emitter.emitBL(entity.vertices.length);
  if (entity.bulges !== undefined) emitter.emitBL(entity.bulges.length);
  if (entity.widths !== undefined) emitter.emitBL(entity.widths.length);

  const first = entity.vertices[0]!;
  emitter.emitRD(first.x);
  emitter.emitRD(first.y);
  for (let index = 1; index < entity.vertices.length; index += 1) {
    const vertex = entity.vertices[index]!;
    const previous = entity.vertices[index - 1]!;
    emitter.emitDD(vertex.x, previous.x);
    emitter.emitDD(vertex.y, previous.y);
  }

  if (entity.bulges !== undefined) {
    for (const bulge of entity.bulges) {
      emitter.emitBD(bulge);
    }
  }
  if (entity.widths !== undefined) {
    for (const width of entity.widths) {
      emitter.emitBD(width.start);
      emitter.emitBD(width.end);
    }
  }
}

/**
 * TEXT: el RC de banderas se DERIVA de la presencia — un bit a 1 declara el
 * campo AUSENTE, así que cada `undefined` del modelo enciende su bit y no
 * emite nada. La alineación viaja como 2DD contra la inserción y la cadena
 * como TV de bytes crudos.
 */
export function emitText(emitter: DwgBitEmitter, entity: DwgTextEntity): void {
  emitTextFields(emitter, entity);
}

/**
 * ATTRIB: los campos de TEXT y, detrás, tag TV, longitud de campo BS y las
 * banderas RC del atributo (hecho registrado; `decodeAttrib` los lee en ese
 * orden). Por eso el cuerpo de TEXT vive en `emitTextFields` y no dentro de
 * `emitText`: el ATTRIB no es «como un TEXT», ES un TEXT más tres campos, y
 * duplicar aquí los trece campos del texto crearía dos disposiciones que
 * podrían separarse sin que nada lo viera.
 *
 * Las banderas y la longitud de campo viajan CRUDAS: el hecho registrado da
 * su disposición, no su semántica, y este writer no inventa la que no midió.
 */
export function emitAttrib(emitter: DwgBitEmitter, entity: DwgAttribEntity): void {
  emitTextFields(emitter, entity);
  emitter.emitTV(entity.tagBytes);
  emitter.emitBS(entity.fieldLength);
  emitter.emitRC(entity.attributeFlags);
}

/** Los trece campos que TEXT y ATTRIB comparten, en el orden del formato. */
function emitTextFields(emitter: DwgBitEmitter, entity: DwgTextFields): void {
  let dataFlags = 0;
  if (entity.elevation === undefined) dataFlags |= 0x01;
  if (entity.alignment === undefined) dataFlags |= 0x02;
  if (entity.obliqueAngle === undefined) dataFlags |= 0x04;
  if (entity.rotation === undefined) dataFlags |= 0x08;
  if (entity.widthFactor === undefined) dataFlags |= 0x10;
  if (entity.generation === undefined) dataFlags |= 0x20;
  if (entity.horizontalAlignment === undefined) dataFlags |= 0x40;
  if (entity.verticalAlignment === undefined) dataFlags |= 0x80;
  emitter.emitRC(dataFlags);

  if (entity.elevation !== undefined) emitter.emitRD(entity.elevation);
  emitter.emitRD(entity.insertion.x);
  emitter.emitRD(entity.insertion.y);
  if (entity.alignment !== undefined) {
    emitter.emitDD(entity.alignment.x, entity.insertion.x);
    emitter.emitDD(entity.alignment.y, entity.insertion.y);
  }
  emitter.emitBE(entity.extrusion);
  emitter.emitBT(entity.thickness);
  if (entity.obliqueAngle !== undefined) emitter.emitRD(entity.obliqueAngle);
  if (entity.rotation !== undefined) emitter.emitRD(entity.rotation);
  emitter.emitRD(entity.height);
  if (entity.widthFactor !== undefined) emitter.emitRD(entity.widthFactor);
  emitter.emitTV(entity.valueBytes);
  if (entity.generation !== undefined) emitter.emitBS(entity.generation);
  if (entity.horizontalAlignment !== undefined) {
    emitter.emitBS(entity.horizontalAlignment);
  }
  if (entity.verticalAlignment !== undefined) {
    emitter.emitBS(entity.verticalAlignment);
  }
}
