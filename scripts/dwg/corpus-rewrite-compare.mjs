/**
 * Comparadores del arnés de re-escritura del corpus — partido de
 * `corpus-rewrite.mjs` por el presupuesto de 800 líneas del monorepo
 * (`scripts/cad/check-monolith-budget.mjs`); misma semántica, cero cambios.
 *
 * Aquí viven las TRES comparaciones que el arnés hace, y sólo eso:
 *
 * 1. `deepDiff` — la entidad que entró contra la que volvió, estructura
 *    completa. No una lista de campos elegida a mano: un campo que el writer
 *    dejara de emitir aparece aquí aunque nadie se hubiera acordado de
 *    añadirlo a la comparación.
 * 2. `projectForOracle` — la entidad releída llevada al MISMO vocabulario que
 *    `expectedFromOracle` de `dxf-oracle.mjs` entrega, para poder enfrentarlas.
 * 3. `anchorAgainstOracle` — el emparejamiento por clase contra lo que el DXF
 *    de autoría propia del bundle declara.
 *
 * Sin estado, sin E/S y sin importar el laboratorio: recibe datos y devuelve
 * datos, para que el spec pueda ejercitarlos con entidades a mano.
 */

/** Tolerancia de comparación: la misma que `validate-corpus.mjs`. */
export const TOLERANCE = 1e-6;

/** CP1252 sobre bytes ASCII coincide con latin1; el corpus es ASCII. */
export const decodeBytes = (bytes) => Buffer.from(bytes ?? []).toString("latin1");

/**
 * Diferencia estructural profunda entre la entidad que se escribió y la que
 * se releyó. Los números llevan la tolerancia declarada; cualquier otra cosa
 * se compara por identidad, y una longitud de arreglo distinta se reporta
 * como UNA diferencia en vez de vomitar un elemento por índice.
 */
export function deepDiff(expected, actual, route = "", into = []) {
  if (typeof expected === "number" || typeof actual === "number") {
    if (
      typeof expected !== "number" ||
      typeof actual !== "number" ||
      Math.abs(expected - actual) > TOLERANCE
    ) {
      into.push({ campo: route, escrito: expected ?? null, releido: actual ?? null });
    }
    return into;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (
      !Array.isArray(expected) ||
      !Array.isArray(actual) ||
      expected.length !== actual.length
    ) {
      into.push({
        campo: route,
        escrito: Array.isArray(expected) ? `${expected.length} elemento(s)` : null,
        releido: Array.isArray(actual) ? `${actual.length} elemento(s)` : null,
      });
      return into;
    }
    expected.forEach((value, index) =>
      deepDiff(value, actual[index], `${route}[${index}]`, into),
    );
    return into;
  }
  if (
    expected !== null &&
    actual !== null &&
    typeof expected === "object" &&
    typeof actual === "object"
  ) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      deepDiff(expected[key], actual[key], route ? `${route}.${key}` : key, into);
    }
    return into;
  }
  if (expected !== actual) {
    into.push({ campo: route, escrito: expected ?? null, releido: actual ?? null });
  }
  return into;
}

/**
 * Proyecta una entidad releída al vocabulario de `expectedFromOracle`.
 *
 * Sólo cubre las clases que el writer sabe emitir: lo que no se escribe no
 * llega hasta aquí. Los campos son los MISMOS que el helper del oráculo
 * entrega —ni uno más—, porque comparar contra un campo que el DXF no declara
 * sería inventarse el esperado.
 */
