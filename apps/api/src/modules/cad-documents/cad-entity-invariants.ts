import { BadRequestException } from '@nestjs/common';
import {
  assertRegionInvariants,
  assertSolid3dInvariants,
} from './cad-solid-invariants';

/**
 * Invariantes por TIPO de entidad, fail-closed.
 *
 * Sale de `cad-document-validation.ts` por tamaño —el esquema 4 añade ocho
 * tipos y el archivo pasaba del techo de 800 líneas— y porque son dos
 * responsabilidades: aquél valida la FORMA del documento (límites, secciones,
 * integridad referencial) y esto valida la GEOMETRÍA de cada entidad.
 *
 * La regla no cambia: un documento inválido se RECHAZA, no se arregla. Los
 * límites de tamaño y profundidad no impiden persistir geometría imposible —un
 * radio negativo, una recta de dirección nula, una tabla que declara 4 filas y
 * trae 2 alturas—, y esa geometría no revienta aquí: revienta más tarde, en el
 * render, en el índice espacial o en la exportación, lejos de su causa.
 */

export function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Un `String(x)` sobre `unknown` produce `[object Object]` cuando llega un
 * objeto, y ese texto acabaría en un mensaje de error o —peor— comparándose
 * con un id real. En un validador que existe para no fiarse de la entrada, lo
 * que no es una cadena no se convierte: se trata como ausente.
 */
export function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Toda coordenada numérica debe ser finita: un NaN envenena bounds e índices. */
function assertFiniteNumbers(node: unknown, entityId: string, depth = 0): void {
  if (depth > 12 || node === null || typeof node !== 'object') return;
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new BadRequestException(
          `CadDocument: la entidad ${entityId} contiene un número no finito.`,
        );
      }
    } else if (typeof value === 'object') {
      assertFiniteNumbers(value, entityId, depth + 1);
    }
  }
}

/**
 * Invariantes discriminadas POR ENTIDAD.
 *
 * Los límites de tamaño, profundidad y conteo no impiden persistir geometría
 * imposible: un radio negativo, un NaN o una polilínea de un solo vértice
 * cruzaban la frontera y rompían render, índice espacial y exportación más
 * tarde, lejos de su causa. Aquí se falla CERRADO y en el punto de entrada.
 */
/** Tolerancia de coincidencia: por debajo, dos puntos SON el mismo punto. */
const POINT_EPSILON = 1e-9;

/** Un punto canónico: `x`/`y` numéricos y finitos; `z` opcional. */
function assertPoint(
  value: unknown,
  entityId: string,
  what: string,
): { x: number; y: number } {
  const point = objectValue(value);
  if (!point) {
    throw new BadRequestException(
      `CadDocument: ${what} de ${entityId} debe ser un punto {x, y}.`,
    );
  }
  const x = point.x;
  const y = point.y;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    throw new BadRequestException(
      `CadDocument: ${what} de ${entityId} necesita coordenadas numéricas finitas.`,
    );
  }
  if (point.z !== undefined && typeof point.z !== 'number') {
    throw new BadRequestException(
      `CadDocument: ${what} de ${entityId} tiene una cota z no numérica.`,
    );
  }
  return { x, y };
}

function samePoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return (
    Math.abs(a.x - b.x) <= POINT_EPSILON && Math.abs(a.y - b.y) <= POINT_EPSILON
  );
}

