/**
 * El estado de una capa DWG llegando al lienzo: congelada y bloqueada.
 *
 * Vive aparte de `dwg-document-bridge.spec.ts` desde el 2026-09-01, cuando el
 * intake de esta medición empujó aquel archivo por encima del presupuesto de
 * monolito. La costura tiene sentido propio: aquí sólo se prueba QUÉ hace el
 * puente con el estado de una capa, con una base neutral mínima en vez del
 * dibujo completo de la spec grande.
 *
 * QUÉ SE PRUEBA Y QUÉ NO. El puente NO descifra el `BS` de estado: ese
 * criterio vive en el laboratorio, donde se midió contra el oráculo DXF sobre
 * 98 capas de las cinco versiones, y lo prueba allí su propia spec de estado
 * de capa. Aquí se le dan los booleanos ya resueltos —que es exactamente como
 * se los da el adaptador autorizado— y se comprueba lo único que es suyo:
 * aplicarlos al documento y declarar lo que no sabe.
 *
 * Este archivo NO referencia el laboratorio ni por ruta: no lo necesita, y así
 * no tiene que entrar en la lista de excepciones de la frontera de producto.
 */
import { strict as assert } from "node:assert";
import { cadLayerShown } from "./cad-layer-visibility";
import { DWG_BRIDGE_LOSS_CODES, dwgNeutralDatabaseToCadDocument } from "./dwg-document-bridge";
import type { DwgNeutralDatabase, DwgNeutralLayer } from "./dwg-neutral-model";

const bytesDe = (text: string): number[] => [...text].map((char) => char.charCodeAt(0) & 0xff);

/**
 * Una capa neutral como la entrega el ADAPTADOR AUTORIZADO: con el estado ya
 * resuelto en booleanos. Los valores por defecto son los del corpus real —una
 * capa normal trae `stateFlags` 1008, no cero—, para que un fixture no
 * enseñe un estado que ningún archivo produce.
 */
const capa = (
  handle: number,
  nombre: string,
  colorIndex: number,
  estado: Partial<
    Pick<
      DwgNeutralLayer,
      "stateFlags" | "frozen" | "locked" | "unmeasuredStateBits" | "linetypeName"
    >
  > = {},
): DwgNeutralLayer => ({
  handle,
  name: bytesDe(nombre),
  colorIndex,
  stateFlags: estado.stateFlags ?? 1008,
  frozen: estado.frozen ?? false,
  locked: estado.locked ?? false,
  unmeasuredStateBits: estado.unmeasuredStateBits ?? 0,
  linetypeName: estado.linetypeName ?? "CONTINUOUS",
});

/**
 * Base neutral mínima. Lleva UNA entidad porque el puente rechaza —con razón—
 * un dibujo del que no sale nada importable: sin ella esta spec probaría el
 * mensaje de error y no el estado de las capas.
 */
const base: DwgNeutralDatabase = {
  insunits: 0,
  layers: [],
  blocks: [],
  modelSpaceEntities: [
    {
      handle: 0x60,
      entity: {
        kind: "line",
        start: { x: 0, y: 0, z: 0 },
        end: { x: 10, y: 0, z: 0 },
        thickness: 0,
        extrusion: { x: 0, y: 0, z: 1 },
      },
      layerHandle: 0x10,
      insertedBlockName: undefined,
      attributes: undefined,
      vertices: undefined,
    },
  ],
  unsupported: [],
  diagnostics: [],
};

// ─── Fase 2.B: el estado de capa MEDIDO llega al documento ────────────────
// Este bloque afirmaba lo contrario hasta el 2026-09-01: que sin semántica
// confirmada la capa entra visible «en vez de adivinar apagada». Era correcto
// mientras no se hubiera medido, y se volvió un guardián de una carencia
// cuando sí se midió — 98 capas contra el oráculo DXF en las cinco versiones.
// Lo que se prueba ahora es que el archivo se respeta.
const conBanderas: DwgNeutralDatabase = {
  ...base,
  layers: [
    capa(0x10, "MUROS", 1, { stateFlags: 1009, frozen: true }),
    capa(0x11, "COTASÑ", 2, { stateFlags: 1016, locked: true }),
    capa(0x12, "NORMAL", 3),
  ],
};
const informeBanderas = dwgNeutralDatabaseToCadDocument(conBanderas);
const muros = informeBanderas.document.layers.find((layer) => layer.id === "MUROS");
assert.equal(muros?.frozen, true, "una capa CONGELADA en el archivo entra congelada");
assert.equal(
  cadLayerShown(muros!),
  false,
  "y congelada quiere decir que NO se dibuja — la regla del propio producto",
);
assert.equal(
  muros?.visible,
  true,
  "pero NO se marca apagada: el apagado no se mide y afirmarlo sería decir de más",
);
assert.equal(
  informeBanderas.document.layers.find((layer) => layer.id === "COTASÑ")?.locked,
  true,
  "una capa BLOQUEADA en el archivo entra bloqueada",
);
assert.equal(
  informeBanderas.document.layers.find((layer) => layer.id === "COTASÑ")?.visible,
  true,
  "bloqueada NO es congelada: la capa se sigue viendo",
);
const normal = informeBanderas.document.layers.find((layer) => layer.id === "NORMAL");
assert.equal(normal?.visible, true);
assert.equal(normal?.locked, false);
// `false`, no `undefined`: el estado SÍ se decodificó y dice que no está
// congelada. La ausencia queda reservada para «no se pudo leer», que es un
// hecho distinto y se prueba más abajo.
assert.equal(
  informeBanderas.document.layers.find((layer) => layer.id === "NORMAL")?.frozen,
  false,
  "una capa normal se declara explícitamente NO congelada",
);