export function projectForOracle(entity, insertedBlockName) {
  switch (entity.kind) {
    case "line":
      return {
        start: [entity.start.x, entity.start.y, entity.start.z],
        end: [entity.end.x, entity.end.y, entity.end.z],
      };
    case "point":
      return { position: [entity.position.x, entity.position.y, entity.position.z] };
    case "circle":
      return {
        center: [entity.center.x, entity.center.y, entity.center.z],
        radius: entity.radius,
      };
    case "arc":
      return {
        center: [entity.center.x, entity.center.y, entity.center.z],
        radius: entity.radius,
        startAngle: entity.startAngle,
        endAngle: entity.endAngle,
      };
    case "text":
      return {
        insertion: [entity.insertion.x, entity.insertion.y],
        height: entity.height,
        rotation: entity.rotation ?? 0,
        value: decodeBytes(entity.valueBytes),
      };
    case "mtext":
      return {
        insertion: [entity.insertion.x, entity.insertion.y],
        height: entity.height,
        value: decodeBytes(entity.valueBytes),
      };
    // El ATTRIB del oráculo declara los mismos campos de un TEXT más la
    // ETIQUETA, que es lo que lo hace un atributo y no un texto suelto.
    case "attrib":
      return {
        insertion: [entity.insertion.x, entity.insertion.y],
        height: entity.height,
        value: decodeBytes(entity.valueBytes),
        tag: decodeBytes(entity.tagBytes),
      };
    case "insert":
      return {
        block: decodeBytes(insertedBlockName).toUpperCase(),
        position: [entity.position.x, entity.position.y, entity.position.z],
        scale: [entity.scale.x, entity.scale.y, entity.scale.z],
        rotation: entity.rotation,
      };
    case "lwpolyline":
      return {
        closed: entity.closed,
        vertices: entity.vertices.map((vertex) => [vertex.x, vertex.y]),
        bulges: entity.bulges ? [...entity.bulges] : entity.vertices.map(() => 0),
        constantWidth: entity.constantWidth ?? 0,
      };
    case "ellipse":
      return {
        center: [entity.center.x, entity.center.y, entity.center.z],
        majorAxis: [
          entity.majorAxisEndpoint.x,
          entity.majorAxisEndpoint.y,
          entity.majorAxisEndpoint.z,
        ],
        ratio: entity.axisRatio,
        startAngle: entity.startAngle,
        endAngle: entity.endAngle,
      };
    // La VENTANA: el oráculo declara su centro en el papel (10/20) y su
    // tamaño (40/41), y nada más de los veintitantos campos del cuerpo. Se
    // comparan esos tres y no se inventa el resto.
    case "viewport":
      return {
        center: [entity.center.x, entity.center.y],
        width: entity.width,
        height: entity.height,
      };
    case "hatch": {
      const polylinePaths = entity.paths.filter((path) => path.kind === "polyline");
      return {
        name: decodeBytes(entity.nameBytes).toUpperCase(),
        solidFill: entity.solidFill,
        pathCount: entity.paths.length,
        polylineVertices: polylinePaths.map((path) =>
          path.vertices.map((vertex) => [vertex.x, vertex.y]),
        ),
        polylineBulges: polylinePaths.map((path) =>
          path.bulges ? [...path.bulges] : path.vertices.map(() => 0),
        ),
      };
    }
    default:
      return {};
  }
}

/** Diferencias de los campos que el ORÁCULO declara; los que él no trae no se inventan. */
export function oracleFieldDiffs(expected, actual) {
  const diffs = [];
  const near = (a, b) => Math.abs(a - b) <= TOLERANCE;
  for (const [key, want] of Object.entries(expected)) {
    const got = actual[key];
    if (typeof want === "number") {
      if (typeof got !== "number" || !near(want, got)) {
        diffs.push({ campo: key, oraculo: want, releido: got ?? null });
      }
    } else if (typeof want === "boolean" || typeof want === "string") {
      if (want !== got) diffs.push({ campo: key, oraculo: want, releido: got ?? null });
    } else if (Array.isArray(want)) {
      const flatWant = want.flat(2);
      const flatGot = Array.isArray(got) ? got.flat(2) : [];
      const equal =
        flatWant.length === flatGot.length &&
        flatWant.every((value, index) =>
          typeof value === "number"
            ? typeof flatGot[index] === "number" && near(value, flatGot[index])
            : value === flatGot[index],
        );
      if (!equal) diffs.push({ campo: key, oraculo: want, releido: got ?? null });
    }
  }
  return diffs;
}