export function assertEntityInvariants(
  entities: unknown[],
  declaredLayers: Set<string> | null,
  where = 'el documento',
  /**
   * Las entidades de PRIMER NIVEL siempre declaran capa: es lo que fija color,
   * visibilidad, bloqueo y exportación. Dentro de una DEFINICIÓN de bloque la
   * capa puede heredarse del INSERT (semántica ByBlock del propio DXF), así que
   * ahí no se exige su presencia — pero si viene, tiene que ser válida y
   * resolver. Se comprueba lo que hay; no se inventa un requisito sobre
   * definiciones heredadas.
   */
  requireLayer = true,
): void {
  for (const raw of entities) {
    const entity = objectValue(raw);
    if (!entity) {
      throw new BadRequestException(
        `CadDocument: ${where} contiene una entidad que no es un objeto.`,
      );
    }
    const id = stringValue(entity.id) || '(sin id)';
    const type = entity.type;
    assertFiniteNumbers(entity, id);

    // Toda entidad vive en una capa. Sin ella no hay color, visibilidad,
    // bloqueo ni exportación posibles, y el editor la dibuja en la nada.
    const layer = entity.layer;
    if (layer !== undefined || requireLayer) {
      if (typeof layer !== 'string' || !layer.trim()) {
        throw new BadRequestException(
          `CadDocument: la entidad ${id} necesita una capa.`,
        );
      }
      // Sólo puede comprobarse la EXISTENCIA cuando el documento declara sus
      // capas. Un documento heredado que no las trae no se rechaza por eso: se
      // comprueba lo que hay, no se finge lo que falta.
      if (declaredLayers && !declaredLayers.has(layer)) {
        throw new BadRequestException(
          `CadDocument: la entidad ${id} referencia la capa inexistente ${layer}.`,
        );
      }
    }

    // Esquema 5. Las dos entidades de sólidos tienen sus invariantes en
    // `cad-solid-invariants.ts`: un SOLID3D no persiste geometría sino el ÁRBOL
    // que la produce, y validar un programa —referencias, ciclos, aridad— es una
    // responsabilidad distinta de comprobar que un radio es positivo.
    if (type === 'solid3d') assertSolid3dInvariants(entity, id);
    if (type === 'region') assertRegionInvariants(entity, id);

    // Esquema 6. Un WALL persiste su RECETA —eje, grosor, altura— y toda su
    // geometría se deriva de ella, así que una receta degenerada no falla al
    // guardarse: falla al DIBUJARSE, con un contorno de área nula que rompe el
    // hit-testing lejos de su causa. Se rechaza aquí, en el punto de entrada.
    if (type === 'wall') {
      const start = assertPoint(entity.start, id, 'el inicio del eje del muro');
      const end = assertPoint(entity.end, id, 'el final del eje del muro');
      if (samePoint(start, end)) {
        throw new BadRequestException(
          `CadDocument: el muro ${id} necesita un eje con dos extremos distintos.`,
        );
      }
      const thickness = entity.thickness;
      if (
        typeof thickness !== 'number' ||
        !Number.isFinite(thickness) ||
        !(thickness > 0)
      ) {
        throw new BadRequestException(
          `CadDocument: el muro ${id} requiere un grosor positivo.`,
        );
      }
      const height = entity.height;
      if (
        typeof height !== 'number' ||
        !Number.isFinite(height) ||
        !(height > 0)
      ) {
        throw new BadRequestException(
          `CadDocument: el muro ${id} requiere una altura positiva.`,
        );
      }
    }

    if (type === 'line') {
      const start = assertPoint(entity.start, id, 'el inicio de la línea');
      const end = assertPoint(entity.end, id, 'el final de la línea');
      if (samePoint(start, end)) {
        throw new BadRequestException(
          `CadDocument: la línea ${id} necesita dos extremos distintos.`,
        );
      }
    }

    if (type === 'circle' || type === 'arc') {
      const radius = entity.radius;
      if (typeof radius !== 'number' || !(radius > 0)) {
        throw new BadRequestException(
          `CadDocument: ${String(type)} ${id} requiere un radio positivo.`,
        );
      }
    }

    if (type === 'polyline') {
      const vertices = entity.vertices;
      const closed = entity.closed;
      if (closed !== undefined && typeof closed !== 'boolean') {
        throw new BadRequestException(
          `CadDocument: la polilínea ${id} tiene un \`closed\` que no es booleano.`,
        );
      }
      if (!Array.isArray(vertices) || vertices.length < 2) {
        throw new BadRequestException(
          `CadDocument: la polilínea ${id} requiere al menos 2 vértices.`,
        );
      }
      // Una CERRADA necesita tres vértices para encerrar área: con dos es un
      // segmento recorrido de ida y vuelta.
      if (closed === true && vertices.length < 3) {
        throw new BadRequestException(
          `CadDocument: la polilínea cerrada ${id} requiere al menos 3 vértices.`,
        );
      }
      const points = vertices.map((vertex, index) => {
        const point = assertPoint(vertex, id, `el vértice ${index}`);
        const bulge = (vertex as Record<string, unknown>)?.bulge;
        if (
          bulge !== undefined &&
          (typeof bulge !== 'number' || !Number.isFinite(bulge))
        ) {
          throw new BadRequestException(
            `CadDocument: el vértice ${index} de ${id} tiene un bulge no finito.`,
          );
        }
        return point;
      });
      // Un tramo de longitud cero no es geometría: rompe normales, offset,
      // OSNAP y el propio DXF. En una cerrada, el tramo de CIERRE cuenta
      // igual, y repetir el primer vértice al final es justo ese caso.
      const segments = closed === true ? points.length : points.length - 1;
      for (let index = 0; index < segments; index += 1) {
        const from = points[index];
        const to = points[(index + 1) % points.length];
        if (samePoint(from, to)) {
          throw new BadRequestException(
            `CadDocument: la polilínea ${id} tiene un segmento nulo entre los vértices ${index} y ${(index + 1) % points.length}.`,
          );
        }
      }
    }

    if (type === 'spline') {
      const controlPoints = entity.controlPoints;
      const degree = entity.degree;
      if (!Array.isArray(controlPoints) || controlPoints.length < 2) {
        throw new BadRequestException(
          `CadDocument: la spline ${id} requiere al menos 2 puntos de control.`,
        );
      }
      if (
        typeof degree !== 'number' ||
        !Number.isInteger(degree) ||
        degree < 1 ||
        degree >= controlPoints.length
      ) {
        throw new BadRequestException(
          `CadDocument: la spline ${id} tiene un grado incompatible con sus puntos de control.`,
        );
      }
      const weights = entity.weights;
      if (weights !== undefined) {
        if (
          !Array.isArray(weights) ||
          weights.length !== controlPoints.length
        ) {
          throw new BadRequestException(
            `CadDocument: la spline ${id} tiene pesos que no corresponden a sus puntos de control.`,
          );
        }
      }
    }

    assertSchema4Invariants(entity, id);
  }
}