// Sin estado decodificado no se finge: entra visible y se declara la ausencia.
const sinEstado: DwgNeutralDatabase = {
  ...base,
  layers: [
    {
      handle: 0x10,
      name: bytesDe("MUROS"),
      colorIndex: 1,
      stateFlags: undefined,
      frozen: undefined,
      locked: undefined,
      unmeasuredStateBits: undefined,
      linetypeName: undefined,
    },
  ],
};
const informeSinEstado = dwgNeutralDatabaseToCadDocument(sinEstado);
const sinMuros = informeSinEstado.document.layers.find((layer) => layer.id === "MUROS");
assert.equal(sinMuros?.visible, true, "sin banderas decodificadas la capa entra visible");
assert.equal(sinMuros?.frozen, undefined, "y sin congelar: no se inventa un estado");
assert.ok(
  informeSinEstado.document.lossManifest.some(
    (entry) => entry.code === DWG_BRIDGE_LOSS_CODES.layerStateFlags,
  ),
  "y la ausencia se declara en el manifiesto",
);

// Un estado con bits fuera de lo medido aplica lo medido y declara el resto.
const conBitsNuevos: DwgNeutralDatabase = {
  ...base,
  layers: [capa(0x10, "MUROS", 1, { stateFlags: 2032, unmeasuredStateBits: 1 << 10 })],
};
const informeBitsNuevos = dwgNeutralDatabaseToCadDocument(conBitsNuevos);
assert.ok(
  informeBitsNuevos.document.lossManifest.some(
    (entry) =>
      entry.code === DWG_BRIDGE_LOSS_CODES.layerStateFlags && entry.detail.includes("0x400"),
  ),
  "los bits fuera del patrón medido se nombran, no se ignoran en silencio",
);

// ─── Fase 2.C: el tipo de línea de la capa deja de perderse ───────────────
// El laboratorio ya leía la tabla LTYPE y las capas, pero no QUIÉN USA CUÁL:
// el enlace es un handle cuya posición se midió sobre 98 capas de las cinco
// versiones. Aquí se prueba lo que es del puente: ponerlo cuando lo hay y
// DECLARARLO cuando no, sin suponer CONTINUOUS.
const conTipoDeLinea: DwgNeutralDatabase = {
  ...base,
  layers: [
    capa(0x10, "EJES", 2, { linetypeName: "TRAZOS" }),
    capa(0x11, "MUROS", 1),
    // Inline y no por el ayudante: su `?? "CONTINUOUS"` no distingue «no lo
    // digo» de «digo que no hay», y el caso que importa aquí es el segundo.
    {
      handle: 0x12,
      name: bytesDe("SINLTYPE"),
      colorIndex: 3,
      stateFlags: 1008,
      frozen: false,
      locked: false,
      unmeasuredStateBits: 0,
      linetypeName: undefined,
    },
  ],
};
const informeLtype = dwgNeutralDatabaseToCadDocument(conTipoDeLinea);
assert.equal(
  informeLtype.document.layers.find((layer) => layer.id === "EJES")?.linetype,
  "TRAZOS",
  "el tipo de línea del archivo llega al documento",
);
assert.equal(
  informeLtype.document.layers.find((layer) => layer.id === "MUROS")?.linetype,
  "CONTINUOUS",
);
assert.equal(
  informeLtype.document.layers.find((layer) => layer.id === "SINLTYPE")?.linetype,
  undefined,
  "sin tipo de línea resoluble el campo queda AUSENTE: suponer CONTINUOUS sería " +
    "afirmar algo que el archivo no dice",
);
assert.ok(
  informeLtype.document.lossManifest.some(
    (entry) =>
      entry.code === DWG_BRIDGE_LOSS_CODES.layerLinetype && entry.detail.includes("SINLTYPE"),
  ),
  "y la ausencia se declara en la capa concreta",
);
assert.equal(
  informeLtype.document.lossManifest.filter(
    (entry) => entry.code === DWG_BRIDGE_LOSS_CODES.layerLinetype,
  ).length,
  1,
  "las capas que sí traen tipo de línea no generan ruido en el manifiesto",
);