/**
 * Ancla entidades releídas contra lo que el DXF del oráculo declara, por clase
 * y con emparejamiento voraz: primero coincidencia exacta —campos Y capa—,
 * después el resto por orden.
 *
 * Nada desaparece del informe. Un esperado sin pareja queda `sinAnclar`, que
 * es lo NORMAL cuando su clase no es escribible; un releído sin pareja es
 * `releidasSinPareja`, y eso sí es una discrepancia de verdad: significa que
 * nuestro archivo lleva una entidad que la fuente ajena no declaraba.
 */
export function anchorAgainstOracle(expectedList, actualList, contexto, into) {
  const perClass = {};
  const kinds = [
    ...new Set([...expectedList.map((e) => e.kind), ...actualList.map((a) => a.kind)]),
  ].sort();
  for (const kind of kinds) {
    const expected = expectedList.filter((entry) => entry.kind === kind);
    const actual = actualList.filter((entry) => entry.kind === kind);
    const used = new Set();
    let anchored = 0;
    const pending = [];
    for (const want of expected) {
      let matched = false;
      for (let index = 0; index < actual.length; index += 1) {
        if (used.has(index)) continue;
        if (want.layer !== undefined && want.layer !== actual[index].layer) continue;
        if (oracleFieldDiffs(want.fields, actual[index].fields).length > 0) continue;
        used.add(index);
        anchored += 1;
        matched = true;
        break;
      }
      if (!matched) pending.push(want);
    }
    let differing = 0;
    for (const want of pending) {
      const index = actual.findIndex((_, at) => !used.has(at));
      if (index < 0) continue;
      used.add(index);
      differing += 1;
      into.push({
        contexto,
        tipo: kind,
        problema: "valor-distinto-del-oraculo",
        capaOraculo: want.layer ?? null,
        capaReleida: actual[index].layer ?? null,
        diferencias: oracleFieldDiffs(want.fields, actual[index].fields),
      });
    }
    const unmatchedActual = actual.length - used.size;
    if (unmatchedActual > 0) {
      into.push({
        contexto,
        tipo: kind,
        problema: "releida-sin-correspondencia-en-el-oraculo",
        cuantas: unmatchedActual,
      });
    }
    perClass[kind] = {
      declaradasPorOraculo: expected.length,
      ancladas: anchored,
      valorDistinto: differing,
      sinAnclar: pending.length - differing,
      releidasSinPareja: unmatchedActual,
    };
  }
  return perClass;
}

/** Una fila vacía de la matriz por clase. */
export const emptyClassRow = () => ({
  estado: null,
  vistas: 0,
  escritas: 0,
  noEscribibles: 0,
  releidasIguales: 0,
  releidasConDiferencia: 0,
  declaradasPorOraculo: 0,
  ancladasAlOraculo: 0,
  valorDistintoDelOraculo: 0,
  declaradasPorOraculoSinAnclar: 0,
  motivos: [],
});

/**
 * El estado de una fila, con el criterio escrito UNA sola vez:
 *
 * - ninguna instancia escrita → `no-escribible`;
 * - todo escrito, todo releído igual y nada que el oráculo desmienta →
 *   `regrabada-integra`;
 * - cualquier otra cosa → `regrabada-con-perdida-declarada`, con sus motivos
 *   en la propia fila.
 *
 * `declaradasPorOraculoSinAnclar` NO decide el estado a propósito: el
 * vocabulario del oráculo no es el del modelo neutral —una POLYLINE 2D del
 * DXF se proyecta a `lwpolyline` y en el DWG llega como `polyline2d`—, así que
 * un esperado sin anclar puede pertenecer a OTRA clase del writer. Lo que sí
 * decide es `valorDistintoDelOraculo`: ahí el emparejamiento es real y el
 * valor no coincide.
 */
export function resolveClassState(row) {
  if (row.escritas === 0) return "no-escribible";
  const clean =
    row.noEscribibles === 0 &&
    row.releidasConDiferencia === 0 &&
    row.valorDistintoDelOraculo === 0;
  return clean ? "regrabada-integra" : "regrabada-con-perdida-declarada";
}