// ---------------------------------------------------------------------------
// Esquema 4
// ---------------------------------------------------------------------------

/** Número finito y estrictamente positivo. */
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Vector con longitud no nula: una dirección degenerada no define nada. */
function assertDirection(value: unknown, entityId: string, what: string): void {
  const vector = assertPoint(value, entityId, what);
  if (Math.hypot(vector.x, vector.y) <= POINT_EPSILON) {
    throw new BadRequestException(
      `CadDocument: ${what} de ${entityId} tiene longitud nula y no define una dirección.`,
    );
  }
}

/** Polígono cerrado sin tramos nulos, con al menos `minimum` vértices. */
function assertPolygon(
  value: unknown,
  entityId: string,
  what: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): void {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new BadRequestException(
      `CadDocument: ${what} de ${entityId} necesita entre ${minimum} y ${maximum === Number.MAX_SAFE_INTEGER ? 'N' : maximum} vértices.`,
    );
  }
  const points = value.map((vertex, index) =>
    assertPoint(vertex, entityId, `el vértice ${index} de ${what}`),
  );
  // Un tramo de longitud cero no es geometría: rompe normales, relleno y el
  // propio DXF. En un contorno CERRADO el tramo final cuenta igual.
  for (let index = 0; index < points.length; index += 1) {
    if (samePoint(points[index], points[(index + 1) % points.length])) {
      throw new BadRequestException(
        `CadDocument: ${what} de ${entityId} tiene un tramo nulo entre los vértices ${index} y ${(index + 1) % points.length}.`,
      );
    }
  }
}

/** Porcentaje 0–100, si viene. Fuera de rango, se rechaza. */
function assertPercentage(
  value: unknown,
  entityId: string,
  what: string,
): void {
  if (value === undefined) return;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new BadRequestException(
      `CadDocument: ${what} de ${entityId} debe ser un porcentaje entre 0 y 100.`,
    );
  }
}

/**
 * Invariantes de los ocho tipos del esquema 4.
 *
 * Cada una impide una forma concreta de geometría imposible que, si cruza la
 * frontera, no falla aquí: falla en el render, en el índice espacial o en la
 * exportación, lejos de su causa y sin decir de dónde viene.
 */