// ─── Fase 2.G: la capa "0" del ARCHIVO manda sobre el respaldo sintético ──
// Hasta el 2026-09-01 `mapLayers` sembraba `seen` con "0" y anteponía una capa
// "0" sintética de ACI 7. La capa "0" REAL del archivo entraba en el bucle y
// se descartaba entera —color, estado y tipo de línea— SIN declarar ni una
// pérdida: el manifiesto no decía nada porque el dato no faltaba, se tiraba.
// Medido sobre el corpus: los 57 fixtures traen capa "0" con tipo de línea
// resuelto (CONTINUOUS ×27, Continuous ×30) y los 57 lo perdían en silencio.
// Ninguno trae la capa "0" con color distinto de ACI 7 ni congelada, así que
// esa mitad de la pérdida es ALCANZABLE y no medida — y se prueba aquí.
const conCeroReal: DwgNeutralDatabase = {
  ...base,
  layers: [
    capa(0x10, "0", 5, { frozen: true, linetypeName: "TRAZOS" }),
    capa(0x11, "MUROS", 1),
  ],
};
const informeCero = dwgNeutralDatabaseToCadDocument(conCeroReal);
const capasCero = informeCero.document.layers.filter((layer) => layer.id === "0");
assert.equal(capasCero.length, 1, "el documento lleva UNA capa 0, no el respaldo y la real");
assert.equal(
  informeCero.document.layers[0]?.id,
  "0",
  "y sigue siendo la primera: hay código que cuenta con que exista",
);
assert.equal(capasCero[0]?.color, "#0000ff", "con el color del ARCHIVO (ACI 5), no el ACI 7 supuesto");
assert.equal(capasCero[0]?.frozen, true, "con el estado del archivo, no descongelada por omisión");
assert.equal(capasCero[0]?.linetype, "TRAZOS", "y con su tipo de línea, que era lo que perdían los 57");

// El respaldo SIGUE existiendo cuando el archivo no trae capa "0": la mitad
// que hay que no romper. Sin esto, toda entidad cuya capa no resuelve —que el
// puente manda a "0"— apuntaría a una capa que no está en el documento.
const sinCero: DwgNeutralDatabase = { ...base, layers: [capa(0x10, "MUROS", 1)] };
const informeSinCero = dwgNeutralDatabaseToCadDocument(sinCero);
const respaldo = informeSinCero.document.layers.find((layer) => layer.id === "0");
assert.equal(respaldo?.color, "#ffffff", "sin capa 0 en el archivo, el respaldo sintético usa ACI 7");
assert.equal(respaldo?.linetype, undefined, "y no afirma un tipo de línea que nadie dijo");

// ─── Fase 2.G: el color que NO se decodificó se DECLARA ───────────────────
// El comentario del puente afirmaba desde siempre que esta pérdida constaba
// en el manifiesto. No constaba en ninguna parte: el gris neutro se pintaba y
// el usuario no se enteraba. El corpus no ejerce este camino —131 capas, las
// 131 con color—, así que esto cierra un camino alcanzable, no medido.
const sinColor: DwgNeutralDatabase = {
  ...base,
  layers: [{ ...capa(0x10, "MUROS", 1), colorIndex: undefined }],
};
const informeSinColor = dwgNeutralDatabaseToCadDocument(sinColor);
assert.equal(
  informeSinColor.document.layers.find((layer) => layer.id === "MUROS")?.color,
  "#8a8f98",
  "sin color decodificado se pinta un gris que NO es ACI, para que se vea que no es del archivo",
);
assert.ok(
  informeSinColor.document.lossManifest.some(
    (entry) => entry.code === DWG_BRIDGE_LOSS_CODES.layerColor && entry.detail.includes("MUROS"),
  ),
  "y ahora SE DICE, con el nombre de la capa dentro",
);
assert.equal(
  informeCero.document.lossManifest.filter(
    (entry) => entry.code === DWG_BRIDGE_LOSS_CODES.layerColor,
  ).length,
  0,
  "las capas que sí traen color no generan ruido en el manifiesto",
);

console.log(
  "dwg-document-bridge-layer-state: una capa CONGELADA entra congelada (y por tanto no se " +
    "dibuja) sin marcarse apagada, una BLOQUEADA entra bloqueada, sin estado decodificado no se " +
    "inventa ninguno, los bits fuera de lo medido se nombran en el manifiesto, y el TIPO DE " +
    "LÍNEA de la capa llega al documento o se declara ausente sin suponer CONTINUOUS; la capa " +
    "0 REAL del archivo manda sobre el respaldo sintético sin duplicarse, el respaldo sigue " +
    "existiendo cuando el archivo no la trae, y el color no decodificado por fin se declara",
);