function assertSchema4Invariants(
  entity: Record<string, unknown>,
  id: string,
): void {
  const type = entity.type;

  if (type === 'point') {
    assertPoint(entity.position, id, 'la posición del punto');
    if (entity.style !== undefined && !Number.isInteger(entity.style)) {
      throw new BadRequestException(
        `CadDocument: el punto ${id} tiene un estilo (PDMODE) que no es entero.`,
      );
    }
    return;
  }

  if (type === 'xline' || type === 'ray') {
    assertPoint(entity.basePoint, id, 'el punto base');
    // Una recta de dirección nula no es una recta: sus bounds salen
    // degenerados, su impacto mide contra un punto y el índice espacial la
    // guarda donde no está.
    assertDirection(entity.direction, id, 'la dirección');
    return;
  }

  if (type === 'solid') {
    // DXF admite triángulos y cuadriláteros, y nada más.
    assertPolygon(entity.points, id, 'el contorno del solid', 3, 4);
    return;
  }

  if (type === 'wipeout') {
    assertPolygon(entity.boundary, id, 'el contorno del wipeout', 3);
    if (entity.frame !== undefined && typeof entity.frame !== 'boolean') {
      throw new BadRequestException(
        `CadDocument: el wipeout ${id} tiene un \`frame\` que no es booleano.`,
      );
    }
    return;
  }

  if (type === 'image') {
    if (!stringValue(entity.definition).trim()) {
      throw new BadRequestException(
        `CadDocument: la imagen ${id} no declara a qué definición apunta.`,
      );
    }
    assertPoint(entity.insertion, id, 'la inserción de la imagen');
    // U y V son los VECTORES que miden un píxel. Nulos, la imagen se aplasta a
    // un segmento o a un punto y su rectángulo deja de existir.
    assertDirection(entity.uVector, id, 'el vector U de la imagen');
    assertDirection(entity.vVector, id, 'el vector V de la imagen');
    const size = objectValue(entity.size);
    if (!size || !positive(size.width) || !positive(size.height)) {
      throw new BadRequestException(
        `CadDocument: la imagen ${id} necesita un tamaño en píxeles positivo.`,
      );
    }
    assertPercentage(entity.brightness, id, 'el brillo');
    assertPercentage(entity.contrast, id, 'el contraste');
    assertPercentage(entity.fade, id, 'el desvanecido');
    return;
  }

  if (type === 'attdef') {
    const tag = stringValue(entity.tag);
    // La ETIQUETA es lo que un INSERT usa para resolver el atributo. Vacía o
    // con espacios, ningún bloque la encuentra y el cajetín sale sin rellenar
    // sin que nada avise.
    if (!tag.trim() || /\s/.test(tag) || tag.length > 128) {
      throw new BadRequestException(
        `CadDocument: el atributo ${id} necesita una etiqueta no vacía y sin espacios.`,
      );
    }
    assertPoint(entity.insertion, id, 'la inserción del atributo');
    if (entity.height !== undefined && !positive(entity.height)) {
      throw new BadRequestException(
        `CadDocument: el atributo ${id} requiere una altura de texto positiva.`,
      );
    }
    return;
  }

  if (type === 'table') {
    const rows = entity.rows;
    const columns = entity.columns;
    if (
      !Number.isInteger(rows) ||
      !positive(rows) ||
      !Number.isInteger(columns) ||
      !positive(columns)
    ) {
      throw new BadRequestException(
        `CadDocument: la tabla ${id} necesita un número entero positivo de filas y columnas.`,
      );
    }
    assertPoint(entity.insertion, id, 'la inserción de la tabla');
    const rowHeights = entity.rowHeights;
    const columnWidths = entity.columnWidths;
    // Declarar 4 filas y traer 2 alturas no es un descuido recuperable: el
    // render dibujaría una rejilla de otro tamaño que el que dice la tabla, y
    // las celdas caerían en la fila equivocada.
    if (!Array.isArray(rowHeights) || rowHeights.length !== rows) {
      throw new BadRequestException(
        `CadDocument: la tabla ${id} declara ${String(rows)} filas y trae ${Array.isArray(rowHeights) ? rowHeights.length : 0} alturas.`,
      );
    }
    if (!Array.isArray(columnWidths) || columnWidths.length !== columns) {
      throw new BadRequestException(
        `CadDocument: la tabla ${id} declara ${String(columns)} columnas y trae ${Array.isArray(columnWidths) ? columnWidths.length : 0} anchos.`,
      );
    }
    for (const height of rowHeights) {
      if (!positive(height)) {
        throw new BadRequestException(
          `CadDocument: la tabla ${id} tiene una altura de fila no positiva.`,
        );
      }
    }
    for (const width of columnWidths) {
      if (!positive(width)) {
        throw new BadRequestException(
          `CadDocument: la tabla ${id} tiene un ancho de columna no positivo.`,
        );
      }
    }
    const cells = entity.cells;
    if (cells !== undefined) {
      if (!Array.isArray(cells)) {
        throw new BadRequestException(
          `CadDocument: la tabla ${id} tiene un \`cells\` que no es un arreglo.`,
        );
      }
      for (const rawCell of cells) {
        const cell = objectValue(rawCell);
        const row = cell?.row;
        const column = cell?.column;
        // Una celda fuera de la rejilla no se dibuja en ningún sitio: su texto
        // viaja en cada guardado y nadie lo ve nunca.
        if (
          !Number.isInteger(row) ||
          (row as number) < 0 ||
          (row as number) >= rows ||
          !Number.isInteger(column) ||
          (column as number) < 0 ||
          (column as number) >= columns
        ) {
          throw new BadRequestException(
            `CadDocument: la tabla ${id} tiene una celda fuera de su rejilla.`,
          );
        }
      }
    }
  }
}
